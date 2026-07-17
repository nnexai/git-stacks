---
phase: 127-stale-workspace-intelligence-and-rc-closure
plan: "07"
subsystem: web-ui
tags: [stale-workspaces, overlay, lifecycle, shortcuts, responsive, accessibility]

requires:
  - phase: 127-02
    provides: strict browser-safe stale workspace protocol DTOs
  - phase: 127-05
    provides: canonical stale evaluation and lifecycle service authority
  - phase: 127-06
    provides: shared stale presentation, generation gating, shortcuts, and action registries
provides:
  - singleton web stale-workspace overlay with retained refresh data and revision recovery
  - canonical Open, Archive, Remove, and guarded Force Remove interaction paths
  - scoped refresh keyboard handling and responsive bounded overlay rendering
affects: [127-08, 127-09, 127-10, 127-11, 127-12, web-verification, release-candidate]

tech-stack:
  added: []
  patterns:
    - volatile authoritative evidence retained across overlay reopen and refresh failure
    - lifecycle descriptors rendered from fresh service inventory without local policy reconstruction
    - overlay close subscriptions dispose detached renderers and invalidate request generations

key-files:
  created:
    - packages/web/src/stale-workspaces.ts
  modified:
    - packages/web/src/app.ts
    - packages/web/src/navigation.ts
    - packages/web/src/app.css
    - packages/web/src/overlay-controller.ts
    - tests/service/web-stale-workspaces.test.ts

key-decisions:
  - "Keep stale evidence volatile in memory and bypass a redundant fetch only while its revision still matches the authoritative snapshot."
  - "Render only canonical Archive and Remove descriptors in the card menu; reveal Force Remove only after the typed dirty result and a fresh authorized inventory."
  - "Reconcile normal workspace state and stale evidence once after a terminal lifecycle result without replaying the mutation."

patterns-established:
  - "Scoped stale refresh: unmodified R is handled only by the mounted stale view and rejected for input, composition, AltGraph, and repeat events."
  - "Lifecycle return: replacing the stale overlay disposes its renderer, while volatile evidence and action context allow canonical confirmation cancellation to reopen the same candidate context."

requirements-completed: [STALE-01, STALE-02, STALE-04, STALE-05]

coverage:
  - id: D1
    description: "Singleton stale overlay renders retained, error, empty, candidate, incomplete, revision-recovery, Open, inventory, and lifecycle states from authoritative data."
    requirement: STALE-01
    verification:
      - kind: integration
        ref: "tests/service/web-stale-workspaces.test.ts (19 tests)"
        status: pass
      - kind: automated_ui
        ref: "Playwright-driven isolated git-stacks web session: singleton open/refocus, Escape restoration, desktop and 320px overflow"
        status: pass
    human_judgment: false
  - id: D2
    description: "Open and lifecycle actions use canonical descriptors, one-shot latches, dirty-result Force gating, and authoritative normal-plus-stale reconciliation."
    requirement: STALE-04
    verification:
      - kind: integration
        ref: "tests/service/web-stale-workspaces.test.ts#Phase 127 web canonical Open and lifecycle authority"
        status: pass
      - kind: integration
        ref: "tests/service/web-workspace-actions.test.ts"
        status: pass
    human_judgment: false
  - id: D3
    description: "Global stale entry and overlay-only Refresh preserve singleton focus and terminal/input keyboard isolation."
    requirement: STALE-02
    verification:
      - kind: integration
        ref: "tests/service/web-keyboard-overlays.test.ts"
        status: pass
      - kind: integration
        ref: "tests/service/web-stale-workspaces.test.ts#context-only R refresh"
        status: pass
    human_judgment: false
  - id: D4
    description: "The 760px/78vh overlay wraps long safe text and avoids horizontal overflow at desktop, 375px, and 320px."
    requirement: STALE-05
    verification:
      - kind: automated_ui
        ref: "Playwright isolated web session: 760px desktop modal and 304px modal at 320px viewport with equal content scroll/client widths"
        status: pass
      - kind: integration
        ref: "tests/service/web-stale-workspaces.test.ts#overflow and long text"
        status: pass
    human_judgment: false

