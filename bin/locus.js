#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync, realpathSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { spawn } from 'node:child_process';
import lockfile from 'proper-lockfile';
import { fileURLToPath } from 'node:url';

const template = new URL('../settings.template.json', import.meta.url);

function readObject(path) {
  const value = JSON.parse(readFileSync(path, 'utf8'));
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('expected an object');
  return value;
}

function migrateSettings(state) {
  const path = join(state, 'settings.json');
  const legacy = join(state, 'config.json');
  if (existsSync(path) || !existsSync(legacy)) return;
  try {
    const settings = readObject(legacy);
    if ('systemPrompt' in settings) {
      settings.customInstructions ??= settings.systemPrompt;
      delete settings.systemPrompt;
    }
    writeFileSync(path, JSON.stringify(settings, null, 2) + '\n', { flag: 'wx' });
  } catch (error) {
    throw Error(`could not migrate .locus/config.json: ${error.message}`);
  }
}

export function initialize(directory) {
  const state = join(directory, '.locus');
  mkdirSync(state, { recursive: true });
  migrateSettings(state);
  const path = join(state, 'settings.json');
  if (!existsSync(path)) writeFileSync(path, readFileSync(template), { flag: 'wx' });
}

export function profileArguments(directory) {
  const state = join(directory, '.locus');
  migrateSettings(state);
  const path = join(state, 'settings.json');
  const args = [];
  try {
    const profile = existsSync(path) ? readObject(path) : {};
    for (const [key, value] of Object.entries(profile)) {
      if (['model', 'thinking', 'customInstructions'].includes(key)) {
        if (typeof value !== 'string') throw Error(`${key} must be a string`);
        if (value.trim()) args.push(key === 'customInstructions' ? '--append-system-prompt' : `--${key}`, value);
      } else if (['tools', 'skills', 'preloadSkills'].includes(key)) {
        if (!Array.isArray(value) || value.some(item => typeof item !== 'string' || !item.trim())) {
          throw Error(`${key} must be an array of nonempty strings`);
        }
        if (key === 'tools') {
          if (value.length) args.push('--tools', value.join(','));
        } else for (const entry of value) {
          const skill = resolve(directory, entry.startsWith('~/') ? join(homedir(), entry.slice(2)) : entry);
          args.push('--skill', skill);
          if (key === 'preloadSkills') {
            args.push('--append-system-prompt', `Preloaded skill: ${skill}\nResolve its relative references from ${dirname(skill)}.\n\n${readFileSync(skill, 'utf8')}`);
          }
        }
      } else throw Error(`unknown field: ${key}`);
    }
  } catch (error) {
    throw Error(`invalid .locus/settings.json: ${error.message}`);
  }
  return args;
}


export async function launchPi(args, { directory, profileArgs = [], conversation = false } = {}) {
  const entry = fileURLToPath(import.meta.resolve('@earendil-works/pi-coding-agent'));
  const cli = join(dirname(entry), 'bundle', 'cli.js');
  const env = {
    ...process.env,
    PI_CODING_AGENT_DIR: process.env.LOCUS_AGENT_DIR || join(homedir(), '.locus', 'agent'),
  };
  let release = async () => {};
  if (conversation) {
    const state = join(directory, '.locus');
    const target = join(state, 'lock');
    writeFileSync(target, '', { flag: 'a' });
    try {
      release = await lockfile.lock(target, { stale: 120000, update: 10000, retries: 0 });
    } catch (error) {
      if (error.code !== 'ELOCKED') throw error;
      console.error('locus: another process is using this directory.');
      process.exitCode = 75;
      return;
    }
    const prompt = fileURLToPath(new URL('../system-prompt.md', import.meta.url));
    const docs = `Installed Pi package: ${dirname(dirname(entry))}\nLocus package: ${fileURLToPath(new URL('../', import.meta.url))}`;
    args = ['--session', join(state, 'session.jsonl'), '--session-dir', state,
      '--system-prompt', prompt, '--append-system-prompt', docs, ...profileArgs, ...args];
  }
  const handlers = new Map();
  try {
    const child = spawn(process.execPath, [cli, ...args], { stdio: 'inherit', env });
    for (const signal of process.platform === 'win32' ? ['SIGINT', 'SIGTERM'] : ['SIGINT', 'SIGTERM', 'SIGHUP']) {
      const handler = () => child.kill(signal);
      handlers.set(signal, handler);
      process.on(signal, handler);
    }
    process.exitCode = await new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('close', (code, signal) => resolve(code ?? (signal === 'SIGINT' ? 130 : 143)));
    });
  } finally {
    for (const [signal, handler] of handlers) process.off(signal, handler);
    await release();
  }
}


const metadata = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const help = `Usage:
  locus init                  Create settings without starting a conversation (optional)
  locus install <source>      Install a Pi package into Locus
  locus                       Open its persistent conversation
  locus "Audit your events"   Open chat with an initial message
  locus -p "Audit your events" Run once and exit
  locus --mode json "Audit"   Stream Pi events and exit
  locus --version             Show the Locus version

Other arguments pass through to Pi. Use /login, /model, /settings, and
/reload inside chat. Skills and extensions use Pi's normal discovery.
Conversation commands initialize the current directory automatically.
Profile: .locus/settings.json | History: .locus/session.jsonl
Requires Node.js 22.19 or newer on Linux, macOS, or Windows.`;

export async function main(args = process.argv.slice(2), directory = process.cwd()) {
  if (args[0] === '--help' || args[0] === '-h') return console.log(help);
  if (args[0] === '--version' || args[0] === '-v') return console.log(metadata.version);
  if (args[0] === 'init') {
    if (args.length !== 1) throw Error('usage: locus init');
    initialize(directory);
    return console.log('Initialized .locus/ (existing settings and history preserved).\nRun locus to start chatting.');
  }
  if (args[0] === 'install') return launchPi(args);

  const sessionOptions = ['--session', '--session-dir', '--session-id', '--no-session',
    '--continue', '-c', '--resume', '-r', '--fork'];
  const separator = args.indexOf('--');
  for (const arg of args.slice(0, separator < 0 ? args.length : separator)) {
    if (sessionOptions.some(option => arg === option || arg.startsWith(`${option}=`))) {
      throw Error('session-selection options are managed by Locus.');
    }
  }
  initialize(directory);
  return launchPi(args, { directory, profileArgs: profileArguments(directory), conversation: true });
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await main();
  } catch (error) {
    console.error(`locus: ${error.message}`);
    process.exitCode = 1;
  }
}
