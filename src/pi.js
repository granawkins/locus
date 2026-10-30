import { dirname, join } from 'node:path';
import { homedir } from 'node:os';
import { execve } from 'node:process';
import { fileURLToPath } from 'node:url';

export function launchPi(args, { directory, profileArgs = [], conversation = false } = {}) {
  const entry = fileURLToPath(import.meta.resolve('@earendil-works/pi-coding-agent'));
  const cli = join(dirname(entry), 'bundle', 'cli.js');
  const env = {
    ...process.env,
    PI_CODING_AGENT_DIR: process.env.LOCUS_AGENT_DIR || join(homedir(), '.locus', 'agent'),
  };
  if (!conversation) return execve(process.execPath, [process.execPath, cli, ...args], env);

  const state = join(directory, '.locus');
  const prompt = fileURLToPath(new URL('../system-prompt.md', import.meta.url));
  const docs = `Installed Pi package: ${dirname(dirname(entry))}\nLocus package: ${fileURLToPath(new URL('../', import.meta.url))}`;
  // Replacing this process preserves terminal control and signals. The OS releases the lock on exit.
  return execve('/usr/bin/flock', ['flock', '--exclusive', '--nonblock', '--conflict-exit-code', '75',
    join(state, 'lock'), process.execPath, cli,
    '--session', join(state, 'session.jsonl'), '--session-dir', state,
    '--system-prompt', prompt, '--append-system-prompt', docs, ...profileArgs, ...args], env);
}
