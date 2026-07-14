# Architecture

**Analysis Date:** 2026-04-04

## Pattern Overview

**Overall:** Layered CLI application with pluggable integration system, YAML-based declarative configuration, and a reactive TUI dashboard.

**Key Characteristics:**
- YAML-based declarative configuration with Zod validation at read-time
- Multi-layer abstraction: config -> workspace-ops -> commands -> CLI
- Integration plugin architecture for IDE/terminal/window-manager/forge/issue-tracker launching
- Hook system for extensible lifecycle events with cascading close -> clean -> remove ordering
- Pluggable secret resolution system (`${{ resolver:path }}` syntax in env vars)
- Notification/messaging system with IPC socket push to running TUI dashboard
- Port allocation system with file-based locking and contiguous-block allocation
- Workspace labels for filtering and categorization
- Bun runtime with native shell scripting via `$` API

## Layers

**CLI / Command Layer:**
- Purpose: Parse user input, dispatch to business logic, format output
- Location: `src/commands/` and `src/index.ts`
- Contains: Commander.js command definitions, option parsing, user-facing output
- Key files:
  - `src/commands/workspace.ts` (44KB) -- new, clone, open, list, status, clean, close, remove, merge, sync, push, pull, cd, rename, run, env, edit, paths
  - `src/commands/template.ts` -- template new, init, edit, list, remove, rename, clone
  - `src/commands/repo.ts` -- repo add, scan, list, remove
  - `src/commands/doctor.ts` -- health check and drift detection with --fix support
  - `src/commands/config.ts` -- interactive config wizard
  - `src/commands/message.ts` -- notification send, list, clear
  - `src/commands/hooks.ts` -- opt-in coding-agent signal hook lifecycle
  - `src/commands/integration.ts` -- per-integration config introspection and subcommands
  - `src/commands/label.ts` -- workspace label add, remove, list, clear
  - `src/commands/completion.ts` -- shell completion output (bash, zsh, fish)
- Depends on: Workspace ops, config I/O, TUI components
- Used by: User shell invocations (`git-stacks` CLI binary)

**Business Logic Layer:**
- Purpose: Core domain operations (workspace lifecycle, sync, merge, push, pull, status)
- Location: `src/lib/workspace-ops.ts` (1699 lines), `src/lib/git.ts`
- Contains: open, close, clean, remove, merge, rename, sync, push, pull functions; git worktree management; env file writing; port allocation dispatch; secret resolution dispatch
- Key functions in `src/lib/workspace-ops.ts`:
  - `openWorkspace()` -- recreate worktrees, resolve secrets, run hooks, launch integrations
  - `closeWorkspace()` -> `_executeClose()` -- pre_close hooks, integration cleanup, post_close hooks
  - `cleanWorkspace()` -> `_executeClean()` -- cascades through close, then removes worktrees
  - `removeWorkspace()` -- cascades through clean, then deletes YAML
  - `mergeWorkspace()` -- cascades through clean, then merges branches and deletes YAML
  - `syncWorkspace()` -- fetch, conflict check, rebase/merge with optional auto-stash
  - `pushWorkspace()` -- parallel push across worktree repos
  - `pullWorkspace()` -- parallel pull --ff-only across worktree repos
  - `renameWorkspace()` / `renameTemplate()` -- re-register worktrees, update cascade references
  - `buildWorkspaceEnv()` -- resolve secrets and merge env vars for hook execution
  - `detectWorkspaceFromCwd()` -- CWD-based workspace auto-detection
- Depends on: git.ts, config.ts, lifecycle.ts, integrations/runner.ts, files.ts, ports.ts, secrets.ts
- Used by: Command layer, TUI layer

**Configuration Layer:**
- Purpose: Validate, read, write YAML configs (templates, workspaces, registry, global settings)
- Location: `src/lib/config.ts`
- Contains: Zod schemas for Template, Workspace, GlobalConfig, RepoRegistryEntry; YAML read/write with atomic write (write-to-tmp + fsync + rename); scan-based lookup by name
- Key schemas:
  - `TemplateSchema` -- repos, hooks (12 lifecycle events), env, env_file, files, includes, ports, labels
  - `WorkspaceSchema` -- name, branch, repos, hooks, settings, env, ports, labels, last_opened
  - `GlobalConfigSchema` -- workspace_root, integrations, ports (range_start/range_end), secrets (resolvers)
  - `RepoRegistryEntrySchema` -- name, local_path, default_branch, type, forge
