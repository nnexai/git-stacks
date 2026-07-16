---
phase: 126-web-workflow-and-forge-source-parity
plan: "03"
subsystem: service-policy
tags: [workspace-actions, operations, cancellation, notes, pull]
requires:
  - phase: 123-archived-workspaces-and-safe-removal
    provides: terminal-stop lifecycle, dirty-only Force Remove, and revision-bound destructive operations
  - phase: 126-web-workflow-and-forge-source-parity
    provides: strict Phase 126 action, note, operation, and cancellation protocol contracts from Plan 01
provides:
  - Canonical service-owned workspace action availability and confirmation authority
  - Core Pull plus revision-bound append-only notes mutation adapters
  - Serialized honest cancellation capability, commit, and terminal outcome semantics
affects: [126-04, 126-05, 126-06, 126-07, 126-08]
tech-stack:
  added: []
  patterns: [revision-bound typed eligibility, per-workspace semantic file lock, explicit cancellation capability]
key-files:
  created:
    - packages/service/src/policy/workspace-actions.ts
    - tests/lib/service/workspace-action-authority.test.ts
  modified:
    - packages/core/src/notes.ts
    - packages/service/src/policy/core-contract.ts
    - packages/service/src/policy/operations.ts
    - packages/service/src/policy/workspace-lifecycle.ts
    - packages/service/src/secure/router.ts
    - tests/lib/service/operations.test.ts
    - tests/lib/service/idempotency.test.ts
key-decisions:
  - "Force Remove presentation authority requires typed dirty evidence bound to the current authoritative revision, with terminals stopped and force explicitly allowed."
  - "Notes retain text and created JSONL records; deterministic decimal SHA-256 revisions and a per-workspace lock add stale-write safety without changing record semantics."
  - "Cancellation is an execution-level safe-boundaries or none capability; registry serialization returns requested, too-late, not-cancellable, or already-finished while terminal operation state remains truth."
patterns-established:
  - "Service action policy returns immutable protocol-neutral descriptors; Plan 04 is responsible only for allowlist projection."
  - "Non-AbortSignal-aware core mutations declare cancellation none and commit no rollback promise to clients."
requirements-completed: [PARITY-01, PARITY-02, PARITY-03, PARITY-04]
coverage:
  - id: D1
    description: Canonical action availability, disabled reasons, confirmations, in-flight locks, and fresh dirty-only Force Remove authority
    requirement: PARITY-01
    verification:
      - kind: unit
        ref: tests/lib/service/workspace-action-authority.test.ts#canonical workspace action authority
        status: pass
    human_judgment: false
  - id: D2
    description: Path-safe Pull and revision-bound append-only Add/Clear note operations with authoritative refresh
    requirement: PARITY-02
    verification:
      - kind: unit
        ref: tests/lib/service/workspace-action-authority.test.ts#revision-bound append-only notes authority
        status: pass
      - kind: integration
        ref: tests/lib/service/operations.test.ts#Pull and notes mutation adapters
        status: pass
    human_judgment: false
  - id: D3
    description: Serialized cancellation capability, requested/too-late/finished outcomes, commit visibility, and terminal reconciliation
    requirement: PARITY-03
    verification:
      - kind: unit
        ref: tests/lib/service/operations.test.ts#OperationRegistry lifecycle
        status: pass
      - kind: integration
        ref: tests/lib/service/workspace-lifecycle-operations.test.ts#queued removal cancellation
        status: pass
    human_judgment: false
duration: 16min
completed: 2026-07-16
status: complete
---

# Phase 126 Plan 03: Canonical Actions and Durable Operations Summary

**One service authority now owns workspace action truth, revision-safe notes and Pull adapters, and cancellation outcomes that never overstate rollback or cancellability.**

## Performance

- **Duration:** 16 min
- **Started:** 2026-07-16T17:32:56Z
- **Completed:** 2026-07-16T17:47:38Z
- **Tasks:** 3
- **Files modified:** 9

## Accomplishments

- Added an immutable canonical inventory for active, archived, missing, dirty, stale, remote-less, non-worktree, closed, capability-limited, and in-flight workspace states.
- Reused core Pull with bounded safe progress/results and extended append-only notes with deterministic revisions, stale-write rejection, malformed-store safety, and newest-first service refresh.
- Made cancellation capability explicit, serialized cancellation decisions with operation transitions, exposed commit-before-effect state, and ran authoritative finalization after every terminal outcome.

