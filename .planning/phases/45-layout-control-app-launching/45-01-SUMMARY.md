---
phase: 45
plan: 1
title: Extend AeroSpace Integration with Layout, Commands, and Focus
subsystem: integrations/aerospace
tags: [aerospace, layout, commands, focus, window-management]

requires: [44-02-SUMMARY.md]
provides: [LAYOUT-01, LAYOUT-02, LAYOUT-03, LAYOUT-04, LAUNCH-01, LAUNCH-02]
affects: [src/lib/integrations/aerospace.ts]

tech-stack:
  added: []
  patterns: [snapshotWindowIds for new window detection, expandVars for env substitution, shellQuote for path safety]

key-files:
  created: []
  modified:
    - src/lib/integrations/aerospace.ts

key-decisions:
  - "Layout application (both normalization paths): focus a window in target workspace → setLayout(layout); normalization field reflects AeroSpace tree management preference, not a different layout command"
  - "Workspace focus via _exec.run(['workspace', targetWorkspace]) — direct CLI call, no wrapper needed"
  - "App launching uses macOS `open -a AppName` via Bun.spawn; command launching uses `sh -c`; both detected via snapshotWindowIds"
  - "normalization defaults to true (parsedConfig.normalization !== false) — absent field → true"

requirements-completed: [LAYOUT-01, LAYOUT-02, LAYOUT-03, LAYOUT-04, LAUNCH-01, LAUNCH-02]

duration: "8 min"
completed: "2026-03-28"
---

# Phase 45 Plan 1: Extend AeroSpace Integration with Layout, Commands, and Focus Summary

Extended `src/lib/integrations/aerospace.ts` with layout control (h_tiles/v_tiles/h_accordion/v_accordion), flatten-before-open, a 7-field commands array for launching apps/shell commands/bag sources, and workspace focus switching.

**Duration:** ~8 min | **Tasks:** 2 | **Files changed:** 1

## What Was Built

- `aerospaceCommandSchema`: 7 fields (app, command, source, repo, cwd, args, focus)
- Extended `aerospaceConfigSchema`: added layout (enum), normalization (bool, default true), flatten_before_open (bool), focus (bool), commands (array)
- New imports: `focusWindow`, `setLayout`, `flattenWorkspaceTree`, `snapshotWindowIds`, `_exec`
- `shellQuote` helper for safe path interpolation
- Rewrote `open()` with 5-step sequence:
  1. Flatten workspace tree (if `flatten_before_open: true`)
  2. Move bag windows (Phase 44 DETECT-02 logic, preserved)
  3. Launch commands (app → `open -a`, command → `sh -c`, source → ArtifactBag lookup)
  4. Apply layout (focus target window → `setLayout(layout)`)
  5. Focus: window-level (`focusWindow`) + workspace-level (`_exec.run(["workspace", ...])`)

## Task Outcomes

| Task | Status | Commit |
|------|--------|--------|
| T1: Extend config schema | Done | 9a1edff |
| T2: Rewrite open() | Done | 9a1edff |

## Verification

- `bun run typecheck` exits 0
- `aerospaceCommandSchema` / `aerospaceConfigSchema` fields verified via grep
- All 5 execution steps present in open()

## Issues Encountered

None

## Next

Ready for 45-02 (tests)

## Self-Check: PASSED
