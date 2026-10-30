#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { execve } from 'node:process';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const directory = process.cwd();
const state = join(directory, '.locus');

function fail(message) {
  console.error(`locus: ${message}`);
  process.exit(1);
}

if (args[0] === '--help' || args[0] === '-h') {
  console.log(`Usage:
  locus init                  Initialize the current directory
  locus install <source>      Install a Pi package into Locus
  locus                       Open its persistent Pi conversation
  locus "Audit your events"   Open chat with an initial message
  locus -p "Audit your events" Run once and exit
  locus --mode json "Audit"   Stream Pi events and exit

Other arguments pass through to Pi. Use /login, /model, and /settings
inside chat. Skills and extensions use Pi's normal configuration.
Conversation: .locus/session.jsonl
Requires Linux flock and Node.js 22.19 or newer.`);
  process.exit(0);
}

if (args[0] === 'init') {
  if (args.length !== 1) fail('usage: locus init');
  mkdirSync(state, { recursive: true });
  const configPath = join(state, 'config.json');
  if (!existsSync(configPath)) {
    writeFileSync(configPath, JSON.stringify({
      model: '', thinking: '', tools: [], skills: [], preloadSkills: [],
    }, null, 2) + '\n', { flag: 'wx' });
  }
  console.log('Initialized .locus/ (existing history preserved).\nRun locus to start chatting.');
  process.exit(0);
}

const piEntry = fileURLToPath(import.meta.resolve('@earendil-works/pi-coding-agent'));
const piCli = join(dirname(piEntry), 'bundle', 'cli.js');
const systemPrompt = fileURLToPath(new URL('../system-prompt.md', import.meta.url));
function execute(command, argv) {
  try {
    execve(command, argv, {
      ...process.env,
      PI_CODING_AGENT_DIR: process.env.LOCUS_AGENT_DIR || join(homedir(), '.locus', 'agent'),
    });
  } catch (error) {
    fail(error.message);
  }
}

// Package management uses shared configuration, without a conversation or lock.
if (args[0] === 'install') execute(process.execPath, [process.execPath, piCli, ...args]);

if (!existsSync(state)) fail('run locus init in this directory first.');

// A small directory profile mapped to Pi options. Explicit CLI options win.
const profileArgs = [];
try {
  const configPath = join(state, 'config.json');
  const profile = existsSync(configPath) ? JSON.parse(readFileSync(configPath, 'utf8')) : {};
  if (!profile || typeof profile !== 'object' || Array.isArray(profile)) throw Error('expected an object');
  for (const [key, value] of Object.entries(profile)) {
    if (key === 'model' || key === 'thinking') {
      if (typeof value !== 'string') throw Error(`${key} must be a string`);
      if (value.trim()) profileArgs.push(`--${key}`, value);
    } else if (['tools', 'skills', 'preloadSkills'].includes(key)) {
      if (!Array.isArray(value) || value.some(item => typeof item !== 'string' || !item.trim())) {
        throw Error(`${key} must be an array of nonempty strings`);
      }
      if (key === 'tools') {
        if (value.length) profileArgs.push('--tools', value.join(','));
      }
      else for (const path of value) {
        const skillPath = resolve(directory, path.startsWith('~/') ? join(homedir(), path.slice(2)) : path);
        profileArgs.push('--skill', skillPath);
        if (key === 'preloadSkills') {
          const file = readFileSync(skillPath, 'utf8');
          profileArgs.push('--append-system-prompt', `Preloaded skill: ${skillPath}\nResolve its relative references from ${dirname(skillPath)}.\n\n${file}`);
        }
      }
    } else throw Error(`unknown field: ${key}`);
  }
} catch (error) {
  fail(`invalid .locus/config.json: ${error.message}`);
}

// Locus owns session selection; all other setup and behavior belong to Pi.
const sessionOptions = ['--session', '--session-dir', '--session-id', '--no-session',
  '--continue', '-c', '--resume', '-r', '--fork'];
for (const arg of args.slice(0, args.indexOf('--') < 0 ? args.length : args.indexOf('--'))) {
  if (sessionOptions.some(option => arg === option || arg.startsWith(`${option}=`))) {
    fail('session-selection options are managed by Locus.');
  }
}

// Replace this process: Pi keeps the terminal and signals; flock releases on exit.
execute('/usr/bin/flock', ['flock', '--exclusive', '--nonblock', '--conflict-exit-code', '75',
    join(state, 'lock'), process.execPath, piCli,
    '--session', join(state, 'session.jsonl'), '--session-dir', state,
    '--system-prompt', systemPrompt, ...profileArgs, ...args]);
