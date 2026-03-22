# Phase 25: Dedicated Lifecycle Phases - Research

**Researched:** 2026-03-22
**Domain:** TypeScript lifecycle composition, Zod schema extension, hook orchestration
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Hook Cascade Semantics
- **D-01:** Strict sequence execution — `pre_close` runs and close logic completes, then `pre_clean` runs and clean logic completes, then `pre_remove` runs and remove logic completes. Each phase finishes before the next starts.
- **D-02:** Literal function composition — `removeWorkspace()` calls `closeWorkspace()` then `cleanWorkspace()` then does YAML deletion. `cleanWorkspace()` calls `closeWorkspace()` then does worktree removal. No lifecycle runner abstraction.
- **D-03:** Abort on any hook failure — if a mid-cascade hook fails (e.g., `pre_clean` fails during a `remove`), the entire operation aborts. Consistent with current `pre_remove` behavior.
- **D-04:** Add `WS_TRIGGERED_BY` env var — cascaded hooks receive `WS_TRIGGERED_BY=remove` (or `clean`, `merge`) so hooks can behave differently based on the parent command. Direct invocation sets `WS_TRIGGERED_BY=close` (etc.) to its own name.

#### New Hook Points
- **D-05:** Add `pre_clean` to Template and Workspace hook schemas — fires when worktrees are about to be removed (in clean, remove, and merge commands), but NOT during a simple close.
- **D-06:** Add `post_close`, `post_clean`, `post_remove` to Template and Workspace hook schemas — full symmetry with pre_ hooks.
- **D-07:** Add `pre_merge` to Template and Workspace hook schemas — replaces `pre_remove`'s role in the merge command.
- **D-08:** Add per-repo `pre_clean` to `WorkspaceRepoHooksSchema` — runs per-repo before that specific repo's worktree is removed, with `cwd` set to `repo.task_path` and `WS_REPO_NAME` identifying the repo. Runs immediately before each individual worktree removal.

#### Merge Command Lifecycle
- **D-09:** Merge participates in the full cascade — `mergeWorkspace()` calls `closeWorkspace()` then `cleanWorkspace()` (which handles worktree removal), then does merge-specific work.
- **D-10:** Full merge lifecycle order: `pre_close` → integration cleanup → `post_close` → `pre_clean` → per-repo `pre_clean` + worktree removal → `post_clean` → `pre_merge` → git merge + branch delete → `pre_remove` → YAML delete → `post_remove` → `post_merge`.
- **D-11:** `post_merge` fires after `post_remove` — full teardown completes first.

### Claude's Discretion
- Internal refactoring of `closeWorkspace`/`cleanWorkspace` to support being called as part of a cascade (handling early returns, avoiding duplicate config reads)
- Whether to extract shared env-building logic into a helper
- Test strategy for verifying cascade ordering

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope
</user_constraints>

---

## Summary

Phase 25 introduces cascading lifecycle phases to `workspace-ops.ts`. The current implementation has four independent functions (`closeWorkspace`, `cleanWorkspace`, `removeWorkspace`, `mergeWorkspace`) that each duplicate config-reading, env-building, integration cleanup, and hook invocation. After this phase, the functions compose: `cleanWorkspace` calls `closeWorkspace` internally, and `removeWorkspace` calls `cleanWorkspace`. `mergeWorkspace` also uses the cascade and gains a dedicated `pre_merge` hook.

The work is almost entirely in two files: `src/lib/config.ts` (schema additions) and `src/lib/workspace-ops.ts` (cascade refactor). The `closeWorkspace` function already exists and handles `pre_close` hooks and integration cleanup — it becomes the foundation that all other teardown functions build on.

The main implementation challenge is the **cascade with early-return propagation**: when `closeWorkspace` is called internally by `cleanWorkspace`, a failure must propagate up cleanly without duplicate config reads. The design pattern is to accept an already-loaded workspace object when called internally, or restructure functions to pass the workspace and config down through the call chain.

**Primary recommendation:** Extract inner functions that accept pre-loaded `workspace` and `config` objects, keeping the public API signatures unchanged. The public functions handle the guard clauses (`workspaceExists`, config reads, dirty checks) then delegate to the inner cascade functions.

