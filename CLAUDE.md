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

Hooks receive injected environment variables: `GS_WORKSPACE_NAME`, `GS_WORKSPACE_BRANCH`, `GS_WORKSPACE_PATH`, `GS_REPO_NAME`, `GS_TRIGGERED_BY`, and others. Templates and workspaces can also define `env: Record<string, string>` and an optional `env_file` path; `workspace-ops.ts` calls `mergeEnv()` to combine them and `writeEnvFiles()` to write merged env to each repo at the configured path.

### Shell completion auto-generation

`completion-generator.ts` walks the commander.js program tree and generates shell-specific completion functions (bash case statements, zsh `_arguments`, fish `complete`). Dynamic completions (workspace/template names) are resolved from the filesystem at completion time.

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

## Languages
- TypeScript 5.9.3 - Used throughout codebase (CLI, TUI, libraries)
- JSX/TSX - React-like syntax for SolidJS components in TUI dashboard
- Bash/Shell - Used in hooks system and git operations via `$` shell
## Runtime
- Bun (latest) - JavaScript runtime and package manager
- Node.js ES modules - via Bun's native ESM support
- Bun - Provides `bun` CLI and acts as package manager
- Lockfile: `bun.lock` (generated from package.json)
## Frameworks
- Commander.js 12.1.0 - CLI command framework and argument parsing
- Zod 3.25.76 - Type-safe schema validation for config files (YAML)
- yaml 2.8.2 - YAML parsing and serialization for config management
- SolidJS 1.9.11 - Reactive component framework for interactive TUI dashboard
- @opentui/core 0.1.96 - Core TUI component library (cross-platform terminal UI)
- @opentui/solid 0.1.96 - SolidJS bindings for OpenTUI components
- opentui-spinner 0.0.6 - Animated spinners in CLI output
- @clack/prompts 0.9.1 - Beautiful CLI interactive prompts and selections
## Key Dependencies
- Zod - Runtime schema validation; all YAML config (stacks, workspaces, global config) is validated against Zod schemas on read
- Commander.js - Entire CLI command tree structure; dynamically introspected for shell completion generation
- yaml - Reads/writes YAML config files stored at `~/.config/git-stacks/`
- SolidJS + OpenTUI - Interactive dashboard (`git-stacks manage`) for workspace management
- @types/bun - Type definitions for Bun APIs (fs, spawn, $)
- Bun's native `$` shell - All git operations and hook execution via shell subprocess
- Bun's `spawn()` API - Hook execution with inherited stdio and environment
## Configuration
- No .env files used
- Configuration sourced from YAML files in `~/.config/git-stacks/`:
- `tsconfig.json`:
- `bunfig.toml`:
## Platform Requirements
- Bun (latest) - Required for running source directly, testing, and publishing
- TypeScript 5.9.3 - Dev dependency for type checking (`bun run typecheck`)
- Git 2.24+ (for worktree support)
- Bun runtime - Binary distribution via npm (`git-stacks` command)
- Git 2.24+ - For `git worktree` operations
- Supported shells: bash, zsh, fish (completion output)
- IDE/terminal integrations:
## Entry Points
- `src/index.ts` - Bun shebang entrypoint; registers all commands with Commander.js
- Published as `git-stacks` bin in package.json
- `src/tui/dashboard/run.tsx` - SolidJS app entry; renders via @opentui/solid
- Invoked by `git-stacks manage` command
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
## Conventions

