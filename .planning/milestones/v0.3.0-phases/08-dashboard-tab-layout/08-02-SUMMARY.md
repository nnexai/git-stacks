---
plan: 08-02
status: complete
---

# Plan 08-02 Summary: Tabbed App Shell + Split Layout

## Completed
- Created `src/tui/dashboard/WorkspaceDetail.tsx`: inline detail pane showing branch/repos/messages
- Updated `src/tui/dashboard/WorkspaceList.tsx`: accepts explicit `height` prop instead of computing from terminal dims
- Refactored `src/tui/dashboard/App.tsx`: tabbed shell, per-tab state, split layout, WorkspaceDetail wired
- Updated `src/tui/dashboard/ActionMenu.tsx`: removed "status" action, added "rename" and "run" (onRun prop)
- Deleted `src/tui/dashboard/DetailStatus.tsx`

## Key structural changes
- Single outer `<box border title={tabTitle()}>` surrounds entire content
- `listHeight` (~60%) and `detailHeight` (~40%) memos for split layout
- Per-tab cursor/filter/filtering state with tabCursor/tabFilter/tabFiltering records
- `1/2/3` and `[/]` switch tabs; tab switch resets view to list
- Esc never calls renderer.destroy() from list view — only `q` exits

## Templates/Repos tabs
- Stubs with placeholder text; Plan 03 will replace with real components