---

## Standard Stack

No new dependencies. All work uses existing project stack:

| Component | Current | Purpose |
|-----------|---------|---------|
| Zod | 3.25.76 | Schema extension for new hook fields |
| TypeScript strict | 5.9.3 | Function signatures and types |
| Bun | latest | Test runner and runtime |
| bun:test | built-in | Test framework |

---

## Architecture Patterns

### Current Function Structure (Before)

Each function is standalone and self-contained:

```typescript
// Current: each function reads config, workspace, runs own hooks, runs integration cleanup
export async function cleanWorkspace(name, opts, onProgress) {
  // guard: workspaceExists
  // read config, tasksDir, workspace
  // dirty check
  // dry-run short-circuit
  // runPreRemoveHooks  <-- should be pre_clean
  // runIntegrationCleanup  <-- close should have done this
  // remove worktrees
}
```

### Target Cascade Structure (After)

```
closeWorkspace(name, opts)
  └─ reads config, workspace
  └─ runs pre_close hooks (WS_TRIGGERED_BY=close/clean/remove/merge)
  └─ runIntegrationCleanup
  └─ runs post_close hooks

cleanWorkspace(name, opts)
  └─ reads config, workspace
  └─ dirty check
  └─ dry-run short-circuit
  └─ calls closeWorkspace() internally
  └─ runs pre_clean hooks (WS_TRIGGERED_BY=clean/remove/merge)
  └─ per-repo pre_clean + removeWorktree (interleaved)
  └─ runs post_clean hooks

removeWorkspace(name, opts)
  └─ reads config, workspace
  └─ dirty check
  └─ dry-run short-circuit
  └─ calls cleanWorkspace() internally
  └─ runs pre_remove hooks (WS_TRIGGERED_BY=remove)
  └─ unlinkSync YAML
  └─ runs post_remove hooks

mergeWorkspace(name, opts)
  └─ reads config, workspace
  └─ dirty check, conflict check
  └─ dry-run short-circuit
  └─ calls closeWorkspace() internally (WS_TRIGGERED_BY=merge)
  └─ calls cleanWorkspace() internally (WS_TRIGGERED_BY=merge) — removes worktrees
  └─ runs pre_merge hooks
  └─ git merge + branch delete
  └─ runs pre_remove hooks (WS_TRIGGERED_BY=merge)
  └─ unlinkSync YAML
  └─ runs post_remove hooks
  └─ runs post_merge hooks
```

### Recommended Inner Function Pattern (Claude's Discretion)

The cleanest approach — avoids double config reads and makes cascade propagation explicit:

```typescript
// Internal: accepts pre-loaded data, no guard clauses
async function _executeClose(
  workspace: Workspace,
  config: GlobalConfig,
  tasksDir: string,
  opts: { captured?: boolean; triggeredBy: string },
  onProgress?: ProgressCallback
): Promise<{ ok: boolean; error?: string }> {
  const baseEnv = buildBaseEnv(workspace, tasksDir, opts.triggeredBy)
  // pre_close hooks
  // integration cleanup
  // post_close hooks
}

// Public: does guard, reads data, delegates
export async function closeWorkspace(
  name: string,
  opts: { captured?: boolean },
  onProgress?: ProgressCallback
): Promise<{ ok: boolean; error?: string }> {
  if (!workspaceExists(name)) return { ok: false, error: `Workspace '${name}' not found.` }
  const config = readGlobalConfig()
  const tasksDir = getTasksDir(config.workspace_root)
  const workspace = readWorkspace(name)
  return _executeClose(workspace, config, tasksDir, { captured: opts.captured, triggeredBy: "close" }, onProgress)
}
```

This pattern means `cleanWorkspace` calls `_executeClose` directly (not the public `closeWorkspace`), avoiding the redundant `workspaceExists` check and second `readWorkspace` call.

### WS_TRIGGERED_BY Environment Variable

New env var injected into ALL hooks across all lifecycle functions:

| Command invoked | `WS_TRIGGERED_BY` value |
|-----------------|------------------------|
| `git-stacks close` | `close` |
| `git-stacks clean` | `clean` |
| `git-stacks remove` | `remove` |
| `git-stacks merge` | `merge` |

