---
phase: 126-web-workflow-and-forge-source-parity
plan: "05"
subsystem: client
tags: [actions, operations, forge-review, state-machine, thin-client]

requires:
  - phase: 126-01
    provides: strict browser-safe action, operation, and reviewed-forge protocol
  - phase: 126-03
    provides: durable workspace action authority and honest cancellation outcomes
  - phase: 126-04
    provides: bound forge review tokens, strict recovery details, and SHA-safe reviewed creation
provides:
  - renderer-neutral canonical workspace action registry with synchronous one-shot invocation
  - durable non-replay operation tracking with honest cancel and refresh gates
  - immutable resolve-review-create coordinator with direct and durable typed recovery
affects: [126-06, 126-07, tui, web]

tech-stack:
  added: []
  patterns: [pure client coordinators, synchronous pre-await latches, typed recovery reducers]

key-files:
  created:
    - packages/client/src/workspace-actions.ts
    - packages/client/src/operation-tracker.ts
    - packages/client/src/forge-review.ts
    - tests/lib/client-workspace-actions.test.ts
    - tests/lib/client-operation-tracker.test.ts
    - tests/lib/client-forge-review.test.ts
  modified:
    - packages/client/src/index.ts

key-decisions:
  - "Surface-local action state may only reduce authoritative availability; it never weakens service policy."
  - "Ambiguous submission locks without retaining replayable intent; reconnect starts only from a known operation ID."
  - "Forge token, revision, and provider identity remain frozen outside the editable draft, including after durable typed failure recovery."

patterns-established:
  - "Acquire subject/action and create latches synchronously before confirmation or transport awaits."
  - "Every terminal durable operation reconciles selection and refreshes authoritative state before unlocking."
  - "Map forge recovery only from schema-validated details, never from error-message parsing."

requirements-completed: [PARITY-04, PARITY-05, SOURCE-01, SOURCE-03, SOURCE-04]

coverage:
  - id: D1
    description: "One canonical workspace action registry supplies identical callbacks, confirmations, disabled reasons, and one-shot behavior to every invoker."
    requirement: PARITY-04
    verification:
      - kind: unit
        ref: "tests/lib/client-workspace-actions.test.ts"
        status: pass
    human_judgment: false
  - id: D2
    description: "Durable operations reconnect by identity, cancel honestly once, retain bounded cards, and refresh after every terminal outcome."
    requirement: PARITY-05
    verification:
      - kind: unit
        ref: "tests/lib/client-operation-tracker.test.ts"
        status: pass
    human_judgment: false
  - id: D3
    description: "Forge resolution, editable review, explicit one-shot create, and typed direct or durable recovery share one immutable-anchor state machine."
    requirement: SOURCE-03
    verification:
      - kind: unit
        ref: "tests/lib/client-forge-review.test.ts"
        status: pass
    human_judgment: false

duration: 37min
completed: 2026-07-16
status: complete
---

# Phase 126 Plan 05: Shared Client Coordination Summary

**Pure action, durable-operation, and reviewed-forge coordinators now give web and TUI one non-replay client behavior model without moving authority out of the service.**

## Performance

- **Duration:** 37 min
- **Started:** 2026-07-16T18:23:00Z
- **Completed:** 2026-07-16T19:00:00Z
- **Tasks:** 3
- **Files modified:** 7

## Accomplishments

- Generalized authoritative workspace descriptors into stable renderer-neutral action entries whose pointer, menu, and optional keyboard invokers share callback, guard, confirmation, and synchronous latch behavior.
- Added one durable operation tracker that never replays ambiguous intent, observes known IDs across reconnect, sends cancellation once only while advertised, and refresh-gates every terminal result.
- Added an immutable resolve-review-create coordinator that keeps token/revision/source identity outside editable state and maps both direct and accepted-operation failures from strict forge recovery details.

## Task Commits

Each task was committed atomically through RED/GREEN TDD:

1. **Task 1: Shared action descriptor registry** — `801c91b9` (RED), `8c82d2d9` (GREEN)
2. **Task 2: Durable operation tracker** — `4e5cc37c` (RED), `8d4db7b5` (GREEN)
3. **Task 3: Reviewed forge coordinator** — `5c9eaddb` (RED), `208f9fd0` (durable-recovery RED), `898783fa` (GREEN), `09caf246` / `18cdb550` (selection-validation RED/GREEN)

