# Architecture

**Analysis Date:** 2026-03-17

## Pattern Overview

**Overall:** Layered CLI application with pluggable integration system. The architecture separates concerns into configuration management, business logic, user interface, and extensible integrations.

**Key Characteristics:**
- YAML-based declarative configuration with Zod validation
- Multi-layer abstraction: config → workspace ops → commands → CLI
- Integration plugin architecture for IDE/terminal spawning
- Hook system for extensible lifecycle events
- Bun runtime with native shell scripting via `$` API

## Layers

**CLI / Command Layer:**
- Purpose: Parse user input, dispatch to business logic, format output
- Location: `src/commands/` and `src/index.ts`
- Contains: Commander.js command definitions, option parsing, user-facing output
- Depends on: Workspace ops, config I/O, TUI components
- Used by: User shell invocations (git-stacks CLI)

**Business Logic Layer:**
- Purpose: Core domain operations (workspace lifecycle, sync, merge, status checks)
- Location: `src/lib/workspace-ops.ts`, `src/lib/git.ts`
- Contains: Open, clean, remove, merge, rename, sync functions; git worktree management
- Depends on: Git shell operations, config I/O, lifecycle hooks, integrations
- Used by: Command layer, TUI layer

**Configuration Layer:**
- Purpose: Validate, read, write YAML configs (stacks, workspaces, global settings)
- Location: `src/lib/config.ts`
- Contains: Zod schemas for Stack, Workspace, GlobalConfig; YAML read/write functions
- Depends on: Zod, yaml library, file system
- Used by: All layers (schema source of truth)

**Integration Plugin Layer:**
- Purpose: Pluggable generation and launching of IDE/terminal artifacts
- Location: `src/lib/integrations/`
- Contains: Integration interface, plugin registry, plugin implementations (vscode, intellij, cmux, tmux)
- Depends on: Config, workspace data, file system
- Used by: Workspace ops during `open` operation

**TUI Layer (Terminal User Interface):**
- Purpose: Interactive prompts and dashboard for user-guided workflows
- Location: `src/tui/` and `src/tui/dashboard/`
- Contains: Stack/workspace wizards, SolidJS dashboard, prompt utilities
- Depends on: Clack prompts, config I/O, lifecycle, file operations, integration registry
- Used by: Commands (`new`, `clone`, `manage`, `config`)

**Path Management Layer:**
- Purpose: Single source of truth for all filesystem paths
- Location: `src/lib/paths.ts`
- Contains: Path constants and helper functions
- Depends on: Nothing (pure path computation)
- Used by: All layers requiring filesystem locations

## Data Flow

**Workspace Creation Flow:**

1. User runs `git-stacks new [name]`
2. `workspace.ts` command dispatches to `runWorkspaceNew()` (TUI layer)
3. TUI prompts user for: name, branch, description, stacks, per-stack repos
4. For each selected stack, TUI reads stack YAML from disk via `readStack()`
5. User confirms selections; `Workspace` object created with repos list
6. `writeWorkspace()` persists YAML to `~/.config/git-stacks/workspaces/{name}.yml`
7. For each `worktree` mode repo, `createWorktree()` invokes `git worktree add`
8. `runHooks()` executes stack/workspace/repo hooks with injected env vars
9. Integrations registry loops: `integration.generate()` (e.g., .vscode/settings.json) → `integration.open()` (e.g., `code` CLI)
10. `applyFileOperations()` copies/symlinks files from stack template to task path

**Workspace Open Flow:**

1. User runs `git-stacks open {name}`
2. `openWorkspace()` reads workspace YAML via `readWorkspace()`
3. For missing worktrees, `createWorktree()` recreates them
4. Workspace-level `pre_open` hooks run
5. Per-repo `pre_open` hooks run in their respective paths
6. For each enabled integration:
   - `integration.isEnabled()` checks global config + workspace override
   - `integration.applies()` filters (e.g., IntelliJ only for Java repos)
   - `integration.generate()` writes artifacts to disk
   - `integration.open()` launches the tool
7. Stack-level environment variables merged into `mergedEnvVars`
8. `writeEnvFiles()` writes `.env` to each worktree if configured
9. Workspace and stack-level `post_open` hooks run

**Workspace Merge & Cleanup Flow:**

1. User runs `git-stacks merge {name}`
2. `mergeWorkspace()` reads workspace, loads all associated stacks
3. Resolve base branches from stack definitions (default: `main`)
4. Dry-run conflict check via `getMergeConflicts()` on all repos
5. If conflicts and not forced, return error
6. Run `pre_remove` hooks (same env enrichment as open)
7. For each worktree repo: `mergeNoFF()` (no fast-forward merge to base branch)
8. Remove worktree directories via `removeWorktree()`
9. Delete local branches
10. Run `post_merge` hooks with `WS_MERGED_BRANCH` env var
11. Delete workspace YAML file
12. Return success

**Sync Flow:**

