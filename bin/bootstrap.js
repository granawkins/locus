import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';

export function bootstrapRule(directory, agentDir) {
  const settingsPath = join(agentDir, 'settings.json');
  if (!existsSync(settingsPath)) return null;
  const rules = JSON.parse(readFileSync(settingsPath, 'utf8')).bootstrap;
  if (rules === undefined) return null;
  if (!Array.isArray(rules)) throw Error('global bootstrap must be a list of rules');

  const target = realpathSync(directory);
  for (const rule of rules) {
    if (!rule || typeof rule !== 'object' || Array.isArray(rule) ||
        typeof rule.root !== 'string' || !isAbsolute(rule.root) ||
        !Number.isInteger(rule.depth) || rule.depth < 1 ||
        !Array.isArray(rule.command) || !rule.command.length ||
        rule.command.some(part => typeof part !== 'string' || !part.trim())) {
      throw Error('bootstrap rules need an absolute root, positive depth, and command list');
    }
    const root = existsSync(rule.root) ? realpathSync(rule.root) : resolve(rule.root);
    const path = relative(root, target);
    if (path && path !== '..' && !path.startsWith(`..${sep}`) &&
        !isAbsolute(path) && path.split(sep).length === rule.depth) return rule;
  }
  return null;
}

export function runBootstrapHook(rule, action, directory) {
  const result = spawnSync(rule.command[0], [...rule.command.slice(1), action, directory], {
    cwd: directory, encoding: 'utf8', timeout: 30000, maxBuffer: 65536,
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  if (result.error) throw Error(`bootstrap ${action}: ${result.error.message}`);
  if (result.status !== 0) throw Error(`bootstrap ${action} failed with exit code ${result.status}`);
  if (action !== 'prepare') return;
  let response;
  try { response = JSON.parse(result.stdout); }
  catch { throw Error('bootstrap prepare must return JSON with a prompt'); }
  if (!response || typeof response !== 'object' || Array.isArray(response) ||
      !(response.prompt === null || (typeof response.prompt === 'string' && response.prompt.trim()))) {
    throw Error('bootstrap prepare must return a nonempty prompt or null');
  }
  return response.prompt;
}
