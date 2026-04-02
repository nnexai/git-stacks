---
plan: 48-01
title: "Multi-Workspace Loop in open()"
status: complete
started: 2026-03-29T14:00:00Z
completed: 2026-03-29T14:30:00Z
---

# Summary: 48-01 Multi-Workspace Loop in open()

## What was built

Rewrote the AeroSpace integration's `open()` method to iterate all entries in the `workspaces` array sequentially. Each entry executes: flatten, bag-move (index 0 only), commands, layout. Focus is deferred to post-loop. `listWorkspaces()` is hoisted before the loop and called exactly once.

## Key changes

- Replaced single-entry `parsedConfig.workspaces[0]` extraction with a `for` loop over all entries
- Added `validateAerospaceConfig()` call before the loop (focus uniqueness, duplicate names)
- Hoisted `listWorkspaces()` to call exactly once; validate all workspace names upfront
- Bag-move gated by `i === 0` — only first entry receives bag windows (PROC-02)
- Shared `beforeSet: Set<number>` accumulates window IDs across entries for snapshot isolation (PROC-04)
- `snapshotWindowIds()` calls pass `{ beforeSet }` for cross-entry isolation
- `setLayout()` now receives `windowId` parameter to avoid cross-entry focus contamination
- Deferred workspace-level and window-level focus to post-loop execution
- Spinner message updates per entry with `(i/total)` progress indicator

## Key files

- `src/lib/integrations/aerospace.ts` — `open()` method rewritten (lines 136-330)

## Self-Check: PASSED

- `bun run typecheck` passes
- `bun run test` passes (all existing tests still pass — backward compatible with single-entry configs)
