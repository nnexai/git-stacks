# Architecture Research

**Domain:** CLI workspace manager — workspace-ops.ts decomposition and observability
**Researched:** 2026-04-05
**Confidence:** HIGH (based on direct code reading of the actual codebase)

---

## Current Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                     CLI Layer (commands/)                        │
│  workspace.ts  template.ts  repo.ts  doctor.ts  config.ts  ...  │
└──────────────────────────┬──────────────────────────────────────┘
                           │  calls (name-based, 35 exports)
┌──────────────────────────▼──────────────────────────────────────┐
│              workspace-ops.ts  (1,735 lines — monolith)          │
│  openWorkspace  closeWorkspace  cleanWorkspace  removeWorkspace  │
│  mergeWorkspace  renameWorkspace  syncWorkspace  pushWorkspace   │
│  pullWorkspace  getWorkspaceListInfo  getWorkspaceStatus         │
│  buildWorkspaceEnv  buildBaseEnv  buildRepoEnv  mergeEnv         │
│  writeEnvFiles  getDirtyWorktrees  detectWorkspaceFromCwd        │
│  editWorkspaceYaml  editTemplateYaml  editGlobalConfigYaml       │
└──┬──────────┬──────────┬─────────┬───────────┬──────────────────┘
   │          │          │         │           │
   ▼          ▼          ▼         ▼           ▼
git.ts    config.ts  lifecycle.ts  integrations/  ports.ts
(399L)    (435L)     (139L)        runner.ts      (300L)
                                                 secrets.ts
                                                 (209L)
                                                 files.ts
                                                 env.ts
                                                 messages.ts

┌─────────────────────────────────────────────────────────────────┐
│              TUI Layer (tui/ + tui/dashboard/)                   │
│  App.tsx imports: openWorkspace closeWorkspace cleanWorkspace    │
│  removeWorkspace mergeWorkspace editWorkspaceYaml renameWorkspace│
│  syncWorkspace pushWorkspace  + SyncRow SyncResult PushRow types │
│  workspace-wizard.ts + workspace-clone.ts: openWorkspace only    │
└─────────────────────────────────────────────────────────────────┘
```

### What workspace-ops.ts Actually Contains

Direct analysis of exports reveals five coherent groupings currently co-mingled:

**Group 1 — Workspace State Queries** (~250 lines)
- `getWorkspaceListInfo` — dirty + ahead/behind aggregate across all repos
- `getWorkspaceStatus` — per-repo status array
- `getDirtyWorktrees` — list of dirty worktree names
- `detectWorkspaceFromCwd` — CWD to workspace lookup

**Group 2 — Env/Secrets Construction** (~160 lines)
- `mergeEnv` — workspace.env + ports as Record
- `buildBaseEnv` — GS_WORKSPACE_* vars
- `buildRepoEnv` — GS_REPO_* vars layered on base
- `buildWorkspaceEnv` — full env with secret resolution
- `resolveWorkspaceEnvVars` (private) — calls secrets.ts
- `writeEnvFiles` — env merge+write to task_path/.env

**Group 3 — Lifecycle Operations** (~1,100 lines, the bulk)
- `openWorkspace` — ports, worktree recreation, upstream tracking, env, file-ops, integrations, hooks, last_opened
- `closeWorkspace` / `_executeClose` — pre_close hooks, integration cleanup, post_close hooks
- `cleanWorkspace` / `_executeClean` — cascades close, per-repo pre_clean, worktree removal, post_clean
- `removeWorkspace` — cascades clean, pre_remove, YAML delete, post_remove
- `mergeWorkspace` — conflict check, cascades clean, git merge, branch delete, pre/post_merge + pre/post_remove
- `renameWorkspace` — worktree re-registration, YAML rename

**Group 4 — Git Sync Operations** (~400 lines)
- `syncWorkspace` — fetch, conflict check, rebase/merge, stash management
- `pushWorkspace` — parallel push across worktree repos
- `pullWorkspace` — dedup fetch by main_path, sequential pull

**Group 5 — YAML Editor Utilities** (~130 lines)
- `editWorkspaceYaml` — returns path + validate()
- `editTemplateYaml` — returns path + validate()
- `editGlobalConfigYaml` — returns path + validate()
- `editRegistryYaml` — returns path + validate()
- `openYamlInEditor` — spawns $VISUAL/$EDITOR
- `renameTemplate` — template rename + workspace cascade

---

## Recommended Decomposition

### Target Module Structure

```
src/lib/
  workspace-ops.ts         KEEP — re-exports from below; thin orchestration for
                           operations that span multiple domain modules
                           (open, close, clean, remove, merge)
  workspace-state.ts       NEW — Group 1: queries, list info, status, CWD detection
  workspace-env.ts         NEW — Group 2: env construction, secret resolution, env file writes
  workspace-git.ts         NEW — Group 4: sync, push, pull operations
  workspace-yaml.ts        NEW — Group 5: YAML editor utilities (rename, edit, validate)
  lifecycle.ts             UNCHANGED — runHooks/runHooksCaptured (already clean)
  git.ts                   UNCHANGED — worktree primitives (already clean)
  config.ts                UNCHANGED — YAML I/O schemas (already clean)
  secrets.ts               UNCHANGED — secret resolver (already clean)
  ports.ts                 UNCHANGED — port allocation (already clean)
  files.ts                 UNCHANGED — file ops (already clean)
