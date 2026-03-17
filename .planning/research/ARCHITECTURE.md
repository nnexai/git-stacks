# Architecture Research

**Domain:** Multi-repo workspace manager CLI (developer environment tooling)
**Researched:** 2026-03-17
**Confidence:** HIGH (based on direct codebase analysis + training knowledge of comparable tools: tmuxinator, mise, moonrepo, devenv, workmux)

---

## Standard Architecture for This Domain

### System Overview

```
┌──────────────────────────────────────────────────────────────────────┐
│                         CLI / TUI Layer                               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐               │
│  │  Commander   │  │  Clack TUI   │  │  SolidJS     │               │
│  │  Commands    │  │  Wizards     │  │  Dashboard   │               │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘               │
├─────────┴─────────────────┴─────────────────┴────────────────────────┤
│                      Business Logic Layer                             │
│  ┌──────────────────────────┐  ┌──────────────────────────────────┐  │
│  │     workspace-ops.ts     │  │         lifecycle.ts             │  │
│  │  open/clean/merge/sync/  │  │  runHooks() — sequential shell   │  │
│  │  rename/status           │  │  execution with env injection    │  │
│  └─────────────┬────────────┘  └──────────────────────────────────┘  │
├───────────────┬┴──────────────────────────────────────────────────────┤
│               │          Infrastructure Layer                          │
│  ┌────────────┴───┐  ┌───────────────┐  ┌──────────────────────────┐ │
│  │   git.ts       │  │  integrations/│  │       files.ts           │ │
│  │  worktree ops  │  │  plugin system│  │  copy/symlink operations │ │
│  │  via Bun $     │  │  (registry)   │  │                          │ │
│  └────────────────┘  └───────────────┘  └──────────────────────────┘ │
├───────────────────────────────────────────────────────────────────────┤
│                       Configuration Layer                              │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐   │
│  │   config.ts      │  │    paths.ts       │  │  YAML on disk    │   │
│  │  Zod schemas +   │  │  single source    │  │  stacks/ +       │   │
│  │  YAML read/write │  │  for all paths    │  │  workspaces/     │   │
│  └──────────────────┘  └──────────────────┘  └──────────────────┘   │
└───────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Communicates With |
|-----------|----------------|-------------------|
| `src/index.ts` | CLI entry point; registers all commands; default to `manage` | Commander, commands/* |
| `src/commands/workspace.ts` | Workspace subcommand handlers; CLI option parsing | workspace-ops, TUI wizards |
| `src/commands/stack.ts` | Stack subcommand thin wrappers | TUI stack wizards |
| `src/commands/doctor.ts` | Health check; drift detection; issue reporting | config, git, paths |
| `src/lib/workspace-ops.ts` | Core domain operations (open, clean, merge, sync, rename) | git, config, lifecycle, integrations |
| `src/lib/git.ts` | All git operations via Bun `$` shell API | External: git binary |
| `src/lib/lifecycle.ts` | Sequential hook runner with env injection | External: sh -c |
| `src/lib/config.ts` | Zod schemas; YAML read/write; workspace and stack I/O | YAML files on disk |
| `src/lib/paths.ts` | All filesystem path constants and helpers | Nothing (pure computation) |
| `src/lib/files.ts` | Copy and symlink operations for stack file templates | Filesystem |
| `src/lib/integrations/` | Plugin registry + per-tool implementations | workspace-ops, config, external tools |
| `src/tui/` | Interactive prompts for new/clone/edit workflows | config, workspace-ops |
| `src/tui/dashboard/` | SolidJS reactive TUI for `manage` command | workspace-ops |

---

## How Comparable Tools Are Structured

### tmuxinator / workmux (session managers)

**Architecture pattern:** Flat config file + process launcher.
- Single YAML per session describes windows/panes and startup commands.
- No plugin system; extensions are done via hooks or ERB templates.
- State is ephemeral — the YAML *is* the definition, no separate instance state.

**Lesson for git-stacks:** The separation of "definition" (Stack YAML) from "instance" (Workspace YAML) is more sophisticated than tmuxinator's approach and is correct. tmuxinator re-reads the definition every time; git-stacks snapshots the repos into the workspace YAML at creation time. This makes workspaces self-contained (survive stack edits), but means stale data accumulates — the `sync`/`doctor` pattern compensates for this correctly.

### mise (polyglot tool version manager)

**Architecture pattern:** Config file hierarchy with scope resolution.
- `mise.toml` → project-level, `~/.config/mise/config.toml` → global.
- Plugin system: each tool is a plugin (TOML-configured or Bash-script). Plugins implement `install`, `list-all`, `exec` hooks.
- Config schema evolution: uses `.toml` with forward-compatible unknown-key tolerance (no hard Zod rejection on extra fields).
- **Key pattern:** The `tasks` feature uses the same hook mechanism as regular config — `[tasks.build]` is just a named hook sequence. This unification is elegant.

**Lesson for git-stacks:** Zod's `strict()` mode would reject unknown YAML keys, breaking configs on downgrade. The current schemas use `z.object()` (not `.strict()`), which silently ignores unknown keys — this is the correct pattern for user-facing config files. However, there is currently no mechanism for additive migrations (e.g., adding a required field to WorkspaceSchema). A `schema_version` field in YAML enables forward-compatibility checks.

### moonrepo (monorepo/multi-repo task orchestrator)

**Architecture pattern:** DAG task execution with workspace graph.
- Each project defines tasks in `.moon/project.yml`; workspace defines the graph in `.moon/workspace.yml`.
- Plugin system (Rust WASM): plugins implement task runners as WASM modules — a heavy-weight, sandboxed approach.
- State: uses a local cache at `.moon/cache/` with hashed inputs for incremental execution. Significant separate state beyond config.
- **Key pattern:** Task dependency resolution as a directed acyclic graph; topological execution order.

**Lesson for git-stacks:** The hook system today is a simple sequential list per scope (stack, workspace, repo). As the tool matures, users will want cross-repo hook ordering (e.g., "build repo A before running post_open for repo B"). A dependency graph for hooks is a maturity milestone, not day-one scope. The current flat arrays are the right starting point.

### devenv (Nix-based dev environments)

**Architecture pattern:** Declarative environment spec that generates activation scripts.
- A single `devenv.nix` generates a shell environment, process manager config, and service definitions.
- No separate "instance" concept — environment is derived from spec each time.
- **Key pattern:** Separation of "what is in the environment" (spec) from "how to activate it" (generated shell script). The generated artifacts are disposable.

**Lesson for git-stacks:** The integration `generate()` method (produces `.code-workspace`, `.idea/` etc.) maps directly to this pattern. These artifacts are **derived** from the workspace spec, not source of truth. The corollary: if an artifact is corrupted or stale, `ws open` should regenerate it without asking. Currently this appears to be the behavior — `generate()` overwrites unconditionally.

---

## Recommended Project Structure (Current + Maturity Direction)

```
src/
├── index.ts                    # CLI entry: register commands, default to manage
├── commands/                   # CLI command handlers (thin: parse → dispatch)
│   ├── workspace.ts            # new, clone, open, list, status, clean, remove, cd, merge, run, rename, sync
│   ├── stack.ts                # stack new|init|edit|list
│   ├── doctor.ts               # health check, drift detection
│   ├── config.ts               # interactive config wizard
│   └── completion.ts           # shell completion generation
├── lib/                        # Infrastructure (no CLI concerns)
│   ├── config.ts               # Zod schemas + YAML I/O (source of truth for types)
│   ├── paths.ts                # All filesystem path constants (pure, no I/O)
│   ├── git.ts                  # Git operations via Bun $ (single responsibility: git)
│   ├── workspace-ops.ts        # Domain operations: open/clean/merge/sync/rename
│   ├── lifecycle.ts            # Hook runner (env injection, sequential execution)
│   ├── files.ts                # File copy/symlink operations
│   ├── detect.ts               # Repo type detection
│   ├── completion-generator.ts # Auto-generates shell completions from commander tree
│   ├── vscode.ts               # Artifact generator (legacy; owned by integration plugin)
│   ├── intellij.ts             # Artifact generator (legacy; owned by integration plugin)
│   ├── cmux.ts                 # Artifact generator (legacy; owned by integration plugin)
│   ├── tmux.ts                 # Artifact generator (legacy; owned by integration plugin)
│   └── integrations/           # Plugin registry
│       ├── types.ts            # Integration interface + IntegrationContext
│       ├── index.ts            # Registry array (the only file to edit when adding plugins)
│       ├── vscode.ts           # VSCode plugin (config, generate, open)
│       ├── intellij.ts         # IntelliJ plugin
│       ├── cmux.ts             # cmux plugin
│       └── tmux.ts             # tmux plugin
└── tui/                        # Interactive UI (clack prompts + SolidJS dashboard)
    ├── utils.ts                # safeText() wrapper
    ├── stack-wizard.ts         # stack new / stack init prompts
    ├── stack-edit.ts           # stack edit prompts
    ├── workspace-wizard.ts     # ws new prompts
    ├── workspace-clone.ts      # ws clone prompts
    └── dashboard/              # SolidJS TUI (ws manage)
        ├── run.tsx             # Entry point for dashboard
        ├── App.tsx             # Root component, state management
        └── [components].tsx    # WorkspaceList, WorkspaceRow, ActionMenu, etc.
