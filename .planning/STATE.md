---
gsd_state_version: 1.0
milestone: v0.4.0
milestone_name: TUI Hardening and Polish
status: phase-complete
stopped_at: Completed 10-02-PLAN.md
last_updated: "2026-03-21T06:33:20Z"
progress:
  total_phases: 6
  completed_phases: 1
  total_plans: 2
  completed_plans: 2
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-20)

**Core value:** One command takes you from "I need to work on feature X" to a fully running dev environment — right repos, right branches, right IDE/terminal open, hooks run — without manual steps.
**Current focus:** Phase 10 — test-harness (complete)

## Current Position

Phase: 10 (test-harness) — COMPLETE
Plan: 2 of 2 (complete)

## Accumulated Context

### Decisions

All prior milestone decisions recorded in PROJECT.md Key Decisions table.

**v0.4.0-specific decisions (from research and execution):**

- `testRender` from `@opentui/solid@0.1.87` confirmed available — component tests import from `@opentui/solid` by design
- All create wizard flows must be native TUI components (`WizardView.tsx`) — `@clack/prompts` has unresolvable stdio ownership conflict with OpenTUI
- `renderer.suspend()` is reserved for: (a) $EDITOR launch, (b) `repo scan` as the one sanctioned escape hatch
- T-06 (`GIT_STACKS_CONFIG_DIR` env override) belongs in Phase 10 — tests cannot be isolated without it
- `fetchOrigin()` must get a 30-second timeout before sync ships (Phase 12)
- `useWorkspaces.reload()` must return `Promise<void>` before wizard cursor placement works (Phase 13)
- WizardView step/data state lives inside `WizardView.tsx` as local signals — NOT in UIView union variants
- Coarse granularity requested; 6 phases retained because research dependency chain requires it
- Subprocess spawning (`spawnSync bun --eval`) required for paths env override tests — Bun shares module cache across test files in same run, so top-level dynamic import returns cached values when config.test.ts already imported paths.ts statically
- ActionMenu `fullActions` array computed inside component (not module scope) so conditional Run entry depends on reactive `props.onRun` at render time
- bunfig.toml `[test]` preload section (not top-level) required for `bun test` to apply the Babel solid transform to tsx imports — top-level preload only applies to `bun run`
- `pressEscape()` requires a 50ms setTimeout before asserting callback — the OpenTUI escape-sequence parser waits for more bytes after `\x1B` before emitting the event

### Pending Todos

None — Phase 10 complete.

### Blockers/Concerns

None.

## Session Continuity

Last session: 2026-03-21
Stopped at: Completed 10-02-PLAN.md
Resume file: .planning/phases/10-test-harness/10-02-SUMMARY.md
Next action: Phase 10 complete. Execute next phase.
