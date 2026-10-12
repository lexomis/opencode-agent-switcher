/// <reference types="node" />

import { readFile, writeFile } from 'node:fs/promises';
import { isScalar, isSeq, parseDocument } from 'yaml';
import { idFromEntry, modelFromEntry, type PriorityEntry, readPrioritySourceConfig } from '../core/global-priority.ts';

/** Strict UI view of a priority entry (id + model both present). */
type TuiPriorityEntry = {
  id: string;
  model: string;
};

export type PriorityGroupKind = 'agent' | 'profile';

export type TuiPriorityGroup = {
  kind: PriorityGroupKind;
  name: string;
  priority: TuiPriorityEntry[];
};

export type TuiPriorityConfig = {
  agents: TuiPriorityGroup[];
  profiles: TuiPriorityGroup[];
};

/** A concrete priority entry selected in the UI, identified within its alias. */
export type PriorityOptionValue = {
  kind: PriorityGroupKind;
  name: string;
  id: string;
  model: string;
};

/** Resolve an ordered list of model ids to strict `{ id, model }` UI entries. */
const toTuiPriority = (ids: ReadonlyArray<string>, models: Record<string, PriorityEntry>): TuiPriorityEntry[] =>
  ids.flatMap((id) => {
    const model = models[id];
    if (!model) return [];
    const resolvedId = idFromEntry(model);
    const resolvedModel = modelFromEntry(model);
    return resolvedId && resolvedModel ? [{ id: resolvedId, model: resolvedModel }] : [];
  });

export const readPriorityConfig = async (path: string): Promise<TuiPriorityConfig> => {
  const shared = await readPrioritySourceConfig(path);
  const profiles = Object.entries(shared.profiles).flatMap(([name, section]) => {
    const priority = toTuiPriority(section.priority, shared.models);
    return priority.length > 0 ? [{ kind: 'profile' as const, name, priority }] : [];
  });
  const agents = Object.entries(shared.agents).flatMap(([name, section]) => {
    if (!section.priority) return [];

    const priority = toTuiPriority(section.priority, shared.models);
    return priority.length > 0 ? [{ kind: 'agent' as const, name, priority }] : [];
  });

  return { agents, profiles };
};

/**
 * Promote the selected entry to the top of its alias's `priority` list in
 * priority.yaml, preserving formatting/comments via the YAML CST document.
 */
export const movePriorityEntryToTop = async (path: string, selected: PriorityOptionValue): Promise<void> => {
  const content = await readFile(path, 'utf8');
  const document = parseDocument(content);
  const sourceKey = selected.kind === 'profile' ? 'profiles' : 'agents';
  const priorityNode = document.getIn([sourceKey, selected.name, 'priority'], true);

  if (!isSeq(priorityNode)) throw new Error(`No priority list found for ${selected.name}`);

  const entryIndex = priorityNode.items.findIndex((entry) => (isScalar(entry) ? entry.value : entry) === selected.id);
  if (entryIndex === -1) throw new Error(`No priority entry found for ${selected.id}`);

  const [entryNode] = priorityNode.items.splice(entryIndex, 1);
  priorityNode.items.splice(0, 0, entryNode);

  await writeFile(path, document.toString(), 'utf8');
};