## Naming Patterns
- Kebab-case for all files (e.g., `workspace-ops.ts`, `stack-wizard.ts`, `completion-generator.ts`)
- Test files follow pattern: `{name}.test.ts` (e.g., `detect.test.ts`, `config.test.ts`)
- Helper/utility files: `utils.ts` (e.g., `src/tui/utils.ts`, `tests/helpers.ts`)
- No `.d.ts` files — types are colocated with implementation
- Camel case for all function names
- Prefix with verb for clarity:
- Camel case (e.g., `dirtyRepos`, `repoPath`, `taskPath`)
- Descriptive names with context:
- Destructure when unpacking YAML objects: `const { name, path, type } = repo`
- Plural for arrays: `workspaces`, `repos`, `commands`, `dirtyRepos`, `issues`
- PascalCase for all type/interface names: `Workspace`, `Stack`, `RepoType`, `Integration`, `WorkspaceListInfo`
- Schema types use suffix `Schema`: `StackSchema`, `WorkspaceSchema`, `StackRepoSchema`
- Infer types from schemas: `export type Stack = z.infer<typeof StackSchema>`
- Use `type` not `interface` for simple data structures, `interface` for contracts (e.g., `Integration`)
- Prefix optional fields with descriptive names: `cmux_workspace_id`, `env_file`, `task_path` (never just `id`)
- UPPER_SNAKE_CASE for paths and configuration constants:
- Located in `src/lib/paths.ts` as single source of truth
## Code Style
- No explicit formatter configured (Bun runs TypeScript directly)
- Implicit style observed:
- No ESLint/Biome config present
- TypeScript strict mode enforced:
- Always export types alongside implementations: `export type Workspace = z.infer<typeof WorkspaceSchema>`
- Zod schemas are single source of truth for YAML shape
- No `any` — use type parameters or explicit unions instead
- Structural typing used in config I/O: `schema.parse(data)` pattern
## Import Organization
- `@/*` resolves to `./src/*` (configured in `tsconfig.json`) — **test-only**; do NOT use in `src/` production code (the alias is not available in the published npm package since Bun does not resolve tsconfig paths from within `node_modules`)
- Used in tests only: `import type { X } from "@/tui/utils"` (type imports are erased at compile time)
- Import named exports: `import { readStack, writeStack } from "./config"`
- Never use wildcard imports: no `import * as config from "./config"`
- Group by functionality: all git functions together, all config functions together
## Error Handling
- Bun shell (`$`) operations use `.quiet().nothrow()` to suppress stderr and return exit codes:
- Zod parsing with `.parse()` throws on invalid schema — only used for trusted YAML files
- Try-catch in narrow scopes, not around entire functions:
- Catch errors silently when expected (e.g., file operations on potentially missing files)
- Throw with descriptive messages including context: `throw new Error(\`Hook failed (exit ${exitCode}): ${cmd}\`)`
- Use discriminated unions for fallible operations:
- Never return `null` for operations that may fail — use union with error info
- Use `.nothrow()` and check `.exitCode` rather than catching shell errors
- Long-running operations (rebase, merge) auto-abort on failure: `git rebase --abort`, `git merge --abort`
- Return error in result object rather than throwing
## Logging
- `console.log()` for normal output
- `console.error()` for errors and warnings
- Prefix output with indentation for nested context: `console.log(\`  ${msg}\`)`
- Pass callback for progress: `openWorkspace(name, opts, (msg) => console.log(\`  ${msg}\`))`
- Format tables manually with `.padEnd()` for alignment
- Shell output inherited directly from spawned processes in lifecycle.ts
## Comments
- Section dividers using visual markers: `// --- Schemas ---`, `// --- Helpers ---`
- Edge cases and workarounds: "Use structural typing to avoid Zod's internal generic complexity"
- Why something non-obvious: "Branch from current HEAD of the main clone, not a fixed base branch"
- Known limitations: `@clack/prompts p.text returns undefined (not "") on empty input`
- Sparse — only on public interfaces and complex types
- Used in integration system: `/** Unique key — used as the key in config.integrations */`
- Document callback and return types for integration hooks
- No auto-generated docs
- Single `//` on same line explaining non-obvious parameters
- No block comments (`/* */`) except JSDoc
## Function Design
- Max 3-4 positional params; use destructuring for objects with >2 fields
- Options objects for CLI: `{ force: boolean; gone: boolean }`
- Callbacks for progress: `ProgressCallback = (message: string) => void`
- Explicit return type annotations always present on exported functions
- Use union types for fallible: `{ ok: true } | { ok: false; error: string }`
- Return null only when "not found" is expected, never for errors
- Async functions always return `Promise<T>`
## Module Design
- Separate `lib/` (reusable) from `commands/` (CLI) from `tui/` (interaction)
- Export all public functions and types
- Export types alongside: `export type Stack = z.infer<typeof StackSchema>`
- All paths: `src/lib/paths.ts`
- All schemas: `src/lib/config.ts`
- All integrations: `src/lib/integrations/index.ts`
- All git ops: `src/lib/git.ts`
- `src/lib/integrations/index.ts` exports all integrations and types
- `src/index.ts` is CLI entry point, not a barrel
## Structural Patterns
- `readYaml(path, schema)` — parses with Zod
- `writeYaml(path, data)` — stringifies
- Create `read*` and `write*` functions for each entity
- Ensure directory exists before writing
- `id` — unique config key
- `applies?(workspace)` — optional filter
- `isEnabled(ctx)` — resolve config
- `generate?(ctx)` — return path or null
- `open(ctx, path)` — launch tool
- Register only in `src/lib/integrations/index.ts`
- Shell operations: `.catch()`, map to error result
- YAML parsing: let Zod throw (data trusted)
- File I/O: try-catch around copy/symlink (expected to fail sometimes)
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->
## Architecture

