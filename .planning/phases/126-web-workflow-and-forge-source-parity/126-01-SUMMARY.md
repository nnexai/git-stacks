---
phase: 126-web-workflow-and-forge-source-parity
plan: "01"
subsystem: protocol
tags: [zod, browser-safety, cancellation, notes, file-status, forge-source]

requires:
  - phase: 123-archived-workspaces-and-safe-removal
    provides: stable-ID lifecycle mutations and terminal-stop failure contracts
  - phase: 125-terminal-safe-keyboard-navigation
    provides: strict shortcut action and singleton-dispatch contracts
provides:
  - Complete canonical workspace action and honest cancellation vocabulary
  - Bounded notes and path-free file-status browser DTOs
  - Distinct GitHub/GitLab resolve, review, and reviewed-create contracts
affects: [126-02, 126-03, 126-04, 126-05, 126-06, 126-07, 126-08]

tech-stack:
  added: []
  patterns: [strict Zod allowlists, state-consistent discriminated unions, path-free browser projections]

key-files:
  created:
    - tests/service/web-workflow-contract.test.ts
  modified:
    - packages/protocol/src/service.ts
    - packages/protocol/src/web.ts

key-decisions:
  - "Preserve the Phase 123 WebOperation and lifecycle schemas while adding a stricter canonical operation summary for Phase 126 consumers."
  - "Represent forge resolution as workspace.source.resolve and reviewed creation as workspace.create.reviewed so unresolved URL input cannot encode creation."
  - "Allow only logical relative configured file targets; raw roots, host paths, errors, and verbose diff paths remain outside browser DTOs."

patterns-established:
  - "Browser workflow DTOs are strict allowlists whose safe messages reject common host-path forms."
  - "Cancellation outcomes are validated against operation state and never imply rollback."
  - "Editable forge drafts carry only logical IDs and branch mappings; immutable source authority stays in a token-bound safe anchor."

requirements-completed: [PARITY-01, PARITY-02, PARITY-03, PARITY-04, PARITY-05, SOURCE-01, SOURCE-02, SOURCE-03, SOURCE-04]

coverage:
  - id: D1
    description: Canonical action inventory and state-consistent cancellation contracts
    requirement: PARITY-01
    verification:
      - kind: unit
        ref: tests/service/web-workflow-contract.test.ts#web workflow protocol contract
        status: pass
    human_judgment: false
  - id: D2
    description: Bounded newest-first notes and path-free file-status projections
    requirement: PARITY-04
    verification:
      - kind: unit
        ref: tests/service/web-workflow-contract.test.ts#browser-safe notes and file status
        status: pass
    human_judgment: false
  - id: D3
    description: Explicit GitHub/GitLab resolve-review-submit and typed safe failures
    requirement: SOURCE-01
    verification:
      - kind: unit
        ref: tests/service/web-workflow-contract.test.ts#reviewed forge source protocol
        status: pass
    human_judgment: false

duration: 12min
completed: 2026-07-16
status: complete
---

# Phase 126 Plan 01: Strict Web Workflow Protocol Summary

**Strict action, cancellation, notes, file-status, and reviewed forge-source contracts now give every downstream package one bounded vocabulary without browser authority or host disclosure.**

## Performance

- **Duration:** 12 min
- **Started:** 2026-07-16T17:15:12Z
- **Completed:** 2026-07-16T17:27:31Z
- **Tasks:** 3
- **Files modified:** 3

## Accomplishments

- Froze all 18 canonical workspace/action IDs, typed availability and confirmation policy, durable operation identity, and honest cancellation states/results.
- Added revisioned newest-first note DTOs and sanitized file-status groups that reject roots, absolute Windows/POSIX paths, raw errors, hints, and verbose diff arrays.
- Added GitHub PR/GitLab MR-only provider terminology, opaque review tokens, safe source anchors/candidates, complete editable drafts, explicit resolve/reviewed-create intents, and bounded failure recovery.

## Task Commits

The plan used one shared RED suite followed by one GREEN protocol commit because all three contract slices must compile as one cross-referenced vocabulary:

1. **RED: Freeze all workflow protocol behavior** - `4c02aeca` (test)
2. **GREEN: Implement Tasks 1-3 strict contracts** - `b9d5694f` (feat)

## Files Created/Modified

- `packages/protocol/src/service.ts` - Carrier-neutral cancellation, mutation-kind, provider, token, and safe source primitives.
- `packages/protocol/src/web.ts` - Canonical actions, bounded operations/notes/files, and resolve-review-create browser contracts.
- `tests/service/web-workflow-contract.test.ts` - Adversarial inventory, strictness, disclosure, state, and workflow separation suite.

## Decisions Made

- Kept existing Phase 123 lifecycle and `WebOperationSchema` shapes unchanged; Phase 126 consumers get `WebOperationSummarySchema` with stricter action/workspace/cancellation identity.
- Required provider-specific terminology and made the reviewed draft source-free, so clients cannot mutate immutable provider identity or submit fetch authority.
- Used strict allowlist construction plus safe logical-target validation rather than attempting to redact rich core file models.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- The isolated worktree had no dependency directory. A temporary symlink to the main worktree's installed dependencies enabled tests and was removed before commit.

## User Setup Required

None - no external service configuration required.

## Verification

- `./node_modules/.bin/vitest run tests/service/web-workflow-contract.test.ts` — 13 passed.
- Focused legacy plus new protocol run — 4 files, 37 tests passed.
- `npm run typecheck --workspace @git-stacks/protocol` — passed.
- `npm run typecheck --workspace @git-stacks/service` — passed.
- `git diff --check` and dependency/import disclosure scan — passed.

## Self-Check: PASSED

- All declared artifacts exist.
- RED and GREEN commits exist in plan history.
- Every task acceptance criterion has executable passing coverage.
- Core remains protocol-free; protocol has no core, service, or client dependency.

## Next Phase Readiness

Ready for Plans 126-02 and 126-03 to implement provider resolution and shared service/client authority against this contract.

---
*Phase: 126-web-workflow-and-forge-source-parity*
*Completed: 2026-07-16*
