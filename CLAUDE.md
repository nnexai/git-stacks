# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
bun run src/index.ts      # run the CLI (alias: bun run dev)
bun test tests/           # run all tests
bun test tests/lib/detect.test.ts   # run a single test file
bun run typecheck         # type-check without emitting (tsc --noEmit)
```

No build step — Bun executes TypeScript source directly. The `@/*` path alias resolves to `./src/*`.

## Architecture

`git-stacks` is a CLI tool that manages git worktrees across multiple repos. It has three core concepts:

**Repo Registry** — a flat list of local git repos with their names, paths, types, and default branches. Stored at `~/.config/git-stacks/registry.yml`. Managed via `git-stacks repo add|scan|list|remove`.

**Templates** — named sets of repos (by registry name) with modes and branch patterns, used to stamp out workspaces. Stored as YAML at `~/.config/git-stacks/templates/{name}.yml`. Managed via `git-stacks template new|list|edit|remove`.

**Workspaces** — task/ticket-scoped instances created from templates. Each workspace has a branch name; repos can be in `worktree` mode (a git worktree is created at `{workspace_root}/tasks/{workspace_name}/{repo_name}`) or `trunk` mode (the main clone path is referenced directly). Stored at `~/.config/git-stacks/workspaces/{name}.yml`.

The global config is at `~/.config/git-stacks/config.yml`. The default `workspace_root` is `~/workspaces`; clones live under `{workspace_root}/main/`, worktrees under `{workspace_root}/tasks/`.

### Source layout

```
src/
  index.ts              — commander entrypoint, registers all commands
  commands/
    workspace.ts        — git-stacks new|clone|open|list|status|clean|remove|cd|merge|run|rename|sync commands
    template.ts         — git-stacks template * subcommands (thin wrappers over tui/)
    repo.ts             — git-stacks repo add|scan|list|remove — manage the repo registry
    doctor.ts           — git-stacks doctor — health check and drift detection
    config.ts           — git-stacks config [show] interactive config wizard
    completion.ts       — git-stacks completion [bash|zsh|fish] shell completion output
  lib/
    config.ts           — Zod schemas + YAML read/write for stacks, workspaces, global config
    paths.ts            — all path constants and helpers (single source of truth)
    git.ts              — git worktree operations via Bun's `$` shell
    workspace-ops.ts    — core business logic: open, clean, remove, merge, rename, sync
    lifecycle.ts        — runHooks() — executes hook arrays via Bun.spawn with inherited stdio
    files.ts            — file copy/symlink operations from templates
    detect.ts           — repo type detection and directory scanning
    completion-generator.ts — auto-generates bash/zsh/fish completions from commander.js tree
    vscode.ts / intellij.ts / cmux.ts / tmux.ts — IDE/terminal artifact generators
    integrations/
      types.ts          — Integration interface, IntegrationContext, resolveEnabled helpers
      vscode.ts / intellij.ts / cmux.ts / tmux.ts — integration plugins
      index.ts          — registry: `export const integrations = [...]`
  tui/
    template-wizard.ts  — interactive prompts for `template new` and `template edit`
    repo-wizard.ts      — interactive prompts for `repo scan`
    workspace-wizard.ts — interactive prompts for `git-stacks new`
    workspace-clone.ts  — interactive prompts for `git-stacks clone`
    utils.ts            — safeText() wrapper normalising @clack/prompts empty-string quirk
    dashboard/          — interactive TUI for `git-stacks manage` (SolidJS-based)
tests/
  helpers.ts            — makeTmpDir/cleanup/touch/write filesystem helpers
  lib/                  — unit tests (bun:test, Jest-compatible API)
```

### Key patterns

- All YAML I/O goes through `src/lib/config.ts`; schemas are Zod-validated on read.
- I/O tests redirect `process.env.HOME` before dynamically importing config to isolate the config directory.
- `src/tui/utils.ts:safeText` must be used instead of `p.text` directly because `@clack/prompts` returns `undefined` (not `""`) on empty input.
- **Repo registry is the source of truth for repo paths**: Templates reference repos by `name` (registry key), not by path. `WorkspaceRepo.repo` stores the registry name; `main_path` and `task_path` are resolved at workspace creation time.
- **Integration plugin system**: `git-stacks open` and `git-stacks new` loop over `integrations` from `src/lib/integrations/index.ts`. To add a new integration: create `src/lib/integrations/my-tool.ts` implementing `Integration`, register it in `index.ts`. No other files need to change.
- Each integration stores its config under `globalConfig.integrations[id]` (a `Record<string, unknown>`) and parses it internally with its own Zod schema.
- Per-workspace overrides: add `settings.integrations.<id>.enabled: false` to the workspace YAML.
- IntelliJ integration's `applies()` returns false when no Java repos are present — it is skipped entirely rather than generating empty artifacts.

### Dashboard TUI input rules

- **Use OpenTUI built-in `<input>` for ALL text fields** in the dashboard — never hand-roll `useKeyboard` character accumulation. The built-in input provides cursor movement, selection, undo/redo, and blinking cursor for free.
- **Keyboard isolation**: `useKeyboard` is a global broadcast — ALL handlers see ALL keys. When a focused `<input>` is active, place the input-mode guard (`if (filtering()) return` / `if (v.view === "inline-input") return`) **above** all navigation handlers (tab switching, cursor movement, action triggers) in the main `useKeyboard` callback.
- **Deferred focus**: When a keypress activates a new `<input>` (e.g., `/` opens filter), mount with `focused={false}` and `setTimeout(() => setFocused(true), 0)` — otherwise the triggering keypress leaks into the input as the first character.
- **`runHooksCaptured()`** must be used instead of `runHooks()` when executing hooks from within the TUI — `runHooks` uses `stdio: "inherit"` which corrupts the OpenTUI screen.

### Hooks system

Templates and workspaces define hook arrays (shell commands executed in order by `runHooks()` in `lifecycle.ts`):

- Template hooks: `pre_create`, `post_create`, `pre_open`, `post_open`, `pre_remove`, `post_merge`
- Workspace hooks: `pre_create`, `post_create`, `pre_open`, `post_open`, `post_merge`, `pre_remove`
- Per-repo hooks (within workspace YAML): `pre_open`

Hooks receive injected environment variables: `WS_WORKSPACE`, `WS_BRANCH`, `WS_TASKS_DIR`, `WS_REPO_NAME`, and others. Templates and workspaces can also define `env: Record<string, string>` and an optional `env_file` path; `workspace-ops.ts` calls `mergeEnv()` to combine them and `writeEnvFiles()` to write merged env to each repo at the configured path.

### Shell completion auto-generation

`completion-generator.ts` walks the commander.js program tree and generates shell-specific completion functions (bash case statements, zsh `_arguments`, fish `complete`). Dynamic completions (workspace/template names) are resolved from the filesystem at completion time.