## Files Created/Modified

- `packages/client/src/workspace-actions.ts` — Canonical descriptor projection, stable invoker callbacks, local blocking overlay, and synchronous per-subject/action latch.
- `packages/client/src/operation-tracker.ts` — Non-replay submit/reconnect/cancel/refresh coordinator and bounded operation cards.
- `packages/client/src/forge-review.ts` — Immutable source anchor, editable draft validation, explicit create, reconciliation, and typed recovery reducer.
- `packages/client/src/index.ts` — Public exports for all three shared modules.
- `tests/lib/client-workspace-actions.test.ts` — Inventory, callback identity, availability, confirmation, and rapid-repeat coverage.
- `tests/lib/client-operation-tracker.test.ts` — Ambiguous submission, reconnect, cancel races, refresh failure, reconciliation, and overflow coverage.
- `tests/lib/client-forge-review.test.ts` — Resolve/review/create isolation, immutable anchoring, one-shot submit, URL invalidation, and typed recovery coverage.

## Decisions Made

- Registry consumers receive protocol descriptors verbatim; surface-local state can disable an otherwise available action but cannot enable an authoritatively unavailable one.
- The operation tracker discards replayable intent after its one submit call and deliberately remains locked on an ambiguous pre-ID response.
- A reviewed create remains accepted until authoritative operation/snapshot reconciliation; a matching durable typed branch conflict returns to Review with safe edits intact.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added durable forge-failure recovery after accepted creation**
- **Found during:** Task 3 after the upstream Plan 04 security review
- **Issue:** Direct submit-failure recovery alone could not handle a branch conflict emitted by an already accepted durable creation operation.
- **Fix:** Extended the coordinator to consume matching `WebOperationSummary.error.forge` details and return correctable failures to editable Review without parsing text.
- **Files modified:** `packages/client/src/forge-review.ts`, `tests/lib/client-forge-review.test.ts`
- **Verification:** Focused forge suite passes all nine cases, including accepted durable branch-conflict recovery.
- **Committed in:** `208f9fd0`, `898783fa`

**2. [Rule 2 - Missing Critical] Validated edited selections against resolved candidates**
- **Found during:** Plan-level acceptance review while awaiting the final upstream startup guard
- **Issue:** Protocol-shape validation alone accepted an edited template or repository identity that was absent from the resolved candidates, delaying basic user feedback until service rejection.
- **Fix:** Added candidate-aware advisory validation and left unknown non-source branch mappings empty instead of inventing client-side branch authority.
- **Files modified:** `packages/client/src/forge-review.ts`, `tests/lib/client-forge-review.test.ts`
- **Verification:** The forge suite rejects an unknown template locally with zero create transport calls.
- **Committed in:** `09caf246`, `18cdb550`

---

**Total deviations:** 2 auto-fixed (2 missing critical functionality)
**Impact on plan:** Both additions close intended recovery and feedback behavior without expanding client authority.

## Issues Encountered

- Execution paused at the Task 3 boundary while Plan 04 closed browser projection, fetch transport, token retry, restart cleanup, and durable forge-detail findings. The repaired main branch was integrated twice; Task 3 then targeted the accepted final protocol rather than a temporary coarse transport.

## Verification

- `./node_modules/.bin/vitest run tests/lib/client-*.test.ts` — 7 files, 46 tests passed.
- `npm run typecheck --workspace @git-stacks/client` — passed.
- `npm run build --workspace @git-stacks/client` — passed.
- `npm run test:deps` — package architecture passed.
- `git diff --check 3ca2b28c..HEAD` — passed.
- Forbidden import scan — no DOM, OpenTUI, core, process, filesystem, or child-process imports in the new modules.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plans 126-06 and 126-07 can consume the same action, operation, and reviewed-forge coordination contracts from TUI and web renderers.
- No blocker remains in Plan 05; live cross-client behavior and hosted forge approval remain explicitly assigned to Phase 127.

---
*Phase: 126-web-workflow-and-forge-source-parity*
*Completed: 2026-07-16*
