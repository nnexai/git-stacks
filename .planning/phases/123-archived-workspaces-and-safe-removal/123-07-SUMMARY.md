---
phase: 123-archived-workspaces-and-safe-removal
plan: "07"
subsystem: tui-lifecycle
tags: [opentui, archive, removal-safety, authoritative-reconciliation, solid-js]

requires:
  - phase: 123-archived-workspaces-and-safe-removal
    provides: Stable-ID lifecycle operations, typed failures, authoritative projections, and shared successor ordering from Plans 02, 04, and 05
provides:
  - One-step TUI archive with Undo plus a minimal newest-first archived workspace surface
  - Default-cancel removal, typed dirty blockers, and exact-name force removal
  - Authoritative post-lifecycle reload and shared pinned/priority/activity/name/ID successor ordering
affects: [123-08-verification, 127-live-uat, tui-workspace-lifecycle]

tech-stack:
  added: []
  patterns: [typed discriminated lifecycle views, deferred destructive-input focus, authoritative replacement before UI settlement]

key-files:
  created:
    - packages/tui/src/ArchivedWorkspacesDialog.tsx
    - packages/tui/src/WorkspaceRemovalDialog.tsx
    - tests/tui/dashboard/integ-workspace-archive-remove.test.tsx
  modified:
    - packages/tui/src/App.tsx
    - packages/tui/src/ActionMenu.tsx
    - packages/tui/src/hooks/useWorkspaces.ts
    - packages/tui/src/types.ts
    - tests/tui/dashboard/ActionMenu.test.tsx
    - tests/tui/dashboard/integ-action-menu.test.tsx

key-decisions:
  - "TUI lifecycle intent carries the stable projection ID and current authoritative core revision; reconciliation reloads core state and signals before selection or empty-state settlement."
  - "Force Remove exists only in a typed workspace_dirty state with terminals_stopped and force_allowed set, and the dedicated input requires the exact current workspace name."
  - "Active row ordering consumes workspaceSuccessorOrder in useWorkspaces, the actual shared ordering seam used by every rendered TUI selection."

patterns-established:
  - "Lifecycle dialogs receive typed data and callbacks only; service, filesystem, Git, and terminal authority remain outside presentation components."
  - "A destructive input opened by a keyboard shortcut defers focus by one event-loop turn so the opening key cannot leak into the confirmation value."

requirements-completed: [ARCH-02, ARCH-03, ARCH-05, ARCH-06, REMOVE-01, REMOVE-03, REMOVE-05]

coverage:
  - id: D1
    description: "The TUI archives through the shared service operation, reconciles authoritative state, selects the shared deterministic successor, and offers Undo/Unarchive."
    requirement: ARCH-02
    verification:
      - kind: automated_ui
        ref: "tests/tui/dashboard/integ-workspace-archive-remove.test.tsx#PHASE123_RED TUI lifecycle contract"
        status: pass
      - kind: automated_ui
        ref: "tests/tui/dashboard/integ-workspace-archive-remove.test.tsx#selects the rendered successor through every shared ordering tier"
        status: pass
    human_judgment: false
  - id: D2
    description: "A separate minimal archived surface renders newest-first identity, activity timestamp, Unarchive, and an explicit empty state without active workspace details."
    requirement: ARCH-05
    verification:
      - kind: automated_ui
        ref: "tests/tui/dashboard/integ-workspace-archive-remove.test.tsx#renders a minimal newest-first archived view, unarchives, and has an empty state"
        status: pass
    human_judgment: false
  - id: D3
    description: "Remove starts canceled, inventories all resource classes, and exposes exact-name Force Remove only after a fresh typed dirty failure while stale and terminal failures never replay or elevate."
    requirement: REMOVE-03
    verification:
      - kind: automated_ui
        ref: "tests/tui/dashboard/integ-workspace-archive-remove.test.tsx#remove defaults to cancel and inventories every deleted resource class"
        status: pass
      - kind: automated_ui
        ref: "tests/tui/dashboard/integ-workspace-archive-remove.test.tsx#offers exact-name Force Remove only for a typed dirty result"
        status: pass
      - kind: automated_ui
        ref: "tests/tui/dashboard/integ-workspace-archive-remove.test.tsx#never offers force for terminal failure and reloads stale state without replay"
        status: pass
    human_judgment: false
  - id: D4
    description: "Lifecycle progress, failures, selection, signals, counts, and navigation settle from authoritative replacement state without adding TUI-side mutation authority."
    requirement: REMOVE-05
    verification:
      - kind: integration
        ref: "tests/tui/dashboard/integ-action-menu.test.tsx#selecting Remove confirms through the lifecycle service and deletes workspace YAML"
        status: pass
      - kind: other
        ref: "npm run typecheck"
        status: pass
      - kind: other
        ref: "npm run test:deps"
        status: pass
    human_judgment: false

