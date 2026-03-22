---
phase: 20-niri-integration
plan: 01
subsystem: integrations
tags: [niri, wayland, compositor, window-management, integration-plugin]

# Dependency graph
requires:
  - phase: 19-niri-shell-wrappers
    provides: isNiriRunning, listNiriWorkspaces, listNiriWindows, setNiriWorkspaceName, moveWindowToWorkspace, focusNiriWorkspace
  - phase: 16-artifact-type-foundation
    provides: Integration interface, ArtifactBag, IntegrationArtifact, WindowArtifact with pid field
  - phase: 18-artifact-population
    provides: vscode/intellij return WindowArtifact with PID for downstream consumption
provides:
  - niri compositor integration plugin at src/lib/integrations/niri.ts
  - niriIntegration registered in src/lib/integrations/index.ts as tier-3 (order 30)
  - 13 unit tests covering all NIRI requirements with fully mocked niri.ts
affects: [future-window-management-integrations, integration-runner]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Tier-3 integration pattern: consumer-only, no generate(), always returns null"
    - "NIRI_SOCKET gate: isNiriRunning() silent early-return before spinner start"
    - "Idempotent workspace creation: query-before-create pattern with listNiriWorkspaces"
    - "PID-based window moves with nullable guard (w.pid != null) for NiriWindow.pid"
    - "Partial failure tolerance: moveWindowToWorkspace wrapped in try/catch, continues on error"
    - "mock.module + cache-busting (?niri-integration-test) for isolation in bun test"

key-files:
  created:
    - src/lib/integrations/niri.ts
    - tests/lib/integrations/niri.test.ts
  modified:
    - src/lib/integrations/index.ts

key-decisions:
  - "Niri integration returns null always (tier-3 consumer, not producer) — no NiriArtifact type needed"
  - "No cleanup on remove (NIRI-05 intentionally unimplemented per user decision)"
  - "configurePrompt returns { enabled: true } only — no commands array prompts in v0.6.0"
  - "Window move failure continues (try/catch + p.log.warn) rather than aborting integration"
  - "Spinner started AFTER isNiriRunning gate — silent return when niri not present"

patterns-established:
  - "Tier-3 integration: order 30, enabledByDefault false, no generate(), always returns null"
  - "All niri IPC goes through src/lib/niri.ts — never direct calls in integrations"
  - "Consumer integrations use ArtifactBag to find prior window PIDs for window management"

requirements-completed: [NIRI-01, NIRI-02, NIRI-03, NIRI-04, NIRI-05, NIRI-08, NIRI-09, TEST-04]

# Metrics
duration: 3min
completed: 2026-03-22
---

# Phase 20 Plan 01: niri-integration Summary

**Niri compositor integration plugin (tier-3, order 30) that arranges workspace windows on a dedicated named niri workspace using PID matching from the ArtifactBag**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-03-22T04:44:15Z
- **Completed:** 2026-03-22T04:46:37Z
- **Tasks:** 2
- **Files modified:** 3 (1 created, 1 created, 1 modified)

## Accomplishments

- Implemented `src/lib/integrations/niri.ts` with full Integration interface: NIRI_SOCKET gate, idempotent named workspace creation, PID-based window moving from artifact bag, user-configured commands via runHooks
- Registered `niriIntegration` in `src/lib/integrations/index.ts` as tier-3 (order 30, enabledByDefault false)
- Created 13 unit tests in `tests/lib/integrations/niri.test.ts` covering all 6 requirement groups: gate, workspace create, focus idempotency, window moves (PID match, no-match, null-pid, failure tolerance), user commands, and registration metadata
- Full test suite: 438 tests pass, 0 failures

## Task Commits

Each task was committed atomically:

1. **Task 1: Create niri integration plugin and register in index.ts** - `8fe0b17` (feat)
2. **Task 2: Create niri integration test suite** - `7f0494e` (test)

## Files Created/Modified

- `src/lib/integrations/niri.ts` - Niri compositor integration plugin implementing Integration interface with all four sequential steps
- `src/lib/integrations/index.ts` - Added niriIntegration import and appended to integrations array
- `tests/lib/integrations/niri.test.ts` - 13 unit tests with mock.module for @/lib/niri, @clack/prompts, and @/lib/lifecycle

## Decisions Made

- Niri integration always returns `null` — tier-3 integrations are consumers of artifacts, not producers. No NiriArtifact type needed.
- NIRI-05 (cleanup on remove) intentionally not implemented per prior user decision — no remove/cleanup method added.
- `configurePrompt()` returns `{ enabled: true }` only — no interactive prompts for the `commands` array in v0.6.0.
- Window move failures (`moveWindowToWorkspace` throws) are logged as warnings and execution continues — partial failure is acceptable.
- Spinner is started only AFTER the `isNiriRunning()` gate — niri users on non-niri sessions see no output at all.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- v0.6.0 milestone complete: all 5 phases (16-20) implemented
- Niri integration is ready for real-world use: enable with `git-stacks config` and set `integrations.niri.enabled: true` in `~/.config/git-stacks/config.yml`
- Optional: add `integrations.niri.commands` array to execute custom commands after workspace setup
- No blockers for next milestone

## Self-Check: PASSED

- `src/lib/integrations/niri.ts` exists with niriIntegration export
- `src/lib/integrations/index.ts` contains niriIntegration in integrations array
- `tests/lib/integrations/niri.test.ts` exists with 13 tests
- Commits 8fe0b17 and 7f0494e verified in git log
- bun run typecheck: PASS
- bun test tests/: 438 pass, 0 fail

---
*Phase: 20-niri-integration*
*Completed: 2026-03-22*
