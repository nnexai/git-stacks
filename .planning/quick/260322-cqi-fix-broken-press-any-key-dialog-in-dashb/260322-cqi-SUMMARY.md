---
phase: quick
plan: 260322-cqi
subsystem: ui
tags: [dashboard, integrations, tui, opentui, hooks, clack]

requires:
  - phase: quick-260322-c0u
    provides: niri two-phase column layout (niri.ts open() method this task modifies)

provides:
  - openWorkspace captured mode — routes hooks through runHooksCaptured, passes silent: true on IntegrationContext
  - Dashboard passes captured: true to openWorkspace — no more screen corruption from ANSI escape sequences

affects:
  - src/lib/integrations (all integrations now check ctx.silent before using p.spinner/p.log.warn)
  - src/tui/dashboard (open action now safe for TUI context)

tech-stack:
  added: []
  patterns:
    - "captured mode pattern: opts.captured routes hook output through callback and silences integration terminal output"
    - "ctx.silent guard: integrations check ctx.silent before calling p.spinner()/p.log.warn() to be TUI-safe"

key-files:
  created: []
  modified:
    - src/lib/integrations/types.ts
    - src/lib/workspace-ops.ts
    - src/lib/integrations/cmux.ts
    - src/lib/integrations/tmux.ts
    - src/lib/integrations/niri.ts
    - src/tui/dashboard/App.tsx

key-decisions:
  - "silent?: boolean on IntegrationContext (not a separate capture parameter) — integrations already receive ctx, no new plumbing needed"
  - "Local execHooks helper in openWorkspace — avoids scattering opts.captured checks across every runHooks call site"
  - "Spinner becomes null (not skipped entirely) when silent — optional chaining (?.) preserves the try/catch structure unchanged"

patterns-established:
  - "Integration open() methods use ctx.silent to conditionally skip terminal output — all 3 integrations follow same pattern"

requirements-completed: []

duration: 8min
completed: 2026-03-22
---

# Quick 260322-cqi: Fix Broken Press-Any-Key Dialog in Dashboard Summary

**Dashboard open action now routes hooks through captured callbacks and silences integration ANSI output, eliminating TUI screen corruption**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-03-22T09:20:00Z
- **Completed:** 2026-03-22T09:28:00Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments

- `openWorkspace` gains `captured?: boolean` option: when true, uses `runHooksCaptured` (output routed to `onProgress` callback) instead of `runHooks` (inherited stdio)
- `IntegrationContext` gains `silent?: boolean`: when true, integrations skip `p.spinner()` and `p.log.warn()` to avoid writing ANSI escape sequences to the terminal
- Dashboard `App.tsx` passes `{ captured: true }` — all 8 `p.log.warn` sites in `niri.ts` open(), and both `cmux.ts`/`tmux.ts` spinners, are now guarded
- CLI open path (`git-stacks open`) is completely unchanged (no `captured` flag)

## Task Commits

1. **Task 1: Add silent flag to IntegrationContext and captured mode to openWorkspace** - `78e54e9` (feat)
2. **Task 2: Make integration open() methods silent-aware and wire dashboard** - `1b493f5` (feat)

## Files Created/Modified

- `src/lib/integrations/types.ts` - Added `silent?: boolean` to `IntegrationContext`
- `src/lib/workspace-ops.ts` - Added `captured?: boolean` to opts, local `execHooks` helper, `runHooksCaptured` import, silent ctx spread
- `src/lib/integrations/cmux.ts` - Spinner conditional on `ctx.silent`, `p.log.warn` guarded
- `src/lib/integrations/tmux.ts` - Spinner conditional on `ctx.silent`, `p.log.warn` guarded
- `src/lib/integrations/niri.ts` - Spinner conditional on `ctx.silent`, all 8 `p.log.warn` calls guarded with `if (!ctx.silent)`
- `src/tui/dashboard/App.tsx` - Open action passes `{ captured: true }` to `openWorkspace`

## Decisions Made

- Used `silent?: boolean` on `IntegrationContext` rather than a separate parameter — integrations already receive ctx, zero additional plumbing
- `execHooks` local helper encapsulates the `opts.captured` branch decision in one place rather than at each call site
- Spinner becomes `null` when silent (using optional chaining `?.`) — preserves try/catch structure with no duplication

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## Next Phase Readiness

- Dashboard workspace open action is TUI-safe: hooks and integrations run without corrupting the screen
- "Press any key to continue" dialog now works correctly after a workspace open
- CLI (non-dashboard) open behavior is completely unchanged

---
*Phase: quick*
*Completed: 2026-03-22*
