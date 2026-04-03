---
phase: 43
plan: 2
subsystem: doctor
tags: [aerospace, doctor, binary-check, macos-gated]
requires: [src/lib/aerospace.ts]
provides: [doctor aerospace binary check]
affects: [src/commands/doctor.ts]
tech-stack:
  added: []
  patterns: [platform-gated-check]
key-files:
  created: []
  modified:
    - src/commands/doctor.ts
key-decisions:
  - Inline platform guard (Option A from research) — simplest, no schema extension needed
  - warn-level (not fail) — AeroSpace is optional, not required for core functionality
  - Entity string "aerospace" (kebab-case, matches existing entries)
requirements-completed: [WRAP-03]
duration: 5 min
completed: "2026-03-28"
---

# Phase 43 Plan 2: Doctor AeroSpace Binary Check Summary

macOS-gated `aerospace` binary check added to `git-stacks doctor` — warn-level issue with install link if not found; silently skipped on Linux/Windows.

**Duration:** 5 min | **Tasks:** 1 | **Files:** 1

## What Was Built

- `src/commands/doctor.ts`: Added `if (process.platform === "darwin")` block after jira check that calls `checkBinary("aerospace")` and pushes warn-level issue with GitHub install link

## Verification

- `bun run typecheck` — no errors
- `bun run src/index.ts doctor --json | grep -c aerospace` returns 0 on Linux
- Platform gate prevents any subprocess call on non-macOS

## Issues Encountered

None.

## Next

Phase 43 complete. Ready for Phase 44: Core Integration Plugin.
