import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { OpenCode } from '@opencode/client';

const pluginDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const configDirectory = await mkdtemp(join(tmpdir(), 'lexomis-smoke-'));
const fixtureDirectory = join(configDirectory, 'project');
await mkdir(fixtureDirectory);
const globalDirectory = join(process.env.HOME, '.config', 'opencode');
for (const name of ['agents', 'commands', 'skills']) {
  await cp(join(globalDirectory, name), join(configDirectory, name), { recursive: true });
}
const globalConfig = JSON.parse(await readFile(join(globalDirectory, 'opencode.json'), 'utf8'));
await writeFile(
  join(configDirectory, 'opencode.json'),
  JSON.stringify({
    permissions: globalConfig.permissions,
    plugins: [pluginDirectory],
  }),
);
await writeFile(
  join(fixtureDirectory, 'opencode.json'),
  JSON.stringify({
    default_agent: 'Planner',
    agents: {
      build: { disabled: true },
      plan: { disabled: true },
      explore: { disabled: true },
      general: { disabled: true },
    },
  }),
);
const password = randomBytes(24).toString('base64url');
const server = spawn('opencode2', ['serve', '--stdio', '--port', '0', '--print-logs'], {
  cwd: fixtureDirectory,
  env: {
    ...process.env,
    OPENCODE_CONFIG_DIR: configDirectory,
    OPENCODE_DB: ':memory:',
    OPENCODE_PASSWORD: password,
    OPENCODE_CONFIG_PROJECT_DISABLE: '0',
    OPENCODE_DISABLE_MODELS_FETCH: '1',
    OPENCODE_CONFIG_CONTENT: '{}',
  },
  stdio: ['pipe', 'pipe', 'pipe'],
});
let diagnostics = '';
server.stderr.on('data', (data) => {
  diagnostics += data.toString();
});

try {
  const baseUrl = await new Promise((accept, reject) => {
    let pending = '';
    const timeout = setTimeout(() => reject(new Error('Private server startup timed out')), 12_000);
    server.once('exit', (code) => {
      clearTimeout(timeout);
      reject(new Error(`Private server exited (${code})`));
    });
    server.stdout.on('data', (data) => {
      pending += data.toString();
      for (;;) {
        const end = pending.indexOf('\n');
        if (end < 0) break;
        const line = pending.slice(0, end);
        pending = pending.slice(end + 1);
        try {
          const value = JSON.parse(line);
          if (typeof value.url === 'string') {
            clearTimeout(timeout);
            accept(value.url);
          }
        } catch {
          // The stdio server may log before its readiness response.
        }
      }
    });
  });
  const client = OpenCode.make({
    baseUrl,
    headers: { authorization: `Basic ${Buffer.from(`opencode:${password}`).toString('base64')}` },
  });
  const location = { directory: fixtureDirectory };
  const session = await client.session.create({ location, agent: 'Planner' }, { signal: AbortSignal.timeout(15_000) });
  await client.session.prompt(
    { sessionID: session.id, text: 'Lexomis readiness probe', resume: false },
    { signal: AbortSignal.timeout(20_000) },
  );
  const { data: agents } = await client.agent.list({ location });
  for (const id of ['Planner', 'Builder', 'Coder', 'PlanBuilder']) {
    const agent = agents.find((entry) => entry.id === id);
    assert.ok(agent && !agent.hidden && agent.name === id, `${id} alias missing`);
    console.log(
      JSON.stringify({
        id: agent.id,
        name: agent.name,
        mode: agent.mode,
        model: agent.model,
        permissionRules: agent.permissions.length,
      }),
    );
  }
  assert.equal(session.agent, 'Planner');
  assert.ok(
    agents
      .find((agent) => agent.id === 'Coder')
      .permissions.some((rule) => rule.action === 'edit' && rule.effect === 'deny'),
  );
  const alias = agents.find((agent) => agent.id === 'Planner');
  assert.ok(
    !agents.some((agent) => /^(primary|subagents)\//.test(agent.id)),
    'Flat global agents must not create filepath aliases',
  );
  const globalRule = alias.permissions.findIndex(
    (rule) => rule.action === 'shell' && rule.resource === 'ls *' && rule.effect === 'allow',
  );
  const agentRule = alias.permissions.findIndex(
    (rule) => rule.action === 'shell' && rule.resource === '*' && rule.effect === 'deny',
  );
  assert.ok(globalRule >= 0 && agentRule > globalRule, 'Agent permissions must follow global permissions');
  const { data: commands } = await client.command.list({ location });
  for (const name of ['05-verify', 'build-fix', 'maintain-docs']) {
    assert.ok(
      commands.some((command) => command.name === name),
      `Global command missing: ${name}; found ${commands.map((command) => command.name).join(', ')}`,
    );
  }
  const { data: skills } = await client.skill.list({ location });
  for (const id of ['superpowers', 'tasks', 'writing-skills', 'readme-writer', 'diagram-creation']) {
    assert.ok(
      skills.some((skill) => skill.id === id),
      `Global skill missing: ${id}`,
    );
  }
  console.log(
    'PASS: global plugin, native agents, commands, skills, and permission ordering; no model request submitted.',
  );
} catch (error) {
  for (const line of diagnostics.split('\n')) {
    if (/agent-priority|plugin.*(error|fail)|error.*plugin/i.test(line)) console.error(line);
  }
  throw error;
} finally {
  server.stdin.end();
  await new Promise((accept) => {
    const timeout = setTimeout(() => {
      server.kill('SIGTERM');
      accept();
    }, 2_000);
    server.once('exit', () => {
      clearTimeout(timeout);
      accept();
    });
  });
  await rm(configDirectory, { recursive: true, force: true });
}