```

The key architectural principle: `workspace-ops.ts` becomes a **thin orchestrator** — it remains as the public API surface for the five lifecycle operations (open/close/clean/remove/merge) that require cross-cutting coordination, but it delegates to domain modules for all pure logic. All 35 current exports remain importable from `workspace-ops.ts` via re-export, so no call sites change.

### Component Responsibilities After Decomposition

| Module | Responsibility | Imports |
|--------|----------------|---------|
| `workspace-state.ts` | Read workspace status, list info, dirty checks, CWD detection | config.ts, git.ts, paths.ts |
| `workspace-env.ts` | Build GS_* env vars, resolve secrets, write .env files | config.ts, secrets.ts, ports.ts, paths.ts |
| `workspace-git.ts` | Multi-repo sync/push/pull operations | config.ts, git.ts |
| `workspace-yaml.ts` | Edit YAML files in $EDITOR, validate schemas, rename template | config.ts, paths.ts |
| `workspace-ops.ts` | Lifecycle orchestration: open/close/clean/remove/merge | all of the above, lifecycle.ts, integrations/runner.ts, files.ts, git.ts |

---

## Data Flow Changes

### Current Flow (everything through workspace-ops.ts)

```
CLI command
    |
workspace.ts (commands/) imports openWorkspace, syncWorkspace, buildWorkspaceEnv, etc.
    |
workspace-ops.ts dispatches everything inline
```

### Target Flow (domain modules, orchestrated re-exports)

```
CLI command
    |
commands/workspace.ts
    |-- openWorkspace        --> workspace-ops.ts (lifecycle orchestrator)
    |-- syncWorkspace        --> workspace-git.ts (direct import or re-export)
    |-- buildWorkspaceEnv    --> workspace-env.ts (direct import or re-export)
    |-- getWorkspaceListInfo --> workspace-state.ts (direct import or re-export)
    +-- editWorkspaceYaml   --> workspace-yaml.ts (direct import or re-export)

tui/dashboard/App.tsx
    |-- openWorkspace, closeWorkspace, etc. --> workspace-ops.ts (unchanged import path)
    +-- SyncRow, SyncResult, PushRow types  --> workspace-git.ts (re-exported from workspace-ops.ts)
```

The re-export strategy means zero call-site changes in phase 1. Commands and TUI keep importing from `workspace-ops.ts`. The refactor is internal.

### openWorkspace Internal Flow (post-decomposition)

```
openWorkspace(name, opts, onProgress)
    |-- readWorkspace() + readGlobalConfig()        [config.ts]
    |-- allocatePorts()                             [ports.ts]
    |-- recreateMissingWorktrees()                  [git.ts]
    |-- ensureUpstreamTracking()                    [git.ts]
    |-- buildWorkspaceEnv()                         [workspace-env.ts]
    |-- runHooks(pre_open)                          [lifecycle.ts]
    |-- applyFileOps()                              [files.ts]
    |-- writeEnvFiles()                             [workspace-env.ts]
    |-- runIntegrations()                           [integrations/runner.ts]
    |-- runHooks(post_open)                         [lifecycle.ts]
    +-- writeWorkspace(last_opened)                 [config.ts]
