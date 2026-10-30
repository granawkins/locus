import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { initialize, profileArguments } from '../bin/locus.js';

function workspace(t) {
  const directory = mkdtempSync(join(tmpdir(), 'locus-settings-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return directory;
}

test('initialization inherits defaults and preserves existing settings, instructions, and history', t => {
  const directory = workspace(t);
  initialize(directory);
  assert.equal(existsSync(join(directory, 'AGENTS.md')), false);
  assert.deepEqual(profileArguments(directory), []);
  const profile = join(directory, '.locus/settings.json');
  const template = JSON.parse(readFileSync(new URL('../settings.template.json', import.meta.url)));
  assert.deepEqual(JSON.parse(readFileSync(profile)), template);
  writeFileSync(profile, JSON.stringify({ model: 'mock/test', customInstructions: 'Keep audit evidence.' }));
  writeFileSync(join(directory, 'AGENTS.md'), 'Existing instructions');
  writeFileSync(join(directory, '.locus/session.jsonl'), 'existing history');
  initialize(directory);
  assert.deepEqual(profileArguments(directory), ['--model', 'mock/test', '--append-system-prompt', 'Keep audit evidence.']);
  assert.equal(readFileSync(join(directory, 'AGENTS.md'), 'utf8'), 'Existing instructions');
  assert.equal(readFileSync(join(directory, '.locus/session.jsonl'), 'utf8'), 'existing history');
});

test('legacy migration preserves its backup and adds instructions without overriding new settings', t => {
  const directory = workspace(t);
  mkdirSync(join(directory, '.locus'));
  const legacy = JSON.stringify({ systemPrompt: 'Local instructions', tools: [] });
  writeFileSync(join(directory, '.locus/config.json'), legacy);
  assert.deepEqual(profileArguments(directory), ['--append-system-prompt', 'Local instructions']);
  assert.equal(readFileSync(join(directory, '.locus/config.json'), 'utf8'), legacy);
  writeFileSync(join(directory, '.locus/settings.json'), '{}');
  assert.deepEqual(profileArguments(directory), []);
});

test('skill paths resolve from the target directory and preloads include full instructions', t => {
  const directory = workspace(t);
  initialize(directory);
  mkdirSync(join(directory, 'skills'));
  const skill = join(directory, 'skills/SKILL.md');
  writeFileSync(skill, 'Detailed skill instructions');
  writeFileSync(join(directory, '.locus/settings.json'), JSON.stringify({
    tools: ['+grep'], skills: ['skills'], preloadSkills: ['skills/SKILL.md'],
  }));
  const args = profileArguments(directory);
  assert.deepEqual(args.slice(0, 6), ['--tools', '+grep', '--skill', join(directory, 'skills'), '--skill', skill]);
  assert.equal(args[6], '--append-system-prompt');
  assert.ok(args[7].includes('Detailed skill instructions'));
  assert.ok(args[7].includes(join(directory, 'skills')));
});

test('invalid profiles fail with a useful settings error', t => {
  const directory = workspace(t);
  initialize(directory);
  const path = join(directory, '.locus/settings.json');
  for (const contents of ['{broken', '[]', '{"unknown":true}', '{"skills":[2]}', '{"model":null}']) {
    writeFileSync(path, contents);
    assert.throws(() => profileArguments(directory), /invalid \.locus\/settings.json/);
  }
});
