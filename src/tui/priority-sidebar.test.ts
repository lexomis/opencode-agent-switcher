import { beforeEach, expect, it, vi } from 'vitest';
import { PrioritySidebar } from './priority-sidebar.tsx';
import type { TuiPriorityConfig } from './priority-store.ts';

type Element = {
  type: string;
  props: Record<string, unknown> & { children?: unknown };
};

// Inspect JSX layout and theme props without requiring OpenTUI's native renderer.
const ui = vi.hoisted(() => ({
  signals: [] as unknown[],
  cursor: 0,
  effects: [] as (() => void)[],
  readConfig: vi.fn(),
  theme: {
    text: {
      base: 'base',
      muted: 'muted',
      action: { primary: { base: 'primary' }, secondary: { base: 'secondary' } },
      feedback: { error: { base: 'error' } },
    },
    background: { action: { primary: { base: 'primary-background' } } },
    categorical: [{ 500: 'category-0' }, { 500: 'category-1' }, { 500: 'category-2' }],
    hue: { accent: { 500: 'accent-500' } },
  },
}));

vi.mock('@opencode/plugin/tui', () => ({
  usePlugin: () => ({ theme: ui.theme }),
}));
vi.mock('./priority-store.ts', () => ({ readPriorityConfig: ui.readConfig }));
vi.mock('solid-js', () => ({
  createEffect: (effect: () => void) => ui.effects.push(effect),
  createSignal: (initial: unknown) => {
    const index = ui.cursor++;
    if (!(index in ui.signals)) ui.signals[index] = initial;
    return [
      () => ui.signals[index],
      (value: unknown) => {
        ui.signals[index] = typeof value === 'function' ? value(ui.signals[index]) : value;
      },
    ];
  },
}));
vi.mock('@opentui/solid/jsx-runtime', () => ({
  jsx: (type: string, props: Element['props']) => ({ type, props }),
  jsxs: (type: string, props: Element['props']) => ({ type, props }),
}));

const config: TuiPriorityConfig = {
  agents: [
    { kind: 'agent', name: 'PlanBuilder', priority: [{ id: 'GlmLight', model: 'zhipu/light' }] },
    {
      kind: 'agent',
      name: 'VeryLongAgentNameForNarrowSidebars',
      priority: [{ id: 'GptHeavy', model: 'openai/heavy' }],
    },
  ],
  profiles: [{ kind: 'profile', name: 'Reviewer', priority: [{ id: 'GptHeavy', model: 'openai/heavy' }] }],
};

function elements(value: unknown): Element[] {
  if (Array.isArray(value)) return value.flatMap(elements);
  if (!value || typeof value !== 'object' || !('props' in value)) return [];
  const element = value as Element;
  return [element, ...elements(element.props.children)];
}

function text(value: unknown): string {
  if (Array.isArray(value)) return value.map(text).join('');
  if (value && typeof value === 'object' && 'props' in value) return text((value as Element).props.children);
  return typeof value === 'string' || typeof value === 'number' ? String(value) : '';
}

function render() {
  ui.cursor = 0;
  return PrioritySidebar({ refreshKey: () => 0 }) as unknown as Element;
}

async function load() {
  render();
  ui.effects[0]();
  await vi.waitFor(() => expect(ui.signals[0]).toEqual(config.agents));
  return render();
}

beforeEach(() => {
  ui.signals = [];
  ui.cursor = 0;
  ui.effects = [];
  ui.readConfig.mockReset().mockResolvedValue(config);
});

it('styles the Agent Switcher badge, renames the agent section, and colors model IDs from the theme', async () => {
  const nodes = elements(await load());
  const heading = nodes.find((node) => node.type === 'text' && text(node).includes('Agent Switcher'));
  expect(text(heading)).toBe('▼ Agent Switcher');
  expect(heading?.props.fg).toBe('primary');
  const badge = nodes.find((node) => node.type === 'box' && node.props.backgroundColor);
  expect(badge?.props).toMatchObject({
    backgroundColor: 'primary-background',
    paddingLeft: 1,
    paddingRight: 1,
  });
  expect(nodes.some((node) => node.type === 'text' && text(node) === 'Agents')).toBe(true);
  expect(nodes.some((node) => node.type === 'text' && text(node) === 'Priority Agents')).toBe(false);
  expect(nodes.find((node) => node.type === 'text' && text(node) === 'PlanBuilder')?.props.fg).toBe('category-0');
  expect(nodes.find((node) => node.type === 'text' && text(node) === 'PlanBuilder')?.props.children).toMatchObject({
    type: 'b',
  });
  expect(nodes.find((node) => node.type === 'text' && text(node) === 'GlmLight')?.props.fg).toBe('muted');
  expect(nodes.find((node) => node.type === 'text' && text(node) === 'GlmLight')?.props.children).toBe('GlmLight');
  expect(nodes.find((node) => node.type === 'text' && text(node) === 'Reviewer')?.props.fg).toBe('category-2');
  expect(nodes.find((node) => node.type === 'text' && text(node) === 'Reviewer')?.props.children).toMatchObject({
    type: 'b',
  });
  expect(
    nodes.filter((node) => node.type === 'text' && text(node) === 'GptHeavy').map((node) => node.props.fg),
  ).toEqual(['muted', 'muted']);
});

it('uses full-width rows with a shrinking name column and a separate right-aligned model', async () => {
  const rows = elements(await load()).filter((node) => node.type === 'box' && node.props.flexDirection === 'row');
  expect(rows).toHaveLength(3);
  for (const row of rows) {
    expect(row.props).toMatchObject({ width: '100%', gap: 1 });
    const columns = elements(row.props.children).filter((node) => node.type === 'text');
    expect(columns).toHaveLength(2);
    expect(columns[0].props).toMatchObject({ flexGrow: 1, flexShrink: 1, minWidth: 0, truncate: true });
    expect(columns[1].props).toMatchObject({ flexShrink: 0, textAlign: 'right' });
  }
});

it('collapses and expands the agent and profile sections', async () => {
  const nodes = elements(await load());
  const heading = nodes.find((node) => node.props.onMouseDown);
  if (!heading) throw new Error('Missing collapse toggle');
  const toggle = heading.props.onMouseDown as () => void;
  toggle();
  const collapsed = render();
  expect(text(collapsed)).toContain('▶ Agent Switcher');
  expect(text(collapsed)).not.toContain('PlanBuilder');
  toggle();
  expect(text(render())).toContain('PlanBuilder');
});

it('reloads first-choice models and displays configuration errors in the error color', async () => {
  await load();
  const updated = {
    ...config,
    agents: [{ ...config.agents[0], priority: [{ id: 'GptHeavy', model: 'openai/heavy' }] }],
  };
  ui.readConfig.mockResolvedValueOnce(updated);
  ui.effects[0]();
  await vi.waitFor(() => expect(ui.signals[0]).toEqual(updated.agents));
  expect(text(render())).not.toContain('GlmLight');

  ui.readConfig.mockRejectedValueOnce(new Error('Invalid priorities'));
  ui.effects[0]();
  await vi.waitFor(() => expect(ui.signals[3]).toBe('Invalid priorities'));
  const nodes = elements(render());
  expect(nodes.find((node) => node.type === 'text' && text(node) === 'Invalid priorities')?.props.fg).toBe('error');
  expect(text(render())).toContain('Agent Switcher');
});