```

**Structure rationale:**
- `lib/` is UI-agnostic — usable from commands, TUI, and a future programmatic API.
- `commands/` are thin dispatchers — no business logic, only option parsing and output formatting.
- `tui/` depends on `lib/` but never vice versa — prevents circular dependencies.
- `lib/integrations/` is the sole extensibility boundary — add a file, register in `index.ts`, done.

---

## Architectural Patterns

### Pattern 1: Command-Result Return Type

**What:** Business logic functions return `{ ok: boolean; error?: string }` rather than throwing. Only hooks and catastrophic failures throw.

**When to use:** Every workspace-ops function. Enables callers (commands, TUI, future API) to handle failures gracefully without try/catch everywhere.

**Trade-offs:** Pro: predictable error flow; easy to test. Con: easy to ignore return value (`const _ = await openWorkspace(...)` silently discards failure). TypeScript's lack of checked exceptions means callers must be disciplined.

**Current implementation:** `workspace-ops.ts` uses this consistently. Commands check `result.ok` and exit with code 1 on failure. Dashboard checks it and displays inline error.

**Maturity gap:** The `{ ok, error }` type is not formally declared as a shared type alias — it's inlined. Extracting `type Result<T = void> = { ok: true; data?: T } | { ok: false; error: string }` would be cleaner and enables typed success payloads.

### Pattern 2: Integration Plugin Registry

**What:** All IDE/terminal integrations implement a shared `Integration` interface and are registered in a single array. Core code iterates the array; no if/else branching on integration type.

**When to use:** Any time a new external tool needs to be supported. The contract is: `id`, `isEnabled(ctx)`, optional `applies(workspace)`, optional `generate(ctx)`, required `open(ctx, path)`, required `configurePrompt(current)`.

**Trade-offs:** Pro: adding a new integration requires touching zero existing files. Con: the `generate → open` lifecycle is hardcoded — integrations that need to query external state before generating (e.g., check if a port is free) have to do it awkwardly inside `open()`.

**Maturity gap:** The `generate()` method returns `string | null` (a path). For integrations that generate multiple artifacts (e.g., a `.devcontainer/` folder), this is too narrow. A future interface revision should return `string[] | null`.

### Pattern 3: Config as Snapshot, Not Reference

**What:** When `ws new` creates a workspace, it snapshots repo metadata (paths, modes, types, stack name) into the workspace YAML. The workspace is self-contained — it does not re-read the stack at runtime.

**When to use:** This is the current architecture for all workspace operations.

**Trade-offs:** Pro: workspaces survive stack edits; idempotent. Con: if a stack is updated (new repo added), existing workspaces don't automatically gain the new repo. Requires an explicit `ws sync` or manual YAML edit.

**Maturity direction:** A `ws update-from-stack` command that diffs the current workspace repos against the stack definition and offers to apply changes. This is a planned quality-of-life improvement, not a design flaw.

### Pattern 4: Hook Scope Hierarchy

**What:** Hooks run at three scopes with increasing specificity: stack-level → workspace-level → repo-level. Environment variables are injected at each scope (`WS_STACK`, `WS_WORKSPACE`, `WS_REPO_NAME`, etc.).

**When to use:** All lifecycle events follow this hierarchy.

**Trade-offs:** Pro: composable — a stack author defines general setup, workspace author adds task-specific steps, repo maintainer adds per-repo steps. Con: execution order is implicit (stack hooks before workspace hooks before repo hooks) and not documented as a contract.

**Maturity gap:** No timeout mechanism on hooks — a hung hook blocks forever. Tools like mise implement a `timeout_secs` field per hook entry. Also, parallel hook execution (run all repo `pre_open` hooks concurrently) would improve speed for large workspaces.

### Pattern 5: Paths as a Pure Module

**What:** All filesystem path computations live in `paths.ts` with zero I/O. Functions are pure: `getTasksDir(wsRoot)` returns a string without touching the filesystem.

**When to use:** Everywhere a path is needed. No inline path construction elsewhere.

**Trade-offs:** Pro: makes path logic trivially testable; prevents scattered `join(HOME, ...)` calls. Con: `paths.ts` derives `HOME` from `homedir()` at module load time, making it hard to override in tests without `process.env.HOME` mutation.

**Maturity direction:** Accept `wsRoot` as a parameter rather than reading from global config — then tests can pass a temp directory without environment mutation.

---

## Data Flow

### Workspace Creation Flow

```
User: git-stacks new [name]
    |
    v
