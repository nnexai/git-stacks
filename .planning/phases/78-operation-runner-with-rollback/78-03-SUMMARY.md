---
phase: 78-operation-runner-with-rollback
plan: 03
subsystem: tui
tags: [rollback, runner, workspace-creation, refactor, dashboard, wizard, concerns-resolved]

# Dependency graph
requires:
  - phase: 78-operation-runner-with-rollback
    provides: createWorkspace() in workspace-lifecycle.ts (Plan 78-02) + createRunner LIFO compensation primitive (Plan 78-01)
provides:
  - Wizard call site (runWorkspaceNew) delegating to createWorkspace()
  - Dashboard call site (executeCreateWorkspace) delegating to createWorkspace()
  - Documented onProgress -> CreateRow regex parsing contract for the dashboard
  - Resolution of CONCERNS.md "Dashboard Duplicates Workspace Creation Logic"
affects:
  - .planning/codebase/CONCERNS.md (item marked RESOLVED)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "regex parsing of onProgress strings to drive a per-repo state machine in the TUI (no new IPC channel needed)"
    - "Partial<CreateRow> patch helper (updateRowByRepo) collapses repeated setCreateRows(prev.map(...)) calls into a single closure"
    - "structurally enforced D-13 failure semantics: wizard exits non-zero, dashboard sets red summary — both branches go through createWorkspace's discriminated union"

key-files:
  created: []
  modified:
    - src/tui/workspace-wizard.ts
    - src/tui/dashboard/App.tsx
    - .planning/codebase/CONCERNS.md

key-decisions:
  - "Wizard imports createWorkspace from ../lib/workspace-lifecycle (D-03 — NOT from workspace-ops)"
  - "Dashboard imports createWorkspace from ../../lib/workspace-lifecycle (D-03)"
  - "Dashboard's CreateRow state is driven from four documented regex constants matching Plan 02's exact onProgress message formats"
  - "running-hooks status is dropped during pre_create — minor UX regression accepted because pre_create is rare and quick"
  - "wsPorts and labels added to wizard's createWorkspace inputs (preserves wizard semantics that the dashboard's CreateWizardData does not currently surface)"

requirements-completed: []  # ENGN-01..03 are reconciled at phase verification

# Metrics
duration: 7min
completed: 2026-04-06
---

# Phase 78 Plan 03: Migrate Wizard + Dashboard to createWorkspace() Summary

**Both workspace creation call sites (wizard `runWorkspaceNew`, dashboard `executeCreateWorkspace`) now delegate to the shared `createWorkspace()` function in `workspace-lifecycle.ts`. The hand-rolled `createdWorktrees[]` proto-rollback in App.tsx is gone, replaced by the operation-runner's LIFO compensation stack. CONCERNS.md "Dashboard Duplicates Workspace Creation Logic" is marked RESOLVED.**

## Performance

- **Duration:** ~7 min
- **Started:** 2026-04-06T18:01:12Z
- **Completed:** 2026-04-06T18:08:20Z
- **Tasks:** 2
- **Files modified:** 3 (2 source, 1 doc)

## Lines Changed

| File | Inserted | Deleted | Net |
|------|---------:|--------:|----:|
| `src/tui/workspace-wizard.ts` | +36 | -163 | **-127** |
| `src/tui/dashboard/App.tsx` | +66 | -116 | **-50** |
| `.planning/codebase/CONCERNS.md` | +2 | -1 | +1 |

The wizard's imperative block (originally lines 471-629, ~158 LOC) collapsed to a 35-LOC `createWorkspace()` call + result handling. The dashboard's imperative block (originally lines 860-991, ~131 LOC) collapsed to a ~85-LOC `createWorkspace()` call plus the regex parser closure that drives `CreateRow` state.

## onProgress -> CreateRow Parsing Contract

The dashboard's per-repo `CreateRow` state machine is driven entirely by string-matching `onProgress` messages from `createWorkspace()`. The contract is captured as four `const` regex patterns inside `executeCreateWorkspace`:

```typescript
const CREATING_RE = /^Creating worktree for (.+)$/
const CREATED_RE = /^created worktree for (.+)$/
const ROLLBACK_RE = /^Rollback: create worktree (.+)$/
const ROLLBACK_ERROR_RE = /^Rollback error: create worktree (.+?) failed \((.+)\)$/
```

Mapping:

| Message format | CreateRow patch |
|----------------|-----------------|
| `Creating worktree for <repo>` | `{ status: "creating-worktree", detail: "creating worktree..." }` |
| `created worktree for <repo>` | `{ status: "done", detail: "worktree created" }` |
| `Rollback: create worktree <repo>` | `{ status: "failed", detail: "rolling back..." }` |
| `Rollback error: create worktree <repo> failed (<err>)` | `{ status: "failed", detail: "rollback failed: <err>" }` |

Unparsed messages (file-ops warnings, integration paths, env-file warnings, etc.) are silently ignored by the per-repo parser. They are not surfaced in the create-progress view because the view has no general-purpose log area; if a future plan wants to surface them, a new output box can be added to `CreateProgressView`.

The forward-step format strings (`Creating worktree for ...`, `created worktree for ...`) come from Plan 02's `onProgress?.(...)` calls inside the worktree-creation `runner.do()` block. The rollback-step format strings come from Plan 01's runner (`Rollback: <name>` and `Rollback error: <name> failed (<err>)` are emitted by the runner itself, where `<name>` is the step name passed to `runner.do()` — in this case `create worktree <repo>`).

## D-12 Coverage by the Migrated Sites

Both call sites now produce the exact D-12 ordering, by virtue of `createWorkspace()` being the single owner of that ordering. The wizard and dashboard each contribute only:

1. Input resolution (template lookup, registry lookup, repo array assembly, label normalization, integration override merging)
2. Inputs object construction
3. The `await createWorkspace(...)` call
4. Result handling (failure path = TUI feedback; success path = optional open / summary)

## Imports Removed

### `src/tui/workspace-wizard.ts`

Removed (no longer used after migration):
- `createWorktree` from `../lib/git`
- `ensureUpstreamTracking` from `../lib/git`
- `runHooks` from `../lib/lifecycle`
- `applyFileOpsForRepo`, `applyFileOpsForWorkspace` from `../lib/files`
- `runIntegrationGenerate` from `../lib/integrations/runner`
- `IntegrationContext` type from `../lib/integrations`
- `mkdirSync` from `fs`
- `isWorktreeRepo` from `../lib/config`

Kept (still used by clone flow / repo-add prompts / ad-hoc paths):
- `getCurrentBranch` from `../lib/git`
- `existsSync` from `fs`
- `writeWorkspace` from `../lib/config` (used by `runWorkspaceEdit`)

Added:
- `createWorkspace` from `../lib/workspace-lifecycle`

### `src/tui/dashboard/App.tsx`

Removed (no longer used after migration):
- `createWorktree`, `removeWorktree`, `ensureUpstreamTracking` from `../../lib/git`
- `runHooksCaptured`, `HookOutputLine` type from `../../lib/lifecycle`
- `applyFileOpsForRepo`, `applyFileOpsForWorkspace` from `../../lib/files`
- `IntegrationContext` type from `../../lib/integrations`
- `runIntegrationGenerate` from `../../lib/integrations/runner`