- Depends on: Zod, yaml library, file system
- Used by: All layers (schema source of truth)

**Git Operations Layer:**
- Purpose: All git CLI interactions wrapped as typed async functions
- Location: `src/lib/git.ts` (400 lines)
- Contains: worktree CRUD, branch checks, dirty detection, merge/rebase, fetch/pull/push, ahead/behind counting, upstream tracking, stash push/pop, fetch staleness detection
- Pattern: Every git command uses Bun's `$` shell with `.quiet().nothrow()`, checks exit codes, returns typed result objects
- Key functions: `createWorktree()`, `removeWorktree()`, `mergeNoFF()`, `pushBranch()`, `pullFFOnly()`, `rebaseBranch()`, `stashPush()`, `stashPop()`, `ensureUpstreamTracking()`, `isFetchStale()`, `getCommitsAhead()`, `getCommitsBehind()`

**Integration Plugin Layer:**
- Purpose: Pluggable generation and launching of IDE/terminal/window-manager/forge/issue artifacts
- Location: `src/lib/integrations/`
- Contains: Integration interface, plugin registry, runner, 10 plugin implementations
- Plugins (sorted by execution order):
  - Tier 1 (10-19): `vscode.ts`, `intellij.ts`, `tmux.ts` -- independent setup
  - Tier 2 (20-29): `cmux.ts` -- partial side-effects (depends on tmux artifact)
  - Tier 3 (30-39): `niri.ts`, `aerospace.ts` -- window management (reads window artifacts from bag)
  - Forge integrations: `github.ts`, `gitlab.ts`, `gitea.ts` -- PR/issue linking
  - Issue tracking: `jira.ts` -- issue linking
- Supporting files: `forge-utils.ts` (shared forge API helpers), `issue-utils.ts` (shared issue linking), `wizard-helpers.ts` (shared config prompts)
- Runner: `runner.ts` -- orchestrates generate -> open -> window detection across all enabled integrations
- Depends on: Config, workspace data, file system, Bun.spawn for external tool launches
- Used by: Workspace ops during `open` and `cleanup` operations

**Secret Resolution Layer:**
- Purpose: Resolve `${{ resolver:path }}` references in workspace env vars to actual secrets
- Location: `src/lib/secrets.ts`
- Contains: `SecretResolver` interface, three built-in resolvers, `resolveSecrets()` orchestrator
- Built-in resolvers:
  - `keychain` -- macOS Keychain / Linux secret-tool; supports legacy `service/account` and new `key=value,key=value` attribute syntax
  - `env` -- reads from process environment variables
  - `cmd` -- executes arbitrary shell commands
- Pattern: Resolvers are registered in `RESOLVER_REGISTRY`, enabled via `config.secrets.resolvers` list. Default: `["keychain", "env"]`
- Called by: `openWorkspace()` via `resolveWorkspaceEnvVars()` before hook execution

**Port Allocation Layer:**
- Purpose: Allocate non-conflicting port numbers across workspaces
- Location: `src/lib/ports.ts`
- Contains: File-based locking, contiguous block allocation, conflict detection, template port merging
- Pattern: `allocatePorts()` acquires lock -> scans all workspaces for taken ports -> finds first-fit contiguous block -> assigns sequentially. Ports injected as env vars via `mergeEnv()`.

**Messaging / Notification Layer:**
- Purpose: Workspace-scoped notifications from hooks/agents to TUI dashboard
- Location: `src/lib/messages.ts`
- Contains: JSONL-based per-workspace message files, Unix socket IPC for real-time push to running TUI
- Pattern: `appendMessage()` writes to `~/.config/git-stacks/messages/{workspace}.jsonl`, then `pushToSocket()` sends to `/tmp/git-stacks.sock` (best-effort, never throws)
- Dashboard IPC: `src/tui/dashboard/run.tsx` opens a Unix socket server; incoming messages pushed into SolidJS reactive store via `setIpcCallback()`

**Template Composition Layer:**
- Purpose: Merge multiple templates via `includes` directive
- Location: `src/lib/composition.ts`
- Contains: Recursive template resolution with circular dependency detection, repo merging (worktree wins), hook concatenation, env merging, label union
- Pattern: Topological merge -- included templates processed first (lower precedence), including template applied last (higher precedence)