duration: 20min
completed: 2026-07-17
status: complete
---

# Phase 127 Plan 07: Stale Workspace Intelligence and RC Closure Summary

**Revision-safe stale-workspace overlay with retained evidence, canonical lifecycle authority, scoped shortcuts, and responsive accessible rendering**

## Performance

- **Duration:** 20 min
- **Started:** 2026-07-17T12:03:03Z
- **Completed:** 2026-07-17T12:23:00Z
- **Tasks:** 3
- **Files modified:** 6

## Accomplishments

- Added a singleton Stale Workspaces overlay adjacent to Archived with exact focus restoration, repeat-entry refocus, retained refresh data, distinct loading/error/empty/incomplete states, and service-order candidate rendering.
- Routed Open, Archive, Remove, and conditional Force Remove through canonical descriptors with one-shot submission, exact-name confirmation, fresh inventory gating, and normal-plus-stale reconciliation.
- Added platform stale-entry shortcuts, overlay-only `R` refresh isolation, accessible reason/timestamp presentation, and bounded responsive layouts verified at desktop and 320px.

## Task Commits

Each task was committed atomically:

1. **Task 1: Implement stale overlay state machine and render model** - `9d6192fa` (feat)
2. **Task 2: Integrate singleton overlay, shortcuts, Open, and lifecycle authority** - `1096f6b0` (feat)
3. **Task 3: Complete responsive geometry and long-text behavior** - `d4c5ec40` (style)
4. **Review fixes: Close canonical lifecycle, cleanup, and revision-safety gaps** - `64876e9e` (fix)

## Files Created/Modified

- `packages/web/src/stale-workspaces.ts` - Volatile stale evidence controller, revision-safe fetch coordination, canonical action inventory, lifecycle latching, and DOM rendering.
- `packages/web/src/app.ts` - Toolbar entry, secure RPC composition, canonical descriptor invocation, lifecycle confirmations, and authoritative navigation/reconciliation.
- `packages/web/src/navigation.ts` - Repeat-entry refocus registration and active-view-only stale refresh dispatch.
- `packages/web/src/app.css` - 760px/78vh bounded overlay, action menu, responsive card layout, wrapping, and overflow controls.
- `packages/web/src/overlay-controller.ts` - Close subscriptions so replaced overlays dispose pending renderers and request generations.
- `tests/service/web-stale-workspaces.test.ts` - State, rendering, generation, disclosure, canonical action, latch, reconciliation, focus, shortcut, and responsive contract coverage.

## Decisions Made

- Kept successful stale evidence as volatile memory only; reopening reuses it only when its revision still equals the current authoritative snapshot.
- Preserved service inventory authority by rendering canonical Archive/Remove descriptors and their disabled reasons rather than reconstructing local lifecycle availability.
- Kept Force Remove out of the normal stale card menu until Remove returns the typed dirty blocker, terminals are stopped, `force_allowed` is true, and a fresh inventory authorizes the descriptor.
- Reconciled authoritative normal workspace state and then force-refreshed stale evidence exactly once after terminal lifecycle success.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Added the missing canonical lifecycle action menu**
- **Found during:** Post-task code review
- **Issue:** `Workspace actions` fetched inventory but did not render Archive/Remove controls or authoritative disabled reasons.
- **Fix:** Added a semantic action menu driven only by the fetched descriptors, with unavailable actions focusable and explanatory, and Force hidden until reauthorized.
- **Files modified:** `packages/web/src/stale-workspaces.ts`, `packages/web/src/app.css`, `tests/service/web-stale-workspaces.test.ts`
- **Verification:** Focused stale and workspace-action suites pass.
- **Committed in:** `64876e9e`

**2. [Rule 1 - Bug] Completed lifecycle terminal reconciliation without mutation replay**
- **Found during:** Post-task code review
- **Issue:** Successful stale lifecycle invocation returned an operation identity but did not automatically refresh stale evidence; repeated activation could also cross newly constructed registry instances.
- **Fix:** Added a controller-level synchronous lifecycle latch and one normal-plus-stale reconciliation path keyed by the retained operation identity.
- **Files modified:** `packages/web/src/stale-workspaces.ts`, `packages/web/src/app.ts`, `tests/service/web-stale-workspaces.test.ts`
- **Verification:** Rapid duplicate invocation submits once; reconciliation count and stale fetch count are each one.
- **Committed in:** `64876e9e`

