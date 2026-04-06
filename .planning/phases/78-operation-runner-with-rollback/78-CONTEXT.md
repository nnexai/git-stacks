# Phase 78: Operation Runner with Rollback - Context

**Gathered:** 2026-04-06
**Status:** Ready for planning

<domain>
## Phase Boundary

Introduce a generic LIFO compensation-stack runner in a new `src/lib/operation-runner.ts` and wire it into workspace creation via a new shared `createWorkspace()` function in `src/lib/workspace-lifecycle.ts`. When a multi-step creation fails, completed reversible steps are undone in reverse order (each undo wrapped in try/catch — best-effort) and the workspace YAML is never written. Both the CLI wizard (`src/tui/workspace-wizard.ts`) and the TUI dashboard (`src/tui/dashboard/App.tsx`) migrate to call the shared function in this phase, resolving the CONCERNS.md:51-55 "Dashboard Duplicates Workspace Creation Logic" item as a side-effect.

Out of scope: rewiring `clean`/`close`/`remove`/`merge` to use the runner (teardown is already forward-only and rollback is semantically empty there), changing the `workspace-ops.ts` facade (locked by Phase 75 D-11 through the v0.17.0 milestone), and any new workspace capabilities.

</domain>

<decisions>
## Implementation Decisions

### Runner coverage and extraction
- **D-01:** Phase 78 introduces `src/lib/operation-runner.ts` and a new shared `createWorkspace()` export in `src/lib/workspace-lifecycle.ts`. The runner is wired into creation only; the existing `clean`/`close`/`remove`/`merge` cascade in `workspace-lifecycle.ts` is not touched.
- **D-02:** Both `runWorkspaceNew` in `src/tui/workspace-wizard.ts` and `executeCreateWorkspace` in `src/tui/dashboard/App.tsx` migrate to call the new `createWorkspace()` in this phase. The hand-rolled `createdWorktrees` rollback block currently at `App.tsx:883-911` is replaced by runner-backed logic inside `createWorkspace()`. This phase fully resolves the "Dashboard Duplicates Workspace Creation Logic" item in `.planning/codebase/CONCERNS.md:51-55`.
- **D-03:** `src/lib/workspace-ops.ts` public facade stays unchanged — the Phase 75 D-11 lock through v0.17.0 still holds. `createWorkspace()` is a new export on `workspace-lifecycle.ts`; it is not re-exported through `workspace-ops.ts` unless the wizard/dashboard call sites already import from there.

### Runner API shape
- **D-04:** Imperative API. Callers use `runner.do(name, forwardFn, undoFn)`. Each call executes `forwardFn` immediately and pushes `undoFn` onto an internal LIFO stack. This matches the proto-rollback pattern currently at `src/tui/dashboard/App.tsx:883-911` and keeps later steps free to close over values produced by earlier steps (worktree paths, resolved env, etc.).
- **D-05:** On any throw from a forward step, the runner invokes `rollback()` which pops and executes undos in reverse order. Each undo is wrapped in its own try/catch — a failing undo does not abort the remaining undos (ENGN-03).
- **D-06:** The runner never throws for expected failures. It returns a discriminated union `{ ok: true } | { ok: false; error: string; rollbackErrors: string[] }`. `rollbackErrors` is empty on the happy path and on successful full rollbacks; non-empty only when individual undos failed.
- **D-07:** The runner accepts an optional `onProgress: (message: string) => void` callback and reuses the existing `ProgressCallback` type from `src/lib/workspace-ops.ts:38`. No new progress channel is introduced.

### Compensation coverage
- **D-08:** Steps tracked by the runner (reversible): worktree creation (undo: `removeWorktree`), per-repo file ops (undo: delete created files/symlinks), workspace file ops (undo: delete created files/symlinks), per-repo env-file writes (undo: delete the written env file). These are the side-effects that can be cleanly inverted.
- **D-09:** Not tracked by the runner (non-reversible but still fatal): `pre_create` and `post_create` hooks. Hooks run inside the try block so their failure triggers rollback of the tracked steps above them, but the hooks themselves are not pushed onto the compensation stack — arbitrary user shell cannot be inverted. This matches ENGN-03 best-effort spirit and stays honest about what can actually be undone.
- **D-10:** `writeWorkspace()` is the commit point — not a tracked step. The runner completes the entire tracked step sequence first; only then does `createWorkspace()` call `writeWorkspace()` once and return `ok`. Success criterion 1 ("workspace YAML is not written" on failure) is satisfied by construction because the YAML write is unreachable if any prior step threw. No need for `deleteWorkspace()` as an undo.
- **D-11:** `runIntegrationGenerate()` runs AFTER the YAML commit, matching the current wizard/dashboard order. Its failures are logged through `onProgress` only and do not trigger rollback — the workspace is already committed. This matches today's tolerance for integration-generation failures.