## Pattern Overview
- YAML-based declarative configuration with Zod validation
- Multi-layer abstraction: config → workspace ops → commands → CLI
- Integration plugin architecture for IDE/terminal spawning
- Hook system for extensible lifecycle events
- Bun runtime with native shell scripting via `$` API
## Layers
- Purpose: Parse user input, dispatch to business logic, format output
- Location: `src/commands/` and `src/index.ts`
- Contains: Commander.js command definitions, option parsing, user-facing output
- Depends on: Workspace ops, config I/O, TUI components
- Used by: User shell invocations (git-stacks CLI)
- Purpose: Core domain operations (workspace lifecycle, sync, merge, status checks)
- Location: `src/lib/workspace-ops.ts`, `src/lib/git.ts`
- Contains: Open, clean, remove, merge, rename, sync functions; git worktree management
- Depends on: Git shell operations, config I/O, lifecycle hooks, integrations
- Used by: Command layer, TUI layer
- Purpose: Validate, read, write YAML configs (stacks, workspaces, global settings)
- Location: `src/lib/config.ts`
- Contains: Zod schemas for Stack, Workspace, GlobalConfig; YAML read/write functions
- Depends on: Zod, yaml library, file system
- Used by: All layers (schema source of truth)
- Purpose: Pluggable generation and launching of IDE/terminal artifacts
- Location: `src/lib/integrations/`
- Contains: Integration interface, plugin registry, plugin implementations (vscode, intellij, cmux, tmux)
- Depends on: Config, workspace data, file system
- Used by: Workspace ops during `open` operation
- Purpose: Interactive prompts and dashboard for user-guided workflows
- Location: `src/tui/` and `src/tui/dashboard/`
- Contains: Stack/workspace wizards, SolidJS dashboard, prompt utilities
- Depends on: Clack prompts, config I/O, lifecycle, file operations, integration registry
- Used by: Commands (`new`, `clone`, `manage`, `config`)
- Purpose: Single source of truth for all filesystem paths
- Location: `src/lib/paths.ts`
- Contains: Path constants and helper functions
- Depends on: Nothing (pure path computation)
- Used by: All layers requiring filesystem locations
## Data Flow
- Workspace state: Persisted as YAML files at `~/.config/git-stacks/workspaces/{name}.yml`
- Stack definitions: Stored as YAML at `~/.config/git-stacks/stacks/{name}.yml`
- Global config: Stored at `~/.config/git-stacks/config.yml` (workspace_root, integration settings)
- Worktree state: Managed by git itself; directories tracked at `{workspace_root}/tasks/{workspace_name}/{repo_name}`
- No runtime-only state; all critical state is persisted to disk
## Key Abstractions
- Purpose: Reusable template describing a set of git repos with metadata
- Examples: `src/lib/config.ts` lines 42-50 define `StackSchema`
- Pattern: Declarative YAML with optional hooks, environment variables, file operations per repo
- Purpose: A task/ticket-scoped snapshot created from one or more stacks
- Examples: `src/lib/config.ts` lines 80-92 define `WorkspaceSchema`
- Pattern: Contains refs to stacks, repo clones/worktrees, branch name, hooks, per-repo hooks
- Purpose: Pluggable artifact generator + launcher for IDE/terminals
- Examples: `src/lib/integrations/vscode.ts`, `src/lib/integrations/intellij.ts`
- Pattern: Implements `Integration` interface; registry pattern in `src/lib/integrations/index.ts`
- Purpose: Represents a single repo within a workspace instance
- Pattern: Tracks both main clone path and task worktree path; carries mode (trunk/worktree)
## Entry Points
- Location: `src/index.ts`
- Triggers: Direct invocation via `bun run src/index.ts` or installed binary `git-stacks`
- Responsibilities: Register all commands, parse argv, default to `manage` if no subcommand
- `git-stacks new [name]` — `src/commands/workspace.ts`, dispatches to `runWorkspaceNew()`
- `git-stacks clone [source]` — dispatches to `runWorkspaceClone()`
- `git-stacks open <name>` — calls `openWorkspace()` from `src/lib/workspace-ops.ts`
- `git-stacks list` — lists all workspaces with optional status checks
- `git-stacks manage` — SolidJS interactive dashboard (`src/tui/dashboard/App.tsx`)
- `git-stacks stack new|init|edit|list` — stack management via `runStackNew()`, `runStackInit()`, `runStackEdit()`
- `git-stacks config` — global config wizard
- `git-stacks completion [bash|zsh|fish]` — shell completion generation
- `git-stacks doctor` — health check and drift detection
- Location: `src/tui/dashboard/run.tsx`
- Triggers: `git-stacks manage` command
- Responsibilities: Render TUI, dispatch workspace actions, show status
## Error Handling
- **Hook failures:** `runHooks()` in `src/lib/lifecycle.ts` aborts on non-zero exit (configurable via `abortOnFailure` param). Callers wrap in try/catch and return `{ ok: false, error: string }`.
- **Git command failures:** `src/lib/git.ts` uses Bun's `.quiet().nothrow()` to suppress stderr/exit code, then manually check exit code. Rebase/merge failures trigger `.abort()` to clean up.
- **Integration failures:** Integrations that fail to generate or open log errors but don't block workflow; workspace operations continue.
- **Config validation:** Zod schema parsing in `readYaml()` throws on invalid YAML; callers handle with try/catch.
- **File operations:** `applyFileOperations()` silently skips missing source files or symlink conflicts (see `src/lib/files.ts`).
- **Missing repos:** Commands check for dirty worktrees and missing task_paths before operations; return user-friendly errors.
## Cross-Cutting Concerns
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
