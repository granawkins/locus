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
  assert.deepEqual(JSON.parse(readFileSync(profile)), JSON.parse(readFileSync(new URL('../settings.template.json', import.meta.url))));
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

test('Pi-named local settings pass through supported CLI options', t => {
  const directory = workspace(t);
  const agent = join(directory, 'agent');
  mkdirSync(agent);
  initialize(directory);
  writeFileSync(join(agent, 'settings.json'), JSON.stringify({ defaultModel: 'test' }));
  writeFileSync(join(directory, '.locus/settings.json'), JSON.stringify({
    defaultProvider: 'mock', defaultThinkingLevel: 'high', enabledModels: ['mock/*'],
    defaultTools: ['+grep'], theme: 'dark', tuiMode: 'regular',
    skills: ['skills'], extensions: ['review.js'], prompts: ['prompts'], themes: ['theme.json'],
  }));
  assert.deepEqual(profileArguments(directory, agent), [
    '--provider', 'mock', '--model', 'test', '--thinking', 'high', '--models', 'mock/*',
    '--tools', '+grep', '--use-theme', 'dark', '--tui-mode', 'regular',
    '--skill', join(directory, 'skills'), '--extension', join(directory, 'review.js'),
    '--prompt-template', join(directory, 'prompts'), '--theme', join(directory, 'theme.json'),
  ]);
  writeFileSync(join(directory, '.locus/settings.json'), JSON.stringify({ defaultTools: [] }));
  assert.deepEqual(profileArguments(directory, agent), ['--no-builtin-tools']);
  writeFileSync(join(directory, '.locus/settings.json'), JSON.stringify({ enabledModels: [] }));
  assert.deepEqual(profileArguments(directory, agent), ['--models', '*']);
});

test('context lists exclude ancestors and include files outside discovery', t => {
  const directory = workspace(t);
  const source = join(directory, 'source');
  const agent = join(directory, 'agent');
  mkdirSync(source);
  mkdirSync(agent);
  initialize(source);
  const parentFile = join(directory, 'AGENTS.md');
  const sourceFile = join(source, 'AGENTS.md');
  const extraFile = join(directory, 'extra.md');
  writeFileSync(parentFile, 'Parent instructions');
  writeFileSync(sourceFile, 'Source instructions');
  writeFileSync(extraFile, 'Extra instructions');
  writeFileSync(join(source, '.locus/settings.json'), JSON.stringify({
    contextFiles: { include: [extraFile, sourceFile, parentFile], exclude: [parentFile] },
  }));
  assert.deepEqual(profileArguments(source, agent), [
    '--no-context-files', '--append-system-prompt', sourceFile,
    '--append-system-prompt', extraFile,
  ]);
});

test('global and local Locus settings combine context lists with their own path bases', t => {
  const directory = workspace(t);
  const source = join(directory, 'source');
  const agent = join(directory, 'agent');
  mkdirSync(source);
  mkdirSync(agent);
  const parentFile = join(directory, 'AGENTS.md');
  const sourceFile = join(source, 'AGENTS.md');
  const globalFile = join(agent, 'global.md');
  const localFile = join(source, 'local.md');
  for (const file of [parentFile, sourceFile, globalFile, localFile]) writeFileSync(file, file);
  writeFileSync(join(agent, 'settings.json'), JSON.stringify({
    defaultModel: 'mock/test', contextFiles: { include: ['global.md'], exclude: [parentFile] },
  }));
  initialize(source);
  writeFileSync(join(source, '.locus/settings.json'), JSON.stringify({
    contextFiles: { include: ['local.md', parentFile], exclude: [globalFile] },
  }));
  assert.deepEqual(profileArguments(source, agent), [
    '--no-context-files', '--append-system-prompt', sourceFile,
    '--append-system-prompt', localFile,
  ]);
});

test('invalid profiles fail with a useful settings error', t => {
  const directory = workspace(t);
  initialize(directory);
  const path = join(directory, '.locus/settings.json');
  for (const contents of ['{broken', '[]', '{"unknown":true}', '{"skills":[2]}', '{"model":null}',
    '{"defaultModel":null}', '{"defaultProvider":"mock"}', '{"defaultTools":["read","+grep"]}',
    '{"contextFiles":[]}', '{"contextFiles":{"include":"AGENTS.md"}}',
    '{"contextFiles":{"exclude":["missing.md"]}}',
    '{"contextFiles":{"include":["missing.md"]}}']) {
    writeFileSync(path, contents);
    assert.throws(() => profileArguments(directory), /invalid Locus settings/);
  }
});
