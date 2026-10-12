/// <reference types="node" />

import { unwatchFile, watchFile } from 'node:fs';
import { Plugin } from '@opencode/plugin/tui';
import { priorityFilePath } from './core/global-priority.ts';
import { refreshPrioritySidebar, renderPrioritySidebar } from './tui/entry.ts';
import {
  movePriorityEntryToTop,
  type PriorityGroupKind,
  type PriorityOptionValue,
  readPriorityConfig,
} from './tui/priority-store.ts';

type GroupValue = { kind: PriorityGroupKind; name: string };

export default Plugin.define({
  id: 'agent-priority',
  setup(context) {
    const priorityPath = priorityFilePath();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let disposed = false;

    const refresh = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = undefined;
        if (!disposed) refreshPrioritySidebar();
      }, 150);
    };
    watchFile(priorityPath, { interval: 300, persistent: false }, refresh);

    const choosePriority = async (group: GroupValue): Promise<void> => {
      const config = await readPriorityConfig(priorityPath);
      const selectedGroup = config[group.kind === 'profile' ? 'profiles' : 'agents'].find(
        (item) => item.name === group.name,
      );
      if (!selectedGroup) {
        context.ui.toast.show({ message: `${group.name} priority was not found`, variant: 'error' });
        return;
      }
      const selected = await context.ui.dialog.select<PriorityOptionValue>({
        title: `${group.name} Priority`,
        options: selectedGroup.priority.map((entry, index) => ({
          title: index === 0 ? `▶ ${entry.id}` : entry.id,
          value: { kind: group.kind, name: group.name, id: entry.id, model: entry.model },
          description: index === 0 ? `${entry.model} (current)` : entry.model,
        })),
      });
      if (!selected) return;
      try {
        await movePriorityEntryToTop(priorityPath, selected);
        refreshPrioritySidebar();
        context.ui.toast.show({
          message: `${selected.name}: ${selected.id} is now first priority`,
          variant: 'success',
        });
      } catch (error) {
        context.ui.toast.show({
          message: error instanceof Error ? error.message : 'Unable to update agent priority',
          variant: 'error',
        });
      }
    };

    context.keymap.layer(() => ({
      mode: 'global',
      commands: [
        {
          id: 'agent-priority.change',
          title: 'Change Agents Priority',
          group: 'Agents',
          palette: true,
          slash: { name: 'change-agents-priority' },
          run: async () => {
            try {
              const config = await readPriorityConfig(priorityPath);
              const groups: GroupValue[] = [...config.profiles, ...config.agents].map(({ kind, name }) => ({
                kind,
                name,
              }));
              const group = await context.ui.dialog.select<GroupValue>({
                title: 'Global Agent Priority',
                options: groups.map((value) => ({
                  title: value.name,
                  value,
                  description: value.kind === 'profile' ? 'Profile' : 'Priority agent',
                })),
              });
              if (group) await choosePriority(group);
            } catch (error) {
              context.ui.toast.show({
                message: error instanceof Error ? error.message : 'Unable to read global priorities',
                variant: 'error',
              });
            }
          },
        },
      ],
    }));

    const removeSlot = context.ui.slot({
      append: 'sidebar.content',
      render: () => renderPrioritySidebar(),
    });
    return () => {
      disposed = true;
      unwatchFile(priorityPath, refresh);
      removeSlot();
      if (timer) clearTimeout(timer);
    };
  },
});