**Lifecycle / Hook Execution Layer:**
- Purpose: Execute arrays of shell commands sequentially with environment injection
- Location: `src/lib/lifecycle.ts`
- Contains: `runHooks()` (inherits stdio) and `runHooksCaptured()` (pipes and streams line-by-line via callback)
- Pattern: Injectable executor via `_exec.spawn` mutable object -- tests replace it without mock.module
- Used by: All workspace lifecycle operations (open, close, clean, remove, merge)

**Agent Signal Hook Layer:**
- Purpose: Manage opt-in user-level coding-agent signal hooks and service-local process fallbacks
- Location: `src/lib/agent-hooks/`
- Contains: ownership-aware provider integration management and terminal wrapper preparation
- Pattern: Explicit `git-stacks hooks` mutations preserve foreign settings; normal terminal launch performs read-only health detection and uses service-local wrappers when hooks are absent

**TUI Layer (Terminal User Interface):**
- Purpose: Interactive prompts and dashboard for user-guided workflows
- Location: `src/tui/` and `src/tui/dashboard/`
- Wizards (Clack prompts):
  - `src/tui/workspace-wizard.ts` -- `git-stacks new` and `git-stacks edit` flows
  - `src/tui/workspace-clone.ts` -- `git-stacks clone` flow
  - `src/tui/template-wizard.ts` -- `git-stacks template new|edit` flows
  - `src/tui/repo-wizard.ts` -- `git-stacks repo scan` flow
  - `src/tui/utils.ts` -- `safeText()` wrapper, mutable `prompts` object for test replacement
- Dashboard (SolidJS + OpenTUI):
  - `src/tui/dashboard/App.tsx` (58KB) -- root component, all keyboard handling, state management
  - `src/tui/dashboard/run.tsx` -- entry point, IPC socket server, SolidJS render call
  - Components: `WorkspaceList.tsx`, `WorkspaceRow.tsx`, `WorkspaceDetail.tsx`, `TemplateList.tsx`, `TemplateDetail.tsx`, `RepoList.tsx`, `RepoDetail.tsx`, `ActionMenu.tsx`, `RepoActionMenu.tsx`, `TemplateActionMenu.tsx`, `SyncProgressView.tsx`, `PushProgressView.tsx`, `CreateProgressView.tsx`, `ProgressView.tsx`, `ConfirmDialog.tsx`, `CenteredDialog.tsx`, `InlineInput.tsx`, `FilterIndicator.tsx`, `HelpOverlay.tsx`, `MessageOverlay.tsx`, `BatchBar.tsx`, `RemoveBlockedView.tsx`, `WizardView.tsx`, `StatusIndicator.tsx`
  - Hooks: `hooks/useWorkspaces.ts`, `hooks/useTemplates.ts`, `hooks/useRepos.ts`, `hooks/useMessages.ts`
  - Types: `types.ts` -- Tab, Action, UIView discriminated union, WorkspaceEntry, RepoStatus
- Depends on: Clack prompts, OpenTUI/SolidJS, config I/O, lifecycle, file operations, integration registry

**Path Management Layer:**
- Purpose: Single source of truth for all filesystem paths and path helpers
- Location: `src/lib/paths.ts`
- Contains: `WS_CONFIG_DIR` (overridable via `GIT_STACKS_CONFIG_DIR` env), `WORKSPACES_DIR`, `TEMPLATES_DIR`, `GLOBAL_CONFIG_FILE`, `REGISTRY_FILE`, `MESSAGES_DIR`, `PORTS_LOCK_FILE`, `getMainDir()`, `getTasksDir()`, `expandHome()`
- Depends on: Nothing (pure path computation)
- Used by: All layers requiring filesystem locations

**Utility Layers:**
- `src/lib/labels.ts` -- `matchesLabels()` for workspace label filtering
- `src/lib/env.ts` -- env var formatting (table, shell, dotenv, json) and CWD-based repo detection
- `src/lib/errors.ts` -- `formatError()` helper
- `src/lib/concurrency.ts` -- `mapLimited()` async concurrency limiter
- `src/lib/detect.ts` -- repo type detection (java/typescript/other) by file presence
- `src/lib/version.ts` -- version string from package.json + git hash
- `src/lib/files.ts` -- file copy/symlink with glob support, three-case logic (skip/error/apply)