**3. [Rule 1 - Bug] Disposed replaced overlays and preserved cancellation context**
- **Found during:** Post-task code review
- **Issue:** Replacing the stale overlay for an exclusive confirmation removed its DOM without notifying mounted subscriptions, leaving detached renderers active and losing the candidate action context.
- **Fix:** Added overlay close listeners, used the normal close path during replacement, invalidated stale requests on disposal, and retained current-revision volatile evidence/action context for reopen.
- **Files modified:** `packages/web/src/overlay-controller.ts`, `packages/web/src/stale-workspaces.ts`, `packages/web/src/app.ts`
- **Verification:** Overlay regression suites and focused stale focus tests pass.
- **Committed in:** `64876e9e`

**4. [Rule 1 - Bug] Replaced unsafe shared response capture with generation-safe mismatch retry**
- **Found during:** Post-task code review
- **Issue:** A shared `lastFetchedResponse` could be overwritten by a superseded request while revision recovery awaited authoritative reload.
- **Fix:** Added a controller generation guard and always discard/retry mismatched evidence after authoritative reload through the shared coordinator.
- **Files modified:** `packages/web/src/stale-workspaces.ts`, `tests/service/web-stale-workspaces.test.ts`
- **Verification:** Revision recovery and late-generation tests pass.
- **Committed in:** `64876e9e`

---

**Total deviations:** 4 auto-fixed (4 Rule 1 bugs)
**Impact on plan:** All fixes were required to satisfy the locked lifecycle, focus, and revision-safety contract; no new product scope or transport surface was added.

## Issues Encountered

- The initial focused RED failed because the planned web stale module did not yet exist, confirming the expected implementation boundary.
- Playwright CLI rejected direct `file:` navigation to the one-use launcher. Verification used a temporary loopback HTTP server only to serve the launcher document; product data continued over the existing pinned secure transport and no application HTTP path was introduced.
- The temporary verification runtime directory may remain at `/tmp/git-stacks-12707-0sJu6F`; it is outside the repository and contains no committed artifact.
- The requirements completion handler reported `STALE-01`, `STALE-02`, `STALE-04`, and `STALE-05` as not found even though they are present in `REQUIREMENTS.md`; no manual checkbox edit was substituted for the failed handler.

## Verification

- `GIT_STACKS_KEY_STORE=file npx vitest run tests/service/web-stale-workspaces.test.ts tests/service/web-workspace-actions.test.ts tests/service/web-keyboard-overlays.test.ts` - 59 tests passed.
- `npm run typecheck` - all workspaces passed.
- `npm run web:build` - passed.
- `npm run test:architecture` - package architecture passed.
- `git diff --check` - passed.
- Isolated live web session verified one visible singleton overlay, Refresh focus, Escape restoration to the exact toolbar invoker, 760px desktop geometry, and no horizontal overflow at a 320px viewport.

## Known Stubs

None. Stub-pattern matches were pre-existing state initializers, test harness defaults, or unrelated copy; no new stale-workspace UI path depends on empty/mock data.

## Threat Review

No unplanned threat surface was introduced. The web client calls existing secure-session RPC methods, renders strict browser-safe DTOs, and adds no endpoint, schema, HTTP product transport, browser storage, credential, path, argv, raw environment, or provider-output projection.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- The complete web stale-workspace surface is ready for Phase 127 cross-client verification and RC closure plans.
- Populated lifecycle confirmation visuals still require the broader Phase 127 live evidence pass; deterministic lifecycle, focus, disclosure, and responsive contracts are covered here.

## Self-Check: PASSED

- Created/modified files listed above exist.
- Task commits `9d6192fa`, `1096f6b0`, `d4c5ec40`, and `64876e9e` exist in Git history.
- Focused regression tests, full typecheck, web build, architecture gate, and patch whitespace checks passed.

---
*Phase: 127-stale-workspace-intelligence-and-rc-closure*
*Completed: 2026-07-17*
