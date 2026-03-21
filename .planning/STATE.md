---
gsd_state_version: 1.0
milestone: v0.6.0
milestone_name: Integration Orchestration & Niri
status: unknown
stopped_at: Completed 16-artifact-type-foundation-16-01-PLAN.md
last_updated: "2026-03-21T22:34:49.279Z"
progress:
  total_phases: 5
  completed_phases: 1
  total_plans: 1
  completed_plans: 1
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-21)

**Core value:** One command takes you from "I need to work on feature X" to a fully running dev environment — right repos, right branches, right IDE/terminal open, hooks run — without manual steps.
**Current focus:** Phase 16 — artifact-type-foundation

## Current Position

Phase: 17
Plan: Not started

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

| Phase 16-artifact-type-foundation P01 | 2 | 2 tasks | 7 files |

### Decisions

**v0.6.0 design decisions (from research and planning):**

- Integration `open()` uses `void | T` transitional union first, tightened to `T | null` after all four integrations updated — avoids non-atomic compile error cascade
- Three-tier ordering: tier 1 (independent: tmux, vscode, intellij), tier 2 (side-effects: cmux), tier 3 (window management: niri) — extensible via numeric `order` field, not hardcoded
- cmux is tier 2 not tier 1 because it may consume tmux artifacts in future (INT-01)
- Niri window identification uses snapshot-diff (poll `niri msg -j windows` before/after spawn) — PID matching unreliable for Xwayland apps per official niri docs
- Named niri workspaces are ephemeral when empty — always query existence at open() start, never persist niri workspace numeric IDs to YAML
- Terminal spawn for niri uses `env -u TMUX -u TMUX_PANE <terminal> -e tmux new-session -A -s <name>` to prevent tmux env contamination when git-stacks is run from inside tmux
- All niri IPC isolated in `src/lib/niri.ts` — no niri calls anywhere else; automated tests always mock this module
- Phase 19 (niri-shell-wrappers) can proceed in parallel with Phase 17-18 since it only depends on Phase 16
- [Phase 16-artifact-type-foundation]: All four existing integrations return null from open() — real artifact values deferred to Phase 18
- [Phase 16-artifact-type-foundation]: ArtifactBag uses integration.id as key so downstream integrations can look up prior artifacts by well-known string key
- [Phase 16-artifact-type-foundation]: WindowArtifact carries pid, app_id, and title to support niri snapshot-diff window identification in Phase 20

### Pending Todos

None.

### Blockers/Concerns

None.

### Quick Tasks Completed

| # | Description | Date | Commit | Status | Directory |
|---|-------------|------|--------|--------|-----------|
| 260321-s98 | Fix dashboard creation wizard input forms clipping outside dialog and short visible input width | 2026-03-21 | 2a30e1b | | [260321-s98-fix-dashboard-creation-wizard-input-form](./quick/260321-s98-fix-dashboard-creation-wizard-input-form/) |
| 260321-sqp | Implement TODO tests across the test suite (30 tests, 6 files) | 2026-03-21 | 5d62b91 | Verified | [260321-sqp-implement-todo-tests-across-the-test-sui](./quick/260321-sqp-implement-todo-tests-across-the-test-sui/) |
| 260321-tdv | Add snapshot tests for 7 untested TUI dashboard components (16 tests, 7 files) | 2026-03-21 | 13a4ba0 | Verified | [260321-tdv-tui-snapshot-tests-for-intentional-visua](./quick/260321-tdv-tui-snapshot-tests-for-intentional-visua/) |
| 260321-u1l | Add git-stacks install --hooks command with Claude Code agent hook plugin system | 2026-03-21 | 3cc797a | Verified | [260321-u1l-git-stacks-install-hooks-agent-framework](./quick/260321-u1l-git-stacks-install-hooks-agent-framework/) |

## Session Continuity

Last session: 2026-03-21T22:31:19.440Z
Stopped at: Completed 16-artifact-type-foundation-16-01-PLAN.md
Resume file: None
Next action: `/gsd:plan-phase 16`
