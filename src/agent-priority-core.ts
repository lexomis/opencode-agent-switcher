import type { Plugin } from '@opencode/plugin';
import { setupGlobalRouting } from './core/global-routing.ts';

export default {
  id: 'agent-priority',
  async setup(ctx) {
    return setupGlobalRouting(ctx);
  },
} satisfies Plugin.Plugin;