## Task Commits

1. **Task 1: Project canonical action availability and confirmation policy** - `82c4c46c` (RED), `74ec6c41` (GREEN), `2151504b` (revision-binding fix)
2. **Task 2: Add Pull and authoritative notes mutation adapters** - `24a5b991` (RED), `17601d5a` (GREEN)
3. **Task 3: Make cancellation outcomes serialized, explicit, and honest** - `b4bb9dd8` (RED), `33a2bdf1` (GREEN)

## Files Created/Modified

- `packages/service/src/policy/workspace-actions.ts` - Canonical protocol-neutral action policy and fixed safe reasons.
- `packages/core/src/notes.ts` - Deterministic note snapshot revisions and locked revision-bound Add/Clear.
- `packages/service/src/policy/core-contract.ts` - Strict Pull and notes mutation schemas.
- `packages/service/src/policy/operations.ts` - Pull/notes adapters, explicit cancellation capabilities/outcomes, and terminal finalization.
- `packages/service/src/policy/workspace-lifecycle.ts` - Declares lifecycle safe-boundary cancellation without changing Phase 123 semantics.
- `packages/service/src/secure/router.ts` - Returns the typed cancellation decision rather than a misleading pre-cancel operation.
- `tests/lib/service/workspace-action-authority.test.ts` - Action, Force Remove, note revision, malformed-store, and parity evidence.
- `tests/lib/service/operations.test.ts` - Pull/notes and deferred cancellation race coverage.
- `tests/lib/service/idempotency.test.ts` - Complete adapter-surface expectation.

## Decisions Made

- Action authority is service-owned and protocol-neutral; browser/TUI DTO construction may map it but may not recompute policy.
- Note revisions fingerprint validated raw JSONL into protocol-compatible decimal strings; empty history is revision `0`.
- Only executions that can observe `AbortSignal` before a declared commit boundary advertise cancellation. Core Pull and notes operations remain honestly non-cancellable.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Updated secure cancellation routing for typed outcomes**
- **Found during:** Task 3
- **Issue:** `secure/router.ts` returned a projected copy of the pre-cancel operation, which could not communicate requested, too-late, finished, or unsupported decisions.
- **Fix:** Route the registry's strict typed cancellation result directly; Plan 04 owns its final safe client projection.
- **Files modified:** `packages/service/src/secure/router.ts`
- **Verification:** Service typecheck and service operation/contract suites pass.
- **Committed in:** `33a2bdf1`

**2. [Rule 1 - Correctness] Bound dirty Force Remove evidence to the authoritative revision**
- **Found during:** Task 1 acceptance recheck
- **Issue:** A typed dirty failure without revision binding could remain display-eligible after catalog state changed.
- **Fix:** Require the evidence revision to equal `CoreState.revision` in addition to the Phase 123 dirty, terminal-stopped, and force-allowed predicates.
- **Files modified:** `packages/service/src/policy/workspace-actions.ts`, `tests/lib/service/workspace-action-authority.test.ts`
- **Verification:** Focused action authority suite and service typecheck pass.
- **Committed in:** `2151504b`

---

**Total deviations:** 2 auto-fixed (1 missing critical, 1 correctness).
**Impact on plan:** Both close authority gaps required by the written cancellation and fresh Force Remove contracts; no client policy or alternate lifecycle implementation was added.

## Issues Encountered

- The temporary worktree needed local workspace-package symlinks so package exports resolved this worktree's source rather than the main checkout. This affected only the untracked test environment.
- Plan 01's web action/operation schemas were under independent review while this plan executed. This implementation deliberately returns protocol-neutral action descriptors and leaves web projection to Plan 04, avoiding dependence on the reviewed schema defect.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan 04 can project the canonical action inventory, bounded notes, safe Pull result, operation cancellation view/result, and terminal refresh into scoped routes.
- Plan 05 can consume one action/cancellation contract without inferring Git, lifecycle, notes, or rollback policy.
- No blocker remains in Plan 03; integrate after the parent branch's Plan 01 protocol review repair.

## Self-Check: PASSED

- Required source and test artifacts exist.
- 13 service/core-focused test files passed (110 tests), plus protocol/router contract coverage (30 tests).
- Core and service typechecks passed.
- `git diff --check` passed.

---
*Phase: 126-web-workflow-and-forge-source-parity*
*Completed: 2026-07-16*
