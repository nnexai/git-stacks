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

**Stacks** — named templates describing a set of repos (paths, types, default modes). Stored as YAML at `~/.config/ws/stacks/{name}.yml`.

**Workspaces** — task/ticket-scoped instances created from stacks. Each workspace has a branch name; repos can be in `worktree` mode (a git worktree is created at `{workspace_root}/tasks/{workspace_name}/{repo_name}`) or `trunk` mode (the main clone path is referenced directly). Stored at `~/.config/ws/workspaces/{name}.yml`.

The global config is at `~/.config/ws/config.yml`. The default `workspace_root` is `~/workspaces`; clones live under `{workspace_root}/main/`, worktrees under `{workspace_root}/tasks/`.

### Source layout

```
src/
  index.ts              — commander entrypoint, registers all commands
  commands/
    workspace.ts        — ws new|clone|open|list|status|clean|remove|cd|merge|run|rename|sync commands
    stack.ts            — ws stack * subcommands (thin wrappers over tui/)
    doctor.ts           — ws doctor — health check and drift detection
    config.ts           — ws config [show] interactive config wizard
    completion.ts       — ws completion [bash|zsh|fish] shell completion output
  lib/
    config.ts           — Zod schemas + YAML read/write for stacks, workspaces, global config
    paths.ts            — all path constants and helpers (single source of truth)
    git.ts              — git worktree operations via Bun's `$` shell
    workspace-ops.ts    — core business logic: open, clean, remove, merge, rename, sync
    lifecycle.ts        — runHooks() — executes hook arrays via Bun.spawn with inherited stdio
    files.ts            — file copy/symlink operations from stack templates
    detect.ts           — repo type detection and directory scanning
    completion-generator.ts — auto-generates bash/zsh/fish completions from commander.js tree
    vscode.ts / intellij.ts / cmux.ts / tmux.ts — IDE/terminal artifact generators
    integrations/
      types.ts          — Integration interface, IntegrationContext, resolveEnabled helpers
      vscode.ts / intellij.ts / cmux.ts / tmux.ts — integration plugins
      index.ts          — registry: `export const integrations = [...]`
  tui/
    stack-wizard.ts     — interactive prompts for `stack new` and `stack init`
    stack-edit.ts       — interactive editor for `stack edit`
    workspace-wizard.ts — interactive prompts for `ws new`
    workspace-clone.ts  — interactive prompts for `ws clone`
    utils.ts            — safeText() wrapper normalising @clack/prompts empty-string quirk
    dashboard/          — interactive TUI for `ws manage` (SolidJS-based)
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

### Hooks system

Stacks and workspaces define hook arrays (shell commands executed in order by `runHooks()` in `lifecycle.ts`):

- Stack hooks: `pre_create`, `post_create`, `pre_remove`
- Workspace hooks: `pre_open`, `post_open`, `post_merge`
- Per-repo hooks (within workspace YAML): `pre_open`

Hooks receive injected environment variables: `WS_WORKSPACE`, `WS_BRANCH`, `WS_TASKS_DIR`, `WS_REPO_NAME`, and others. Stacks and workspaces can also define `env: Record<string, string>` and an optional `env_file` path; `workspace-ops.ts` calls `mergeEnv()` to combine them and `writeEnvFiles()` to write merged env to each repo at the configured path.

### Shell completion auto-generation

`completion-generator.ts` walks the commander.js program tree and generates shell-specific completion functions (bash case statements, zsh `_arguments`, fish `complete`). Dynamic completions (workspace/stack names) are resolved from the filesystem at completion time.
