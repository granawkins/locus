#!/usr/bin/env node
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
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
  console.log('Initialized .locus/ (existing history preserved).\nRun locus to start chatting.');
  process.exit(0);
}

if (!existsSync(state)) fail('run locus init in this directory first.');

// Locus owns session selection; all other setup and behavior belong to Pi.
const sessionOptions = ['--session', '--session-dir', '--session-id', '--no-session',
  '--continue', '-c', '--resume', '-r', '--fork'];
for (const arg of args.slice(0, args.indexOf('--') < 0 ? args.length : args.indexOf('--'))) {
  if (sessionOptions.some(option => arg === option || arg.startsWith(`${option}=`))) {
    fail('session-selection options are managed by Locus.');
  }
}

const piEntry = fileURLToPath(import.meta.resolve('@earendil-works/pi-coding-agent'));
const piCli = join(dirname(piEntry), 'bundle', 'cli.js');
const systemPrompt = fileURLToPath(new URL('../system-prompt.md', import.meta.url));
try {
  // Replace this process: Pi keeps the terminal and signals; flock releases on exit.
  execve('/usr/bin/flock', ['flock', '--exclusive', '--nonblock', '--conflict-exit-code', '75',
    join(state, 'lock'), process.execPath, piCli,
    '--session', join(state, 'session.jsonl'), '--session-dir', state,
    '--system-prompt', systemPrompt, ...args], {
      ...process.env,
      PI_CODING_AGENT_DIR: process.env.LOCUS_AGENT_DIR || join(homedir(), '.locus', 'agent'),
    });
} catch (error) {
  fail(error.message);
}