```

This is already the correct structure — the code just needs to be physically split to make the layers visible.

---

## Architectural Patterns

### Pattern 1: Re-export Facade

**What:** `workspace-ops.ts` re-exports everything from domain modules. Existing call sites don't change import paths in phase 1.

**When to use:** When refactoring a module that has many call sites and backward compatibility matters. Extract domain modules first, then optionally move call sites to direct imports in later phases.

**Trade-offs:** Slightly more indirection. The facade becomes a change magnet for anyone wanting to know "what is the public API?" — which is actually desirable here.

**Example:**
```typescript
// workspace-ops.ts after decomposition
export { getWorkspaceListInfo, getWorkspaceStatus, getDirtyWorktrees, detectWorkspaceFromCwd } from "./workspace-state"
export { mergeEnv, buildBaseEnv, buildRepoEnv, buildWorkspaceEnv, writeEnvFiles } from "./workspace-env"
export { syncWorkspace, pushWorkspace, pullWorkspace } from "./workspace-git"
export { editWorkspaceYaml, editTemplateYaml, editGlobalConfigYaml, editRegistryYaml, openYamlInEditor, renameTemplate } from "./workspace-yaml"
export type { SyncResult, SyncRow, PushResult, PushRow, PullResult, PullRow } from "./workspace-git"
export type { WorkspaceListInfo, RepoStatus, CwdDetectionResult } from "./workspace-state"
export type { BuildWorkspaceEnvOptions } from "./workspace-env"
// Only openWorkspace, closeWorkspace, cleanWorkspace, removeWorkspace, mergeWorkspace,
// renameWorkspace, ProgressCallback stay implemented here
```

### Pattern 2: Incremental Extraction

**What:** Extract one domain module at a time, running full test suite after each. Never extract mid-function — only at function boundaries.

**When to use:** Any refactor where the existing test suite is the safety net.

**Trade-offs:** Slower than big-bang but much lower risk. Each step is independently reviewable.

**Build order rationale:**
1. `workspace-state.ts` first — no dependencies on other domain modules, pure queries over config.ts + git.ts
2. `workspace-env.ts` second — depends on secrets.ts, ports.ts but not on any new domain module
3. `workspace-git.ts` third — depends on git.ts, config.ts; no cross-domain deps
4. `workspace-yaml.ts` fourth — depends on config.ts only; rename-template logic touches listWorkspaces
5. `workspace-ops.ts` cleanup last — remove extracted code, add re-exports, verify nothing broke

### Pattern 3: Structured ProgressEvents for Observability

**What:** Extend `ProgressCallback` to accept structured events for observability. Existing string calls are left unchanged, new structured events added alongside.

**When to use:** When you want to add tracing/logging without changing the operation's return type and without breaking existing consumers.

**Trade-offs:** Union type requires consumers to check for string vs. object. Use `typeof event === "string"` guard to keep existing display code working.

**Example:**
```typescript
// Current: flat string
export type ProgressCallback = (message: string) => void

// Proposed: structured event, string still accepted for backward compat
export type ProgressEvent =
  | { kind: "step"; phase: "pre_hook" | "git" | "integration" | "post_hook"; message: string }
  | { kind: "warn"; message: string }
  | { kind: "error"; message: string }

export type ProgressCallback = (event: ProgressEvent | string) => void

// Existing call sites unchanged:
onProgress?.(`removed  ${repo.name}`)

