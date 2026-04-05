---
phase: 71-observability
plan: 02
subsystem: observability
tags: [observability, debug, stderr, status, testing]
requires: [71-01]
provides:
  - labeled timing wrappers across the extracted workspace domain modules
  - stderr-only debug coverage for human and JSON status output
  - a best-effort manage smoke check showing no stderr debug leakage before timeout
affects: [status, sync, push, pull, yaml-editors, lifecycle-commands, manage]
tech-stack:
  added: []
  patterns: [shared timeOperation wrappers, stderr-only debug tests, logical domain labels]
key-files:
  modified:
    - src/lib/observability.ts
    - src/lib/workspace-env.ts
    - src/lib/workspace-status.ts
    - src/lib/workspace-git.ts
    - src/lib/workspace-yaml.ts
    - src/lib/workspace-lifecycle.ts
    - tests/commands/status-json.test.ts
  created:
    - tests/commands/debug-output.test.ts
key-decisions:
  - "Instrumentation stays inside domain modules and never routes through progress callbacks or JSON payloads."
  - "syncWorkspace logs meaningful substeps for fetch, conflict detection, apply-strategy, and stash restore without changing result payloads."
  - "The manage path remains a manual verification item, but a non-interactive smoke run showed zero stderr bytes under GIT_STACKS_DEBUG=1 before timeout."
requirements-completed: [OBSV-01, OBSV-02, OBSV-03, OBSV-04]
requirements-pending-human: [OBSV-05]
duration: 18 min
completed: 2026-04-05
---

# Phase 71 Plan 02: Observability Domain Instrumentation Summary

## Accomplishments

- Wrapped the extracted workspace domain modules with `timeOperation()` using the required logical labels: `workspace-env`, `workspace-status`, `workspace-git`, `workspace-yaml`, and `workspace-lifecycle`.
- Added high-signal debug substeps for secret resolution, status dirty/ahead-behind work, and sync fetch/conflict/apply/stash flows.
- Added end-to-end command coverage proving `status` debug stays on `stderr`, `status --json` remains parseable, and normal runs keep `stderr` empty.

## Task Commits

1. **Task 1: Instrument extracted domain modules with logical labels and timing** - `0512baec` (`feat`)
2. **Task 2: Add end-to-end stderr/debug regression tests for status and JSON safety** - `ac2968f4` (`test`)

## Verification

- `bun test tests/lib/observability.test.ts tests/commands/debug-output.test.ts tests/commands/status-json.test.ts` — pass
- `bun run typecheck` — pass
- `bun run test` — pass (`Unit tests: PASS`, `Integration tests: 41/41 passed`)
- `timeout 2s env GIT_STACKS_DEBUG=1 bun run src/index.ts manage` — timed out as expected for the TUI, wrote `4715` bytes to stdout and `0` bytes to stderr

## Notes

- `src/lib/observability.ts` gained overloads for `timeOperation()` so sync wrappers remain type-safe after the new instrumentation.
- The `manage` path still merits an interactive human check on a real terminal surface, but the smoke run found no pre-TUI debug leakage on `stderr`.

---
*Phase: 71-observability*
*Completed: 2026-04-05*