## Data Flow

**Workspace Creation Flow:**

1. User runs `git-stacks new [name]` or `git-stacks clone [source]`
2. Command dispatches to `runWorkspaceNew()` or `runWorkspaceClone()` (TUI wizards)
3. TUI prompts for: name, branch, description, template selection, per-repo config
4. Template composition resolves `includes` chains via `src/lib/composition.ts`
5. Port allocation via `allocatePorts()` with file-based locking
6. `Workspace` object created and persisted via `writeWorkspace()`
7. For each `worktree` mode repo, `createWorktree()` invokes `git worktree add`
8. `runHooks()` executes pre_create/post_create hooks with injected env vars
9. Integration runner loops: `generate()` -> `open()` with window detection
10. `applyFileOpsForRepo()` / `applyFileOpsForWorkspace()` handles copy/symlink operations

**Workspace Open Flow:**

1. `openWorkspace()` reads workspace YAML, allocates ports if needed
2. Recreates any missing worktrees via `createWorktree()`
3. Ensures upstream tracking for all worktree repos (parallel)
4. Resolves secrets in env vars via `resolveWorkspaceEnvVars()` -> `resolveSecrets()`
5. Runs workspace-level `pre_open` hooks, then per-repo `pre_open` hooks
6. Applies per-repo and workspace-level file operations (copy/symlink)
7. Writes `.env` files to each worktree if `env_file` configured
8. Ensures trunk repos are on expected base branch
9. Runs integration runner: generate -> open -> window detection for all enabled integrations
10. Runs workspace-level `post_open` hooks
11. Updates `last_opened` timestamp in workspace YAML

**Lifecycle Cascade (close -> clean -> remove/merge):**

The lifecycle operations cascade in a strict order:
- `remove` calls `_executeClean()` which calls `_executeClose()` internally
- `merge` calls `_executeClean()` which calls `_executeClose()` internally
- `clean` calls `_executeClose()` internally

Hook execution order for `remove`:
1. `pre_close` hooks -> integration cleanup -> `post_close` hooks
2. `pre_clean` hooks -> per-repo `pre_clean` + worktree removal -> `post_clean` hooks -> folder deletion
3. `pre_remove` hooks -> YAML deletion -> `post_remove` hooks

Hook execution order for `merge` adds steps after clean cascade:
4. `pre_merge` hooks -> git merge + branch delete
5. `pre_remove` hooks -> YAML deletion -> `post_remove` hooks -> `post_merge` hooks

**Sync Flow:**

1. `syncWorkspace()` optionally auto-stashes dirty repos (with `--stash` flag)
2. Parallel `fetchOrigin()` on all worktree repos
3. Parallel dry-run conflict check via `getMergeConflicts()` against `origin/{baseBranch}`
4. In strict mode: abort on conflicts. In best-effort mode: skip conflicting repos.
5. For each non-conflicting repo: `rebaseBranch()` or `mergeBranchFF()` per strategy
6. Finally: restore stashes in reverse order (stash pop), report pop failures

**Push Flow:**

1. `pushWorkspace()` pushes all worktree repos in parallel
2. Supports `--force`, `--force-with-lease`, `--set-upstream` flags
3. Reports per-repo status: pushed (commit count), skipped (trunk), failed (with reason)

**Pull Flow:**

1. `pullWorkspace()` pulls all worktree repos in parallel via `pullFFOnly()`
2. Reports per-repo: pulled (commit count), skipped, failed (diverged/no remote/etc.)

**Notification Flow:**

1. Hook or agent runs `git-stacks message send "text" --workspace ws`
2. `appendMessage()` writes JSONL to `~/.config/git-stacks/messages/{ws}.jsonl`
3. `pushToSocket()` connects to `/tmp/git-stacks.sock` (best-effort, 500ms timeout)
4. If TUI dashboard is running: `onIpcMessage` callback pushes into SolidJS store
5. Dashboard reactive update displays new notification badge/overlay

