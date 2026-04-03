---
phase: 56-doctor-config-polish
plan: 01
subsystem: cli
tags: [doctor, integrations, tmux, completions, config]

# Dependency graph
requires: []
provides:
  - Conditional forge CLI checks in doctor (only when integration is enabled)
  - Practical tmux pane layout example in configExample
affects: [doctor, tmux-integration]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "resolveEnabledGlobally used to gate forge CLI checks in doctor"
    - "Data-driven loop over forgeClis array for DRY integration checks"

key-files:
  created: []
  modified:
    - src/commands/doctor.ts
    - src/lib/integrations/tmux.ts

key-decisions:
  - "Forge CLI checks gated by resolveEnabledGlobally(integrationId, false, config) — false default means unconfigured integrations are skipped"
  - "Data-driven forgeClis array replaces four unconditional individual checks for DRY code"

patterns-established:
  - "Integration-gated doctor checks: use resolveEnabledGlobally with enabledByDefault=false to skip checks for unconfigured integrations"

requirements-completed: [DOC-01, CFG-01]

# Metrics
duration: 5min
completed: 2026-04-02
---

# Phase 56 Plan 01: Conditional Forge CLI Checks and Tmux Config Example Summary

**Forge CLI doctor checks gated by integration config (resolveEnabledGlobally), and tmux configExample updated with 3-pane dev layout showing editor, test runner, and dev server**

## Performance

- **Duration:** 5 min
- **Started:** 2026-04-02T05:50:00Z
- **Completed:** 2026-04-02T05:52:27Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Doctor no longer warns about missing `gh`, `glab`, `tea`, or `jira` when those forge integrations are not configured in global config
- Replaced four unconditional forge CLI checks with a data-driven loop over a `forgeClis` array, gated by `resolveEnabledGlobally`
- Tmux `configExample` now demonstrates a practical 3-pane layout: main editor pane, right split for test runner, down split with `focus: true` for dev server

## Task Commits

Each task was committed atomically:

1. **Task 1: Make forge CLI checks conditional on integration config** - `60d3be0` (feat)
2. **Task 2: Update tmux configExample with practical pane layout** - `15520b1` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified
- `src/commands/doctor.ts` - Added `resolveEnabledGlobally` import; replaced 4 unconditional forge checks with data-driven loop
- `src/lib/integrations/tmux.ts` - Expanded `configExample` string to show 3-pane layout with direction, surfaces, command, and focus fields

## Decisions Made
- `resolveEnabledGlobally(integrationId, false, config)` with `enabledByDefault=false` means unconfigured integrations are skipped — consistent with all forge integrations having `enabledByDefault: false`
- Data-driven `forgeClis` array is DRY and extensible — adding a new forge integration only requires adding one entry

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 56 (Doctor & Config Polish) complete — ready for Phase 57 (Release Audit)
- All forge integration doctor checks now respect user configuration

---
*Phase: 56-doctor-config-polish*
*Completed: 2026-04-02*
