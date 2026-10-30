import { readFileSync } from 'node:fs';
import { initialize, profileArguments } from './settings.js';
import { launchPi } from './pi.js';

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
Requires Linux flock and Node.js 22.19 or newer.`;

export function main(args = process.argv.slice(2), directory = process.cwd()) {
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