**State Management:**
- Workspace state: YAML files at `~/.config/git-stacks/workspaces/{name}.yml`
- Template definitions: YAML at `~/.config/git-stacks/templates/{name}.yml`
- Repo registry: YAML at `~/.config/git-stacks/registry.yml`
- Global config: YAML at `~/.config/git-stacks/config.yml`
- Messages: JSONL at `~/.config/git-stacks/messages/{workspace}.jsonl`
- Port lock: `~/.config/git-stacks/.ports.lock`
- Worktree state: Managed by git; directories at `{workspace_root}/tasks/{workspace_name}/{repo_name}`
- No runtime-only state; all critical state is persisted to disk

## Key Abstractions

**Template (Configuration Blueprint):**
- Purpose: Reusable blueprint describing repos, hooks, env, files, ports, labels
- Definition: `TemplateSchema` in `src/lib/config.ts`
- Supports `includes` for composition (resolved by `src/lib/composition.ts`)
- Pattern: Declarative YAML with 12 lifecycle hook events, env vars, file operations, port declarations, label inheritance

**Workspace (Task Instance):**
- Purpose: A task/ticket-scoped instance created from a template
- Definition: `WorkspaceSchema` in `src/lib/config.ts`
- Contains: branch name, repos list (each with mode/paths/hooks/files), hooks, settings, env, ports, labels, metadata (created, last_opened, description)
- Pattern: Immutable once created except for: port allocation, last_opened, rename, label changes

**Integration (Plugin Interface):**
- Purpose: Pluggable artifact generator + launcher for IDE/terminal/window-manager/forge/issue tools
- Definition: `Integration` interface in `src/lib/integrations/types.ts`
- Key methods: `isEnabled()`, `applies?()`, `generate?()`, `open()`, `cleanup?()`, `commands?()`, `configurePrompt()`
- Execution: Sorted by `order` field; runner passes `ArtifactBag` between integrations for cross-integration communication (e.g., niri reads vscode WindowArtifact)
- Window detection: `WindowDetector` interface for post-open window ID resolution

**SecretResolver (Pluggable Secret Backend):**
- Purpose: Resolve secret references in env vars at workspace open time
- Definition: `SecretResolver` interface in `src/lib/secrets.ts`
- Pattern: `${{ resolver_id:path }}` syntax in env var values; resolvers registered in `RESOLVER_REGISTRY`; enabled list configured in `config.secrets.resolvers`

**WorkspaceRepo (Repo Reference):**
- Purpose: Represents a single repo within a workspace instance
- Definition: `WorkspaceRepoSchema` in `src/lib/config.ts`
- Key fields: `repo` (registry name), `mode` (trunk/worktree), `main_path`, `task_path`, `base_branch`, `hooks`, `files`

**ProgressCallback / Row-based Progress:**
- Purpose: Streaming status updates from business logic to command layer or TUI
- Pattern: `(message: string) => void` for simple operations; `(row: SyncRow | PushRow | PullRow) => void` for tabular progress displays

## Entry Points

**CLI Entry:**
- Location: `src/index.ts`
- Triggers: `bun run src/index.ts` or installed `git-stacks` binary
- Responsibilities: Check git version, register all commands, default to `manage` if no subcommand

**Main Commands:**
- `git-stacks new [name]` -- `src/commands/workspace.ts` -> `src/tui/workspace-wizard.ts`
- `git-stacks clone [source]` -- `src/commands/workspace.ts` -> `src/tui/workspace-clone.ts`
- `git-stacks open <name>` -- `src/commands/workspace.ts` -> `src/lib/workspace-ops.ts:openWorkspace()`
- `git-stacks list` -- workspace listing with dirty/ahead/behind status, label filtering
- `git-stacks status [name]` -- per-repo status with ahead/behind counts
- `git-stacks sync <name>` -- fetch + rebase/merge with optional auto-stash
- `git-stacks push <name>` -- parallel push across worktree repos
- `git-stacks pull <name>` -- parallel pull --ff-only
- `git-stacks close <name>` -- integration cleanup, close hooks
- `git-stacks clean <name>` -- cascades through close, removes worktrees
- `git-stacks remove <name>` -- cascades through clean, deletes YAML
- `git-stacks merge <name>` -- cascades through clean, merges branches, deletes YAML
- `git-stacks rename <old> <new>` -- re-register worktrees at new paths
- `git-stacks manage` -- SolidJS interactive TUI dashboard
- `git-stacks template new|init|edit|list|remove|rename|clone` -- template management
- `git-stacks repo add|scan|list|remove` -- repo registry management
- `git-stacks config [show]` -- global config wizard
- `git-stacks doctor [--fix] [--json]` -- health check and drift detection
- `git-stacks message send|list|clear` -- workspace notifications
- `git-stacks hooks status|install|update|uninstall` -- opt-in coding-agent signal hook management
- `git-stacks integration list|<id> config show|example` -- integration introspection
- `git-stacks label add|remove|list|clear` -- workspace label management
- `git-stacks completion [bash|zsh|fish]` -- shell completion generation
- `git-stacks env <workspace>` -- print resolved env vars in multiple formats
- `git-stacks edit <workspace>` -- open workspace YAML in editor
- `git-stacks cd <workspace>` -- print workspace path for shell eval
- `git-stacks paths <workspace>` -- print repo paths
- `git-stacks run <workspace> <command>` -- run command in each repo

