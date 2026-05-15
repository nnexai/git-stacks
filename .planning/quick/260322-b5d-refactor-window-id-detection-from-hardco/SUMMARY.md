---
status: complete
phase: quick
plan: 260322-b5d
subsystem: integrations
tags: [refactor, window-detection, niri, decoupling, tdd]
dependency_graph:
  requires: []
  provides: [WindowDetector interface, generic windowIds in WindowArtifact, runner detector wrapping]
  affects: [src/lib/integrations/types.ts, src/lib/integrations/runner.ts, src/lib/integrations/niri.ts, src/lib/integrations/vscode.ts, src/lib/integrations/intellij.ts]
tech_stack:
  added: []
  patterns: [WindowDetector begin/resolve, DetectorSnapshot opaque type, runner-driven detection]
key_files:
  created: [tests/lib/integrations/window-detector.test.ts]
  modified:
    - src/lib/integrations/types.ts
    - src/lib/integrations/runner.ts
    - src/lib/integrations/niri.ts
    - src/lib/integrations/vscode.ts
    - src/lib/integrations/intellij.ts
    - tests/lib/integrations/niri.test.ts
    - tests/lib/integrations/artifacts.test.ts
decisions:
  - "WindowDetector.begin() called before every integration's open() — runner captures pre-spawn snapshot for each integration, not just window-producing ones (simplicity over optimization)"
  - "resolve() inlines the polling loop from snapshotWindowIds rather than calling snapshotWindowIds with empty spawnFn — cleaner separation of begin/resolve phases"
  - "artifacts.test.ts niri mock removed entirely — vscode/intellij no longer import from niri.ts"
metrics:
  duration: ~8 minutes
  completed: 2026-03-22T07:18:32Z
  tasks_completed: 2
  files_modified: 7
---

# Phase quick Plan 260322-b5d: Refactor Window ID Detection Summary

**One-liner:** Replaced hardcoded `niriWindowIds` field with a generic `WindowDetector` interface so any WM integration can detect window IDs without vscode/intellij knowing about the WM.

## What Was Built

### WindowDetector Interface (types.ts)

Added `DetectorSnapshot` opaque type and `WindowDetector` interface with `begin()`/`resolve()` methods. Replaced `WindowArtifact.niriWindowIds?: number[]` with `windowIds?: Record<string, number[]>`. Added optional `windowDetector?: WindowDetector` to `Integration` interface.

### Runner Integration (runner.ts)

`runIntegrations()` now collects `WindowDetector` instances from all enabled integrations before the main loop. For each integration, runner calls `begin()` on all detectors before `open()`, and `resolve()` after if a `WindowArtifact` is returned. Results merged into `artifact.windowIds` keyed by detector id.

### Niri WindowDetector (niri.ts)

`niriIntegration` now exposes a `windowDetector` property:
- `begin()` — calls `isNiriRunning()` and `listNiriWindows()` to capture current window ID set
- `resolve()` — polls `listNiriWindows()` with exponential backoff, diffs against the snapshot, returns new IDs

Internal column-window detection (`snapshotWindowIds` for `app:`/`command:` windows) unchanged — those are spawned inside niri's own `open()` and detected internally as before.

Updated `artifact.niriWindowIds` references in `open()` to `artifact.windowIds?.["niri"]`.

### vscode.ts and intellij.ts

Removed all imports from `"../niri"`. Removed niri-specific branching (`if (niriActive) { ... } else { ... }`). The `open()` method now simply spawns the process and returns a plain `WindowArtifact`. Detection is runner's responsibility.

### Tests

- Added `tests/lib/integrations/window-detector.test.ts` (12 tests) covering the interface contract and runner integration via TDD
- Updated `niri.test.ts`: all bag fixtures using `niriWindowIds` updated to `windowIds: { niri: [...] }`
- Updated `artifacts.test.ts`: removed `@/lib/niri` mock (no longer needed by vscode/intellij)

## Verification Results

1. `bun run typecheck` — PASS (no type errors)
2. `bun test tests/lib/integrations/` — 83 pass, 0 fail
3. `grep -r "niriWindowIds" src/` — zero matches (fully removed)
4. `grep -r "from.*\.\./niri" src/lib/integrations/vscode.ts src/lib/integrations/intellij.ts` — zero matches
5. `grep "windowDetector" src/lib/integrations/niri.ts` — found (detector implemented)
6. `grep "WindowDetector" src/lib/integrations/types.ts` — found (interface defined)

## Deviations from Plan

**None for Task 2.** Task 1 and Task 2 were implemented together because the type change (`niriWindowIds` → `windowIds`) caused compile errors in vscode.ts and intellij.ts that had to be fixed as part of getting typecheck to pass. This was expected — the plan acknowledged both files would change in Task 2, and the implementation was done in the correct logical sequence.

**TDD adjustments:** The initial test assertion `expect(mockBegin.mock.calls.length).toBe(1)` was corrected to `toBe(3)` after clarifying the design: `begin()` is called before every integration's open() (not just window-producing ones), for correctness and simplicity. The test name was updated to reflect the correct behavior.

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 (TDD) | 5156cb9 | WindowDetector interface, runner wrapping, niri detector, vscode/intellij decoupling |
| 2 | 9b38920 | Update niri.test.ts and artifacts.test.ts assertions |

## Self-Check: PASSED

- SUMMARY.md: FOUND
- Commit 5156cb9 (Task 1): FOUND
- Commit 9b38920 (Task 2): FOUND
