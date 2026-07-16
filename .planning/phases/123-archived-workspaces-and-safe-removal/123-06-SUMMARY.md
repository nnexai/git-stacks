---
phase: 123-archived-workspaces-and-safe-removal
plan: "06"
subsystem: web-lifecycle
tags: [browser-projection, archive, remove, force-confirmation, authoritative-reconciliation]

requires:
  - phase: 123-archived-workspaces-and-safe-removal
    provides: Strict lifecycle contracts, catalog partitioning, terminal barriers, coordinator, and secure transport from Plans 02-05
provides:
  - Catalog-backed minimal archived browser projection and active-only signal visibility
  - One-step Archive with Undo plus a singleton identity/activity/Unarchive surface
  - Default-cancel Remove and dirty-only exact-name Force Remove flows
  - Exact replacement reconciliation for catalog, terminals, signals, selection, counts, and navigation
affects: [123-07-tui-lifecycle, 123-08-verification, 127-milestone-end-live-uat]

tech-stack:
  added: []
  patterns: [projection allowlist, single-attempt destructive intent, operation-id observation, replacement-set reconciliation]

key-files:
  created: []
  modified:
    - packages/service/src/web/projection.ts
    - packages/service/src/secure/router.ts
    - packages/web/src/app.ts
    - packages/web/src/app.css
    - tests/service/web-projection.test.ts
    - tests/service/web-presentation.test.ts

key-decisions:
  - "Browser lifecycle submission is attempted once; only the returned durable operation ID is observed afterward."
  - "Every lifecycle terminal state refreshes authoritative catalog, terminal, and signal replacement sets before presentation settles."
  - "The browser web.snapshot route consumes the aggregate catalog so archive-only and all-archived revisions never fall back to zero."

patterns-established:
  - "Lifecycle conflict or reconnect clears the current destructive flow, refreshes state, and requires a new invocation and confirmation."
  - "Browser archive rows are rendered only from id, name, and activity_at; no normal workspace actions or details are reachable from that surface."

requirements-completed: [ARCH-02, ARCH-03, ARCH-05, ARCH-06, REMOVE-01, REMOVE-03, REMOVE-05]

coverage:
  - id: D1
    description: "The browser receives aggregate active/archive state, bounded lifecycle progress/failures/results, and no path, secret, environment, repository-detail, or cross-principal terminal authority."
    requirement: ARCH-05
    verification:
      - kind: unit
        ref: "tests/service/web-projection.test.ts#PHASE123_RED web lifecycle contract"
        status: pass
      - kind: unit
        ref: "tests/service/web-projection.test.ts#allowlists operation progress, result, and error fields"
        status: pass
    human_judgment: false
  - id: D2
    description: "Web Archive is one-step and reversible, while archived rows remain a singleton minimal identity/activity/Unarchive surface."
    requirement: ARCH-02
    verification:
      - kind: automated_ui
        ref: "tests/service/web-presentation.test.ts#browser lifecycle presentation keeps destructive intent explicit and replaceable"
        status: pass
      - kind: other
        ref: "npm run web:build"
        status: pass
    human_judgment: false
  - id: D3
    description: "Remove defaults to cancel and only a typed dirty failure with stopped terminals can lead to a separately refreshed exact-name Force Remove intent."
    requirement: REMOVE-03
    verification:
      - kind: automated_ui
        ref: "tests/service/web-presentation.test.ts#browser lifecycle presentation keeps destructive intent explicit and replaceable"
        status: pass
      - kind: unit
        ref: "tests/service/web-presentation.test.ts#lifecycle contracts are strict, bounded, and force-specific"
        status: pass
    human_judgment: false
  - id: D4
    description: "Lifecycle completion and failure replace catalog, terminal views, signals, counts, navigation, and selection without destructive replay after stale state."
    requirement: REMOVE-05
    verification:
      - kind: automated_ui
        ref: "tests/service/web-presentation.test.ts#browser lifecycle presentation keeps destructive intent explicit and replaceable"
        status: pass
      - kind: unit
        ref: "tests/service/web-presentation.test.ts#shared successor order proves every tie tier independently"
        status: pass
    human_judgment: false

duration: 9 min
completed: 2026-07-16
status: complete
---

# Phase 123 Plan 06: Thin Web Lifecycle Surface Summary

**A path-minimal browser lifecycle surface with one-step archive Undo, locked dirty-only force removal, and authoritative replacement reconciliation**

## Performance