duration: 25 min
completed: 2026-07-16
status: complete
---

# Phase 123 Plan 07: TUI Archived Workspaces and Safe Removal Summary

**Typed OpenTUI archive, Undo/Unarchive, default-cancel removal, dirty-only exact-name force removal, and authoritative successor reconciliation**

## Performance

- **Duration:** 25 min
- **Started:** 2026-07-16T09:10:00+02:00
- **Completed:** 2026-07-16T09:35:50+02:00
- **Tasks:** 3
- **Files modified:** 9

## Accomplishments

- Added one-step Archive, post-archive Undo, and a singleton minimal archived-workspaces view that renders only identity, the authoritative activity timestamp, and Unarchive.
- Replaced the TUI's legacy remove path with stable-ID/revision lifecycle submission, default-cancel confirmation, typed blocker reporting, and dirty-only exact-name Force Remove.
- Reconciled core state and signals before final UI settlement and sorted active rows with the shared pinned, priority, activity, name, and stable-ID comparator.
- Locked archive, remove, force, stale, failure, successor, and empty-state behavior in a rendered OpenTUI suite with request-shape and operation-order assertions.

## Task Commits

Each task was committed atomically:

1. **Task 1: Create the Wave 0 rendered TUI lifecycle interaction suite** - `2ba1982c` (test)
2. **Task 2: Add explicit archived and removal TUI view states** - `8f764475` (feat)
3. **Task 3: Wire shared lifecycle operations and authoritative TUI reconciliation** - `7797603f` (feat)

## Verification

- The original RED run reached `PHASE123_RED TUI lifecycle contract` and failed on six absent lifecycle behaviors rather than syntax, import, preload, fixture, or environment setup.
- `bun test --preload @opentui/solid/preload tests/tui/dashboard/integ-workspace-archive-remove.test.tsx` passes 6/6 tests with 47 assertions.
- Directly affected ActionMenu unit/integration and lifecycle integration files pass 35/35 tests.
- `npm run typecheck` passes for protocol, client, core, CLI, service, web, and TUI workspaces.
- `npm run test:deps` reports `Package architecture: OK`.
- The post-integration `npm test` gate passes 136 Vitest files / 1,787 tests, all 42 Node tests, and the complete OpenTUI matrix.
- Final live TUI and real-service interaction review remains intentionally deferred to the milestone-end Phase 127 checklist before tagging.

## Files Created/Modified

- `packages/tui/src/ArchivedWorkspacesDialog.tsx` - Minimal archived list, empty state, Unarchive, and post-archive Undo views.
- `packages/tui/src/WorkspaceRemovalDialog.tsx` - Default-cancel removal inventory, typed dirty blockers, and deferred-focus exact-name force confirmation.
- `packages/tui/src/App.tsx` - Stable-ID lifecycle submission, typed failure routing, progress, reconciliation, and explicit lifecycle view transitions.
- `packages/tui/src/ActionMenu.tsx` - Archive action and keyboard shortcut.
- `packages/tui/src/hooks/useWorkspaces.ts` - Shared deterministic successor ordering using stable ID and authoritative activity time.
- `packages/tui/src/types.ts` - Explicit lifecycle targets, dirty context, actions, and discriminated UI states.
- `tests/tui/dashboard/integ-workspace-archive-remove.test.tsx` - Rendered lifecycle, request, reconciliation, ordering-tier, and safety contract.
- `tests/tui/dashboard/ActionMenu.test.tsx` - Archive rendering/shortcut coverage and corrected disabled-row navigation index.
- `tests/tui/dashboard/integ-action-menu.test.tsx` - Service-owned removal integration contract and updated config/service mocks.

