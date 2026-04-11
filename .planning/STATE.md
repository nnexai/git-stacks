---
gsd_state_version: 1.0
milestone: v0.17.1
milestone_name: E2E Test Coverage
status: executing
stopped_at: Phase 84 context gathered
last_updated: "2026-04-11T12:47:34.623Z"
last_activity: 2026-04-11 -- Phase 83 planning complete
progress:
  total_phases: 16
  completed_phases: 7
  total_plans: 35
  completed_plans: 15
  percent: 43
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-10)

**Core value:** One command takes you from "I need to work on feature X" to a fully running dev environment — right repos, right branches, right IDE/terminal open, hooks run — without manual steps.
**Current focus:** v0.17.1 E2E Test Coverage — start with Phase 80 E2E harness and machine-parseable inventory.

## Current Position

Phase: 80 of 84 (E2E CLI Harness and Living Inventory)
Plan: Not planned yet
Status: Ready to execute
Last activity: 2026-04-11 -- Phase 83 planning complete

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
- Phase structure after planning feedback: combined harness/inventory foundation (80), workspace/git-operation E2E (81), template/repo/label/message E2E (82), support/error E2E (82.1), Istanbul-based subprocess coverage reports (83), local gates/docs/release prep (84).
- Existing test runner constraint: unit files run in one shared Bun test process; integration/E2E-style files run as isolated per-file Bun test subprocesses.
- There is no CI in the project today; v0.17.1 gates are local verification scripts/commands, not CI workflow work.
- Coverage reporting must include source exercised by subprocess E2E tests. The old "or document the limitation" fallback is intentionally removed; Phase 83 will use Istanbul-compatible source instrumentation with per-process artifact merging.
- Phase 80 should extend existing helpers in `tests/helpers.ts` rather than replacing them.
- The Phase 80 inventory must have a machine-parseable source of truth so Phase 84 local gates can detect unmapped commands and missing test mappings.
- Phase 80 no longer requires a separate human-readable inventory surface; the canonical artifact is the machine-parseable source itself.
- The milestone's core testing intent is to falsify assumptions around env injection, hooks, cwd/path selection, branch starting points, merge/pull/sync/push behavior, and command execution that uses explicit cwd/path handling instead of shell `cd` state.
- Backlog 999.2 (README debug format) promoted into Phase 84 SC 6; 999.1 and 999.3 remain backlog.
- Wizard-driven commands (new, clone, config wizard, repo scan, template new, template edit, install prompts) are excluded from E2E scope; tested indirectly via pre-built fixtures where applicable.
- `cd`, `edit --yaml`, `integration list`, and `integration <id> config show/example` were missing from phase success criteria and have been added.
- **Coverage spike findings (2026-04-10):** (1) Bun ignores `NODE_V8_COVERAGE` — no V8 coverage JSON produced from Bun subprocesses. (2) `bun test --coverage` works for in-process imports only; subprocess code is invisible. (3) `c8 --all` sees the source tree but reports 0% because Bun subprocesses don't emit V8 artifacts. (4) Istanbul source instrumentation (`istanbul-lib-instrument` with `parserPlugins: ["typescript"]`) works end-to-end under Bun: instrument TS → run instrumented code in subprocess → collect `globalThis.__coverage__` → get per-function/statement/branch hit counts. (5) Phase 83 approach confirmed: Istanbul source instrumentation + `__coverage__` collection + artifact merge. Phase 82.1 SC 6 requires a minimal proof-of-concept before Phase 83 planning begins.

### Roadmap Evolution

- Phase 81.1 inserted after Phase 81: Repo add honors enabled forge integrations (URGENT)
- Phase 81.1.1 inserted after Phase 81.1: Minimal non-interactive workspace create and clone variants (URGENT)

### Pending Todos

None.

### Blockers/Concerns

None.

## Session Continuity

Last session: 2026-04-11T12:12:12.242Z
Stopped at: Phase 84 context gathered
Resume file: .planning/phases/84-local-coverage-gates-docs-and-release-prep/84-CONTEXT.md
