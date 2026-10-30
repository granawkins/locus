#!/usr/bin/env node
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
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
  const instructions = join(directory, 'AGENTS.md');
  if (!existsSync(instructions)) {
    writeFileSync(instructions, `# Directory agent

You are the resident agent for this directory. Continue the work recorded
in your conversation. Keep useful notes and working files here as needed.
Inspect existing files before making changes. Use the available skills
and tools. Leave .locus/ session files to Pi; do not edit them yourself.
`, { flag: 'wx' });
  }
  console.log('Initialized .locus/ (existing instructions and history preserved).\nRun locus to start chatting.');
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
try {
  // Replace this process: Pi keeps the terminal and signals; flock releases on exit.
  execve('/usr/bin/flock', ['flock', '--exclusive', '--nonblock', '--conflict-exit-code', '75',
    join(state, 'lock'), process.execPath, piCli,
    '--session', join(state, 'session.jsonl'), '--session-dir', state, ...args], process.env);
} catch (error) {
  fail(error.message);
}
