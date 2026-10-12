# Opencode Agent Switcher

Choose preferred models for OpenCode agents without rewriting their prompts or permissions.

[![License: Apache-2.0](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)

Manage agent-to-model assignments in one global YAML file across projects. Order model choices per agent, or share priorities through reusable profiles. Use the first choice for new sessions while keeping ongoing selections stable. Change priorities from OpenCode's command palette instead of editing multiple agent files.

- Centralize provider models and settings in a shared catalog.
- Switch between faster, cheaper, or more capable models without duplicating agent definitions.
- Update a shared profile once for every agent using it.
- Inspect preferred models in the sidebar without leaving OpenCode.
- Preserve native agent identities, prompts, tools, and permission policies.

Use priorities for deliberate model selection, not automatic failover after provider errors. Keep session selections stable while the agent, catalog ID, and plugin process remain unchanged.

## Installation

Add package to `plugins` in one of your `opencode.json(c)` 's:

```json
{
  "plugins": ["@lexomis/opencode-agent-switcher"]
}
```

To see the switcher in your TUI (which is basically required), add the same to your `cli.json(c)`:

```json
{
  "plugins": ["@lexomis/opencode-agent-switcher"]
}
```

## Quick Start

Create a native OpenCode agent named `Reviewer` before configuring its model priority. Keep prompts, modes, tools, and permissions in native agent definitions. Replace example model references with available, authenticated provider models.

Create the global priority directory:

```sh
mkdir -p ~/.config/opencode/agents
```

Create `~/.config/opencode/agents/Reviewer.md`, or keep your existing native definition:

```markdown
---
description: Review code for correctness and maintainability
mode: primary
---
Review proposed changes and report actionable findings.
```

Save this configuration as `~/.config/opencode/agents/priority.yaml`:

```yaml
models:
  - id: Default
    model: openai/gpt-4.1
agents:
  Reviewer:
    template: Reviewer.md
    priority: [Default]
```

Restart OpenCode and start a new session with `Reviewer`.

## Usage

### Set an agent's priority

Add catalog IDs in preferred order:

```yaml
models:
  - id: Standard
    model: openai/gpt-4.1
  - id: Fast
    model: openai/gpt-4.1-mini
agents:
  Reviewer:
    template: Reviewer.md
    priority: [Standard, Fast]
```

Treat additional entries as selectable alternatives, not automatic error fallbacks. 

Expect the first prompt to select and pin the first configured model. Start a new session to adopt reordered priorities. Keep a pinned catalog ID in the list to retain its selection. Keep the same session agent; expect switching agents to replace the remembered pin.

Treat pins as process-local; expect plugin reloads or server restarts to reset them. Expect a removed pinned ID to switch to the first remaining entry.

### Share a profile

Reuse a profile across native agents and pass provider options through model entries:

```yaml
models:
  - id: Thorough
    model: openai/gpt-5
    reasoningEffort: high
  - id: Fast
    model: openai/gpt-4.1-mini
profiles:
  Reviews:
    priority: [Thorough, Fast]
agents:
  Reviewer:
    template: Reviewer.md
    profile: Reviews
  Auditor:
    template: Auditor.md
    profile: Reviews
  QuickReviewer:
    template: QuickReviewer.md
    profile: Reviews
    priority: [Fast]
```

Use provider-supported options only. 

Set an explicit agent `priority` to override its profile, including an empty list. Include `template` for schema validation; do not expect template loading or agent creation. Match each configured agent key to an existing native agent ID.

### Change priorities in the TUI

Open **Change Agents Priority** from the command palette, or enter `/change-agents-priority`.

Choose a profile or explicitly configured agent, then select a catalog entry. Promote that entry to first place in the global YAML file. Use the **Agent Switcher** sidebar to inspect configured first choices. Edit a profile to update all agents inheriting its priorities. Treat sidebar values as configuration, not active-session model status.

Expect file changes to trigger reloads without automatic model fallback. Correct malformed files before prompting; do not expect silent defaults. Ignore project-local priority files; use the global file only.

## Options

Use these configuration fields:

| Field | Description |
| --- | --- |
| `models` | Define the shared model catalog as a list. |
| `models[].id` | Assign a unique catalog ID. |
| `models[].model` | Specify `provider/model` or `provider/model#variant`. |
| `models[].variant` | Override an embedded variant. |
| Other model fields | Pass provider options when the request matches the configured model. |
| `profiles.<name>.priority` | List catalog IDs in preferred order. |
| `agents.<name>.template` | Supply required metadata without loading a template. |
| `agents.<name>.profile` | Reference a shared profile. |
| `agents.<name>.priority` | Override profile priorities with an explicit list. |

Resolve the global directory in this order:

1. Use `OPENCODE_CONFIG_DIR` when set.
2. Otherwise, use `$XDG_CONFIG_HOME/opencode` when set.
3. Otherwise, use `~/.config/opencode`.

Place priorities at `agents/priority.yaml` within that directory.
Adjust the installation examples when overriding the global directory.

## Installation - via Clone

Clone the repository and install dependencies with pnpm:

```sh
git clone https://github.com/lexomis/opencode-priority-agents.git
cd opencode-priority-agents
pnpm install --frozen-lockfile
pnpm build
```

Add the checkout directory to `plugins` in your global `~/.config/opencode/opencode.json`:

```json
{
  "plugins": ["/absolute/path/to/opencode-priority-agents"]
}
```

Use the same checkout directory in `~/.config/opencode/cli.json` for the TUI plugin. OpenCode requires local plugin config entries to be directories; `pnpm build` creates ignored root `index.js` and `tui.ts` symlinks to the built implementations in `dist/`.

Replace `/absolute/path/to/opencode-priority-agents` with your checkout's absolute path, keep existing configuration entries, and re-run `pnpm build` after changing the source.

## Contributing

Install dependencies, build, and lint:

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm lint
```

`pnpm build` type-checks the source and compiles both plugins into `dist/` using Node. The package exports `dist/index.js` as `./server` and `dist/tui.js` as `./tui`; re-run the build after source changes. CI runs the build explicitly before publishing. For local packing or publishing, run `pnpm build` first; packaging does not trigger a build automatically.

Run the Vitest suite:

```sh
pnpm test
```

It requires a locally configured OpenCode environment, including `opencode2` on
`PATH` and the personal configuration and fixture files expected by
`scripts/smoke-server.mjs`. Do not install or configure these globally for CI.

## License

Use under the [Apache License 2.0](LICENSE).
