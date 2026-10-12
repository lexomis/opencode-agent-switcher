import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { parse } from 'yaml';
import { isRecord } from '../core/global-priority.ts';
import { movePriorityEntryToTop, readPriorityConfig } from './priority-store.ts';

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true })));
});

it('reorders a profile without changing the model catalog, agent definitions, or comments', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'lexomis-priority-'));
  directories.push(directory);
  const path = join(directory, 'priority.yaml');
  const source = `# Team model priorities
profiles:
  Reviews:
    priority: [First, Second]
agents:
  Reviewer:
    template: review.md
    profile: Reviews
models:
  - { id: First, model: openai/first }
  - { id: Second, model: anthropic/second }
`;
  await writeFile(path, source);
  await movePriorityEntryToTop(path, {
    kind: 'profile',
    name: 'Reviews',
    id: 'Second',
    model: 'anthropic/second',
  });
  const content = await readFile(path, 'utf8');
  const before: unknown = parse(source);
  const after: unknown = parse(content);
  if (!isRecord(before) || !isRecord(after)) throw new Error('Priority documents must be mappings');
  expect(after.models).toEqual(before.models);
  expect(after.agents).toEqual(before.agents);
  expect(content).toContain('# Team model priorities');
  expect((await readPriorityConfig(path)).profiles[0].priority.map((entry) => entry.id)).toEqual(['Second', 'First']);
});