Kept (still used by other dashboard flows):
- `isRepoDirty` from `../../lib/git` (used by `executeSync`)
- `writeWorkspace` from `../../lib/config` (used by label-merge flow at line 575)
- `isWorktreeRepo` from `../../lib/config` (used by `executeSync`'s repo filter)

Added:
- `createWorkspace` from `../../lib/workspace-lifecycle`

## Behavior Changes vs. Pre-Migration Code

| Aspect | Wizard (before) | Dashboard (before) | Both (after) |
|--------|-----------------|--------------------|--------------|
| pre_create hook failure | `runHooks` throws -> `process.exit(1)` | `runHooksCaptured(..., abortOnFailure=false)` -> warning only, **continues with creation** | Throws -> runner rolls back tracked steps -> fail result returned (D-13: **dashboard now aborts on hook failure**, matching wizard) |
| post_create hook failure | `runHooks` throws -> `process.exit(1)` | `runHooksCaptured(..., abortOnFailure=false)` -> warning only, **commits anyway** | Throws -> runner rolls back tracked steps -> fail result returned (D-13: **dashboard now aborts and rolls back**, matching wizard) |
| Per-repo file-op failure | `applyFileOpsForRepo` `{ ok: false }` -> `process.exit(1)` | Silently ignored (return value never checked) | Throws inside tracked `runner.do()` -> rolls back -> fail result (**dashboard now treats as fatal**) |
| Workspace file-op failure | `applyFileOpsForWorkspace` `{ ok: false }` -> `process.exit(1)` | Silently ignored | Throws inside tracked `runner.do()` -> rolls back -> fail result |
| Worktree creation failure (repo N of M) | `process.exit(1)`, no cleanup of repos 1..N-1 | Hand-rolled `createdWorktrees[]` cleanup loop | LIFO `runner.do()` undo of `removeWorktree` for repos 1..N-1 |
| Integration generate failure | Implicit throw bubbles up | Implicit throw bubbles up after successful YAML write | Caught inside `createWorkspace`, surfaced via `onProgress`, NEVER triggers rollback (D-11: post-commit) |
| `running-hooks` per-repo status during pre_create | Not displayed (CLI uses spinners) | Set on every repo while pre_create runs, then reset to `pending` | **Not displayed** — pre_create runs inside `createWorkspace` BEFORE any onProgress is emitted, so the dashboard parser has no signal to set this status. **Minor UX regression**: the user briefly sees `pending` instead of `running-hooks`. Acceptable because pre_create hooks are rare and typically very fast. |

The dashboard's behavior shift is the most significant: it now adopts the wizard's strict-abort semantics for hooks and file ops, rolling back already-committed worktrees on failure. This was the primary motivation for the runner — the previous dashboard would silently leave the user with half-committed worktrees and a written workspace YAML on hook failure.

## Acceptance Criteria Verification

### Task 1 — Wizard

| Criterion | Result |
|-----------|--------|
| `grep "import { createWorkspace } from \"../lib/workspace-lifecycle\""` -> 1 match | PASS |
| `grep "await createWorkspace("` -> >= 1 match | PASS (1) |
| `grep "createdWorktrees"` -> 0 matches | PASS (wizard never had this array) |
| `grep "await runHooks(wsHooks"` -> 0 matches | PASS |
| `grep "writeWorkspace(workspaceObj)"` -> 0 matches | PASS |
| `grep "runIntegrationGenerate"` -> 0 matches | PASS |
| `grep "applyFileOpsForRepo\|applyFileOpsForWorkspace"` -> 0 matches | PASS |
| `grep "process.exit(1)"` -> >= 1 match | PASS (multiple — failure path preserved per D-13) |
| `bun run typecheck` exits 0 | PASS |
| `bun run test` exits 0 | PASS (Unit PASS, Integration 49/49) |

### Task 2 — Dashboard

| Criterion | Result |
|-----------|--------|
| `grep "import { createWorkspace } from \"../../lib/workspace-lifecycle\""` -> 1 match | PASS |
| `grep "await createWorkspace("` -> >= 1 match | PASS (1 at line 900) |
| `grep "createdWorktrees"` -> 0 matches | PASS (rollback array gone, comment paraphrased) |
| `grep "for (const created of createdWorktrees)"` -> 0 matches | PASS |
| `grep "writeFileSync.*env"` -> 0 matches | PASS |
| `grep "runHooksCaptured(wsHooks"` -> 0 matches | PASS |
| `grep "runIntegrationGenerate"` -> 0 matches | PASS |
| `grep "writeWorkspace(workspaceObj)"` -> 0 matches | PASS |
| `grep "console.error\|process.stderr"` -> 0 matches | PASS (D-14 OpenTUI safety preserved) |
| `grep "Rollback: create worktree"` -> >= 1 match | PASS (regex constant) |
| `grep "Rollback error: create worktree"` -> >= 1 match | PASS (regex constant) |
| `grep "CREATING_RE\|CREATED_RE\|ROLLBACK_RE\|ROLLBACK_ERROR_RE"` -> >= 4 | PASS (8 — 4 declarations + 4 use sites) |
| `grep "Dashboard Duplicates Workspace Creation Logic — RESOLVED"` in CONCERNS.md -> 1 | PASS |
| `grep "Phase 78"` in CONCERNS.md -> >= 1 | PASS |
| `bun run typecheck` exits 0 | PASS |
| `bun run test` exits 0 | PASS (Unit PASS, Integration 49/49) |

## CONCERNS.md Update

`.planning/codebase/CONCERNS.md` line 51-56 (block) modified:

- Heading suffixed with `— RESOLVED (Phase 78)`
- New `**Resolution:**` line added at the bottom of the block describing how Phase 78 resolved the duplication, naming both call sites and the new shared function, and pointing to the phase directory.
- Original Issue/Files/Impact/Fix-approach lines preserved unchanged for historical record.

## Decisions Made

- **`wsPorts` and `labels` are passed through from the wizard** — the wizard still surfaces port allocation and label normalization, and the createWorkspace input shape supports both. The dashboard's `CreateWizardData` currently does not collect `wsPorts` or `labels`, so the dashboard call site omits both fields. A future plan can wire those into the dashboard wizard if needed without changing `createWorkspace()`.
- **Comment paraphrase to satisfy `createdWorktrees` zero-grep criterion** — initial comment cited "the hand-rolled `createdWorktrees[]` rollback at lines 883-911" verbatim, which left a literal `createdWorktrees` token in the file. Paraphrased to "the hand-rolled per-repo worktree-cleanup rollback that used to live here" to satisfy the acceptance criterion's literal grep.
- **`isWorktreeRepo` import retained in App.tsx** — initial removal broke `executeSync` (line 425 still uses it for repo filtering). Restored after typecheck error caught it. The TypeScript narrowing `isWorktreeRepo` provides is also why line 436's `existsSync(repo.task_path)` and `isRepoDirty(repo.task_path)` calls work — without the type guard, `task_path` would be `string | undefined`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] `isWorktreeRepo` import incorrectly removed from App.tsx**

- **Found during:** Task 2 typecheck after first import edit
- **Issue:** Plan Step 2 listed several imports as candidates for removal but did not list `isWorktreeRepo`. I removed it anyway because `executeCreateWorkspace` no longer used it. The plan's removal protocol (`grep | wc -l > 1 = leave it`) would have caught this, but I skipped the per-symbol grep step. Removing the import broke `executeSync` at line 425, where `ws.repos.filter(isWorktreeRepo)` is the only narrowing of `WorkspaceRepo` to the worktree variant. Two cascading TS errors fired (`isWorktreeRepo` undefined, plus `repo.task_path` losing its `string` type narrowing).
- **Fix:** Re-added `isWorktreeRepo` to the `../../lib/config` import line. Followed up by running typecheck again — clean.
- **Files modified:** `src/tui/dashboard/App.tsx`
- **Verification:** `bun run typecheck` clean; `bun run test` 49/49 integration PASS.
- **Committed in:** `85387efc` (folded into Task 2's commit; the broken intermediate state never landed)

**2. [Rule 3 — Blocking] `mkdirSync`, `isWorktreeRepo`, and `baseEnv` flagged unused in workspace-wizard.ts**

- **Found during:** Task 1 typecheck after the imperative block deletion
- **Issue:** Three symbols became unused after the imperative block was replaced: `mkdirSync` (only the deleted block called it), `isWorktreeRepo` from config (only the deleted block filtered with it — wizard's own clone flow uses path-based detection instead), and the `baseEnv` local variable that the deleted block built for hook execution. TypeScript's `noUnusedLocals` flagged all three.
- **Fix:** Removed `mkdirSync` from the `fs` import, removed `isWorktreeRepo` from the `../lib/config` import, and removed the `baseEnv` declaration entirely (it was a no-op once createWorkspace took over baseEnv assembly internally).
- **Files modified:** `src/tui/workspace-wizard.ts`
- **Verification:** `bun run typecheck` clean.
- **Committed in:** `9641b42e` (folded into Task 1's commit)

**3. [Rule 3 — Blocking] `createdWorktrees` literal token in comment violated zero-grep criterion**

- **Found during:** Task 2 acceptance verification grep
- **Issue:** Plan-suggested comment text included "The hand-rolled createdWorktrees[] rollback that used to live here (lines 883-911)" verbatim. The plan's acceptance criterion `grep -n "createdWorktrees" returns ZERO matches` makes no exception for documentation references. Same class of issue as Plan 78-01's `_exec` doc-comment deviation.
- **Fix:** Paraphrased the comment to "The hand-rolled per-repo worktree-cleanup rollback that used to live here is now provided by the operation-runner inside workspace-lifecycle.ts." Preserves the architectural intent without including the literal `createdWorktrees` token.
- **Files modified:** `src/tui/dashboard/App.tsx`
- **Verification:** `grep -n "createdWorktrees" src/tui/dashboard/App.tsx` returns zero matches.
- **Committed in:** `85387efc`

---

**Total deviations:** 3 auto-fixed (all Rule 3 — blocking acceptance criterion / typecheck issues).
**Impact on plan:** None substantive. One self-inflicted mistake (over-eager `isWorktreeRepo` removal) caught immediately by typecheck, two are well-known classes of issue from Plans 78-01/02 (literal-grep hostility to doc references and unused-symbol cleanup after large block removal).

## Issues Encountered

- The `running-hooks` UX status during pre_create hooks is no longer set in the dashboard — see "Behavior Changes" table for details. This is a documented, accepted minor regression.
- The `executeSync` flow at line 425 of App.tsx depends on `isWorktreeRepo` for both filtering AND TypeScript narrowing of `WorkspaceRepo.task_path` from `string | undefined` to `string`. This is a non-obvious cross-file coupling that future cleanup work should be aware of when touching the imports block.

## Threat Flags

None. Plan 78-03 introduces no new network endpoints, auth paths, schema changes, or trust boundaries. The migration consolidates two existing call sites onto a single shared function — every individual side effect was already in production. The dashboard's behavior tightening (strict-abort on hook/file-op failures, see Behavior Changes table) increases safety, not exposure.

The plan's `<threat_model>` register (T-78-13 through T-78-18) is fully covered:
- **T-78-13** (regex parser tampering): accepted; first-party local string streams, parser only updates visual state, no control flow depends on parsed output.
- **T-78-14** (regex format drift): mitigated by code-level documentation of the four regex constants and Plan 02's locked message formats. Future drift would break the TUI and be caught by visual QA.
- **T-78-15** (failure visibility regression): mitigated by acceptance criteria — wizard still calls `process.exit(1)`, dashboard still sets red `setCreateSummary` on `result.ok===false`. Both verified.
- **T-78-16** (stderr corruption of OpenTUI): mitigated by negative grep — `console.error|process.stderr` returns 0 matches in App.tsx.
- **T-78-17** (filesystem path leakage in TUI): accepted; single-user local surface.
- **T-78-18** (CONCERNS.md resolution without actual fix): mitigated by cross-referenced negative-grep (`createdWorktrees` returns 0 in App.tsx, proving the rollback code is gone, not just commented).

## User Setup Required

None — pure refactor of two source files plus one documentation update.

## Phase 78 Milestone Impact

Plan 78-03 is the final wave of Phase 78. With both call sites migrated, the phase delivers on its three milestone requirements:

- **ENGN-01** (LIFO compensation runner) — provided by Plan 78-01's `createRunner`, exercised by `createWorkspace()` in Plan 78-02, now exclusively driving rollback for the wizard and dashboard creation flows in Plan 78-03.
- **ENGN-02** (atomic workspace creation, no partial commits on failure) — `createWorkspace()` enforces this structurally (writeWorkspace is unreachable on `runner.result()` ok:false), and now both call sites benefit. The dashboard's previous silent half-commits on hook failure are eliminated.
- **ENGN-03** (best-effort rollback with collected errors) — runner's per-undo try/catch propagates through `RunnerResult.rollbackErrors`, surfaced to the wizard via `p.log.warn` and to the dashboard via the failure-summary text.

These requirements should be marked complete by phase verification (not by this plan), per the phase verification protocol.

## Task Commits

1. **Task 1: Migrate workspace-wizard.ts to createWorkspace()** — `9641b42e` (refactor)
2. **Task 2: Migrate App.tsx to createWorkspace() + delete hand-rolled rollback + update CONCERNS.md** — `85387efc` (refactor)

## Self-Check: PASSED

- `src/tui/workspace-wizard.ts` — FOUND (modified, -127 LOC net)
- `src/tui/dashboard/App.tsx` — FOUND (modified, -50 LOC net)
- `.planning/codebase/CONCERNS.md` — FOUND (item marked RESOLVED)
- Commit `9641b42e` (Task 1) — FOUND in `git log`
- Commit `85387efc` (Task 2) — FOUND in `git log`
- `bun run typecheck` — exits 0
- `bun run test` (full suite) — Unit PASS, Integration 49/49 PASS
- `grep -c "createdWorktrees" src/tui/dashboard/App.tsx` — 0 (D-02 lock)
- `grep -c "createWorkspace" src/lib/workspace-ops.ts` — 0 (D-03 lock)

---
*Phase: 78-operation-runner-with-rollback*
*Completed: 2026-04-06*
