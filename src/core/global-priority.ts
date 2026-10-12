import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { parse } from 'yaml';

export type PriorityEntry = Record<string, unknown>;
export type PrioritySourceConfig = {
  profiles: Record<string, { priority: string[] }>;
  agents: Record<string, { template: string; priority?: string[]; profile?: string }>;
  models: Record<string, PriorityEntry>;
};
export type PriorityAlias = { template: string; priority: PriorityEntry[] };

/** Resolve the global OpenCode config directory, including isolated test overrides. */
export function globalConfigDirectory(): string {
  return resolve(
    process.env.OPENCODE_CONFIG_DIR ?? join(process.env.XDG_CONFIG_HOME ?? join(homedir(), '.config'), 'opencode'),
  );
}

/** Return the sole priority source. Project priority files are intentionally ignored. */
export function priorityFilePath(): string {
  return join(globalConfigDirectory(), 'agents', 'priority.yaml');
}

/** Narrow parsed YAML values before using them. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function mapping(value: unknown, label: string): Record<string, unknown> {
  if (value === undefined) return {};
  if (!isRecord(value)) throw new Error(`${label} must be a mapping`);
  return value;
}

function ids(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || !value.every((item) => typeof item === 'string' && item.trim())) {
    throw new Error(`${label} must be a list of model IDs`);
  }
  return value.map((item: string) => item.trim());
}

/** Read global priorities strictly; unreadable or malformed files never silently become defaults. */
export async function readPrioritySourceConfig(path: string): Promise<PrioritySourceConfig> {
  const document: unknown = parse(await readFile(path, 'utf8'));
  if (!isRecord(document)) throw new Error(`Priority config must be a mapping: ${path}`);
  const config: PrioritySourceConfig = { profiles: {}, agents: {}, models: {} };
  if (document.models !== undefined) {
    if (!Array.isArray(document.models)) throw new Error('models must be a list');
    for (const value of document.models) {
      if (!isRecord(value)) throw new Error('Each model must be a mapping');
      const id = idFromEntry(value),
        model = modelFromEntry(value);
      if (!id || !model || !/^[^/#]+\/[^#]+(?:#[^#]+)?$/.test(model)) {
        throw new Error('Each model needs an ID and provider/model reference');
      }
      if (config.models[id]) throw new Error(`Duplicate model ID: ${id}`);
      config.models[id] = value;
    }
  }
  for (const [name, value] of Object.entries(mapping(document.profiles, 'profiles'))) {
    if (!isRecord(value)) throw new Error(`Profile ${name} must be a mapping`);
    config.profiles[name] = { priority: ids(value.priority, `profiles.${name}.priority`) };
  }
  for (const [name, value] of Object.entries(mapping(document.agents, 'agents'))) {
    if (!isRecord(value) || typeof value.template !== 'string' || !value.template.trim()) {
      throw new Error(`Agent ${name} needs a template`);
    }
    if (value.profile !== undefined && typeof value.profile !== 'string') {
      throw new Error(`Agent ${name} profile must be a string`);
    }
    config.agents[name] = {
      template: value.template,
      ...(value.priority === undefined ? {} : { priority: ids(value.priority, `agents.${name}.priority`) }),
      ...(typeof value.profile === 'string' ? { profile: value.profile } : {}),
    };
  }
  for (const [name, profile] of Object.entries(config.profiles)) {
    for (const id of profile.priority)
      if (!config.models[id]) throw new Error(`Unknown model ${id} in profile ${name}`);
  }
  for (const [name, agent] of Object.entries(config.agents)) {
    if (agent.profile && !config.profiles[agent.profile])
      throw new Error(`Unknown profile ${agent.profile} for ${name}`);
    for (const id of agent.priority ?? []) if (!config.models[id]) throw new Error(`Unknown model ${id} for ${name}`);
  }
  return config;
}

/** Resolve agent/profile model IDs without merging any project data. */
export async function readPriorityConfig(path: string): Promise<Record<string, PriorityAlias>> {
  const config = await readPrioritySourceConfig(path);
  return Object.fromEntries(
    Object.entries(config.agents).map(([name, agent]) => {
      const priority = agent.priority ?? (agent.profile ? config.profiles[agent.profile].priority : []);
      return [name, { template: agent.template, priority: priority.map((id) => config.models[id]) }];
    }),
  );
}

/** Read the catalog ID of a priority entry. */
export function idFromEntry(entry: PriorityEntry): string | undefined {
  return typeof entry.id === 'string' && entry.id.trim() ? entry.id.trim() : undefined;
}

/** Read the provider/model reference of a priority entry. */
export function modelFromEntry(entry: PriorityEntry): string | undefined {
  return typeof entry.model === 'string' && entry.model.trim() ? entry.model.trim() : undefined;
}
