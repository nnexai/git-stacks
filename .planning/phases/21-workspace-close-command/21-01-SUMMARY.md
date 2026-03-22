---
phase: 21-workspace-close-command
plan: 01
subsystem: workspace-lifecycle
tags: [workspace, hooks, integrations, tui, cli, zod]

# Dependency graph
requires:
  - phase: 20-niri-integration
    provides: runIntegrationCleanup in runner.ts used by closeWorkspace
  - phase: 17-integration-runner
    provides: runner.ts with runIntegrationCleanup function
provides:
  - closeWorkspace function in workspace-ops.ts
  - pre_close hook in WorkspaceHooksSchema and TemplateSchema
  - git-stacks close <name> CLI command
  - Close action (x shortcut) in TUI dashboard ActionMenu
affects:
  - 22-niri-display-fix (uses same TUI patterns)
  - 23-test-isolation (tests use workspace-ops infrastructure)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - closeWorkspace follows cleanWorkspace pattern but without worktree removal
    - pre_close hook follows same pattern as pre_remove (captured mode for TUI)
    - close action in TUI uses same progress view pattern as open action (no confirmation needed)

key-files:
  created:
    - .planning/phases/21-workspace-close-command/21-01-SUMMARY.md
  modified:
    - src/lib/config.ts
    - src/lib/workspace-ops.ts
    - src/commands/workspace.ts
    - src/tui/dashboard/types.ts
    - src/tui/dashboard/ActionMenu.tsx
    - src/tui/dashboard/App.tsx
    - tests/lib/workspace-ops.test.ts
    - tests/tui/dashboard/ActionMenu.test.tsx

key-decisions:
  - "closeWorkspace does not touch worktrees or YAML — preserves all filesystem state, making open work immediately after"
  - "No confirmation prompt for close (non-destructive) — follows same pattern as open"
  - "Close entry uses x shortcut, appears after Open in ActionMenu (close is open's inverse)"
  - "pre_close hook schema added to both WorkspaceHooksSchema and TemplateSchema for consistency"

patterns-established:
  - "Non-destructive workspace operations skip confirmation and go directly to progress view"
  - "captured: true passed to closeWorkspace from TUI for hook output compatibility with OpenTUI"

requirements-completed: [CLOSE-01, CLOSE-02, CLOSE-03, CLOSE-04]

# Metrics
duration: 6min
completed: 2026-03-22
---

# Phase 21 Plan 01: Workspace Close Command Summary

**Lightweight workspace session teardown via `git-stacks close <name>`: runs pre_close hooks and integration cleanup (tmux, niri) without removing worktrees or workspace YAML**

## Performance

- **Duration:** 6 min
- **Started:** 2026-03-22T09:21:04Z
- **Completed:** 2026-03-22T09:26:58Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments

- Added `closeWorkspace()` function to workspace-ops.ts: runs pre_close hooks + integration cleanup, preserves worktrees and YAML
- Added `pre_close` hook field to both `WorkspaceHooksSchema` and `TemplateSchema` (Zod-validated)
- Registered `git-stacks close <name>` CLI command (no confirmation, no dry-run — non-destructive)
- Added Close entry with `x` shortcut in TUI ActionMenu after Open; dispatched via progress view in App.tsx

## Task Commits

Each task was committed atomically:

1. **Task 1: RED (failing tests)** - `1bf82c8` (test)
2. **Task 1: GREEN (schemas + closeWorkspace impl)** - `4110370` (feat)
3. **Task 2: CLI command + TUI wiring** - `1ca1262` (feat)

_Note: TDD tasks have multiple commits (test → feat)_

## Files Created/Modified

- `src/lib/config.ts` - Added `pre_close: z.array(z.string()).optional()` to WorkspaceHooksSchema and TemplateSchema hooks
- `src/lib/workspace-ops.ts` - Added `closeWorkspace()` function: pre_close hooks + runIntegrationCleanup, no worktree removal
- `src/commands/workspace.ts` - Registered `close <name>` command after `open`; imports closeWorkspace
- `src/tui/dashboard/types.ts` - Added `"close"` to Action type union
- `src/tui/dashboard/ActionMenu.tsx` - Added `{ key: "x", action: "close", label: "Close" }` after Open entry
- `src/tui/dashboard/App.tsx` - Added closeWorkspace import; added close action handler in runAction (progress view, captured mode)
- `tests/lib/workspace-ops.test.ts` - Added 5 closeWorkspace tests (TDD RED/GREEN) + TemplateSchema import
- `tests/tui/dashboard/ActionMenu.test.tsx` - Updated tests to reflect Close at index 1 (shifted cursor positions)

## Decisions Made

- closeWorkspace does not touch worktrees or YAML — preserves all filesystem state, making `open` work immediately after
- No confirmation prompt for close (non-destructive operation) — follows same UX pattern as `open`
- `x` shortcut chosen for Close; entry placed immediately after Open in ActionMenu (open's inverse)
- `pre_close` added to both hook schemas for consistency with all other workspace lifecycle events

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Updated ActionMenu tests to reflect new Close action at index 1**
- **Found during:** Task 2 (CLI and TUI wiring)
- **Issue:** Adding Close at index 1 shifted all subsequent cursor positions in ActionMenu tests — "down arrow moves cursor to second item" expected Rename but Close is now second; "up arrow" test cursor math was wrong; "enter dispatches action at moved cursor position" needed one more down press
- **Fix:** Updated ActionMenu.test.tsx to expect `[x] Close` as second item, updated cursor position comments, added 3 downs (not 2) to reach Edit
- **Files modified:** `tests/tui/dashboard/ActionMenu.test.tsx`
- **Verification:** `bun test tests/tui/dashboard/ActionMenu.test.tsx` — 10 pass, 0 fail
- **Committed in:** `1ca1262` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 — bug in test cursor positions caused by new action insertion)
**Impact on plan:** Necessary correctness fix. No scope creep.

## Issues Encountered

- 14 pre-existing failures from `focusNiriWindow` not exported from niri.ts — unrelated to this plan, out of scope per deviation rules

## Next Phase Readiness

- closeWorkspace function is complete and tested; integrations will call their `cleanup()` method when close runs
- Phase 22 (niri display fix) and Phase 23 (test isolation) can proceed independently
- The `pre_close` hook is available in YAML for users to configure teardown scripts

---
*Phase: 21-workspace-close-command*
*Completed: 2026-03-22*
