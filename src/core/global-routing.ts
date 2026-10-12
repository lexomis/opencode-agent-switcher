import { unwatchFile, watchFile } from 'node:fs';
import type { Model, Plugin } from '@opencode/plugin';
import type { AgentEditor } from '@opencode/plugin/promise/agent';
import type { SessionContext } from '@opencode/plugin/promise/session';
import { idFromEntry, modelFromEntry, priorityFilePath, readPriorityConfig } from './global-priority.ts';

export type Route = { id: string; alias: string; model: Model.Ref; options: Record<string, unknown> };
type Routes = Map<string, Route[]>;

/** Resolve model references at the SDK boundary without importing host schema implementations. */
function modelReference(reference: string, variant?: string): Model.Ref {
  const slash = reference.indexOf('/');
  const [id, embedded] = reference.slice(slash + 1).split('#');
  return {
    providerID: reference.slice(0, slash),
    id,
    ...(variant || embedded ? { variant: variant || embedded } : {}),
  } as Model.Ref;
}

/** Load only the global model catalog; native agent files own names, prompts, and permissions. */
export async function loadRoutes(path: string): Promise<Routes> {
  const aliases = await readPriorityConfig(path);
  return new Map(
    Object.entries(aliases).map(([alias, entry]) => [
      alias,
      entry.priority.map((value) => {
        const id = idFromEntry(value),
          model = modelFromEntry(value);
        if (!id || !model) throw new Error(`Invalid model route for ${alias}`);
        const options = { ...value };
        delete options.id;
        delete options.model;
        const variant = typeof options.variant === 'string' ? options.variant : undefined;
        delete options.variant;
        return { id, alias, model: modelReference(model, variant), options };
      }),
    ]),
  );
}

/** Override only configured model preferences, never native identities or security policies. */
export function applyModels(editor: AgentEditor, routes: Routes): void {
  for (const [alias, chain] of routes) {
    if (!editor.get(alias) || !chain[0]) continue;
    editor.update(alias, (agent) => {
      agent.model = chain[0].model;
    });
  }
}

/** Choose a stable per-session route, with automatic fallback intentionally disabled. */
export function chooseRoute(
  sessionID: string,
  alias: string,
  routes: Routes,
  pins: Map<string, Route>,
): Route | undefined {
  const chain = routes.get(alias);
  if (!chain?.length) return undefined;
  const pin = pins.get(sessionID);
  const route = chain.find((candidate) => pin?.alias === alias && candidate.id === pin.id) ?? chain[0];
  pins.set(sessionID, route);
  return route;
}

/** Apply provider settings only when the request is actually using the configured route. */
export function applyContext(event: SessionContext, routes: Routes): void {
  const route = routes
    .get(event.agent)
    ?.find(
      (candidate) =>
        candidate.model.providerID === event.model.providerID &&
        candidate.model.id === event.model.id &&
        candidate.model.variant === event.model.variant,
    );
  if (route) Object.assign(event.options, route.options);
}

/** Install globally sourced model routing and dispose its watcher/event subscription on unload. */
export async function setupGlobalRouting(ctx: Plugin.Context): Promise<() => Promise<void>> {
  const path = priorityFilePath();
  let routes = await loadRoutes(path);
  let failure: unknown;
  let closed = false;
  let registration: Promise<void> | undefined;
  const pins = new Map<string, Route>();
  const ensureRegistration = () => {
    if (closed) return Promise.resolve();
    registration ??= ctx.agent.transform((editor) => applyModels(editor, routes)).then(() => undefined);
    return registration;
  };
  await ctx.session.hook('prompt', async (event) => {
    if (failure) throw failure;
    await ensureRegistration();
    const session = await ctx.session.get({ sessionID: event.sessionID });
    const route = session.agent ? chooseRoute(event.sessionID, session.agent, routes, pins) : undefined;
    if (route) await ctx.session.switchModel({ sessionID: event.sessionID, model: route.model });
  });
  await ctx.session.hook('context', async (event) => {
    if (failure) throw failure;
    await ensureRegistration();
    applyContext(event, routes);
  });
  const controller = new AbortController();
  const events = (async () => {
    try {
      for await (const event of ctx.event.subscribe({ signal: controller.signal })) {
        if (event.type === 'plugin.updated' && event.location?.directory === ctx.location.directory) {
          void ensureRegistration().catch((error: unknown) => {
            failure = error;
            console.error(error);
          });
        }
        if (event.type === 'session.deleted') pins.delete(event.data.sessionID);
      }
    } catch (error) {
      if (!controller.signal.aborted) console.error('agent-priority: event subscription failed', error);
    }
  })();
  let pending = Promise.resolve();
  const reload = () => {
    pending = pending
      .then(async () => {
        if (closed) return;
        try {
          routes = await loadRoutes(path);
          failure = undefined;
        } catch (error) {
          routes = new Map();
          pins.clear();
          failure = error;
          console.error('agent-priority: invalid global priority file', error);
        }
        if (!closed) await ctx.agent.reload();
      })
      .catch((error: unknown) => {
        failure = error;
        console.error(error);
      });
  };
  watchFile(path, { interval: 300, persistent: false }, reload);
  return async () => {
    closed = true;
    unwatchFile(path, reload);
    controller.abort();
    await Promise.all([pending, events, registration]);
  };
}
