---
phase: 126-web-workflow-and-forge-source-parity
plan: "06"
subsystem: ui
tags: [opentui, service-projections, operation-tracker, forge-review]
requires:
  - phase: 126-04
    provides: canonical workspace action and operation contracts
  - phase: 126-05
    provides: shared forge review coordinator and safe projections
provides:
  - Canonical grouped OpenTUI workspace actions and durable operation handling
  - Path-free authoritative notes and file-status dialogs
  - Contained PR/MR resolve, review, and explicit-create flow
affects: [126-07, milestone-verification, tui]
tech-stack:
  added: []
  patterns: [typed service bridge, contained OpenTUI keyboard ownership, shared coordinator state]
key-files:
  created:
    - packages/tui/src/ForgeSourceReviewDialog.tsx
    - packages/tui/src/WorkspaceNotesDialog.tsx
    - packages/tui/src/WorkspaceFileStatusDialog.tsx
    - packages/tui/src/official-service.ts
  modified:
    - packages/tui/src/App.tsx
    - packages/tui/src/ActionMenu.tsx
    - packages/tui/src/WorkspaceOperationView.tsx
    - packages/tui/src/WorkspaceDetail.tsx
key-decisions:
  - "Keep policy in protocol/client/service layers; TUI uses a typed, mockable official-service bridge."
  - "Resolve Enter never creates; c is the sole one-shot reviewed-create path."
patterns-established:
  - "Persistent OpenTUI dialog shells switch reactive contents without remounting native resources."
  - "Legacy App integration fixtures use complete shared config/lifecycle mocks when linking the service graph."
requirements-completed: [PARITY-01, PARITY-02, PARITY-03, PARITY-04, PARITY-05, SOURCE-01, SOURCE-03, SOURCE-04]
coverage:
  - id: D1
    description: "Canonical TUI actions, unavailable reasons, durable progress, cancellation, and refresh"
    requirement: PARITY-01
    verification:
      - kind: automated_ui
        ref: "tests/tui/dashboard/WorkspaceParity.test.tsx"
        status: pass
    human_judgment: false
  - id: D2
    description: "Authoritative path-free notes and file-status details"
    requirement: PARITY-04
    verification:
      - kind: automated_ui
        ref: "tests/tui/dashboard/WorkspaceParity.test.tsx#OpenTUI authoritative workspace details"
        status: pass
    human_judgment: false
  - id: D3
    description: "Contained PR/MR resolve, editable review, and explicit one-shot creation"
    requirement: SOURCE-03
    verification:
      - kind: automated_ui
        ref: "tests/tui/dashboard/ForgeSourceReview.test.tsx"
        status: pass
    human_judgment: false
duration: 2h 45m
completed: 2026-07-16
status: complete
---

# Phase 126 Plan 06: OpenTUI Parity Summary

**OpenTUI now consumes canonical workspace actions and safe service projections, with durable operations and a contained reviewed-source creation flow.**

## Performance

- **Duration:** 2h 45m
- **Completed:** 2026-07-16
- **Tasks:** 3
- **Commits:** 7 implementation/test commits

## Accomplishments

- Added grouped canonical actions including Pull, Pin/Unpin, Notes, File status, and authoritative Cancel behavior.
- Replaced rich notes/file readers in touched TUI surfaces with lazy, bounded, path-free service DTOs.
- Added PR/MR URL resolve and anchored editable review with explicit one-shot `c` creation and authoritative operation progress.
- Preserved Phase 123 exact-name force removal and stopped-terminal lifecycle behavior.

## Task Commits

1. **Task 1 RED/GREEN:** `7864361b`, `25954a59`
2. **Task 2 RED/GREEN:** `d8ea6969`, `f065271a`
3. **Task 3 RED/GREEN:** `4975050a`, `519ca023`
4. **Full-suite adapter hardening:** `5573d52e`

## Decisions Made

- Used one persistent `CenteredDialog` for forge review state transitions to avoid remounting OpenTUI native resources.
- Kept reviewed-create progress on the existing authoritative creation progress surface, polling only the accepted operation ID before refresh and selection.
- Added a typed local service bridge so production remains statically resolvable while legacy integration tests can mock the safe adapter boundary directly.

## Deviations from Plan

### Auto-fixed Issues

1. **Rule 3 - OpenTUI test runner preload:** Plan verification used Vitest syntax, but OpenTUI tests require `bun test --preload @opentui/solid/preload`; verification used the repository-supported runner.
2. **Rule 2 - Narrow service transport adapters:** TUI-safe action, note, file, forge, and operation transports were exposed from the service client without moving policy into the TUI.
3. **Rule 1 - Stale integration mocks:** Full `test:tui` linked the expanded service graph through incomplete config/lifecycle fixtures; fixtures now use complete shared mock helpers and mock the typed TUI service bridge.

**Total deviations:** 3 auto-fixed. No domain authority or unrelated product scope was added.

## Verification

- `npm run test:tui` — pass
- Focused forge/parity/file suites — 16/16 pass
- `npm run typecheck --workspace @git-stacks/tui` — pass
- `npm run typecheck --workspace @git-stacks/service` — pass
- `npm run tui:build` — pass
- `npm run test:deps` — pass
- Touched-surface rich authority/path/provider command scan — pass

## Issues Encountered

- A keyed forge dialog remount caused an OpenTUI `SyntaxStyle` native allocation failure; a persistent shell with reactive content switching fixed it.
- Generated OpenTUI snapshots retain terminal padding whitespace; source diffs pass whitespace checks excluding the generated snapshot artifact.

## User Setup Required

None.

## Reviewed Repair Evidence

A subsequent independent review found authority and recovery gaps in the original implementation. The repair was developed RED/GREEN on `codex/phase126-06` without claiming review closure:

- `6ad1dcf1` adds failing regressions for fail-closed inventory states, shared action policy wiring, adapted legacy-only rows, submit-unknown Back, note rejection handling, and reviewed-create recovery.
- `5a648e3d` routes canonical menu invocations through `createWorkspaceActionRegistry`, restores Merge confirmation, removes the local menu latch, preserves Edit/Clean/Run/Issue/Commands rows, makes Pin/Unpin shortcuts unique, handles note mutation rejections, allows submit-unknown Back, and delegates reviewed terminal failures to `forgeReview.observeOperation`.
- Focused OpenTUI suites pass: WorkspaceParity 13/13, ForgeSourceReview 5/5, and ActionMenu 17/17.
- TUI, client, and service package typechecks pass; TUI build, dependency cycle gate, and package architecture gate pass.
- `npm run test:tui` was attempted. Component suites passed, but pre-existing App integration fixtures that intentionally throw from `fetchWorkspaceActionInventory` now fail because the repaired UI correctly fails closed instead of exposing the old legacy menu. Those fixtures must be migrated to authoritative inventory mocks before the full suite is green.

## Next Phase Readiness

The reviewed findings are repaired and focused gates pass. Do not merge until the stale full-suite App fixtures are migrated and the branch receives an independent re-review.

---
*Phase: 126-web-workflow-and-forge-source-parity*
*Completed: 2026-07-16*