commands/workspace.ts: registerWorkspaceCommands()
    |  (dispatches to TUI)
    v
tui/workspace-wizard.ts: runWorkspaceNew()
    |  (reads stack YAMLs, prompts user)
    |  config.ts: readStack(name) x N
    v
    |  (user confirms)
    v
config.ts: writeWorkspace(workspace)  ── YAML written to disk
    |
    v
lib/git.ts: createWorktree() x N      ── git worktrees created
    |
    v
lib/lifecycle.ts: runHooks()          ── post_create hooks
    |
    v
lib/integrations/index.ts: generate() + open()  ── IDE/terminal launched
    |
    v
lib/files.ts: applyFileOperations()   ── template files copied/symlinked
```

### Workspace Open Flow

```
User: git-stacks open <name>
    |
    v
commands/workspace.ts → lib/workspace-ops.ts: openWorkspace()
    |
    v
config.ts: readWorkspace(name) + readGlobalConfig()
    |
    v
lib/git.ts: createWorktree() for each missing task_path
    |
    v
lib/lifecycle.ts: runHooks(workspace.hooks.pre_open)
    |
    v
lib/lifecycle.ts: runHooks(repo.hooks.pre_open) per repo
    |
    v
integrations[].isEnabled() → applies() → generate() → open()
    |
    v