This is additive — existing hooks that don't use `WS_TRIGGERED_BY` are unaffected.

### Per-Repo Pre-Clean Hook Pattern

Established pattern from `openWorkspace`'s `pre_open` per-repo hooks (lines 562-574 of workspace-ops.ts). The pattern for `pre_clean` mirrors it but runs immediately before each individual worktree removal:

```typescript
// Source: established pattern from openWorkspace per-repo pre_open hooks
for (const repo of workspace.repos.filter(r => r.mode === "worktree")) {
  if (!existsSync(repo.task_path)) {
    onProgress?.(`skip  ${repo.name} (already removed)`)
    continue
  }
  // Per-repo pre_clean hook fires immediately before THIS repo's worktree is removed
  if (repo.hooks?.pre_clean?.length) {
    const repoEnv = {
      ...baseEnv,
      WS_REPO_NAME: repo.name,
      WS_REPO_PATH: repo.task_path,
      WS_MAIN_PATH: repo.main_path,
    }
    await runHooks(repo.hooks.pre_clean, repo.task_path, repoEnv)
  }
  await removeWorktree(repo.main_path, repo.task_path)
  onProgress?.(`removed  ${repo.name}`)
}
```

### Shared Env-Building Helper (Claude's Discretion)

Currently `closeWorkspace` and `runPreRemoveHooks` both construct the same base env object. With cascade, this pattern appears in more places. Extract:

```typescript
function buildBaseEnv(
  workspace: Workspace,
  tasksDir: string,
  triggeredBy: string
): Record<string, string> {
  return {
    WS_WORKSPACE: workspace.name,
    WS_BRANCH: workspace.branch,
    WS_TASKS_DIR: tasksDir,
    WS_TRIGGERED_BY: triggeredBy,
    ...mergeEnv(workspace),
  }
}
```

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead |
|---------|-------------|-------------|
| Hook failure propagation | Custom error accumulator | `runHooks` already throws on non-zero exit — callers catch and return `{ ok: false }` |
| Environment merging | Custom deep merge | `mergeEnv()` already exists in `workspace-ops.ts:96` |
| Cascade ordering enforcement | Lifecycle runner abstraction | D-02 says literal function composition — no abstraction |
| Integration cleanup | Integration-specific teardown logic | `runIntegrationCleanup()` already handles all integrations |

---

## Current Code Analysis

### What Needs Changing

**`src/lib/config.ts`** — Schema additions only:

1. `WorkspaceHooksSchema`: Add `pre_clean`, `post_close`, `post_clean`, `post_remove`, `pre_merge` fields (all `z.array(z.string()).optional()`)
2. `TemplateSchema.hooks`: Add the same fields
3. `WorkspaceRepoHooksSchema`: Add `pre_clean: z.array(z.string()).optional()`

Current `WorkspaceHooksSchema` (lines 108-116):
```typescript
const WorkspaceHooksSchema = z.object({
  pre_create: z.array(z.string()).optional(),
  post_create: z.array(z.string()).optional(),
  pre_open: z.array(z.string()).optional(),
  post_open: z.array(z.string()).optional(),
  post_merge: z.array(z.string()).optional(),
  pre_remove: z.array(z.string()).optional(),
  pre_close: z.array(z.string()).optional(),
  // ADD: pre_clean, post_close, post_clean, post_remove, pre_merge
})
```

Current `WorkspaceRepoHooksSchema` (lines 85-87):
```typescript
const WorkspaceRepoHooksSchema = z.object({
  pre_open: z.array(z.string()).optional(),
  // ADD: pre_clean
})
```

Current `TemplateSchema.hooks` (lines 68-76): Same additions as `WorkspaceHooksSchema`.

**`src/lib/workspace-ops.ts`** — Cascade refactor:

