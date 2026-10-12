/** @jsxImportSource @opentui/solid */

import { usePlugin } from '@opencode/plugin/tui';
import { createEffect, createSignal } from 'solid-js';
import { priorityFilePath } from '../core/global-priority.ts';
import { readPriorityConfig } from './priority-store.ts';

type Props = { refreshKey: () => number };

/** Display configured first-priority agents and profiles in the CLI sidebar. */
export function PrioritySidebar(props: Props) {
  const context = usePlugin();
  const [agents, setAgents] = createSignal<string[]>([]);
  const [profiles, setProfiles] = createSignal<string[]>([]);
  const [collapsed, setCollapsed] = createSignal(false);
  const [error, setError] = createSignal<string>();
  const muted = context.theme.text.muted;

  createEffect(() => {
    props.refreshKey();
    void readPriorityConfig(priorityFilePath())
      .then((config) => {
        setError(undefined);
        setAgents(
          config.agents.flatMap((group) => (group.priority[0] ? [`${group.name}  ${group.priority[0].id}`] : [])),
        );
        setProfiles(
          config.profiles.flatMap((group) => (group.priority[0] ? [`${group.name}  ${group.priority[0].id}`] : [])),
        );
      })
      .catch((failure: unknown) => {
        setError(failure instanceof Error ? failure.message : 'Invalid global priorities');
        setAgents([]);
        setProfiles([]);
      });
  });

  return (
    <box width="100%" flexDirection="column" paddingTop={1} paddingLeft={1}>
      <text onMouseDown={() => setCollapsed((value) => !value)} fg={context.theme.text.base}>
        <b>
          {collapsed() ? '▶' : '▼'} Global Agent Priority ({agents().length + profiles().length})
        </b>
      </text>
      {error() && <text fg={muted}>{error()}</text>}
      {!collapsed() && (
        <box flexDirection="column" marginTop={1}>
          <text fg={muted}>Priority Agents</text>
          {agents().length ? agents().map((row) => <text fg={muted}>{row}</text>) : <text fg={muted}>None</text>}
          <text fg={muted}>Profiles</text>
          {profiles().length ? profiles().map((row) => <text fg={muted}>{row}</text>) : <text fg={muted}>None</text>}
        </box>
      )}
    </box>
  );
}