**Interactive Dashboard Entry:**
- Location: `src/tui/dashboard/run.tsx`
- Triggers: `git-stacks manage` command (also default when no subcommand)
- Responsibilities: Open IPC socket, render SolidJS TUI at 30fps on alternate screen

## Error Handling

**Strategy:** Graceful degradation with informative errors. Failed hooks abort by default. Integrations silently degrade. All fallible operations return `{ ok: boolean; error?: string }` result objects.

**Patterns:**
- **Hook failures:** `runHooks()` in `src/lib/lifecycle.ts` throws on non-zero exit (configurable `abortOnFailure`). Callers wrap in try/catch, return `{ ok: false, error }`.
- **Git command failures:** `src/lib/git.ts` uses `.quiet().nothrow()`, checks exit codes. Rebase/merge failures trigger `.abort()`. Push failures return categorized reasons (non-fast-forward, auth failed, network error, etc.).
- **Secret resolution failures:** `resolveSecrets()` throws if resolver not found or resolution fails. `openWorkspace()` catches and returns `{ ok: false, error: "Secret resolution failed: ..." }`.
- **Port allocation failures:** Returns `{ ok: false, error }` on conflict or exhaustion; lock timeout throws.
- **Integration failures:** `runner.ts` cleanup errors are non-fatal (logged via `console.warn`, execution continues).
- **Config validation:** Zod `.parse()` throws on invalid YAML; `.safeParse()` used for list operations (skip corrupt files with warning).
- **File operations:** `applyEntry()` returns `ApplyResult` -- three-case logic: destination exists (skip), source missing (error), both valid (apply). Glob zero-matches emit warnings, not errors.
- **Workspace not found:** All operations check existence first and return `{ ok: false, error }` rather than throwing.

## Cross-Cutting Concerns

**Logging:** Console output via `console.log()` / `console.error()`. Business logic accepts `onProgress` callbacks (simple string or typed row objects). Dashboard uses SolidJS reactivity. No logging framework.

**Validation:** All YAML inputs validated at read time via Zod schemas. User CLI inputs validated with `NameSchema` regex (letters, digits, dots, hyphens, underscores). Label inputs validated with `LabelSchema`. Template names, workspace names both use `NameSchema`.

**Environment Variables:**
- Hooks receive: `GS_WORKSPACE_NAME`, `GS_WORKSPACE_BRANCH`, `GS_WORKSPACE_PATH`, `GS_TRIGGERED_BY`, `GS_REPO_NAME`, `GS_REPO_PATH`, `GS_REPO_CLONE_PATH`
- Plus: merged workspace `env` dict, resolved port values, resolved secrets
- Special: `GS_MERGED_BRANCH` in post_merge hooks

**Secret Resolution:** Env var values matching `${{ resolver:path }}` are resolved via pluggable `SecretResolver` instances at workspace open time. Resolution is skipped with `--skip-secrets` flag.

**Port Injection:** Workspace port declarations (from template or workspace YAML) are allocated at open time and injected into the hook environment as env vars.

**Config Directory Override:** `GIT_STACKS_CONFIG_DIR` env var overrides `~/.config/git-stacks/` for test isolation.

**Atomic Writes:** All YAML writes go through `writeYaml()` which writes to `.tmp` file, fsyncs, then renames (atomic on POSIX).

---

*Architecture analysis: 2026-04-04*
