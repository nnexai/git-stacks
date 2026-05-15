---
status: complete
phase: quick-260322-9bm
plan: 01
subsystem: integrations
tags: [tmux, niri, commander, integration-commands, cleanup]

requires:
  - phase: quick-260322-8sf
    provides: niri integration with cleanup() and snapshotWindowIds

provides:
  - tmux open() creates session without stealing focus
  - killTmuxSession() helper in src/lib/tmux.ts
  - tmuxIntegration.cleanup() kills session on workspace clean/remove
  - Integration interface commands?(parent) optional method
  - tmuxIntegration.commands: "git-stacks integration tmux attach <workspace>"
  - niriIntegration.commands: "git-stacks integration niri focus-workspace <workspace>"
  - src/commands/integration.ts: integrationCommand mounts per-integration subcommands

affects: [workspace-ops, commands, integration-runner]

tech-stack:
  added: []
  patterns:
    - "Integration.commands?(parent: Command) optional method for registering per-integration CLI helpers"
    - "src/commands/integration.ts iterates integrations array and mounts subcommands dynamically"

key-files:
  created:
    - src/commands/integration.ts
    - tests/lib/integrations/tmux.test.ts
    - tests/lib/integration-commands.test.ts
  modified:
    - src/lib/tmux.ts
    - src/lib/integrations/tmux.ts
    - src/lib/integrations/niri.ts
    - src/lib/integrations/types.ts
    - src/index.ts

key-decisions:
  - "tmux open() no longer calls focusTmuxSession() — session is created in background, user explicitly attaches via git-stacks integration tmux attach"
  - "Integration.commands? optional so existing integrations (vscode, intellij, cmux) need no changes"
  - "Attach/focus commands print usage and exit(1) when workspace arg is missing — no interactive fallback"
  - "focusTmuxSession re-imported in tmux integration for use in commands.attach only (not open)"

requirements-completed: [QUICK-9bm]

duration: 12min
completed: 2026-03-22
---

# Quick Task 260322-9bm: tmux defocus on open, cleanup, integration helper commands

**tmux open() stops stealing focus, cleanup() kills sessions, and git-stacks integration tmux|niri subcommands give users explicit control over attach/focus**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-03-22T05:30:00Z
- **Completed:** 2026-03-22T05:42:00Z
- **Tasks:** 2
- **Files modified:** 7 (2 new src, 2 new tests)

## Accomplishments

- tmux `open()` no longer calls `focusTmuxSession()` — session is created silently in background, spinner says "tmux session ready: {name}"
- New `killTmuxSession()` helper in `src/lib/tmux.ts` wraps `tmux kill-session -t {name}` with `.nothrow()`
- `tmuxIntegration.cleanup()` checks session existence then kills it — prevents leaking tmux sessions on workspace clean/remove
- New optional `commands?(parent: Command): void` on Integration interface for per-integration CLI helper registration
- `tmuxIntegration.commands` registers `git-stacks integration tmux attach <workspace>` calling `focusTmuxSession`
- `niriIntegration.commands` registers `git-stacks integration niri focus-workspace <workspace>` calling `focusNiriWorkspace`
- New `src/commands/integration.ts` dynamically mounts subcommands from all integrations that implement `commands`
- `src/index.ts` registers `integrationCommand` on the program

## Task Commits

1. **Task 1: tmux open() defocus + cleanup + killTmuxSession helper** - `0d1f88d` (feat)
2. **Task 2: Integration commands system + tmux attach + niri focus-workspace** - `285802d` (feat)

**Plan metadata:** (this commit)

## Files Created/Modified

- `src/lib/tmux.ts` - Added `killTmuxSession()` export
- `src/lib/integrations/tmux.ts` - Removed focusTmuxSession from open(), updated spinner, added cleanup() and commands()
- `src/lib/integrations/niri.ts` - Added commands() method with focus-workspace subcommand
- `src/lib/integrations/types.ts` - Added `commands?(parent: Command): void` to Integration interface
- `src/commands/integration.ts` - New: integrationCommand factory, mounts per-integration subcommands
- `src/index.ts` - Registers integrationCommand
- `tests/lib/integrations/tmux.test.ts` - New: tests for open() no-focus, return value, cleanup() behavior
- `tests/lib/integration-commands.test.ts` - New: tests for command tree structure

## Decisions Made

- `tmux open()` no longer focuses — user intent is "prepare the environment", attach is a deliberate action
- `commands?` is optional so vscode/intellij/cmux don't need changes (they have no helper CLI actions)
- Missing workspace arg in attach/focus-workspace prints usage and exits 1 (no interactive fallback in v0.6.0)
- `focusTmuxSession` is re-imported in tmux integration for use in `commands.attach` — the `open()` path explicitly does not call it

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## Self-Check

- [x] `src/lib/tmux.ts` contains `killTmuxSession`
- [x] `src/lib/integrations/tmux.ts` contains `cleanup` method and `commands` method, no `focusTmuxSession` call in `open()`
- [x] `src/lib/integrations/types.ts` contains `commands?` on Integration interface
- [x] `src/commands/integration.ts` exists and exports `integrationCommand`
- [x] `src/index.ts` imports and registers `integrationCommand`
- [x] All tests pass (25/25)
- [x] `bun run typecheck` passes

## Self-Check: PASSED

---
*Phase: quick-260322-9bm*
*Completed: 2026-03-22*
