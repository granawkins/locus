import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const cli = fileURLToPath(new URL('../bin/locus.js', import.meta.url));
function run(args, cwd, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cli, ...args], { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', code => resolve({ code, stdout, stderr }));
  });
}
function workspace(t) {
  const directory = mkdtempSync(join(tmpdir(), 'locus-cli-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const agent = join(directory, 'agent');
  mkdirSync(agent);
  return { directory, agent, env: { ...process.env, LOCUS_AGENT_DIR: agent, PI_OFFLINE: '1' } };
}

test('help/version and package installation work without initializing a conversation', async t => {
  const { directory, agent, env } = workspace(t);
  assert.match((await run(['--help'], directory, env)).stdout, /locus install/);
  assert.equal((await run(['--version'], directory, env)).stdout.trim(), '0.1.0');
  assert.equal((await run(['-p', 'hello'], directory, env)).code, 1);
  const resource = join(directory, 'resource');
  mkdirSync(resource);
  writeFileSync(join(resource, 'package.json'), JSON.stringify({ name: 'locus-test-resource', version: '0.0.0', pi: { skills: ['./skills'] } }));
  mkdirSync(join(resource, 'skills'));
  const installed = await run(['install', resource], directory, env);
  assert.equal(installed.code, 0, installed.stderr);
  const settings = JSON.parse(readFileSync(join(agent, 'settings.json')));
  assert.ok(settings.packages.some(path => join(agent, path) === resource));
  assert.equal(existsSync(join(directory, '.locus')), false);
  assert.notEqual((await run(['install'], directory, env)).code, 0);
});

test('real Pi persists history, loads skills and additive instructions, and respects locks', { timeout: 30000 }, async t => {
  const { directory, agent, env } = workspace(t);
  const requests = [];
  const server = createServer(async (request, response) => {
    let body = '';
    for await (const chunk of request) body += chunk;
    requests.push(JSON.parse(body));
    response.writeHead(200, { 'Content-Type': 'text/event-stream' });
    for (const [delta, finish] of [[{ role: 'assistant', content: 'The blue lantern is remembered.' }, null], [{}, 'stop']]) {
      response.write(`data: ${JSON.stringify({ id: 'local-test', object: 'chat.completion.chunk', created: 1,
        model: 'test', choices: [{ index: 0, delta, finish_reason: finish }] })}\n\n`);
    }
    response.end('data: [DONE]\n\n');
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => server.close());
  writeFileSync(join(agent, 'models.json'), JSON.stringify({ providers: { mock: {
    baseUrl: `http://127.0.0.1:${server.address().port}/v1`, api: 'openai-completions', apiKey: 'local-test',
    models: [{ id: 'test', contextWindow: 32768, maxTokens: 1024 }],
  } } }));
  writeFileSync(join(agent, 'settings.json'), JSON.stringify({ defaultProvider: 'mock', defaultModel: 'test', defaultTools: ['read', 'bash', 'edit', 'write', 'grep'] }));
  const skill = join(agent, 'skills', 'audit');
  mkdirSync(skill, { recursive: true });
  writeFileSync(join(skill, 'SKILL.md'), '---\nname: audit\ndescription: Audit the violet anchor.\n---\nKeep the detailed audit record.\n');
  assert.equal((await run(['init'], directory, env)).code, 0);
  writeFileSync(join(directory, 'AGENTS.md'), 'Keep the amber compass.');
  writeFileSync(join(directory, '.locus/settings.json'), JSON.stringify({ customInstructions: 'Keep the silver compass.', preloadSkills: [join(skill, 'SKILL.md')] }));
  const flags = ['--no-extensions', '--no-mcp'];
  const first = await run([...flags, '-p', 'Remember the blue lantern.'], directory, env);
  assert.equal(first.code, 0, first.stderr);
  assert.match(first.stdout, /blue lantern/);
  const system = JSON.stringify(requests[0].messages);
  for (const text of ['You are Locus', 'amber compass', 'silver compass', 'violet anchor', 'detailed audit record', 'Installed Pi package:']) assert.ok(system.includes(text), text);
  assert.ok(requests[0].tools.some(tool => tool.function?.name === 'grep'));
  const transcript = join(directory, '.locus/session.jsonl');
  const before = readFileSync(transcript, 'utf8').trim().split('\n').map(JSON.parse);
  const second = await run([...flags, '--mode', 'json', 'What did I ask you to remember?'], directory, env);
  assert.equal(second.code, 0, second.stderr);
  assert.ok(JSON.stringify(requests[1].messages).includes('Remember the blue lantern.'));
  assert.ok(second.stdout.trim().split('\n').map(JSON.parse).some(event => event.type === 'agent_settled'));
  const after = readFileSync(transcript, 'utf8').trim().split('\n').map(JSON.parse);
  assert.equal(after[0].id, before[0].id);
  assert.ok(after.length > before.length);

  const holder = spawn('/usr/bin/flock', ['--exclusive', '--no-fork', join(directory, '.locus/lock'), process.execPath,
    '-e', 'process.stdout.write("ready");setInterval(()=>{},1000)'], { stdio: ['ignore', 'pipe', 'ignore'] });
  t.after(() => holder.kill());
  await once(holder.stdout, 'data');
  assert.equal((await run([...flags, '-p', 'must not run'], directory, env)).code, 75);
  const stopped = once(holder, 'close');
  holder.kill();
  await stopped;
  assert.equal((await run(['--session', 'other.jsonl'], directory, env)).code, 1);
  assert.equal(requests.length, 2);
});
