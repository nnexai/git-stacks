---
phase: 18-artifact-population
plan: 01
subsystem: integrations
tags: [bun, tmux, cmux, vscode, intellij, artifacts, TDD]

requires:
  - phase: 16-artifact-type-foundation
    provides: TmuxArtifact, CmuxArtifact, WindowArtifact type definitions and ArtifactBag type
  - phase: 17-integration-runner
    provides: runner.ts that accumulates ArtifactBag from open() return values

provides:
  - tmux open() returns TmuxArtifact with sessionName on success, null on error
  - cmux open() returns CmuxArtifact with workspaceRef on success, null on error
  - vscode open() returns WindowArtifact with pid/app_id/title on success via Bun.spawn, null on error or missing binary
  - intellij open() returns WindowArtifact with pid/app_id/title on success via Bun.spawn, null on error or missing binary
  - Unit tests verifying artifact shapes and error handling for all four integrations

affects:
  - 20-niri-integration (reads tmux sessionName and window PIDs from ArtifactBag)

tech-stack:
  added: []
  patterns:
    - "Integration open() uses Bun.spawn (not Bun.$) for process launch to capture PID in WindowArtifact"
    - "Artifact return restructures try/catch — success return inside try, catch returns null explicitly, no trailing return null after try/catch"
    - "spyOn(Bun, 'spawn') used in tests for Bun global mocking (not mock.module('bun')) — simpler and reliable"
    - "vscode uses cmd.split('/').at(-1) ?? cmd to derive app_id from binary path"

key-files:
  created:
    - tests/lib/integrations/artifacts.test.ts
  modified:
    - src/lib/integrations/tmux.ts
    - src/lib/integrations/cmux.ts
    - src/lib/integrations/vscode.ts
    - src/lib/integrations/intellij.ts

key-decisions:
  - "Bun.spawn used instead of Bun.$ for IDE launches — Bun.$ is async and blocks until process exits, Bun.spawn returns immediately with pid for artifact"
  - "app_id for vscode derived from cmd basename (cmd.split('/').at(-1)) — preserves user-configured cmd name (code, code-insiders, or custom path)"
  - "intellij app_id hardcoded as 'idea' — IntelliJ always launched as 'idea' binary"
  - "Test for vscode uses 'sh' binary (always available on Linux) to test success path without mocking Bun.$ shell"

patterns-established:
  - "Integration open() TDD pattern: write failing tests expecting real artifacts, then implement — RED then GREEN"

requirements-completed: [ART-01, ART-02, ART-03, ART-04]

duration: 3min
completed: 2026-03-21
---

# Phase 18 Plan 01: Artifact Population Summary

**All four integrations (tmux, cmux, vscode, intellij) now return real typed IntegrationArtifact values from open() instead of null — ArtifactBag is populated for Phase 20 niri consumption**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-03-21T23:22:37Z
- **Completed:** 2026-03-21T23:24:58Z
- **Tasks:** 2 (TDD: RED + GREEN)
- **Files modified:** 5

## Accomplishments

- tmux.ts: open() now returns `{ kind: "tmux", sessionName: ctx.workspace.name }` after focusTmuxSession — catch returns null
- cmux.ts: open() now returns `{ kind: "cmux", workspaceRef: ref }` after spinner.stop — catch returns null
- vscode.ts: Switched from `Bun.$` (blocking) to `Bun.spawn` for IDE launch, returns `{ kind: "window", pid: proc.pid, app_id, title: "" }`
- intellij.ts: Same pattern as vscode — Bun.spawn for launch, returns WindowArtifact with `app_id: "idea"`
- Test file `tests/lib/integrations/artifacts.test.ts` with 10 tests covering all artifact shapes and error paths

## Task Commits

1. **Task 1: Create artifact test file (TDD RED)** - `08ebbc1` (test)
2. **Task 2: Update all four integrations to return real artifacts (TDD GREEN)** - `7a0ad6e` (feat)

## Files Created/Modified

- `tests/lib/integrations/artifacts.test.ts` - Unit tests for all four integration artifact return values (10 tests)
- `src/lib/integrations/tmux.ts` - Return `TmuxArtifact` on success; restructured try/catch
- `src/lib/integrations/cmux.ts` - Return `CmuxArtifact` on success; restructured try/catch
- `src/lib/integrations/vscode.ts` - Replace `Bun.$` launch with `Bun.spawn`; return `WindowArtifact`
- `src/lib/integrations/intellij.ts` - Replace `Bun.$` launch with `Bun.spawn`; return `WindowArtifact`

## Decisions Made

- **Bun.spawn vs Bun.$ for IDE launch**: `Bun.$` runs the process and awaits completion (blocking), giving no PID. `Bun.spawn` returns a process handle immediately with `.pid`, which is what WindowArtifact needs. Switched both vscode and intellij to `Bun.spawn`.
- **Test strategy for Bun globals**: Used `spyOn(Bun, "spawn")` rather than `mock.module("bun", ...)` — spyOn works reliably on global properties; mock.module for "bun" is more complex and doesn't intercept globals cleanly.
- **vscode success-path test**: Used `sh` binary (always present on Linux) instead of `code-insiders` — guarantees `which sh` exits 0 so the test exercises the real artifact-return branch.

## Deviations from Plan

None — plan executed exactly as written. The plan's alternative approaches for testing (spyOn vs mock.module) were anticipated; spyOn was the right choice and worked immediately.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- ArtifactBag is now populated with real artifacts when integrations run
- Phase 19 (niri-shell-wrappers) proceeds independently
- Phase 20 (niri integration) can read `bag["tmux"].sessionName` and `bag["vscode"].pid` from the accumulated bag
- Full test suite passes (399 tests, 0 failures)

## Self-Check: PASSED

All created/modified files verified present. All task commits verified in git log.

---
*Phase: 18-artifact-population*
*Completed: 2026-03-21*
