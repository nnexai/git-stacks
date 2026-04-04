# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
bun run src/index.ts      # run the CLI (alias: bun run dev)
bun run test              # run all tests (uses isolated test runner)
bun test tests/lib/detect.test.ts   # run a single test file
bun run typecheck         # type-check without emitting (tsc --noEmit)
```

**Important:** Do not use `bun test tests/` directly — it runs all test files in a shared Bun process where `mock.module()` calls from one file pollute others, producing false failures. The project's `bun run test` script (`scripts/test-runner.ts`) isolates mock-heavy files into separate processes.

No build step — Bun executes TypeScript source directly. The `@/*` path alias resolves to `./src/*` but is **test-only** — production code in src/ must use relative imports (the alias is not available in the published npm package).

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
    workspace.ts        — new|clone|open|list|status|clean|close|remove|cd|merge|run|rename|sync|push|pull
    template.ts         — template * subcommands (thin wrappers over tui/)
    repo.ts             — repo add|scan|list|remove
    doctor.ts           — health check and drift detection
    config.ts           — config [show] interactive config wizard
    completion.ts       — completion [bash|zsh|fish] shell completion output
    install.ts          — install --hooks agent framework hook installation
    integration.ts      — integration list|<id> config show|example
    label.ts            — label add|remove|list|clear
    message.ts          — message send|list|clear
  lib/
    config.ts           — Zod schemas + YAML read/write for templates, workspaces, global config
    paths.ts            — all path constants and helpers (single source of truth)
    git.ts              — git worktree/branch/merge/push/pull/ahead-behind via Bun `$` shell
    workspace-ops.ts    — core business logic: open, close, clean, remove, merge, rename, sync, push, pull
    lifecycle.ts        — runHooks() / runHooksCaptured() — shell hook execution
    composition.ts      — template includes: recursive merge with circular dependency detection
    files.ts            — file copy/symlink operations from templates
    detect.ts           — repo type detection and directory scanning
    secrets.ts          — pluggable secret resolution (${{ resolver:path }} syntax)
    ports.ts            — file-locked port allocation across workspaces
    messages.ts         — JSONL notifications + Unix socket IPC to TUI dashboard
    labels.ts           — workspace label matching
    env.ts              — env var formatting (table, shell, dotenv, json)
    concurrency.ts      — mapLimited() async concurrency limiter
    completion-generator.ts — auto-generates bash/zsh/fish completions from commander.js tree
    agent-hooks/        — CI-agent hook generators (Claude Code, Copilot)
    integrations/
      types.ts          — Integration interface, IntegrationContext, resolveEnabled helpers
      runner.ts         — orchestrates generate -> open -> window detection across integrations
      vscode.ts / intellij.ts / cmux.ts / tmux.ts / niri.ts / aerospace.ts — IDE/terminal/WM plugins
      github.ts / gitlab.ts / gitea.ts — forge plugins
      jira.ts           — issue tracker plugin
      forge-utils.ts / issue-utils.ts / wizard-helpers.ts — shared helpers
      index.ts          — registry: `export const integrations = [...]`
  tui/
    template-wizard.ts  — interactive prompts for `template new` and `template edit`
    repo-wizard.ts      — interactive prompts for `repo scan`
    workspace-wizard.ts — interactive prompts for `git-stacks new`
    workspace-clone.ts  — interactive prompts for `git-stacks clone`
    utils.ts            — safeText() wrapper normalising @clack/prompts empty-string quirk
    dashboard/          — interactive TUI for `git-stacks manage` (SolidJS + OpenTUI)
tests/
  helpers.ts            — makeTmpDir/cleanup/touch/write filesystem helpers
  lib/                  — unit tests (bun:test, Jest-compatible API)
```

### Key patterns

- All YAML I/O goes through `src/lib/config.ts`; schemas are Zod-validated on read. Atomic writes via tmp+fsync+rename.
- Workspace/template lookups scan all YAML files and match by `name` field, not filename (handles filename drift).
- I/O tests redirect `process.env.HOME` before dynamically importing config to isolate the config directory.
- `src/tui/utils.ts:safeText` must be used instead of `p.text` directly because `@clack/prompts` returns `undefined` (not `""`) on empty input.
- **Repo registry is the source of truth for repo paths**: Templates reference repos by `name` (registry key), not by path. `WorkspaceRepo.repo` stores the registry name; `main_path` and `task_path` are resolved at workspace creation time.
- **Integration plugin system**: `src/lib/integrations/runner.ts` sorts by `order`, checks `applies()` and `isEnabled()`, then calls `generate()` then `open()`. Passes `ArtifactBag` between integrations for cross-integration communication. To add a new integration: create the plugin implementing `Integration`, register it in `index.ts`.
- Each integration stores its config under `globalConfig.integrations[id]` (a `Record<string, unknown>`) and parses it internally with its own Zod schema.
- Per-workspace overrides: add `settings.integrations.<id>.enabled: false` to the workspace YAML.
- **Subprocess testing**: Modules that spawn subprocesses export a mutable `_exec` object. Tests replace `_exec.spawn` with a mock to verify call shapes without executing real processes. Object property is mutable even in ESM (unlike named exports).
- **Workspace lifecycle cascading**: `remove` calls `clean` which calls `close` internally. `merge` also cascades through `clean` then `close`.
- **Secret resolution**: `${{ resolver_id:path }}` syntax in env var values. Three built-in resolvers: keychain (macOS/Linux), env, cmd. Resolvers registered in `RESOLVER_REGISTRY`; enabled list in `config.secrets.resolvers`.
- **Error handling**: Git ops use `.quiet().nothrow()` + exit code checks, returning discriminated unions `{ ok: true } | { ok: false; error: string }`. Never throw for expected failures. `runHooks()` throws on non-zero exit when `abortOnFailure=true`.

### Dashboard TUI input rules

- **Use OpenTUI built-in `<input>` for ALL text fields** in the dashboard — never hand-roll `useKeyboard` character accumulation. The built-in input provides cursor movement, selection, undo/redo, and blinking cursor for free.
- **Keyboard isolation**: `useKeyboard` is a global broadcast — ALL handlers see ALL keys. When a focused `<input>` is active, place the input-mode guard (`if (filtering()) return` / `if (v.view === "inline-input") return`) **above** all navigation handlers (tab switching, cursor movement, action triggers) in the main `useKeyboard` callback.
- **Deferred focus**: When a keypress activates a new `<input>` (e.g., `/` opens filter), mount with `focused={false}` and `setTimeout(() => setFocused(true), 0)` — otherwise the triggering keypress leaks into the input as the first character.
- **`runHooksCaptured()`** must be used instead of `runHooks()` when executing hooks from within the TUI — `runHooks` uses `stdio: "inherit"` which corrupts the OpenTUI screen.

### Hooks system

Templates and workspaces define hook arrays (shell commands executed in order by `runHooks()` in `lifecycle.ts`):

- Template hooks: `pre_create`, `post_create`, `pre_open`, `post_open`, `pre_close`, `post_close`, `pre_remove`, `post_merge`
- Workspace hooks: `pre_create`, `post_create`, `pre_open`, `post_open`, `pre_close`, `post_close`, `post_merge`, `pre_remove`
- Per-repo hooks (within workspace YAML): `pre_open`

Hooks receive injected environment variables: `GS_WORKSPACE_NAME`, `GS_WORKSPACE_BRANCH`, `GS_WORKSPACE_PATH`, `GS_REPO_NAME`, `GS_TRIGGERED_BY`, and others. Templates and workspaces can also define `env: Record<string, string>` and an optional `env_file` path; `workspace-ops.ts` calls `mergeEnv()` to combine them and `writeEnvFiles()` to write merged env to each repo at the configured path.

<!-- GSD:project-start source:PROJECT.md -->
## Project

**git-stacks**

`git-stacks` is a CLI workspace manager for feature-branch driven development. It creates isolated, fully-configured development environments per feature or task — instantly setting up git worktrees, IDE/terminal multiplexer sessions, and dependency repos from declarative templates. An interactive TUI dashboard (`git-stacks manage`) provides full CRUD for workspaces, templates, and repos, plus a real-time notification system for AI agent hooks. Works for a single developer juggling multiple features in parallel, or for AI agents that each need their own workspace without colliding on files.

**Core Value:** One command should take you from "I need to work on feature X" to a fully running dev environment — the right repos checked out, the right branches created, the right IDE/terminal open, hooks run — without manual steps.

### Constraints

- **Runtime**: Bun — no Node.js compatibility required; use Bun APIs freely (`$`, `spawn`, `Bun.file`)
- **Language**: TypeScript strict mode throughout
- **Config format**: YAML with Zod validation — preserve schema compatibility with existing user configs
- **No breaking changes**: Existing workspace YAML files must continue to work across improvements
<!-- GSD:project-end -->

<!-- GSD:stack-start source:codebase/STACK.md -->
## Technology Stack

- **Runtime**: Bun (latest) — executes TypeScript directly, no build step
- **CLI**: Commander.js ^14.0.3 — command tree + shell completion introspection
- **Validation**: Zod ^4.3.6 — all YAML config validated on read
- **YAML**: yaml ^2.8.3 — all config I/O
- **TUI**: SolidJS ^1.9.12 + @opentui/core ^0.1.96 + @opentui/solid ^0.1.96
- **Prompts**: @clack/prompts ^1.2.0 (use `safeText()` wrapper)
- **TypeScript**: ^6.0.2 (type-check only via `tsc --noEmit`)
- **Test**: bun:test + custom runner (`scripts/test-runner.ts`) for mock isolation
- **Shell tools**: git >=2.24, plus optional: code, idea, tmux, cmux, niri, aerospace, gh, glab, tea, jira, secret-tool/security
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
## Conventions

- Kebab-case files, camelCase functions (verb-prefixed), PascalCase types, UPPER_SNAKE_CASE path constants
- Schema types use `Schema` suffix; infer types via `z.infer<typeof Schema>`
- `type` for data structures, `interface` for contracts (e.g., `Integration`, `WindowDetector`, `SecretResolver`)
- Named exports only (no wildcards); `@/*` alias is test-only, production uses relative imports
- Discriminated unions `{ ok: true } | { ok: false; error: string }` for fallible ops; `null` only for "not found"
- Paired `read*`/`write*` functions for each entity; atomic writes (tmp+fsync+rename)
- Modules with subprocesses export mutable `_exec` object for test injection
- `@clack/prompts` wrapped in mutable `prompts` object in `src/tui/utils.ts` for testability
- No barrel files except `src/lib/integrations/index.ts`
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->
## Architecture

Layers: `commands/` (CLI parsing) -> `lib/workspace-ops.ts` (business logic) -> `lib/config.ts` (YAML I/O) + `lib/git.ts` (git ops). TUI in `tui/` (wizards + SolidJS dashboard). All paths from `lib/paths.ts`.

Key subsystems beyond core workspace lifecycle:
- **Integrations** (`lib/integrations/`): 10 plugins (vscode, intellij, cmux, tmux, niri, aerospace, github, gitlab, gitea, jira) orchestrated by `runner.ts`
- **Composition** (`lib/composition.ts`): Template `includes` with recursive merge, circular dependency detection
- **Secrets** (`lib/secrets.ts`): `${{ resolver:path }}` env var resolution via pluggable resolvers (keychain, env, cmd)
- **Ports** (`lib/ports.ts`): File-locked contiguous port allocation across workspaces
- **Messages** (`lib/messages.ts`): JSONL per-workspace notifications + Unix socket IPC to running TUI
- **Agent hooks** (`lib/agent-hooks/`): Generate CI-style hooks for Claude Code and Copilot into workspace repos
- **Labels** (`lib/labels.ts`): Workspace categorization and filtering

All state persisted to disk as YAML/JSONL at `~/.config/git-stacks/`. No runtime-only state.
<!-- GSD:architecture-end -->

<!-- GSD:workflow-start source:GSD defaults -->
## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd:quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd:debug` for investigation and bug fixing
- `/gsd:execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->

<!-- GSD:profile-start -->
## Developer Profile

> Profile not yet configured. Run `/gsd:profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
