---
phase: 43
plan: 1
subsystem: aerospace-wrappers
tags: [aerospace, shell-wrappers, testing, zod, tsv-parsing]
requires: []
provides: [src/lib/aerospace.ts, AerospaceCommands interface]
affects: []
tech-stack:
  added: []
  patterns: [injectable-exec, zod-tsv-validation, exponential-backoff-snapshot]
key-files:
  created:
    - src/lib/aerospace.ts
    - tests/lib/aerospace.test.ts
  modified: []
key-decisions:
  - Tab-split TSV parsing (not whitespace) to handle multi-word app names like "Google Chrome"
  - Platform gate as FIRST condition in isAerospaceRunning() before any subprocess call
  - Mirrored niri.ts structure exactly: _exec injection, Zod schemas, AerospaceCommands interface, snapshotWindowIds
requirements-completed: [WRAP-01, WRAP-02]
duration: 15 min
completed: "2026-03-28"
---

# Phase 43 Plan 1: AeroSpace Shell Wrappers & Tests Summary

9 typed async CLI wrappers in src/lib/aerospace.ts with injectable _exec, TSV parsing via tab-split, Zod validation, and snapshotWindowIds with exponential backoff — 25 unit tests covering edge cases, all passing on Linux CI.

**Duration:** 15 min | **Tasks:** 4 | **Files:** 2

## What Was Built

- `src/lib/aerospace.ts`: 9 exported functions (`isAerospaceRunning`, `getVersion`, `listWindows`, `listWorkspaces`, `moveNodeToWorkspace`, `focusWindow`, `setLayout`, `flattenWorkspaceTree`, `snapshotWindowIds`) with `AerospaceCommands` interface, `AerospaceCmdResult` type, `SnapshotOpts` type, injectable `_exec`
- `tests/lib/aerospace.test.ts`: 25 tests covering TSV parsing (multi-word app names, empty output, malformed rows, boolean parsing), action wrappers (capturedArgs verification), snapshotWindowIds backoff, and AerospaceCommands interface structural check

## Verification

- `bun test tests/lib/aerospace.test.ts` — 25 pass, 0 fail
- `bun run typecheck` — no errors
- `bun run test` — full suite passes (no mock pollution)
- `isAerospaceRunning()` returns false on Linux without spawning subprocess
- Tab-split correctly parses "Google Chrome" as single appName field

## Next

Ready for Plan 43-02: Doctor AeroSpace Binary Check (already complete).