// New structured events added alongside:
onProgress?.({ kind: "step", phase: "git", message: `removed  ${repo.name}` })
```

---

## Integration Points

### CLI commands/ → workspace-ops.ts (and domain modules)

| Command | Currently Uses | After Decomposition |
|---------|---------------|---------------------|
| `workspace open` | `openWorkspace` | unchanged (re-export) |
| `workspace sync` | `syncWorkspace` | unchanged (re-export) or direct to workspace-git.ts |
| `workspace env` | `buildWorkspaceEnv`, `buildRepoEnv` | unchanged (re-export) or direct to workspace-env.ts |
| `workspace status` | `getWorkspaceStatus`, `getWorkspaceListInfo` | unchanged (re-export) or direct to workspace-state.ts |
| `workspace rename` | `renameWorkspace` | unchanged — stays in workspace-ops.ts (lifecycle op) |
| `template rename` | `renameTemplate` | unchanged (re-export) or direct to workspace-yaml.ts |

No command-layer changes are required in phase 1. The re-export facade means commands/workspace.ts continues importing from `"../lib/workspace-ops"` without any modifications.

### TUI (dashboard/App.tsx) → workspace-ops.ts

App.tsx currently imports 9 functions and 3 types from workspace-ops. After decomposition, all remain importable from workspace-ops via re-export with no import path changes required.

One pre-existing divergence to note: App.tsx reimplements parts of openWorkspace inline — it directly imports `createWorktree`, `runHooksCaptured`, `applyFileOpsForRepo`, `runIntegrationGenerate` for finer-grained TUI progress updates. This is intentional (the TUI needs step-level progress) and should not be changed during decomposition.

### workspace-ops.ts → lifecycle.ts

The `_executeClose`, `_executeClean`, `openWorkspace`, `mergeWorkspace`, `removeWorkspace` functions all repeat the same captured/non-captured hook dispatch pattern approximately 15 times:

```typescript
if (opts.captured) {
  await runHooksCaptured(hooks, cwd, env, (output) => onProgress?.(output.line))
} else {
  await runHooks(hooks, cwd, env)
}
```

A helper `execHooks` already exists locally inside `openWorkspace` but is not shared. Phase 5 cleanup extracts this into a shared utility within workspace-ops.ts, eliminating the duplication.

### workspace-ops.ts → integrations/runner.ts

`IntegrationContext` is constructed inline in `openWorkspace` and `_executeClose`. No changes to the integration boundary are needed — the context construction just moves with the lifecycle functions when workspace-ops.ts is cleaned up.

---

## Build Order

### Phase 1: Extract workspace-state.ts (lowest risk)

**Scope:** Move to `src/lib/workspace-state.ts`:
- `getWorkspaceListInfo` (includes private `formatAge`)
- `getWorkspaceStatus`
- `getDirtyWorktrees`
- `detectWorkspaceFromCwd`
- Types: `WorkspaceListInfo`, `RepoStatus`, `CwdDetectionResult`

**Dependencies acquired:** config.ts, git.ts, paths.ts (all stable)
**Dependencies on new modules:** none
**Test risk:** LOW — pure query functions with no side effects

Add re-exports to workspace-ops.ts. Run `bun run test`. Commit.

### Phase 2: Extract workspace-env.ts

**Scope:** Move to `src/lib/workspace-env.ts`:
- `mergeEnv`
- `buildBaseEnv`
- `buildRepoEnv`
- `buildWorkspaceEnv`
- `resolveWorkspaceEnvVars` (private, keep unexported)
- `writeEnvFiles`
- Type: `BuildWorkspaceEnvOptions`

**Dependencies acquired:** config.ts, secrets.ts, ports.ts, paths.ts
**Dependencies on new modules:** none
**Coordination:** `openWorkspace` in workspace-ops.ts imports `buildWorkspaceEnv` and `writeEnvFiles` from workspace-env.ts

Add re-exports. Run `bun run test`. Commit.

### Phase 3: Extract workspace-git.ts

**Scope:** Move to `src/lib/workspace-git.ts`:
- `syncWorkspace` (with private `restoreStashes` closure kept inside)
- `pushWorkspace`
- `pullWorkspace`
- Types: `SyncResult`, `SyncRow`, `PushResult`, `PushRow`, `PullRow`, `PullResult`

**Dependencies acquired:** config.ts, git.ts
**Dependencies on new modules:** none
**Test risk:** MEDIUM — sync has complex stash restore logic; verify tests pass before and after

Critical: re-export types from workspace-ops.ts, since App.tsx imports `SyncRow`, `SyncResult`, `PushRow` by name from workspace-ops. Run `bun run test`. Commit.

### Phase 4: Extract workspace-yaml.ts

**Scope:** Move to `src/lib/workspace-yaml.ts`:
- `editWorkspaceYaml`
- `editTemplateYaml`
- `editGlobalConfigYaml`
- `editRegistryYaml`
- `openYamlInEditor`
- `renameTemplate` (touches listWorkspaces — belongs here, not in lifecycle)

**Dependencies acquired:** config.ts, paths.ts, fs (readFileSync), Bun.spawn
**Dependencies on new modules:** none
**Test risk:** LOW — thin utilities with straightforward behavior

Add re-exports. Run `bun run test`. Commit.

### Phase 5: Clean up workspace-ops.ts

After phases 1-4, workspace-ops.ts contains only:
- `openWorkspace`
- `_executeClose` / `closeWorkspace`
- `_executeClean` / `cleanWorkspace`
- `removeWorkspace`
- `mergeWorkspace`
- `renameWorkspace`
- `ProgressCallback` type
- Re-export block for domain modules

Apply the shared `execHooks` helper across all five lifecycle functions to eliminate the 15 repetitions of the captured/non-captured dispatch pattern.

Run `bun run test`. Commit.

**Resulting size:** workspace-ops.ts shrinks from 1,735 lines to approximately 700 lines.

### Phase 6 (optional): Structured ProgressEvents

Extend `ProgressCallback` to accept `ProgressEvent | string`. Implement additively — existing string calls are left as-is, structured events added where observability is needed. Update 3-4 formatter functions in commands/workspace.ts to handle both forms.

---

## Anti-Patterns

### Anti-Pattern 1: Moving `_executeClose` / `_executeClean` to Domain Modules

**What people do:** Extract the private cascade functions along with the public APIs.

**Why it's wrong:** `_executeClose` and `_executeClean` accept pre-loaded `workspace` and `config` objects to avoid re-reading disk inside a cascade. They are not independently callable and moving them creates false re-use affordance and extra YAML reads mid-cascade.

**Do this instead:** Keep `_executeClose` and `_executeClean` private in workspace-ops.ts. Their public wrappers stay there too.

### Anti-Pattern 2: Breaking the Re-export Facade Before Tests Are Updated

**What people do:** Move a function to a domain module AND update all call sites in the same commit.

**Why it's wrong:** If a test fails after a big-bang move, the diff is large and the bug is hard to locate.

**Do this instead:** Phases 1-4 are pure moves with re-exports. Only update call sites after all domain modules are stable.

### Anti-Pattern 3: Exposing `resolveWorkspaceEnvVars` as Public API

**What people do:** Make the private `resolveWorkspaceEnvVars` public when moving it to workspace-env.ts.

**Why it's wrong:** Its skip-secrets and warn behavior is an implementation detail of `buildWorkspaceEnv`. Callers misusing it will bypass port injection and base env construction.

**Do this instead:** Keep `resolveWorkspaceEnvVars` unexported in workspace-env.ts. The public API is `buildWorkspaceEnv`.

### Anti-Pattern 4: Adding a Second Output Channel Alongside ProgressCallback

**What people do:** Add a `logger?: Logger` parameter to workspace operation functions for observability, alongside `onProgress`.

**Why it's wrong:** Two output channels means code has to decide which to call for each event, and consumers get duplicate output.

**Do this instead:** Extend `ProgressCallback` to accept structured events. One output channel, consumers choose how to render it.

---

## Sources

- Direct code analysis: `/home/nnex/dev/prj/git-stacks/src/lib/workspace-ops.ts` (1,735 lines, all sections read)
- Direct code analysis: `/home/nnex/dev/prj/git-stacks/src/commands/workspace.ts` (imports section)
- Direct code analysis: `/home/nnex/dev/prj/git-stacks/src/tui/dashboard/App.tsx` (imports, lines 26-53)
- Direct code analysis: `/home/nnex/dev/prj/git-stacks/src/lib/lifecycle.ts` (full file, 139 lines)
- Project state: `/home/nnex/dev/prj/git-stacks/.planning/PROJECT.md`
- CLAUDE.md architecture documentation

---
*Architecture research for: git-stacks workspace-ops decomposition*
*Researched: 2026-04-05*
