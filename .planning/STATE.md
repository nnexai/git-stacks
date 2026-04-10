---
gsd_state_version: 1.0
milestone: v0.17.1
milestone_name: E2E Test Coverage
status: roadmap_created
stopped_at: Phase 80 ready to plan
last_updated: "2026-04-10T19:02:34Z"
last_activity: 2026-04-10 - Roadmap refined for v0.17.1 E2E Test Coverage after planning feedback
progress:
  total_phases: 6
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
  percent: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-10)

**Core value:** One command takes you from "I need to work on feature X" to a fully running dev environment — right repos, right branches, right IDE/terminal open, hooks run — without manual steps.
**Current focus:** v0.17.1 E2E Test Coverage — start with Phase 80 E2E harness and living inventory.

## Current Position

Phase: 80 of 84 (E2E CLI Harness and Living Inventory)
Plan: Not planned yet
Status: Ready to plan
Last activity: 2026-04-10 — v0.17.1 roadmap refined from coworker/user feedback; REQUIREMENTS.md traceability mapped 21/21 requirements.

Progress: [░░░░░░░░░░] 0% (0/6 phases complete)

## Performance Metrics

**Velocity:** New milestone; no v0.17.1 plans completed yet.

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 80-84 plus 82.1 | TBD | - | - |

## Accumulated Context

### Decisions

- Treat v0.17.0 as the completed baseline even though MILESTONES.md is stale; phases 74-79 are complete and v0.17.1 starts at Phase 80.
- v0.17.1 scope is non-TUI, non-integration E2E coverage plus usable coverage reports across the split test runner architecture.
- TUI behavior, external integration behavior, editor-launching edit commands, and the v0.17.0 terminal UI rollback visibility audit gap stay out of this milestone.
- Phase structure after planning feedback: combined harness/living inventory (80), workspace/git-operation E2E (81), template/repo/label/message E2E (82), support/error E2E (82.1), Istanbul-based subprocess coverage reports (83), local gates/docs/release prep (84).
- Existing test runner constraint: unit files run in one shared Bun test process; integration/E2E-style files run as isolated per-file Bun test subprocesses.
- There is no CI in the project today; v0.17.1 gates are local verification scripts/commands, not CI workflow work.
- Coverage reporting must include source exercised by subprocess E2E tests. The old "or document the limitation" fallback is intentionally removed; Phase 83 will use Istanbul-compatible source instrumentation with per-process artifact merging.
- Phase 80 should extend existing helpers in `tests/helpers.ts` rather than replacing them.
- The Phase 80 inventory must have a machine-parseable source of truth so Phase 84 local gates can detect unmapped commands and missing test mappings.
- The milestone's core testing intent is to falsify assumptions around env injection, hooks, cwd/path selection, branch starting points, merge/pull/sync/push behavior, and command execution that uses explicit cwd/path handling instead of shell `cd` state.
- Existing v0.17.0 backlog items remain backlog for now; they are not promoted into v0.17.1 unless explicitly requested later.

### Pending Todos

None.

### Blockers/Concerns

None.

## Session Continuity

Last session: 2026-04-10 19:02 UTC
Stopped at: Roadmap refined; next action is `/gsd-plan-phase 80`
Resume file: None