### Creation step ordering
- **D-12:** Final order inside `createWorkspace()`, top to bottom:
  1. `pre_create` hooks (not tracked; failure triggers rollback of nothing-yet → effectively no-op)
  2. Worktree creation per repo (tracked)
  3. `ensureUpstreamTracking` across all worktree repos (not tracked; best-effort, already tolerant)
  4. Per-repo file ops (tracked)
  5. Workspace file ops (tracked)
  6. Env-file writes (tracked)
  7. `post_create` hooks (not tracked; failure triggers rollback of all tracked steps above)
  8. `writeWorkspace()` — commit point, outside the stack
  9. `runIntegrationGenerate()` — post-commit, failures logged only
- **D-13:** This ordering preserves today's user-visible semantics: `post_create` hook failures still abort creation, just like the current `process.exit(1)` in `src/tui/workspace-wizard.ts`. The only behavior change is that on abort, already-created worktrees and file-op artifacts are cleaned up instead of being left on disk.

### Error contract and progress messages
- **D-14:** Rollback progress messages flow through the same `onProgress` callback the caller already supplies. No `console.error` side writes (the dashboard runs in OpenTUI alternate screen mode; stray stderr corrupts the TUI — same rationale behind `runHooksCaptured()`).
- **D-15:** Message format conventions: forward-step progress is free-form (matches today's strings like `"removed worktree for foo"`); rollback-step progress is prefixed `Rollback: ` (e.g. `"Rollback: removed worktree for foo"` — matches the success-criterion example text); undo failures are prefixed `Rollback error: ` (e.g. `"Rollback error: removeWorktree foo failed (permission denied)"`).
- **D-16:** `rollbackErrors[]` in the return value carries the same undo-failure strings that were streamed through `onProgress`, so programmatic callers (tests, dashboard) can inspect them without re-parsing stdout.
- **D-17:** The original forward-step error is the value of the `error` field in the returned `{ ok: false, error, rollbackErrors }`. Rollback errors never replace it — they're supplementary.

### Claude's Discretion
- Internal data structure of the compensation stack (array of `{ name, undo }` tuples is the obvious choice).
- Whether `createWorkspace()` accepts a pre-resolved `Workspace` object or re-builds it from inputs — wizard and dashboard both currently construct the `Workspace` object near the end, so the shared function probably takes the assembled inputs (`wsName`, `branch`, `repos`, `wsHooks`, `wsEnv`, `wsEnvFile`, `wsFiles`, `wsIntegrationSettings`, `wsPorts`, `labels`, `templateName`, `description`) and assembles the final object itself right before the commit point.
- Whether the runner exports a `_exec`-style seam, or whether tests force failures by swapping `workspace-git._exec` and `lifecycle._exec` which Phase 75 already made injectable. Prefer the latter unless the runner needs to intercept something those seams don't cover.
- Exact test layout (likely `tests/lib/operation-runner.test.ts` for the pure runner + `tests/lib/workspace-lifecycle-create.test.ts` for the integration paths that force `createWorktree` failures via the existing `_exec` seam).
- Whether to keep `ensureUpstreamTracking` inside `createWorkspace()` or leave it in the callers — it's best-effort and not tracked either way; decision is purely about code locality.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase and milestone requirements
- `.planning/ROADMAP.md` §Phase 78 — goal statement, dependency on Phase 77, success criteria (create-failure cleanup, rollback progress via `onProgress`, best-effort undo)
- `.planning/REQUIREMENTS.md` — ENGN-01 (compensation stack), ENGN-02 (rollback visible via `onProgress`), ENGN-03 (best-effort undo)
- `.planning/STATE.md` — locked decisions: "Rollback order must be strictly LIFO; each undo wrapped in try/catch (best-effort)"; "`workspace-ops.ts` facade signature stays unchanged throughout this milestone"

### Known tech debt this phase resolves
- `.planning/codebase/CONCERNS.md` §"Dashboard Duplicates Workspace Creation Logic" (lines 51-55) — documents the current wizard/dashboard creation duplication that D-02 eliminates

### Existing creation side-effect implementations
- `src/tui/workspace-wizard.ts` — `runWorkspaceNew`; creation side-effects live at lines 471-629 (pre_create → worktrees → ensureUpstreamTracking → file ops → env files → post_create → writeWorkspace → runIntegrationGenerate → optional openWorkspace). Currently aborts via `process.exit(1)` on any failure with no cleanup.
- `src/tui/dashboard/App.tsx` — `executeCreateWorkspace` at lines 774-970; duplicate creation flow. Already implements a hand-rolled proto-rollback at lines 883-911 that tracks `createdWorktrees[]` and cleans up on error. This is the pattern the runner formalizes.

### Target implementation surfaces
- `src/lib/workspace-lifecycle.ts` — gains a new exported `createWorkspace(inputs, onProgress?)` function that uses the runner. Existing `cleanWorkspace`/`closeWorkspace`/`removeWorkspace`/`mergeWorkspace` are not touched.
- `src/lib/workspace-ops.ts` — `ProgressCallback` type (line 38) is reused by the runner and `createWorkspace()`. No public facade changes.
- `src/lib/operation-runner.ts` — NEW file. Exports `createRunner()` (or equivalent) that returns an object with `do(name, forward, undo)`, automatic rollback on throw, and a `{ ok, error, rollbackErrors }` return shape.

### Reversible-side-effect primitives used as forward/undo pairs
- `src/lib/git.ts` — `createWorktree` (forward) / `removeWorktree` (undo). `removeWorktree` is already tolerant of the "already removed" case, matching the clean-path behavior.
- `src/lib/files.ts` — `applyFileOpsForRepo` / `applyFileOpsForWorkspace` (forward). Planner will need to inspect these to decide how to express their undo (delete created files, undo symlinks); the current return shape reports created paths which the undo can consume.
- `src/lib/workspace-env.ts` — `writeEnvFiles` and `mergeEnv`. Env-file writes land on disk at paths derivable from `repo.task_path + env_file`; undo is `fs.rmSync` on those paths.

### Hooks and integrations (NOT rolled back, but runtime-relevant)
- `src/lib/lifecycle.ts` — `runHooks` / `runHooksCaptured`. Hook failures throw; runner catches them and triggers rollback of tracked steps. Hooks themselves are not inverted.
- `src/lib/integrations/runner.ts` — `runIntegrationGenerate`. Runs post-commit per D-11; failures logged only.

### Phase 75 seams for testing
- `src/lib/workspace-git.ts` exports a mutable `_exec` seam — tests force `createWorktree` failures through it without spawning real git.
- `src/lib/lifecycle.ts` exports a mutable `_exec.spawn` seam — tests force hook failures without real subprocess.
- Reuse these rather than adding a new seam on the runner itself.

### Phase 77 config helpers
- `src/lib/config.ts` — `writeWorkspace`, `deleteWorkspace`. `writeWorkspace` is the D-10 commit point. `deleteWorkspace` is not used by the runner in this phase because YAML is unreachable on failure per D-10 (listed only so the planner knows it's available if D-10 is revisited).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/tui/dashboard/App.tsx:883-911` — hand-rolled `createdWorktrees[]` rollback pattern. The runner is this pattern generalized and made injectable. Use it as the behavioral reference for the runner's rollback semantics.
- `src/lib/workspace-ops.ts:38` — `ProgressCallback = (message: string) => void` type. Runner and `createWorkspace()` both use it. No new type needed.
- `src/lib/git.ts` — `createWorktree` / `removeWorktree` pair is already idempotent-tolerant on the undo side (clean path skips already-removed worktrees today).
- Phase 75's `workspace-git._exec` and `lifecycle._exec` seams — ready-made test injection points for failure simulation.

### Established Patterns
- **Discriminated-union returns** — project-wide convention per CLAUDE.md. Runner follows this (`{ ok } | { ok: false; error, rollbackErrors }`); `createWorkspace()` follows the existing `workspace-lifecycle.ts` return shape (`{ ok } | { ok: false; error }`) but may extend with `rollbackErrors` when the runner fails with undos.
- **`onProgress` callbacks everywhere** — every existing lifecycle function (`openWorkspace`, `cleanWorkspace`, `closeWorkspace`, `removeWorkspace`, `mergeWorkspace`) takes an optional `ProgressCallback`. `createWorkspace()` follows the same shape.
- **TUI-safe output** — `runHooksCaptured` exists specifically because `console.error` corrupts the OpenTUI alternate screen. Runner must route rollback messages through `onProgress`, never directly to stderr (D-14).
- **`_exec` mutable-object seam pattern** — established across `lifecycle.ts`, `workspace-lifecycle.ts`, `workspace-git.ts`, `aerospace.ts`, `niri.ts`, `cmux.ts`, `tmux.ts`. Runner probably doesn't need its own seam because it delegates all side-effects to modules that already have one.
- **`timeOperation(OBS_CATEGORY, ...)` wrapper** — `workspace-lifecycle.ts` wraps every public lifecycle function for structured debug output (Phase 75). `createWorkspace()` should do the same so `GS_DEBUG=lifecycle` picks it up.
- **Atomic YAML writes** — `writeYaml` uses tmp+fsync+rename. `writeWorkspace` inherits this. The commit-point guarantee in D-10 relies on this atomicity.

### Integration Points
- **Wizard migration** — `src/tui/workspace-wizard.ts` replaces the lines-471-629 side-effect block with a single call to `createWorkspace({...inputs}, msg => p.log.info(msg))`. All `process.exit(1)` on failure paths collapse into a single `if (!result.ok) { p.cancel(result.error); process.exit(1) }`.
- **Dashboard migration** — `src/tui/dashboard/App.tsx:774-970` replaces the inline flow with a single `createWorkspace()` call. The dashboard's per-repo `CreateRow` state needs to be updatable from the `onProgress` callback — the runner's forward-step `name` argument provides enough granularity (e.g. `"create worktree foo"` → dashboard matches on the repo name). Planner should verify the dashboard's current `CreateRow` state machine can be driven from string messages or whether a richer progress-event shape is needed.
- **Phase 77 cache invalidation** — `writeWorkspace()` already triggers index invalidation; no extra bookkeeping in the runner.

</code_context>

<specifics>
## Specific Ideas

- The rollback progress message format should visibly echo the success-criterion example text: `"Rolling back: removed worktree for <repo>"` or `"Rollback: removed worktree for <repo>"`. Pick one and use it consistently across forward-undo pairs.
- The hand-rolled proto-rollback in `src/tui/dashboard/App.tsx:883-911` is the closest thing to a "reference implementation" of the intended behavior. Planner should diff the new runner-backed flow against this block to confirm semantic parity.
- `createWorkspace()` accepts assembled inputs (not raw template/CLI args) because both callers already do the template resolution, registry lookups, and label merging before the side-effect phase — moving those into the shared function would bloat its signature and pull TUI concerns into `workspace-lifecycle.ts`.

</specifics>

<deferred>
## Deferred Ideas

- Wrapping `cleanWorkspace`/`removeWorkspace`/`mergeWorkspace` in the runner — rejected explicitly; teardown is forward-only and rollback is semantically empty. If a future phase introduces a rollback-meaningful forward teardown (e.g. snapshot-before-remove), the runner is already available.
- Dry-run rendering of the planned step list — not needed in phase 78 because the imperative API runs steps as they are declared. A declarative step-list runner (rejected in favor of imperative) would enable this; revisit only if dry-run becomes a user-facing need.
- A dedicated `_exec` seam on the runner — not needed because all forward/undo operations delegate to modules that already have Phase 75 seams. Revisit only if a future step type lacks an underlying seam.
- On-disk persistence of in-flight operations for crash recovery — explicitly out of scope; the runner is an in-process construct. A crashed CLI leaves whatever the OS left; users rerun.
- Migrating `src/tui/dashboard/App.tsx` template creation flow (separate from workspace creation) to a similar runner — not in scope; template creation is a single YAML write, no compensation needed.

### Reviewed Todos (not folded)
None — `todo match-phase 78` returned zero matches.

</deferred>

---

*Phase: 78-operation-runner-with-rollback*
*Context gathered: 2026-04-06*
