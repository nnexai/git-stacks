# Phase 25: Dedicated Lifecycle Phases - Context

**Gathered:** 2026-03-22
**Status:** Ready for planning

<domain>
## Phase Boundary

Introduce cascading lifecycle phases so close happens before clean, and clean happens before remove. Each higher-level command composes lower-level functions: `remove` calls `close` then `clean` then does its own work; `clean` calls `close` then does its own work. New hooks (`pre_clean`, `post_close`, `post_clean`, `post_remove`, `pre_merge`) give users finer-grained control over teardown behavior. `merge` also participates in the full cascade.

</domain>

<decisions>
## Implementation Decisions

### Hook Cascade Semantics
- **D-01:** Strict sequence execution — `pre_close` runs and close logic completes, then `pre_clean` runs and clean logic completes, then `pre_remove` runs and remove logic completes. Each phase finishes before the next starts.
- **D-02:** Literal function composition — `removeWorkspace()` calls `closeWorkspace()` then `cleanWorkspace()` then does YAML deletion. `cleanWorkspace()` calls `closeWorkspace()` then does worktree removal. No lifecycle runner abstraction.
- **D-03:** Abort on any hook failure — if a mid-cascade hook fails (e.g., `pre_clean` fails during a `remove`), the entire operation aborts. Consistent with current `pre_remove` behavior.
- **D-04:** Add `WS_TRIGGERED_BY` env var — cascaded hooks receive `WS_TRIGGERED_BY=remove` (or `clean`, `merge`) so hooks can behave differently based on the parent command. Direct invocation sets `WS_TRIGGERED_BY=close` (etc.) to its own name.

### New Hook Points
- **D-05:** Add `pre_clean` to Template and Workspace hook schemas — fires when worktrees are about to be removed (in clean, remove, and merge commands), but NOT during a simple close.
- **D-06:** Add `post_close`, `post_clean`, `post_remove` to Template and Workspace hook schemas — full symmetry with pre_ hooks. Users can notify, log, or trigger external systems after each phase.
- **D-07:** Add `pre_merge` to Template and Workspace hook schemas — replaces `pre_remove`'s role in the merge command. Fires specifically when a merge is about to happen.
- **D-08:** Add per-repo `pre_clean` to `WorkspaceRepoHooksSchema` — runs per-repo before that specific repo's worktree is removed, with `cwd` set to `repo.task_path` and `WS_REPO_NAME` identifying the repo. Runs immediately before each individual worktree removal, not all upfront.

### Merge Command Lifecycle
- **D-09:** Merge participates in the full cascade — `mergeWorkspace()` calls `closeWorkspace()` then `cleanWorkspace()` (which handles worktree removal), then does merge-specific work (actual git merge + branch deletion + YAML deletion).
- **D-10:** Full merge lifecycle order: `pre_close` → integration cleanup → `post_close` → `pre_clean` → per-repo `pre_clean` + worktree removal → `post_clean` → `pre_merge` → git merge + branch delete → `pre_remove` → YAML delete → `post_remove` → `post_merge`.
- **D-11:** `post_merge` fires after `post_remove` — full teardown completes first, then `post_merge` fires. Consistent with current behavior where post_merge runs after everything.

### Claude's Discretion
- Internal refactoring of `closeWorkspace`/`cleanWorkspace` to support being called as part of a cascade (handling early returns, avoiding duplicate config reads)
- Whether to extract shared env-building logic into a helper
- Test strategy for verifying cascade ordering

</decisions>

<specifics>
## Specific Ideas

- From user's original note: "pre_close will be triggered in close/clean/remove commands, but pre_remove only in the remove one" — this is the core mental model
- The cascade should feel natural: users think in terms of "close is lighter than clean is lighter than remove" — each level includes the previous

</specifics>

<canonical_refs>
## Canonical References

No external specs — requirements are fully captured in decisions above.

### Prior phase context
- `.planning/phases/21-workspace-close-command/21-CONTEXT.md` — Original close command decisions, `pre_close` hook introduction, integration cleanup patterns
- `.planning/notes/2026-03-22-dedicated-lifecycle-phases-close.md` — Original user note describing the desired lifecycle cascade

### Implementation references
- `src/lib/workspace-ops.ts` — Current `closeWorkspace`, `cleanWorkspace`, `removeWorkspace`, `mergeWorkspace` functions that will be refactored
- `src/lib/lifecycle.ts` — `runHooks()` and `runHooksCaptured()` implementations
- `src/lib/config.ts` lines 63-116 — Template and Workspace hook schemas (`TemplateSchema.hooks`, `WorkspaceHooksSchema`, `WorkspaceRepoHooksSchema`)
- `src/lib/integrations/runner.ts` — `runIntegrationCleanup()` used by close/clean/remove/merge

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `closeWorkspace()` in `workspace-ops.ts:270` — already handles `pre_close` + integration cleanup; will be called by `cleanWorkspace` and `removeWorkspace`
- `cleanWorkspace()` in `workspace-ops.ts:201` — already handles worktree removal with failure collection; will be called by `removeWorkspace` and `mergeWorkspace`
- `runPreRemoveHooks()` in `workspace-ops.ts:168` — pattern for hook execution with env injection; model for new `runPreCleanHooks`, `runPreMergeHooks`
- `mergeEnv()` in `workspace-ops.ts:96` — shared env-building helper already used across functions

### Established Patterns
- All workspace ops follow: read config → read workspace → hooks → integration ops → progress callback → `{ ok, error? }` return
- `closeWorkspace` accepts `{ captured?: boolean }` for TUI vs CLI hook execution — cascade callers must propagate this
- Per-repo hooks run with `WS_REPO_NAME` env var (established in `openWorkspace` per-repo `pre_open` hooks)

### Integration Points
- `src/lib/config.ts` — Schema changes: add `pre_clean`, `post_close`, `post_clean`, `post_remove`, `pre_merge` to `TemplateSchema.hooks` and `WorkspaceHooksSchema`; add `pre_clean` to `WorkspaceRepoHooksSchema`
- `src/lib/workspace-ops.ts` — Refactor all four lifecycle functions for cascade composition
- `src/commands/workspace.ts` — CLI commands may need minor updates if function signatures change
- `src/tui/dashboard/App.tsx` — TUI action dispatchers may need updates for new function signatures
- Shell completion in `completion-generator.ts` — no changes needed (hooks are YAML config, not CLI flags)

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 25-dedicated-lifecycle-phases*
*Context gathered: 2026-03-22*