lib/workspace-ops.ts: mergeEnv() → writeEnvFiles()
    |
    v
lib/lifecycle.ts: runHooks(workspace.hooks.post_open)
                  runHooks(stack.hooks.post_open) per stack
```

### State Management

```
Persistent state (YAML files):
  ~/.config/git-stacks/config.yml          ← GlobalConfig (workspace_root, integration settings)
  ~/.config/git-stacks/stacks/{name}.yml   ← Stack definitions (templates)
  ~/.config/git-stacks/workspaces/{name}.yml ← Workspace instances (snapshots)

Git state (managed by git itself):
  {workspace_root}/main/{repo}/            ← Main clones
  {workspace_root}/tasks/{ws}/{repo}/      ← Worktree checkouts

No in-process runtime state is persisted.
State source of truth: YAML files + git worktree list.
Doctor command reconciles the two.
```

### Config Resolution Priority

```
Integration enabled state:
  workspace.settings.integrations[id].enabled   (highest — per-workspace override)
      ↓ if absent
  config.integrations[id].enabled                (global setting)
      ↓ if absent
  integration.enabledByDefault                   (fallback)

Hook environment variable resolution:
  process.env                                    (base)
  + stack.env / workspace.env (merged)           (additive)
  + WS_* injected vars (WS_WORKSPACE, WS_BRANCH, etc.)  (always present)
