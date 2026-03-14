# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
bun run src/index.ts      # run the CLI (alias: bun run dev)
bun test tests/           # run all tests
bun test tests/lib/detect.test.ts   # run a single test file
```

No build step — Bun executes TypeScript source directly. The `@/*` path alias resolves to `./src/*`.

## Architecture

`ws` is a CLI tool that manages git worktrees across multiple repos. It has two core concepts:

**Stacks** — named templates describing a set of repos (paths, types, default modes). Stored as YAML at `{workspace_root}/.ws/stacks/{name}.yml`.

**Workspaces** — task/ticket-scoped instances created from stacks. Each workspace has a branch name; repos can be in `worktree` mode (a git worktree is created at `{workspace_root}/tasks/{workspace_name}/{repo_name}`) or `trunk` mode (the main clone path is referenced directly). Stored at `{workspace_root}/.ws/workspaces/{name}.yml`.

The default `workspace_root` is `~/workspaces`. All config lives inside it (not in `~/.config` or `~`).

### Source layout

```
src/
  index.ts              — commander entrypoint, registers all commands
  commands/
    stack.ts            — `ws stack *` subcommands (thin wrappers over tui/)
    workspace.ts        — `ws new|open|list|status|clean` commands
    config.ts           — `ws config [show]` interactive config wizard
    completion.ts       — `ws completion [bash|zsh|fish]` shell completion output
  lib/
    config.ts           — Zod schemas + YAML read/write for stacks, workspaces, global config
    paths.ts            — all path constants and helpers (single source of truth)
    git.ts              — git worktree operations via Bun's `$` shell
    detect.ts           — repo type detection and directory scanning
    vscode.ts           — generates .code-workspace files (used by vscode integration)
    intellij.ts         — generates .idea/modules.xml + stub .iml files (used by intellij integration)
    cmux.ts             — creates/focuses cmux workspaces (used by cmux integration)
    integrations/
      types.ts          — Integration interface, IntegrationContext, resolveEnabled helpers
      vscode.ts         — VSCode integration plugin
      intellij.ts       — IntelliJ integration plugin
      cmux.ts           — cmux integration plugin
      index.ts          — registry: `export const integrations = [...]`
  tui/
    stack-wizard.ts     — interactive prompts for `stack new` and `stack init`
    stack-edit.ts       — interactive editor for `stack edit`
    workspace-wizard.ts — interactive prompts for `ws new`
    utils.ts            — safeText() wrapper normalising @clack/prompts empty-string quirk
tests/
  helpers.ts            — makeTmpDir/cleanup/touch/write filesystem helpers
  lib/                  — unit tests (bun:test, Jest-compatible API)
```

### Key patterns

- All YAML I/O goes through `src/lib/config.ts`; schemas are Zod-validated on read.
- I/O tests redirect `process.env.HOME` before dynamically importing config to isolate the config directory.
- `src/tui/utils.ts:safeText` must be used instead of `p.text` directly because `@clack/prompts` returns `undefined` (not `""`) on empty input.
- **Integration plugin system**: `ws open` and `ws new` loop over `integrations` from `src/lib/integrations/index.ts`. To add a new integration: create `src/lib/integrations/my-tool.ts` implementing `Integration`, register it in `index.ts`. No other files need to change.
- Each integration stores its config under `globalConfig.integrations[id]` (a `Record<string, unknown>`) and parses it internally with its own Zod schema.
- Per-workspace overrides: add `settings.integrations.<id>.enabled: false` to the workspace YAML.
- IntelliJ integration's `applies()` returns false when no Java repos are present — it is skipped entirely rather than generating empty artifacts.
