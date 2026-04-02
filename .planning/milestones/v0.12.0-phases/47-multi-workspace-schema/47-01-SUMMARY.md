---
phase: 47-multi-workspace-schema
plan: 01
subsystem: integrations
tags: [zod, aerospace, schema, validation]

requires:
  - phase: 45-layout-control-app-launching
    provides: flat aerospaceConfigSchema with layout/normalization/commands fields
provides:
  - workspaces array schema replacing flat config
  - validateAerospaceConfig() exported function
  - SnapshotOpts.beforeSet for cross-entry isolation
affects: [48-multi-workspace-loop, aerospace]

tech-stack:
  added: []
  patterns: [post-parse validation with thrown errors, array-of-entries schema pattern]

key-files:
  created: []
  modified:
    - src/lib/integrations/aerospace.ts
    - src/lib/aerospace.ts

key-decisions:
  - "Breaking change — workspaces array replaces flat workspace field, no backward compat"
  - "validateAerospaceConfig() is a separate exported function, not Zod .superRefine"
  - "open() reads from workspaces[0] temporarily until Phase 48 adds the loop"

patterns-established:
  - "Array-of-entries schema pattern: top-level config holds enabled + array of independently validated entries"
  - "Post-parse validation for cross-entry constraints (focus uniqueness, duplicate names)"

requirements-completed: [SCHEMA-01, SCHEMA-02, SCHEMA-03, SCHEMA-04]

duration: 5min
completed: 2026-03-29
---

# Plan 47-01: Multi-Workspace Schema, Validation, and beforeSet Summary

**Replaced flat AeroSpace config with workspaces array schema, added focus/duplicate validation, and extended snapshotWindowIds with beforeSet filtering**

## Performance

- **Duration:** 5 min
- **Tasks:** 4
- **Files modified:** 2

## Accomplishments
- Replaced flat aerospaceConfigSchema with workspaces array where each entry carries workspace, layout, normalization, flatten_before_open, focus, and commands
- Added exported validateAerospaceConfig() that checks focus-uniqueness and duplicate workspace names with plain-English error messages
- Extended SnapshotOpts with beforeSet field and updated snapshotWindowIds() to filter accumulated IDs from prior entries
- Updated open() config parsing to read from workspaces[0] (Phase 48 loop prep)

## Task Commits

1. **Task 1-4 (combined):** `4808dcf` (feat: replace flat config with workspaces array schema)

## Files Created/Modified
- `src/lib/integrations/aerospace.ts` — New workspaces array schema, validateAerospaceConfig(), updated open() parsing
- `src/lib/aerospace.ts` — SnapshotOpts.beforeSet, snapshotWindowIds() beforeSet filtering

## Decisions Made
- Breaking change: no backward compat with flat schema (per D-01)
- validateAerospaceConfig() exported separately for reuse from open() and doctor
- open() reads workspaces[0] temporarily; Phase 48 will add the multi-entry loop

## Deviations from Plan
None - plan executed exactly as written

## Issues Encountered
None

## Next Phase Readiness
- Schema ready for Phase 48 multi-workspace loop
- beforeSet enables cross-entry snapshot isolation in Phase 48

---
*Phase: 47-multi-workspace-schema*
*Completed: 2026-03-29*
