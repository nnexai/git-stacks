---
gsd_state_version: 1.0
milestone: v0.7.0
milestone_name: Close Command & Polish
status: unknown
stopped_at: Completed 24-01-PLAN.md — _exec injection for tmux.ts, cmux.ts, lifecycle.ts
last_updated: "2026-03-22T12:48:43.547Z"
progress:
  total_phases: 7
  completed_phases: 4
  total_plans: 5
  completed_plans: 5
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-22)

**Core value:** One command takes you from "I need to work on feature X" to a fully running dev environment — right repos, right branches, right IDE/terminal open, hooks run — without manual steps.
**Current focus:** Phase 24 — mock-architecture-refactor

## Current Position

Phase: 24 (mock-architecture-refactor) — EXECUTING
Plan: 2 of 2

## Performance Metrics

**Velocity:**

- Total plans completed: 0 (this milestone)
- Average duration: —
- Total execution time: —

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| - | - | - | - |

## Accumulated Context

*Carried from v0.6.0:*

| Phase 16-artifact-type-foundation P01 | 2 | 2 tasks | 7 files |
| Phase 17-integration-runner P01 | 15 | 2 tasks | 8 files |
| Phase 17-integration-runner P02 | 5 | 1 tasks | 4 files |
| Phase 18-artifact-population P01 | 3 | 2 tasks | 5 files |
| Phase 19-niri-shell-wrappers P01 | 9min | 2 tasks | 2 files |
| Phase 20 P01 | 3min | 2 tasks | 3 files |
| Phase 21-workspace-close-command P01 | 6min | 2 tasks | 8 files |
| Phase 22-niri-display-fix P01 | 2min | 2 tasks | 6 files |
| Phase 23-test-environment-isolation P01 | 7min | 2 tasks | 4 files |
| Phase 24-mock-architecture-refactor P02 | 8min | 2 tasks | 18 files |
| Phase 24-mock-architecture-refactor P01 | 12min | 2 tasks | 6 files |

### Decisions

- [Phase 20]: No cleanup on workspace remove — user manages niri workspace lifecycle manually; close command fills this gap
- [Phase 19]: Injectable `_exec` for niri test isolation — Bun built-in modules can't be mocked via mock.module
- [Phase 16-18]: ArtifactBag as Record<string, artifact | null> — niri reads bag values without mutation
- [Phase 21-workspace-close-command]: closeWorkspace preserves worktrees and YAML — non-destructive, open works immediately after
- [Phase 21-workspace-close-command]: No confirmation prompt for close (non-destructive) — same UX pattern as open, x shortcut in TUI after Open entry
- [Phase 22-niri-display-fix]: formatConfigValue: niri columns detected by presence of 'windows' key on every array element — no niri-specific import needed in configUtils
- [Phase 23-test-environment-isolation]: Re-establish mock in beforeEach when multiple describe blocks share one isolated config — prevents io-roundtrip test from overriding the shared file-level mock
- [Phase 23-test-environment-isolation]: useIsolatedConfig + cache-busting dynamic imports replaces saveGlobalConfig/restoreGlobalConfig pattern — tests no longer touch real config files
- [Phase 24-mock-architecture-refactor]: prompts wrapper pattern: import { prompts as p } from @/tui/utils alias preserves all p.confirm/p.select call sites; tests mocking @/tui/utils directly need prompts in mock shape
- [Phase 24-01]: lifecycle.ts _exec.spawn returns SpawnHandle not resolved result — required for concurrent stream drain in runHooksCaptured
- [Phase 24-01]: Lifecycle real-shell tests use cache-busting import to prevent mock.module contamination from consumer tests

### Pending Todos

None. 6 todos cleared: 3 already shipped (close command, niri fix, test isolation), 3 promoted to phases 25-27 (lifecycle phases, autocompletion polish, git forge integrations).

### Roadmap Evolution

- Phase 24 added: Mock Architecture Refactor — replace module-level mock.module() with injectable dependency mocking (_exec pattern)
- Phases 25-27 added from promoted todos: Dedicated Lifecycle Phases, Autocompletion & Editor Polish, Git Forge Integrations

### Blockers/Concerns

None.

## Session Continuity

Last session: 2026-03-22T12:48:43.545Z
Stopped at: Completed 24-01-PLAN.md — _exec injection for tmux.ts, cmux.ts, lifecycle.ts
Resume file: None
Next action: /gsd:plan-phase 21