1. **`runPreRemoveHooks`** (line 168): Currently used by `cleanWorkspace`, `removeWorkspace`, `mergeWorkspace`. After refactor, only `removeWorkspace` fires `pre_remove`. Consider renaming to `runPreRemovePhase` or inlining.
2. **`closeWorkspace`** (line 270): Needs `post_close` hook support. Currently doesn't call `post_close`. Needs to accept a `triggeredBy` parameter for `WS_TRIGGERED_BY`.
3. **`cleanWorkspace`** (line 201): Must call `closeWorkspace` (or `_executeClose`) before worktree removal. Must gain `pre_clean` hook (replaces `pre_remove` usage here). Must add `post_clean` hook. Must propagate `captured` flag from outer context.
4. **`removeWorkspace`** (line 315): Must call `cleanWorkspace` (or `_executeClean`) instead of inline logic. Must add `post_remove` hook.
5. **`mergeWorkspace`** (line 386): Must call `_executeClose` then `_executeClean` (which removes worktrees), then `pre_merge`, then git merge, then `pre_remove`, then YAML delete, then `post_remove`, then `post_merge`.

### Critical Detail: `captured` Flag Propagation

`closeWorkspace` accepts `{ captured?: boolean }` for TUI vs CLI hook execution. When called from TUI's `cleanWorkspace` or `removeWorkspace` dispatch, the `captured` flag must flow through the cascade. The TUI currently calls these functions without `captured` (see App.tsx lines 312-320). After refactor, TUI will need to pass `captured: true` to `cleanWorkspace` and `removeWorkspace` as well for hooks to avoid corrupting the OpenTUI screen.

Current TUI dispatch (App.tsx):
```typescript
case "clean":
  result = await cleanWorkspace(wsName, { force: false }, onProgress)
  // Missing: captured: true
```

### Current Integration Cleanup Position

