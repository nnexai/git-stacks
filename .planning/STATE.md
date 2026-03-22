---
gsd_state_version: 1.0
milestone: v0.6.0
milestone_name: Integration Orchestration & Niri
status: unknown
stopped_at: Completed 20-niri-integration-20-01-PLAN.md
last_updated: "2026-03-22T04:57:35.802Z"
progress:
  total_phases: 5
  completed_phases: 5
  total_plans: 6
  completed_plans: 6
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-21)

**Core value:** One command takes you from "I need to work on feature X" to a fully running dev environment — right repos, right branches, right IDE/terminal open, hooks run — without manual steps.
**Current focus:** Phase 20 — niri-integration

## Current Position

Phase: 20
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
| Phase 17-integration-runner P01 | 15 | 2 tasks | 8 files |
| Phase 17-integration-runner P02 | 5 | 1 tasks | 4 files |
| Phase 18-artifact-population P01 | 3 | 2 tasks | 5 files |
| Phase 19-niri-shell-wrappers P01 | 9min | 2 tasks | 2 files |
| Phase 20 P01 | 3min | 2 tasks | 3 files |

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
- [Phase 17-integration-runner]: vscode=10, intellij=11, tmux=12 (tier 1: independent), cmux=20 (tier 2: side-effects) — preserves array order within tier 1
- [Phase 17-integration-runner]: runner.ts imports integrations from index.ts directly (not as parameter) — enables mock.module test isolation with cache-busting
- [Phase 17-integration-runner]: Spread-sort [...integrations].sort() avoids mutating the exported array in index.ts
- [Phase 17-integration-runner]: workspace-ops.ts drops the bag variable — runIntegrations return not yet consumed downstream, await alone is sufficient
- [Phase 18-artifact-population]: Bun.spawn used instead of Bun.$ for IDE launches — Bun.$ blocks awaiting exit, Bun.spawn returns immediately with pid for WindowArtifact
- [Phase 18-artifact-population]: vscode app_id derived from cmd basename (cmd.split('/').at(-1)) to handle custom binary paths; intellij hardcoded as 'idea'
- [Phase 19-niri-shell-wrappers]: _exec mutable object pattern for ESM-safe Bun.$ test injection — mock.module(bun) and spyOn(Bun, '$') both fail for built-in modules; object property mutation works
- [Phase 19-niri-shell-wrappers]: snapshotWindowIds uses _listWindows injectable param (not _exec.run) — avoids Zod parse overhead in tests and gives typed control over window state per poll
- [Phase 19-niri-shell-wrappers]: NiriCommands interface exported so Phase 20 tests can type-safely use mock.module('@/lib/niri') with all 8 function signatures
- [Phase 20]: Niri integration returns null always (tier-3 consumer, not producer) — no NiriArtifact type needed
- [Phase 20]: NIRI-05 cleanup on remove intentionally unimplemented per user decision — no remove/cleanup method
- [Phase 20]: Window move failures logged as warnings and continue — partial failure acceptable for niri integration
- [Quick 260322-9bm]: tmux open() no longer calls focusTmuxSession() — session is created in background, user explicitly attaches via "git-stacks integration tmux attach"
- [Quick 260322-9bm]: Integration.commands?(parent: Command) optional method enables per-integration CLI helpers without requiring all integrations to implement it

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
| 260322-8sf | Fix niri integration: use snapshotWindowIds, correct workspace creation, add cleanup | 2026-03-22 | 4d5830d | Verified | [260322-8sf-fix-niri-integration-use-snapshotwindowi](./quick/260322-8sf-fix-niri-integration-use-snapshotwindowi/) |
| 260322-9bm | tmux open() defocus, cleanup(), integration helper commands (tmux attach, niri focus-workspace) | 2026-03-22 | 285802d | Verified | [260322-9bm-tmux-integration-remove-focus-on-open-ad](./quick/260322-9bm-tmux-integration-remove-focus-on-open-ad/) |
| 260322-a6s | Rework niri integration config from commands[] to declarative columns with app/command/source windows | 2026-03-22 | 468d564 | Verified | [260322-a6s-rework-niri-integration-config-declarati](./quick/260322-a6s-rework-niri-integration-config-declarati/) |

## Session Continuity

Last session: 2026-03-22T06:08:00.000Z
Stopped at: Completed quick task 260322-a6s (niri declarative column config rework)
Resume file: None
Next action: `/gsd:plan-phase 16`