```

---

## Component Boundaries (What Talks to What)

```
CLI Layer (commands/)
    |
    |-- reads/writes --> config.ts (YAML schemas)
    |-- calls -------> workspace-ops.ts (all operations)
    |-- dispatches --> tui/ (interactive prompts for new/clone/edit)
    |-- no direct --> git.ts, lifecycle.ts, integrations/ (these are lib internals)

TUI Layer (tui/)
    |
    |-- reads/writes --> config.ts (YAML schemas)
    |-- calls -------> workspace-ops.ts (operations post-wizard)
    |-- no calls to --> git.ts, lifecycle.ts (these are workspace-ops concerns)

workspace-ops.ts (domain layer)
    |
    |-- reads/writes --> config.ts
    |-- calls -------> git.ts
    |-- calls -------> lifecycle.ts
    |-- calls -------> integrations/
    |-- calls -------> files.ts
    |-- reads from --> paths.ts

integrations/ (plugin layer)
    |
    |-- reads from --> config.ts (types + GlobalConfig)
    |-- reads from --> paths.ts
    |-- calls -------> lib/vscode.ts, lib/intellij.ts, etc. (artifact generators)
    |-- spawns -------> external tools (code, idea, tmux, cmux)

git.ts (infrastructure)
    |
    |-- spawns -------> git binary via Bun $

lifecycle.ts (infrastructure)
    |
    |-- spawns -------> sh -c for each hook command

config.ts (foundation)
    |
    |-- reads/writes -> YAML files via paths.ts constants
    |-- no other deps