Currently ALL four functions call `runIntegrationCleanup()` directly. After cascade:
- `closeWorkspace` owns integration cleanup (it's the close phase)
- `cleanWorkspace`, `removeWorkspace`, `mergeWorkspace` do NOT call `runIntegrationCleanup` directly — they get it via `closeWorkspace` in the cascade

### Dry-Run Behavior

Dry-run short-circuits before any hooks or integration cleanup in all current functions. This must be preserved. The cascade functions should NOT be called during dry-run — the dry-run path returns early with `[dry-run]` messages before reaching the inner function calls.

---

## Common Pitfalls

### Pitfall 1: Double Config Read in Cascade
**What goes wrong:** `cleanWorkspace` reads config+workspace, then calls `closeWorkspace` which reads them again.
**Why it happens:** Each public function currently reads its own data at the start.
**How to avoid:** Use inner `_execute*` functions that accept pre-loaded data. Public functions read once and pass down.
**Warning signs:** Two `readWorkspace(name)` calls in the same execution path.

### Pitfall 2: Integration Cleanup Running Twice
**What goes wrong:** `cleanWorkspace` currently calls `runIntegrationCleanup()`. If it also calls `closeWorkspace` which calls `runIntegrationCleanup()`, cleanup runs twice.
**Why it happens:** The current codebase duplicates integration cleanup across all four functions.
**How to avoid:** After cascade, only `closeWorkspace` (or `_executeClose`) calls `runIntegrationCleanup`. Remove the direct `runIntegrationCleanup` call from `cleanWorkspace`, `removeWorkspace`, `mergeWorkspace`.

### Pitfall 3: pre_remove Hook Behavior in Merge
**What goes wrong:** The merge command currently fires `pre_remove` via `runPreRemoveHooks()`. After refactor, merge fires `pre_merge` (new) and `pre_remove` at YAML deletion. Users' existing `pre_remove` hooks in merge context must still fire.
**Why it happens:** D-10 defines a specific order including both `pre_merge` AND `pre_remove` in the merge lifecycle.
**How to avoid:** Keep `pre_remove` in `removeWorkspace` and ensure merge calls through the cascade properly, running `pre_remove` before YAML deletion.

### Pitfall 4: captured Flag Not Propagated
**What goes wrong:** TUI calls `cleanWorkspace` with `{ force: false }` but no `captured: true`, so when `cleanWorkspace` internally calls `closeWorkspace` which runs `pre_close` hooks, the hooks write to inherited stdio, corrupting the OpenTUI screen.
**Why it happens:** The TUI currently only passes `captured: true` to `closeWorkspace` directly (App.tsx line 265). The `clean` and `remove` TUI dispatch paths don't pass `captured`.
**How to avoid:** Add `captured` to the opts of `cleanWorkspace` and `removeWorkspace`. Update TUI dispatch to pass `captured: true`.
**Warning signs:** OpenTUI screen corruption during `clean` or `remove` when hooks are configured.

### Pitfall 5: Abort Propagation from Nested Functions
**What goes wrong:** `_executeClose` throws (hook failure) while inside `cleanWorkspace`. The error propagates correctly only if the caller uses try-catch consistently.
**Why it happens:** D-03 says abort on any hook failure. The inner function may throw or return `{ ok: false }`.
**How to avoid:** Standardize: inner functions return `{ ok: false, error }` (not throw). Outer functions check result and propagate. This is consistent with existing patterns (`closeWorkspace` already catches hook errors and returns `{ ok: false }`).

### Pitfall 6: Per-Repo pre_clean Hook Ordering
**What goes wrong:** Running all `pre_clean` hooks upfront, then removing worktrees. The decision D-08 says hooks run immediately before each individual worktree removal (interleaved).
**Why it happens:** It's tempting to batch hook execution for simplicity.
**How to avoid:** Per-repo `pre_clean` hook runs in the same loop iteration as `removeWorktree` for that repo. Not in a separate pre-pass.

---

## Code Examples

### Schema Addition Pattern (Zod)

All new hook fields follow the same pattern as existing fields:

```typescript
// Source: src/lib/config.ts lines 108-116
const WorkspaceHooksSchema = z.object({
  // existing...
  pre_close: z.array(z.string()).optional(),
  // new additions — same pattern:
  post_close: z.array(z.string()).optional(),
  pre_clean: z.array(z.string()).optional(),
  post_clean: z.array(z.string()).optional(),
  pre_merge: z.array(z.string()).optional(),
  pre_remove: z.array(z.string()).optional(),  // existing — stays
  post_remove: z.array(z.string()).optional(),
})
```

Zod's `.optional()` fields are backward compatible — YAML files without these fields parse cleanly (field is `undefined`). No migration needed.

### Hook Execution with WS_TRIGGERED_BY

```typescript
// Pattern for running a hook array with triggeredBy context
async function runPhaseHooks(
  hooks: string[] | undefined,
  cwd: string,
  baseEnv: Record<string, string>,
  opts: { captured?: boolean },
  onProgress?: ProgressCallback,
  label?: string
): Promise<{ ok: boolean; error?: string }> {
  if (!hooks?.length) return { ok: true }
  try {
    if (opts.captured) {
      await runHooksCaptured(hooks, cwd, baseEnv, (out) => onProgress?.(out.line))
    } else {
      await runHooks(hooks, cwd, baseEnv)
    }
    return { ok: true }
  } catch (err) {
    return { ok: false, error: `${label ?? "hook"} failed (${err})` }
  }
}
```

### Cascade Propagation Pattern

```typescript
// In cleanWorkspace internal core:
const closeResult = await _executeClose(workspace, config, tasksDir, {
  captured: opts.captured,
  triggeredBy: opts.triggeredBy ?? "clean",
}, onProgress)
if (!closeResult.ok) return closeResult  // abort: error propagates to caller
```

### Per-Repo pre_clean Interleaved with Removal

```typescript
// D-08: per-repo hook fires immediately before that repo's worktree removal
for (const repo of workspace.repos.filter(r => r.mode === "worktree")) {
  if (!existsSync(repo.task_path)) {
    onProgress?.(`skip  ${repo.name} (already removed)`)
    continue
  }
  if (repo.hooks?.pre_clean?.length) {
    const repoEnv = { ...baseEnv, WS_REPO_NAME: repo.name, WS_REPO_PATH: repo.task_path, WS_MAIN_PATH: repo.main_path }
    const hookResult = await runPhaseHooks(repo.hooks.pre_clean, repo.task_path, repoEnv, opts, onProgress, `pre_clean[${repo.name}]`)
    if (!hookResult.ok) return hookResult  // D-03: abort on failure
  }
  try {
    await removeWorktree(repo.main_path, repo.task_path)
    onProgress?.(`removed  ${repo.name}`)
  } catch (err) {
    failures.push(`${repo.name} (${err})`)
  }
}
```

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | bun:test (built-in) |
| Config file | none — Bun auto-discovers `*.test.ts` |
| Quick run command | `bun test tests/lib/workspace-ops.test.ts` |
| Full suite command | `bun test tests/` |

### Phase Requirements to Test Map

| Behavior | Test Type | Automated Command |
|----------|-----------|-------------------|
| Schema: new hook fields parse in WorkspaceSchema | unit | `bun test tests/lib/config.test.ts` |
| Schema: new hook fields parse in TemplateSchema | unit | `bun test tests/lib/config.test.ts` |
| Schema: per-repo pre_clean parses in WorkspaceRepoHooksSchema | unit | `bun test tests/lib/config.test.ts` |
| closeWorkspace fires pre_close then post_close | unit | `bun test tests/lib/workspace-ops.test.ts` |
| closeWorkspace injects WS_TRIGGERED_BY=close | unit | `bun test tests/lib/workspace-ops.test.ts` |
| cleanWorkspace calls closeWorkspace first (cascade order) | integration | `bun test tests/lib/workspace-ops.test.ts` |
| cleanWorkspace fires pre_clean before worktree removal | integration | `bun test tests/lib/workspace-ops.test.ts` |
| cleanWorkspace fires post_clean after worktree removal | integration | `bun test tests/lib/workspace-ops.test.ts` |
| cleanWorkspace injects WS_TRIGGERED_BY=clean | integration | `bun test tests/lib/workspace-ops.test.ts` |
| removeWorkspace calls cleanWorkspace then YAML delete | integration | `bun test tests/lib/workspace-ops.test.ts` |
| removeWorkspace fires pre_remove before YAML delete | integration | `bun test tests/lib/workspace-ops.test.ts` |
| removeWorkspace fires post_remove after YAML delete | integration | `bun test tests/lib/workspace-ops.test.ts` |
| mergeWorkspace fires full D-10 order | integration | `bun test tests/lib/workspace-ops.test.ts` |
| mergeWorkspace fires pre_merge before git merge | integration | `bun test tests/lib/workspace-ops.test.ts` |
| hook failure mid-cascade aborts entire operation (D-03) | integration | `bun test tests/lib/workspace-ops.test.ts` |
| per-repo pre_clean fires immediately before that repo's worktree removal | integration | `bun test tests/lib/workspace-ops.test.ts` |
| WS_TRIGGERED_BY=remove propagated to closeWorkspace hooks during removeWorkspace | integration | `bun test tests/lib/workspace-ops.test.ts` |
| Existing tests still pass (regression) | regression | `bun test tests/` |

### Test Strategy for Cascade Ordering

The main challenge is verifying execution ORDER, not just that hooks run. Use a shared log array and mock the worktree removal and hook execution to record events in sequence:

```typescript
// Pattern: record events in a log, assert order
const log: string[] = []
const workspace = WorkspaceSchema.parse({
  name: wsName, branch: "feature/test", created: new Date().toISOString(), repos: [...],
  hooks: {
    pre_close: [`echo pre_close`],
    post_close: [`echo post_close`],
    pre_clean: [`echo pre_clean`],
    post_clean: [`echo post_clean`],
    pre_remove: [`echo pre_remove`],
    post_remove: [`echo post_remove`],
  }
})
// Run the cascade and capture onProgress messages + use real shell hooks
// Assert log order matches D-10
```

For cascade ordering tests, real shell hooks (using `echo`) writing to the `onProgress` callback are simpler than mocks, because the existing `workspace-ops.test.ts` pattern uses real git repos and real lifecycle execution. The important thing is that hook output appears in the correct position relative to worktree removal events (also reported via `onProgress`).

### Note on Phase 24.1

The user noted that phase 24.1 (test-mock-hygiene) is running in parallel and may change some test infrastructure details. Research has verified the current `workspace-ops.test.ts` patterns (uses `useIsolatedConfig` + cache-busting imports, real git repos, real lifecycle). New tests for Phase 25 should follow the same pattern. If phase 24.1 changes the import pattern for lifecycle mocking, the cascade ordering tests may need updating — but the high-level test structure (describe blocks, fixture setup, assertions against `workspaceExists` and `existsSync`) is stable.

### Sampling Rate
- **Per task commit:** `bun test tests/lib/workspace-ops.test.ts`
- **Per wave merge:** `bun test tests/`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

None — existing test infrastructure covers the phase. `workspace-ops.test.ts` already has describe blocks for each function. New tests extend existing describe blocks rather than creating new files.

---

## State of the Art

| Aspect | Current | After Phase 25 |
|--------|---------|----------------|
| Hook points | `pre_close`, `pre_open`, `pre_create`, `pre_remove`, `post_open`, `post_create`, `post_merge` | + `post_close`, `pre_clean`, `post_clean`, `pre_merge`, `post_remove` |
| Per-repo hooks | `pre_open` only | + `pre_clean` |
| Cascade composition | None (each function independent) | Full cascade: close < clean < remove |
| `WS_TRIGGERED_BY` | Not present | All hooks receive parent command context |
| Integration cleanup ownership | Each function calls `runIntegrationCleanup` | Only `closeWorkspace`/`_executeClose` calls it |

---

## Open Questions

1. **`cleanWorkspace` dry-run and cascade**
   - What we know: Dry-run short-circuits before hooks. `closeWorkspace` doesn't have a dry-run mode (non-destructive operation).
   - What's unclear: Should dry-run in `cleanWorkspace` skip calling `closeWorkspace` entirely, or call it (since close is non-destructive)? D-02 says literal composition — but dry-run skips all operations.
   - Recommendation: Skip `closeWorkspace` call during dry-run. Dry-run's purpose is "show what would happen to the filesystem." Integration cleanup and close hooks are side effects that dry-run traditionally skips. Add `[dry-run] would close workspace (run pre_close, integration cleanup)` to dry-run output.

2. **TUI `captured` flag for clean/remove**
   - What we know: TUI currently dispatches `cleanWorkspace` and `removeWorkspace` without `captured: true` (App.tsx lines 312-317). With cascade, these will call `closeWorkspace` which runs `pre_close` hooks. Without `captured`, hooks write to inherited stdio, corrupting OpenTUI screen.
   - What's unclear: Is this a bug to fix in this phase, or out of scope?
   - Recommendation: Fix it in this phase. It's a direct consequence of the cascade composition. The `cleanWorkspace` and `removeWorkspace` function signatures need a `captured` field in opts, and TUI dispatch needs to pass it. Minimal change.

3. **Failure collection vs. abort in clean phase**
   - What we know: Current `cleanWorkspace` collects ALL failures (`failures: string[]`) before returning the error — it attempts all worktrees even if one fails (BUG-02 fix). D-03 says abort on hook failure.
   - What's unclear: If a per-repo `pre_clean` hook fails for repo-1 of 3, do we stop immediately (D-03), or continue trying other repos?
   - Recommendation: Abort immediately on hook failure (D-03), but continue the existing "collect all worktree removal failures" pattern for the actual removal step. Hooks abort; physical removal failures are collected.

---

## Sources

### Primary (HIGH confidence)
- Direct source code analysis: `src/lib/workspace-ops.ts` (complete read, all 4 lifecycle functions)
- Direct source code analysis: `src/lib/config.ts` (complete read, all Zod schemas)
- Direct source code analysis: `src/lib/lifecycle.ts` (complete read, runHooks/runHooksCaptured)
- Direct source code analysis: `src/lib/integrations/runner.ts` (runIntegrationCleanup)
- Direct source code analysis: `src/tui/dashboard/App.tsx` (TUI dispatch patterns)
- Direct source code analysis: `tests/lib/workspace-ops.test.ts` (existing test structure)
- `25-CONTEXT.md` — All implementation decisions (D-01 through D-11)
- `21-CONTEXT.md` — Phase 21 close command decisions

### Secondary (MEDIUM confidence)
- CLAUDE.md architectural guidelines — function design, error handling, module patterns

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new dependencies, existing TypeScript/Zod patterns
- Architecture: HIGH — all source files read directly, patterns verified in code
- Pitfalls: HIGH — identified from direct code inspection of cascade interaction points
- Test strategy: HIGH — existing test file structure and helper patterns verified

**Research date:** 2026-03-22
**Valid until:** 2026-04-22 (stable codebase, implementation patterns won't change)
