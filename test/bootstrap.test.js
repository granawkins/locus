import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { bootstrapRule, runBootstrapHook } from '../bin/bootstrap.js';

function workspace(t) {
  const root = mkdtempSync(join(tmpdir(), 'locus-bootstrap-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const agent = join(root, 'agent');
  const sources = join(root, 'sources');
  const source = join(sources, 'city', 'venue');
  mkdirSync(agent);
  mkdirSync(source, { recursive: true });
  return { root, agent, sources, source };
}

test('global bootstrap applies only at the configured directory depth', t => {
  const { agent, sources, source } = workspace(t);
  const rule = { root: sources, depth: 2, command: [process.execPath, '/tmp/hook.js'] };
  writeFileSync(join(agent, 'settings.json'), JSON.stringify({ bootstrap: [rule] }));
  assert.deepEqual(bootstrapRule(source, agent), rule);
  assert.equal(bootstrapRule(sources, agent), null);
  assert.equal(bootstrapRule(join(sources, 'city'), agent), null);
  const nested = join(source, 'subdir');
  mkdirSync(nested);
  assert.equal(bootstrapRule(nested, agent), null);
});

test('invalid rules fail before any hook runs', t => {
  const { agent, source } = workspace(t);
  for (const bootstrap of [{}, [{ root: 'relative', depth: 2, command: ['node'] }],
    [{ root: '/tmp', depth: 0, command: ['node'] }],
    [{ root: '/tmp', depth: 2, command: [] }]]) {
    writeFileSync(join(agent, 'settings.json'), JSON.stringify({ bootstrap }));
    assert.throws(() => bootstrapRule(source, agent), /bootstrap/);
  }
});

test('hook receives its action and directory without shell interpolation', t => {
  const { root, source } = workspace(t);
  const hook = join(root, 'hook.js');
  writeFileSync(hook, `const fs = require('fs'); const [action, directory] = process.argv.slice(2);
if (action === 'prepare') console.log(JSON.stringify({ prompt: directory }));
else fs.writeFileSync(directory + '/verified', action);`);
  const rule = { command: [process.execPath, hook] };
  assert.equal(runBootstrapHook(rule, 'prepare', source), source);
  runBootstrapHook(rule, 'verify', source);
  assert.equal(readFileSync(join(source, 'verified'), 'utf8'), 'verify');
});
