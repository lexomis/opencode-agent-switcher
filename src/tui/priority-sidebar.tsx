/** @jsxImportSource @opentui/solid */

import { usePlugin } from '@opencode/plugin/tui';
import { createEffect, createSignal } from 'solid-js';
import { priorityFilePath } from '../core/global-priority.ts';
import { readPriorityConfig, type TuiPriorityGroup } from './priority-store.ts';

type Props = { refreshKey: () => number };

/** Display configured first-priority agents and profiles in the CLI sidebar. */
export function PrioritySidebar(props: Props) {
  const context = usePlugin();
  const [agents, setAgents] = createSignal<TuiPriorityGroup[]>([]);
  const [profiles, setProfiles] = createSignal<TuiPriorityGroup[]>([]);
  const [collapsed, setCollapsed] = createSignal(false);
  const [error, setError] = createSignal<string>();

  const rowColor = (index: number) => {
    const palette = context.theme.categorical;
    return palette.length ? palette[index % palette.length][500] : context.theme.hue.accent[500];
  };

  const rows = (groups: TuiPriorityGroup[], colorOffset = 0) =>
    groups.length ? (
      groups.map((group, index) => (
        <box width="100%" flexDirection="row" gap={1}>
          <text fg={rowColor(colorOffset + index)} flexGrow={1} flexShrink={1} minWidth={0} truncate>
            <b>{group.name}</b>
          </text>
          <text fg={context.theme.text.muted} flexShrink={0} textAlign="right">
            {group.priority[0]?.id}
          </text>
        </box>
      ))
    ) : (
      <text fg={context.theme.text.muted}>None</text>
    );

  createEffect(() => {
    props.refreshKey();
    void readPriorityConfig(priorityFilePath())
      .then((config) => {
        setError(undefined);
        setAgents(config.agents.filter((group) => group.priority.length > 0));
        setProfiles(config.profiles.filter((group) => group.priority.length > 0));
      })
      .catch((failure: unknown) => {
        setError(failure instanceof Error ? failure.message : 'Invalid global priorities');
        setAgents([]);
        setProfiles([]);
      });
  });

  return (
    <box width="100%" flexDirection="column" paddingTop={1} paddingLeft={1} paddingRight={1}>
      <box
        onMouseDown={() => setCollapsed((value) => !value)}
        paddingLeft={1}
        paddingRight={1}
        backgroundColor={context.theme.background.action.primary.base}
      >
        <text fg={context.theme.text.action.primary.base}>
          <b>{collapsed() ? '▶ ' : '▼ '}Agent Switcher</b>
        </text>
      </box>
      {error() && <text fg={context.theme.text.feedback.error.base}>{error()}</text>}
      {!collapsed() && (
        <box width="100%" flexDirection="column" marginTop={1}>
          <text fg={context.theme.text.action.primary.base}>
            <b>Agents</b>
          </text>
          {rows(agents())}
          <text fg={context.theme.text.action.primary.base} marginTop={1}>
            <b>Profiles</b>
          </text>
          {rows(profiles(), agents().length)}
        </box>
      )}
    </box>
  );
}
