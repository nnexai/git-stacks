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
    - packages/tui/src/workspace-action-inventory.ts
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
- **Tasks:** 3 plus reviewed repair and full-suite closure
- **Commits:** 7 implementation/test commits, 3 prior review-repair commits, and this fixture-closure commit

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
5. **Independent-review repair:** `6ad1dcf1`, `5a648e3d`, `61b8e786`
6. **Full-suite fixture closure:** this atomic fixture/source/summary commit

## Decisions Made

- Used one persistent `CenteredDialog` for forge review state transitions to avoid remounting OpenTUI native resources.
- Kept reviewed-create progress on the existing authoritative creation progress surface, polling only the accepted operation ID before refresh and selection.
- Added a typed local service bridge so production remains statically resolvable while legacy integration tests can mock the safe adapter boundary directly.

## Deviations from Plan

### Auto-fixed Issues

1. **Rule 3 - OpenTUI test runner preload:** Plan verification used Vitest syntax, but OpenTUI tests require `bun test --preload @opentui/solid/preload`; verification used the repository-supported runner.
2. **Rule 2 - Narrow service transport adapters:** TUI-safe action, note, file, forge, and operation transports were exposed from the service client without moving policy into the TUI.
3. **Rule 1 - Stale integration mocks:** Full `test:tui` linked the expanded service graph through incomplete config/lifecycle fixtures; normal App fixtures now provide complete canonical inventories through the typed TUI service bridge.
4. **Rule 1 - Reactive inventory transition:** Authoritative fixture success exposed that `ActionMenu` selected its loading branch only at mount. A reactive `Switch` now moves loading/error to canonical ready state while retaining the same non-actionable fail-closed branches.

**Total deviations:** 4 auto-fixed. No domain authority or unrelated product scope was added.

## Verification

- `npm run test:tui` — pass with every OpenTUI file isolated in its own Bun process.
- Focused OpenTUI suites — WorkspaceParity 13/13, ForgeSourceReview 5/5, ActionMenu 17/17.
- Repaired App integrations — action menu 12/12, canonical sync 3/3, lifecycle archive/remove 7/7.
- `npx vitest run tests/lib/client-workspace-actions.test.ts tests/lib/service/workspace-action-authority.test.ts tests/service/web-workflow-authority.test.ts` — 22/22 pass.
- `npm run typecheck --workspace @git-stacks/tui` — pass.
- `npm run typecheck --workspace @git-stacks/client` — pass.
- `npm run typecheck --workspace @git-stacks/service` — pass.
- `npm run tui:build` — pass.
- `npm run test:deps` — pass.
- `npm run test:architecture` — pass.
- `git diff --check`, stale-inventory-fixture scan, fail-closed zero-dispatch coverage scan, and safe TUI authority/path/provider scan — pass.
- Runtime OpenTUI verification against an isolated real managed service — opening Actions rendered canonical rows from the service, an unavailable Pull stayed in-menu with the authoritative reason, and an invalid authority configuration rendered the non-actionable inventory error; pressing legacy `o` did not leave that error state.

## Issues Encountered

- A keyed forge dialog remount caused an OpenTUI `SyntaxStyle` native allocation failure; a persistent shell with reactive content switching fixed it.
- Canonical success fixtures exposed a production transition bug: the menu stayed mounted in its initial unavailable branch after inventory became ready. Reactive branch selection fixed the transition without enabling any fallback.
- Generated OpenTUI snapshots retain terminal padding whitespace; source diffs pass whitespace checks excluding the generated snapshot artifact.
- The full OpenTUI run still prints existing `TerminalConsoleCache` listener-count warnings in several component files; they are non-failing and were not changed in this repair.

## User Setup Required

None.

## Reviewed Repair Evidence

Two independent reviews found authority, race, recovery, and constrained-layout gaps in the original implementation. Both repair rounds were developed RED/GREEN on `codex/phase126-06` without claiming review closure:

- `6ad1dcf1` adds the first failing regressions for fail-closed inventory states, shared action policy wiring, adapted legacy-only rows, submit-unknown Back, note rejection handling, and reviewed-create recovery.
- `5a648e3d` closes that first authority set by routing canonical menu invocations through `createWorkspaceActionRegistry`, restoring Merge confirmation, preserving adapted local rows, handling note mutation rejections, and delegating reviewed terminal failures to `forgeReview.observeOperation`.
- `61b8e786` records the first review repair and its then-open full-suite blocker; `f8210e8f` closes the canonical fixture blocker.
- The second verified repair removes `LegacyActionMenu` completely. Undefined, loading, failed, empty, malformed, and subject-mismatched inventories are explicit non-actionable states, while normal tests now supply canonical inventories.
- Action inventory loads now use generation plus immutable workspace identity. Late results, reordered rows, switched targets, empty results, and mismatched descriptor subjects cannot install callbacks.
- Lifecycle and rename execution re-check current service descriptors before mutation. Remove, Force Remove, Rename, Unarchive, Undo, generic confirmations, and inputs have synchronous one-shot guards; exact-name Force Remove remains case-sensitive.
- Reviewed creation reconnects only by its accepted operation ID, ignores transport failures as terminal outcomes, and refreshes authoritative state before success unlock or typed review recovery.
- Forge review now exposes inclusion for every selected-template repository and branch mapping for every included worktree repository. Row identity survives typed rejection, and real stacked rendering is exercised at widths 79, 55, and 40.
- Notes responses are generation-, workspace-, and revision-keyed. Add/Clear reject absent, failed, mismatched, stale, or unavailable transport prerequisites while preserving editable draft/confirmation state; successful mutation refreshes before accepting the new authoritative response.
- `WorkspaceOperationView` uses one shared recoverable-Back predicate for rendering and key handling, so refresh-failed is retry-only.
- Final runtime verification used an isolated real managed service: canonical unavailable actions remained non-actionable; rapid Enter added one note and refreshed the authoritative count; rapid `y` cleared once; a real GitHub PR rendered editable two-repository review rows at 79/55/40 columns; toggling the second repository restored its row; and rapid `y` removed one isolated workspace once.

## Final Verification After Second Repair

- `npm run test:tui` — pass; all OpenTUI files isolated by the repository runner. Existing non-failing `TerminalConsoleCache` listener warnings remain.
- Focused OpenTUI — ActionMenu 7/7, WorkspaceParity 16/16, ForgeSourceReview 6/6, action-menu integration 12/12, lifecycle archive/remove 7/7.
- `npx vitest run tests/lib/client-workspace-actions.test.ts tests/lib/service/workspace-action-authority.test.ts tests/service/web-workflow-authority.test.ts` — 22/22 pass.
- TUI, client, and service workspace typechecks — pass.
- `npm run tui:build` — pass.
- `npm run test:deps` and `npm run test:architecture` — pass (`Package architecture: OK`).
- `git diff --check`, stale-index/legacy-fallback scan, descriptor-subject scan, and TUI safe-authority/path scan — pass.

## Next Phase Readiness

The eight verified Plan 06 review fixes are implemented and locally verified. The branch is ready for independent re-review only; do not merge until that review is clean, and this summary does not claim review or release approval.

---
*Phase: 126-web-workflow-and-forge-source-parity*
*Completed: 2026-07-16*