- **Duration:** 9 min
- **Started:** 2026-07-16T07:09:00Z
- **Completed:** 2026-07-16T07:17:45Z
- **Tasks:** 3
- **Files modified:** 6

## Accomplishments

- Projected the aggregate active/archive catalog, lifecycle phases/results/failures, and active-only signals through explicit browser allowlists.
- Added Archive, Undo/Unarchive, a minimal singleton archived surface, default-cancel Remove inventory, dirty blockers, and exact-name Force Remove.
- Submitted destructive intent only once and observed the accepted durable operation ID, clearing and refreshing on conflict or reconnect without automatic resubmission.
- Replaced dead terminal views and invalid selection/signals/counts/navigation from authoritative service results after lifecycle completion or failure.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add Wave 0 browser projection and presentation safety tests** - `71f48dc1` (test)
2. **Task 2: Project bounded lifecycle state and authoritative active-only signals** - `61c5f128` (feat)
3. **Task 3: Implement web archive, remove, force, and replacement reconciliation flows** - `5dcb42ea` (feat)

## Verification

- RED reached the exact `PHASE123_RED web lifecycle contract` sentinel through missing behavior, with no import, syntax, fixture, or environment failure.
- Focused web projection/presentation suites pass 13/13.
- Workspace typecheck passes for protocol, client, core, CLI, service, web, and TUI.
- Package dependency/cycle gate reports `Package architecture: OK`.
- Production browser assets build with `npm run web:build`.
- Automated/static evidence does not claim live browser focus, pointer, keyboard, modal, or terminal-rendering approval; that checklist remains at the Phase 127 milestone-end boundary before release side effects.

## Files Created/Modified

- `packages/service/src/web/projection.ts` - Aggregate catalog, typed lifecycle allowlists, and active-workspace signal filter.
- `packages/service/src/secure/router.ts` - Catalog-backed web snapshot route and active-only signal list/acknowledgement/event delivery.
- `packages/web/src/app.ts` - Lifecycle action surfaces, operation observation, confirmations, archive view, and replacement reconciliation.
- `packages/web/src/app.css` - Existing-token styling for lifecycle inventory, blockers, archive rows, actions, and Undo toast.
- `tests/service/web-projection.test.ts` - Exact-shape, encoded-negative, lifecycle, archive-empty, and signal-filter coverage.
- `tests/service/web-presentation.test.ts` - Static browser lifecycle, confirmation, successor, no-replay, and disposal contract.

## Decisions Made

- Used `operation.get` only after `operation.submit` returns an operation ID; transport loss before that boundary never causes browser resubmission.
- Reconciled all lifecycle terminal states, including partial terminal-cleanup failures, because service-side terminal state may have changed even when persisted workspace mutation failed.
- Kept the archive surface deliberately non-navigable: its rows expose only identity, formatted activity, and Unarchive.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical Integration] Route browser snapshots and signals through the new aggregate/active authority**
- **Found during:** Task 2
- **Issue:** `web.snapshot` still passed the legacy active-only `buildAll()` array, and router signal responses/events had no authoritative active-ID filter. Updating projection alone would leave archived summaries unavailable in the real browser and journal-backed archived signals visible.
- **Fix:** Used optional `buildCatalog()` at the web route with legacy fallback for embeddings, and filtered browser signal list, acknowledgement, and event delivery against current active workspace IDs while retaining journal records.
- **Files modified:** `packages/service/src/secure/router.ts`
- **Verification:** Focused projection and router operation suites, workspace typecheck, dependency gate, and web build pass.
- **Committed in:** `61c5f128`

---

**Total deviations:** 1 auto-fixed (1 missing critical integration). **Impact:** Required to make the planned projection effective in the actual secure browser route; no new endpoint, authority, or product scope was added.

## Issues Encountered

- The pre-implementation projection accepted only active arrays, so the RED archive fixture failed at the intended behavior boundary. The catalog signature and route were updated together.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan 07 can implement the TUI surface over the same lifecycle operation and successor contracts.
- Plan 08 can run full gates and cross-client automated lifecycle evidence.
- Live browser interaction remains explicitly assigned to the Phase 127 milestone-end manual checklist; this summary does not claim human browser approval.

## Self-Check: PASSED

- Task commits `71f48dc1`, `61c5f128`, and `5dcb42ea` exist in history.
- All six modified source/test files exist.
- All four coverage deliverables have current passing automated evidence.

---
*Phase: 123-archived-workspaces-and-safe-removal*
*Completed: 2026-07-16*