```

**Boundary violations to avoid:**
- Commands importing from `git.ts` directly (doctor.ts currently imports `$` from bun directly — acceptable for one-off checks)
- `lib/` modules importing from `commands/` or `tui/` (would create circular dependency)
- `integrations/` importing from `workspace-ops.ts` (would create circular dependency — integrations receive context, not the ops module)

---

## Scaling Considerations

This is a local CLI tool with no server component. "Scaling" means handling more workspaces, more repos per workspace, and more simultaneous users (AI agents on the same machine).

| Concern | At 5 workspaces | At 50 workspaces | At 500 workspaces |
|---------|-----------------|------------------|-------------------|
| List startup time | Instant | ~100ms YAML parse | >1s; needs lazy load or index |
| Status check | ~200ms parallel git | ~2s parallel git | Need pagination / async stream |
| Completion latency | Instant | ~50ms dir scan | Cache needed (but adds staleness) |
| Config file contention | None (single process) | None | Possible if agent parallelism creates concurrent writes |

**First bottleneck:** `listWorkspaces()` and `listStacks()` re-read and re-parse all YAML on every command. For <20 workspaces this is fine (current typical use). At 50+ workspaces, a lightweight JSON index file (`~/.config/git-stacks/.index.json` with name + branch + created) enables fast list/completion without full YAML parse. Invalidated on any write.

**Second bottleneck:** `git-stacks status` is already parallelized with `Promise.all()` for dirty checks. The serial fallback in some sync paths (per-repo `rebaseBranch()` called sequentially) could be parallelized for independent repos.

**Agent parallelism:** The current architecture has no file locking on workspace YAML writes. Two agents creating workspaces simultaneously could corrupt the workspaces directory. A simple lock file (`~/.config/git-stacks/.lock`) with `flock` semantics would address this for the multi-agent use case.

---

## Anti-Patterns

### Anti-Pattern 1: Standalone Artifact Generators as First-Class Modules

**What people do:** Call `generateCodeWorkspace()` from `lib/vscode.ts` directly, bypassing the integration plugin.

**Why it's wrong:** The integration plugin is the contract boundary. Bypassing it means the `isEnabled()` check is skipped, workspace overrides are ignored, and the tool can be launched when the user has disabled it. It also splits the "what to generate" logic across two locations.

**Do this instead:** All artifact generation goes through `integrations/index.ts`. The standalone files in `lib/` become private implementation details of their integration plugin (moved to `lib/integrations/vscode/artifact.ts` or inlined into `lib/integrations/vscode.ts`).

### Anti-Pattern 2: Hardcoded Skip Logic in openWorkspace

**What people do:** Pass `{ ide: false, cmux: false }` flags to `openWorkspace()`, which builds a `skip: Set<string>` of integration IDs to exclude.

**Why it's wrong:** This couples the command-layer flags to integration IDs. Adding a new integration means updating both the integration registry and the skip logic in `openWorkspace()`. The integration plugin's `isEnabled()` contract already handles this.

**Do this instead:** Map CLI flags to `workspace.settings.integrations` overrides before calling `openWorkspace()`. The function never needs the `opts.ide/opts.cmux` flags — it reads enable state from context. This is a clean-up task, not urgent.

### Anti-Pattern 3: Schema Version Lock-In Without Migration Path

**What people do:** Add required fields to Zod schemas (e.g., make `branch` required in `WorkspaceSchema`) without providing a migration for existing YAML files.

**Why it's wrong:** Users with existing configs will get a cryptic Zod parse error on upgrade. The tool becomes self-breaking.

**Do this instead:** New required fields should have `.default()` fallbacks in Zod. Truly new mandatory fields require a migration step: on read, if the field is absent, apply the default and write back. A `schema_version` field in YAML enables conditional migration paths.

### Anti-Pattern 4: Global Config as Integration Config Bag

**What people do:** Store arbitrary integration state in `config.integrations[id]` as `Record<string, unknown>`.

**Why it's wrong:** There is no compile-time guarantee that the stored data matches what the integration expects. The integration must parse defensively on every access. A corrupted or mistyped value silently fails.

**Do this instead:** Each integration's `configurePrompt()` method already validates with its own Zod schema before writing. The pattern is correct — the gap is that the global config schema uses `z.record(z.unknown())` instead of per-integration validated schemas. This is a practical tradeoff (the registry is runtime, not compile-time), documented and acceptable.

### Anti-Pattern 5: TUI Layer Calling git.ts Directly

**What people do:** Import git functions directly into wizard code for "quick checks" (e.g., validate a branch exists during prompts).

**Why it's wrong:** Creates a direct dependency from TUI to infrastructure, bypassing workspace-ops. Makes the TUI hard to test and violates the layering contract.

**Do this instead:** Add a validation function to workspace-ops (e.g., `validateBranchExists(stackName, branch)`) and call that from TUI. The TUI layer should only know about config types and workspace-ops functions.

---

## Integration Points

### External Tools (Integration Plugins)

| Tool | Launch Pattern | Detection | Failure Mode |
|------|---------------|-----------|--------------|
| VSCode / code-insiders | `$ code artifact.code-workspace` | Binary name from config | Silent via `.nothrow()` |
| IntelliJ / idea | `$ idea artifact-dir/` | `applies()`: Java repos only | Silent via `.nothrow()` |
| tmux | `$ tmux new-session ...` | `enabledByDefault: false` | Silent via `.nothrow()` |
| cmux | `$ cmux select-workspace ...` | `enabledByDefault: false` | Stale session ID tracked in workspace YAML |

**Improvement needed:** All integration `open()` calls use `.nothrow()` — binary-not-found errors are silently swallowed. A `which`-style pre-check before spawning would produce actionable errors.

### Shell Completion Integration

| Shell | Generation | Dynamic Resolution |
|-------|------------|-------------------|
| bash | `complete -F __git_stacks_complete git-stacks` | Reads `~/.config/git-stacks/workspaces/` at tab time |
| zsh | `_arguments` with completion functions | Same |
| fish | `complete -c git-stacks` | Same |

**Risk:** Completion functions read the YAML directory at every tab press. For NFS or network-mounted home directories this adds latency. An index file (see Scaling section) would fix this.

### Programmatic API (Future)

The current architecture makes a programmatic API straightforward: `workspace-ops.ts` functions accept typed parameters and return `{ ok, error }` structs — they are already API-shaped. The CLI is a thin shell around them. To expose an API, the only work needed is:

1. Export `workspace-ops.ts` functions as a package entry point.
2. Accept a `configDir` parameter to override the global `~/.config/git-stacks/` path (enables multi-tenant / agent use).
3. Document the `ProgressCallback` pattern for streaming output.

---

## Build Order Implications for Roadmap

Based on the dependency graph, phases should respect this order:

**Foundation (must be first):**
`paths.ts` + `config.ts` (Zod schemas) — everything depends on these. Any schema changes here have the widest blast radius. Stabilize types here before adding features.

**Infrastructure (second):**
`git.ts`, `lifecycle.ts`, `files.ts` — pure infrastructure with no domain coupling. Tests here are unit-testable with temp git repos.

**Domain (third):**
`workspace-ops.ts` — depends on all infrastructure. Integration tests require all of the above.

**Integrations (parallel to domain):**
`lib/integrations/` — depends on config types but not workspace-ops. Can be developed and tested independently.

**CLI + TUI (last):**
Commands and wizards are thin — implement after the domain is stable. Changes here should never require domain-layer changes.

**Doctor / observability (any time after domain):**
`doctor.ts` depends on config and paths; it is a read-only consumer of domain state. Can be extended independently.

---

## Gaps and Open Questions

1. **Schema migration strategy:** No formal versioning or migration mechanism exists. Adding `schema_version: 1` now (while there are few users) costs nothing and prevents future pain. Flag for Phase 1 / stabilization work.

2. **Standalone generators vs. integration plugins:** `src/lib/vscode.ts`, `intellij.ts`, `cmux.ts`, `tmux.ts` are accessible alongside the integration plugin implementations. The intended boundary is that plugins own their generators. This should be resolved during a cleanup phase.

3. **Programmatic API surface:** `workspace-ops.ts` is API-ready today but not exported as a package entry point. When multi-agent use becomes a first-class scenario, a `package.json` `exports` field pointing to a public API surface (not the CLI binary) is needed.

4. **Hook execution model:** All hooks run sequentially, blocking the main process. No timeout, no parallelism, no output capture (output goes to inherited stdio). For long-running hooks, there is no way to display progress inside the TUI dashboard. A structured hook result type (exit code + captured output + duration) would enable better UX.

5. **Config path injection for tests:** `paths.ts` derives `HOME` at module load time. The `process.env.HOME` mutation pattern in tests is fragile under parallelism. Dependency-injecting `configDir` into the read/write functions would make this clean.

---

## Sources

- Direct codebase analysis: `/home/nnex/dev/prj/git-stacks/src/` (HIGH confidence — primary source)
- Codebase architecture document: `.planning/codebase/ARCHITECTURE.md` (HIGH confidence)
- Codebase concerns document: `.planning/codebase/CONCERNS.md` (HIGH confidence)
- Training knowledge of mise architecture (MEDIUM confidence — verified against known patterns)
- Training knowledge of tmuxinator, moonrepo, devenv design patterns (MEDIUM confidence — training data, not verified against live docs; used for comparative patterns only, not specific claims)

---

*Architecture research for: multi-repo workspace manager CLI (git-stacks)*
*Researched: 2026-03-17*