## Decisions Made

- Used the stable projection ID instead of workspace name as lifecycle identity, paired with the revision from the same authoritative core snapshot.
- Reloaded core state and signals before changing selection or leaving progress so archived/removed targets, terminal/signal projections, counts, and empty states settle together.
- Required the full typed dirty contract (`workspace_dirty`, `terminals_stopped`, `force_allowed`, blocker array) before constructing a force-capable view; no lifecycle behavior depends on error-message parsing.
- Hid the normal split pane while the archived surface is open so archived rows cannot leak into active workspace detail/actions.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Applied shared ordering at the actual active-row seam**
- **Found during:** Task 3 (authoritative reconciliation)
- **Issue:** The plan named `App.tsx`, but the rendered workspace order is produced by `useWorkspaces.ts`; sorting only in App would not consistently govern selection and navigation.
- **Fix:** Added stable projection ID/activity fields to `WorkspaceEntry` and replaced the legacy priority-only sort with `workspaceSuccessorOrder` in `useWorkspaces.ts`.
- **Files modified:** `packages/tui/src/hooks/useWorkspaces.ts`, `packages/tui/src/types.ts`
- **Verification:** The rendered successor test independently passes the pin, priority, activity, name, and stable-ID tiers.
- **Committed in:** `f8446051`

**2. [Rule 1 - Bug] Preserved queued authoritative replacement state in the lifecycle harness**
- **Found during:** Task 3 (dirty and stale reconciliation tests)
- **Issue:** The test render helper overwrote the prepared reload snapshot, preventing the harness from modeling a new service revision after mutation.
- **Fix:** Kept the initial render state and queued authoritative reload state independent.
- **Files modified:** `tests/tui/dashboard/integ-workspace-archive-remove.test.tsx`
- **Verification:** Dirty removal submits at revision 20, reloads revision 21, and Force Remove submits the fresh revision; stale reload also requires explicit reconfirmation.
- **Committed in:** `f8446051`

**3. [Rule 1 - Bug] Updated the legacy ActionMenu removal test to the service-owned lifecycle seam**
- **Found during:** Task 3 regression verification
- **Issue:** The existing integration test still mocked the pre-Phase-123 direct core removal and its config mock lacked newer exports, so it could not verify the new authoritative route.
- **Fix:** Asserted the stable-ID/revision lifecycle request, retained the service-owned YAML deletion assertion, and added the necessary isolated config/client mocks. The ActionMenu unit test also now covers Archive and its shifted disabled-row position.
- **Files modified:** `tests/tui/dashboard/ActionMenu.test.tsx`, `tests/tui/dashboard/integ-action-menu.test.tsx`
- **Verification:** Both files pass 29/29 tests; combined with the lifecycle file, directly affected coverage passes 35/35.
- **Committed in:** `f8446051`

---

**Total deviations:** 3 auto-fixed (1 missing critical, 2 bugs)
**Impact on plan:** All changes were necessary to make the planned shared ordering and service lifecycle behavior real at existing TUI seams; no client-side mutation authority or unrelated product scope was added.

## Issues Encountered

- Reopening the exact-name dialog initially allowed typed characters to arrive before the input regained focus. The dialog now uses the established deferred-focus pattern and its test settles that transition before typing.
- The isolated worktree initially exposed incomplete unrelated mocks and a missing built launcher artifact; after rebasing and integrating with the completed web/runtime wave, the full repository `npm test` gate—including the complete OpenTUI matrix—passes.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan 08 can run cross-surface lifecycle verification against the strict browser and TUI contracts.
- Phase 127 remains the deliberate live rendering/real-service verification boundary before any tag.
- No Plan 07 blocker remains.

## Self-Check: PASSED

- Integrated task commits `2ba1982c`, `8f764475`, and `7797603f` exist in history after the worktree branch was rebased onto the completed web mainline.
- All nine created/modified source and test files exist.
- Every coverage deliverable has current passing automated evidence.
- No TUI lifecycle component imports filesystem, Git, process, or terminal authority, and no lifecycle branch parses error-message text.

---
*Phase: 123-archived-workspaces-and-safe-removal*
*Completed: 2026-07-16*