1. User runs `git-stacks sync {name} [--strategy rebase|merge] [--best-effort]`
2. `syncWorkspace()` reads workspace, loads stacks
3. Parallel `fetchOrigin()` on all worktree repos
4. Parallel dry-run conflict check against `origin/{baseBranch}`
5. If strict mode and conflicts: return detailed error
6. If best-effort mode: skip conflicting repos
7. For each non-conflicting repo:
   - Get commits behind via `getCommitsBehind()`
   - Apply strategy: `rebaseBranch()` or `mergeBranchFF()`
   - Record results (synced/skipped with reasons)
8. Return sync result with detailed status

**State Management:**

- Workspace state: Persisted as YAML files at `~/.config/git-stacks/workspaces/{name}.yml`
- Stack definitions: Stored as YAML at `~/.config/git-stacks/stacks/{name}.yml`
- Global config: Stored at `~/.config/git-stacks/config.yml` (workspace_root, integration settings)
- Worktree state: Managed by git itself; directories tracked at `{workspace_root}/tasks/{workspace_name}/{repo_name}`
- No runtime-only state; all critical state is persisted to disk

## Key Abstractions

**Stack (Configuration Template):**
- Purpose: Reusable template describing a set of git repos with metadata
- Examples: `src/lib/config.ts` lines 42-50 define `StackSchema`
- Pattern: Declarative YAML with optional hooks, environment variables, file operations per repo

**Workspace (Task Instance):**
- Purpose: A task/ticket-scoped snapshot created from one or more stacks
- Examples: `src/lib/config.ts` lines 80-92 define `WorkspaceSchema`
- Pattern: Contains refs to stacks, repo clones/worktrees, branch name, hooks, per-repo hooks

**Integration (Plugin Interface):**
- Purpose: Pluggable artifact generator + launcher for IDE/terminals
- Examples: `src/lib/integrations/vscode.ts`, `src/lib/integrations/intellij.ts`
- Pattern: Implements `Integration` interface; registry pattern in `src/lib/integrations/index.ts`

**WorkspaceRepo (Repo Reference):**
- Purpose: Represents a single repo within a workspace instance
- Pattern: Tracks both main clone path and task worktree path; carries mode (trunk/worktree)

## Entry Points

**CLI Entry:**
- Location: `src/index.ts`
- Triggers: Direct invocation via `bun run src/index.ts` or installed binary `git-stacks`
- Responsibilities: Register all commands, parse argv, default to `manage` if no subcommand

**Main Commands:**
- `git-stacks new [name]` — `src/commands/workspace.ts`, dispatches to `runWorkspaceNew()`
- `git-stacks clone [source]` — dispatches to `runWorkspaceClone()`
- `git-stacks open <name>` — calls `openWorkspace()` from `src/lib/workspace-ops.ts`
- `git-stacks list` — lists all workspaces with optional status checks
- `git-stacks manage` — SolidJS interactive dashboard (`src/tui/dashboard/App.tsx`)
- `git-stacks stack new|init|edit|list` — stack management via `runStackNew()`, `runStackInit()`, `runStackEdit()`
- `git-stacks config` — global config wizard
- `git-stacks completion [bash|zsh|fish]` — shell completion generation
- `git-stacks doctor` — health check and drift detection

**Interactive Dashboard Entry:**
- Location: `src/tui/dashboard/run.tsx`
- Triggers: `git-stacks manage` command
- Responsibilities: Render TUI, dispatch workspace actions, show status

## Error Handling

**Strategy:** Graceful degradation with informative error messages; failed hooks abort by default; integrations silently degrade if disabled or inapplicable.

**Patterns:**

- **Hook failures:** `runHooks()` in `src/lib/lifecycle.ts` aborts on non-zero exit (configurable via `abortOnFailure` param). Callers wrap in try/catch and return `{ ok: false, error: string }`.
- **Git command failures:** `src/lib/git.ts` uses Bun's `.quiet().nothrow()` to suppress stderr/exit code, then manually check exit code. Rebase/merge failures trigger `.abort()` to clean up.
- **Integration failures:** Integrations that fail to generate or open log errors but don't block workflow; workspace operations continue.
- **Config validation:** Zod schema parsing in `readYaml()` throws on invalid YAML; callers handle with try/catch.
- **File operations:** `applyFileOperations()` silently skips missing source files or symlink conflicts (see `src/lib/files.ts`).
- **Missing repos:** Commands check for dirty worktrees and missing task_paths before operations; return user-friendly errors.

## Cross-Cutting Concerns

**Logging:** Console output via standard `console.log()` / `console.error()`. Commands and workspace-ops functions accept optional `onProgress` callback for streaming status messages. Dashboard uses SolidJS reactivity.

**Validation:** All YAML inputs validated at read time via Zod schemas (`src/lib/config.ts`). User inputs from TUI validated by prompt functions. Git commands validated by exit code checks.

**Authentication:** None — tools used (git, code, idea, etc.) handle their own auth. Global config and workspace YAML may store integration-specific settings (e.g., VS Code launch flags), stored in `globalConfig.integrations[id]`.

**Environment Variables:** Hooks receive injected env vars (`WS_WORKSPACE`, `WS_BRANCH`, `WS_TASKS_DIR`, `WS_REPO_NAME`, etc.) plus merged stack + workspace `env` dicts. Per-workspace env files written to `.env` at task_path if configured.

---

*Architecture analysis: 2026-03-17*
