---
phase: quick
plan: 260403-j1s
subsystem: tui/dashboard
tags: [opentui, typescript, api-migration]
dependency_graph:
  requires: []
  provides: [clean-typecheck]
  affects: [src/tui/dashboard/run.tsx]
tech_stack:
  added: []
  patterns: [opentui-screenMode-api]
key_files:
  created: []
  modified:
    - src/tui/dashboard/run.tsx
    - CLAUDE.md
decisions:
  - "Use screenMode: \"alternate-screen\" (string enum) as the replacement for the removed boolean useAlternateScreen: true in CliRendererConfig"
metrics:
  duration: ~3min
  completed: 2026-04-03
  tasks_completed: 1
  files_changed: 2
---

# Quick Task 260403-j1s: Fix useAlternateScreen TS Error After OpenTUI Upgrade

**One-liner:** Migrated `useAlternateScreen: true` to `screenMode: "alternate-screen"` in the dashboard render config to fix TS2353 error from @opentui/core 0.1.87 -> 0.1.96 upgrade.

## What Was Done

Single-property rename in `src/tui/dashboard/run.tsx` line 71: the `useAlternateScreen` boolean property was removed from `CliRendererConfig` in @opentui/core 0.1.96 and replaced by `screenMode: ScreenMode` where `ScreenMode = "alternate-screen" | "main-screen" | "split-footer"`.

Also updated the version references in `CLAUDE.md` from 0.1.87 to 0.1.96 for both `@opentui/core` and `@opentui/solid`.

## Verification

- `bun run typecheck` exits 0 with zero errors
- `bun run test` passes: 480 unit tests + 37 integration test files, all green

## Deviations from Plan

None - plan executed exactly as written.

## Commits

| Task | Commit | Message |
|------|--------|---------|
| Task 1 | 27b8cb6 | fix: replace useAlternateScreen with screenMode for OpenTUI 0.1.96 API |

## Self-Check: PASSED

- src/tui/dashboard/run.tsx: FOUND (modified, contains `screenMode: "alternate-screen"`)
- CLAUDE.md: FOUND (modified, version updated to 0.1.96)
- Commit 27b8cb6: FOUND
