#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync, realpathSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { spawn } from 'node:child_process';
import lockfile from 'proper-lockfile';
import { fileURLToPath } from 'node:url';
import { loadProjectContextFiles } from '@earendil-works/pi-coding-agent';
import { bootstrapRule, runBootstrapHook } from './bootstrap.js';

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
  const settings = join(state, 'settings.json');
  if (!existsSync(settings)) writeFileSync(settings, readFileSync(template), { flag: 'wx' });
}

function contextArguments(directory, selections, agentDir) {
  const include = [], exclude = [];
  for (const { contextFiles, base } of selections) {
    if (!contextFiles || typeof contextFiles !== 'object' || Array.isArray(contextFiles) ||
        Object.keys(contextFiles).some(key => !['include', 'exclude'].includes(key))) {
      throw Error('contextFiles must contain only include and exclude lists');
    }
    for (const [name, paths] of Object.entries({ include: contextFiles.include ?? [], exclude: contextFiles.exclude ?? [] })) {
      if (!Array.isArray(paths) || paths.some(path => typeof path !== 'string' || !path.trim())) {
        throw Error(`contextFiles.${name} must be a list of nonempty paths`);
      }
      (name === 'include' ? include : exclude).push(...paths.map(path => ({ path, base })));
    }
  }
  if (!include.length && !exclude.length) return [];

  const canonical = ({ path, base }) => {
    const resolved = resolve(base, path.startsWith('~/') ? join(homedir(), path.slice(2)) : path);
    try {
      if (statSync(resolved).isFile()) return realpathSync(resolved);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    throw Error(`context file is missing or not a regular file: ${resolved}`);
  };
  // Pi's CLI cannot filter individual context files, so select from Pi's own discovery.
  const omitted = new Set(exclude.map(canonical));
  const selected = new Map();
  for (const file of loadProjectContextFiles({ cwd: directory, agentDir })) {
    const identity = canonical({ path: file.path, base: directory });
    if (!omitted.has(identity)) selected.set(identity, file.path);
  }
  for (const entry of include) {
    const identity = canonical(entry);
    if (!omitted.has(identity) && !selected.has(identity)) selected.set(identity, identity);
  }
  return ['--no-context-files', ...[...selected.values()].flatMap(path => ['--append-system-prompt', path])];
}

export function profileArguments(directory, agentDir = process.env.LOCUS_AGENT_DIR || join(homedir(), '.locus', 'agent')) {
  const state = join(directory, '.locus');
  migrateSettings(state);
  const settingsPath = join(state, 'settings.json');
  const args = [];
  try {
    const selections = [];
    const globalPath = join(agentDir, 'settings.json');
    const global = existsSync(globalPath) ? readObject(globalPath) : {};
    if ('contextFiles' in global) selections.push({ contextFiles: global.contextFiles, base: agentDir });
    const profile = existsSync(settingsPath) ? readObject(settingsPath) : {};
    const aliases = { model: 'defaultModel', thinking: 'defaultThinkingLevel', tools: 'defaultTools' };
    for (const [oldName, newName] of Object.entries(aliases)) {
      if (oldName in profile && newName in profile) throw Error(`${oldName} and ${newName} cannot both be set`);
    }
    const provider = profile.defaultProvider;
    if (provider !== undefined && (typeof provider !== 'string' || !provider.trim())) {
      throw Error('defaultProvider must be a nonempty string');
    }
    const localModel = profile.defaultModel ?? profile.model;
    if (provider && !localModel && !global.defaultModel) {
      throw Error('defaultProvider requires a defaultModel locally or globally');
    }
    for (const [rawKey, value] of Object.entries(profile)) {
      const key = aliases[rawKey] ?? rawKey;
      if (key === 'defaultProvider') {
        args.push('--provider', value);
        if (!localModel) args.push('--model', global.defaultModel);
      } else if (['defaultModel', 'defaultThinkingLevel', 'customInstructions', 'theme', 'tuiMode'].includes(key)) {
        if (typeof value !== 'string') throw Error(`${key} must be a string`);
        if (value.trim()) args.push({ defaultModel: '--model', defaultThinkingLevel: '--thinking',
          customInstructions: '--append-system-prompt', theme: '--use-theme', tuiMode: '--tui-mode' }[key], value);
      } else if (key === 'contextFiles') {
        selections.push({ contextFiles: value, base: directory });
      } else if (['defaultTools', 'enabledModels', 'skills', 'extensions', 'prompts', 'themes', 'preloadSkills'].includes(key)) {
        if (!Array.isArray(value) || value.some(item => typeof item !== 'string' || !item.trim())) {
          throw Error(`${key} must be an array of nonempty strings`);
        }
        if (key === 'defaultTools') {
          const modifiers = value.filter(item => /^[+-]/.test(item));
          if (modifiers.length && modifiers.length !== value.length) {
            throw Error('defaultTools cannot mix tool names and + or - modifiers in Locus settings');
          }
          if (value.length) args.push('--tools', value.join(','));
          else if (rawKey !== 'tools') args.push('--no-builtin-tools');
        } else if (key === 'enabledModels') {
          args.push('--models', value.length ? value.join(',') : '*');
        } else for (const entry of value) {
          if (entry.startsWith('-') || entry.includes('*')) throw Error(`${key} supports paths only; use Pi settings for exclusions and globs`);
          const resourcePath = entry.replace(/^\+/, '');
          const resource = key === 'extensions' && resourcePath.startsWith('builtin:') ? resourcePath :
            resolve(directory, resourcePath.startsWith('~/') ? join(homedir(), resourcePath.slice(2)) : resourcePath);
          const option = { skills: '--skill', extensions: '--extension', prompts: '--prompt-template',
            themes: '--theme', preloadSkills: '--skill' }[key];
          args.push(option, resource);
          if (key === 'preloadSkills') {
            args.push('--append-system-prompt', `Preloaded skill: ${resource}\nResolve its relative references from ${dirname(resource)}.\n\n${readFileSync(resource, 'utf8')}`);
          }
        }
      } else throw Error(`unknown field: ${key}`);
    }
    args.push(...contextArguments(directory, selections, agentDir));
  } catch (error) {
    throw Error(`invalid Locus settings: ${error.message}`);
  }
  return args;
}


async function withDirectoryLock(directory, run) {
  const target = join(directory, '.locus', 'lock');
  writeFileSync(target, '', { flag: 'a' });
  let release;
  try {
    release = await lockfile.lock(target, { stale: 120000, update: 10000, retries: 0 });
  } catch (error) {
    if (error.code !== 'ELOCKED') throw error;
    console.error('locus: another process is using this directory.');
    process.exitCode = 75;
    return 75;
  }
  try { return await run(); }
  finally { await release(); }
}

export async function launchPi(args, { directory, profileArgs = [], conversation = false,
  lockHeld = false, stdio = 'inherit' } = {}) {
  if (conversation && !lockHeld) {
    return withDirectoryLock(directory, () => launchPi(args, {
      directory, profileArgs, conversation, lockHeld: true, stdio,
    }));
  }
  const entry = fileURLToPath(import.meta.resolve('@earendil-works/pi-coding-agent'));
  const cli = join(dirname(entry), 'bundle', 'cli.js');
  const env = {
    ...process.env,
    PI_CODING_AGENT_DIR: process.env.LOCUS_AGENT_DIR || join(homedir(), '.locus', 'agent'),
  };
  if (conversation) {
    const state = join(directory, '.locus');
    const prompt = fileURLToPath(new URL('../system-prompt.md', import.meta.url));
    const docs = `Installed Pi package: ${dirname(dirname(entry))}\nLocus package: ${fileURLToPath(new URL('../', import.meta.url))}`;
    args = ['--session', join(state, 'session.jsonl'), '--session-dir', state,
      '--system-prompt', prompt, '--append-system-prompt', docs, ...profileArgs, ...args];
  }
  const handlers = new Map();
  try {
    const child = spawn(process.execPath, [cli, ...args], { stdio, env });
    for (const signal of process.platform === 'win32' ? ['SIGINT', 'SIGTERM'] : ['SIGINT', 'SIGTERM', 'SIGHUP']) {
      const handler = () => child.kill(signal);
      handlers.set(signal, handler);
      process.on(signal, handler);
    }
    process.exitCode = await new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('close', (code, signal) => resolve(code ?? (signal === 'SIGINT' ? 130 : 143)));
    });
    return process.exitCode;
  } finally {
    for (const [signal, handler] of handlers) process.off(signal, handler);
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
Settings: ~/.locus/agent/settings.json and .locus/settings.json | History: .locus/session.jsonl
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
  const agentDir = process.env.LOCUS_AGENT_DIR || join(homedir(), '.locus', 'agent');
  const rule = bootstrapRule(directory, agentDir);
  if (!rule) {
    initialize(directory);
    return launchPi(args, { directory, profileArgs: profileArguments(directory, agentDir), conversation: true });
  }
  mkdirSync(join(directory, '.locus'), { recursive: true });
  return withDirectoryLock(directory, async () => {
    const marker = join(directory, '.locus', 'bootstrap-complete');
    if (!existsSync(marker)) {
      const setupPrompt = runBootstrapHook(rule, 'prepare', directory);
      initialize(directory);
      if (setupPrompt) {
        const code = await launchPi(['-p', setupPrompt], {
          directory, profileArgs: profileArguments(directory, agentDir), conversation: true,
          lockHeld: true, stdio: ['inherit', 2, 'inherit'],
        });
        if (code !== 0) return code;
      }
      runBootstrapHook(rule, 'verify', directory);
      writeFileSync(marker, 'Setup complete.\n', { flag: 'wx' });
    } else initialize(directory);
    return launchPi(args, {
      directory, profileArgs: profileArguments(directory, agentDir), conversation: true, lockHeld: true,
    });
  });
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await main();
  } catch (error) {
    console.error(`locus: ${error.message}`);
    process.exitCode = 1;
  }
}
