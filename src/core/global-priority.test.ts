import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { priorityFilePath, readPriorityConfig } from './global-priority.ts';
import { chooseRoute, loadRoutes, type Route } from './global-routing.ts';

const directories: string[] = [];
afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true })));
});

async function fixture(content = '{}') {
  const root = await mkdtemp(join(tmpdir(), 'global-priority-'));
  directories.push(root);
  await mkdir(join(root, 'agents'));
  const file = join(root, 'agents', 'priority.yaml');
  await writeFile(file, content);
  vi.stubEnv('OPENCODE_CONFIG_DIR', root);
  return { root, file };
}

it('uses only the global config path', async () => {
  const { root, file } = await fixture();
  await mkdir(join(root, 'project', '.opencode', 'agents'), { recursive: true });
  await writeFile(join(root, 'project', '.opencode', 'agents', 'priority.yaml'), 'broken: [');
  expect(priorityFilePath()).toBe(file);
  expect(await readPriorityConfig(file)).toEqual({});
});

it('rejects malformed global priorities instead of silently accepting empty data', async () => {
  const { file } = await fixture('agents: [');
  await expect(readPriorityConfig(file)).rejects.toThrow();
  await writeFile(file, 'agents:\n  Coder:\n    template: Coder.md\n    priority: [Missing]\n');
  await expect(readPriorityConfig(file)).rejects.toThrow('Unknown model');
});

it('resolves profiles and pins existing sessions while new sessions follow reordered priorities', async () => {
  const { file } = await fixture(`agents:
  Coder: { template: Coder.md, profile: Main }
profiles:
  Main: { priority: [First, Second] }
models:
  - { id: First, model: openai/test#high, reasoningEffort: high }
  - { id: Second, model: anthropic/test }
`);
  let routes = await loadRoutes(file);
  const pins = new Map<string, Route>();
  expect(chooseRoute('old', 'Coder', routes, pins)?.id).toBe('First');
  expect(routes.get('Coder')?.[0].model.variant).toBe('high');
  await writeFile(file, (await readFile(file, 'utf8')).replace('[First, Second]', '[Second, First]'));
  routes = await loadRoutes(file);
  expect(chooseRoute('old', 'Coder', routes, pins)?.id).toBe('First');
  expect(chooseRoute('new', 'Coder', routes, pins)?.id).toBe('Second');
});
