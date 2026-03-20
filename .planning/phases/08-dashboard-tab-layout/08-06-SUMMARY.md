---
phase: 08-dashboard-tab-layout
plan: 06
subsystem: ui
tags: [solid-js, opentui, tui, dashboard, nested-text-fix, selection-scoping]

# Dependency graph
requires:
  - phase: 08-05
    provides: tab signal, per-tab cursor/filter/filtering state, memo accessors, existing Switch/Match structure
provides:
  - Fix for nested <text> crash in TemplateList/RepoList (root cause of tab switching issues)
  - Selection/batch keys scoped to workspaces tab only
  - Rename view reset to list after successful completion
affects: [08-UAT, any future dashboard rendering work]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "No nested <text> in OpenTUI: TextRenderable ≠ TextNodeRenderable — use sibling <text> in <box flexDirection=row>"
    - "Match WorkspaceRow pattern: <box height={1} flexDirection=row backgroundColor={focused ? #333333 : undefined}>"

key-files:
  created: []
  modified:
    - src/tui/dashboard/App.tsx
    - src/tui/dashboard/TemplateList.tsx
    - src/tui/dashboard/RepoList.tsx

key-decisions:
  - "Root cause was nested <text> elements, NOT Switch/Match — TextRenderable.add() delegates to TextNodeRenderable.add() which rejects TextRenderable children"
  - "Reverted to original Switch/Match (clean conditional rendering) — it works correctly when components don't crash"
  - "TemplateList/RepoList rewritten to use <box flexDirection=row> with sibling <text> for multi-colored segments, matching WorkspaceRow"
  - "Space/batch keys/BatchBar gated to workspaces tab — prevents cross-tab selection bleed"
  - "On rename error, stay on progress view; on success, call setView({ view: list })"

patterns-established:
  - "OpenTUI row pattern: <box height={1} flexDirection=row backgroundColor={focused ? #333333 : undefined}> with sibling <text fg=color> segments"
  - "Never nest <text> inside <text> in OpenTUI — causes TextNodeRenderable crash"

requirements-completed: [DASH-02, DASH-03, DASH-07]

# Metrics
duration: 45min
completed: 2026-03-20
---

# Phase 08 Plan 06: Nested Text Fix, Selection Scoping, Rename Fix

**Eliminated nested `<text>` elements (root cause of tab freeze), scoped selection to workspaces tab, fixed rename view reset**

## Performance

- **Duration:** 45 min (including root cause investigation)
- **Completed:** 2026-03-20
- **Tasks:** 2 (original) + manual debugging and correction
- **Files modified:** 3

## Accomplishments

- Identified root cause: OpenTUI's `TextRenderable.add()` delegates to `TextNodeRenderable.add()` which only accepts `string | TextNodeRenderable | StyledText` — a nested `<text>` creates a `TextRenderable` (different class), causing crash
- Rewrote TemplateList and RepoList to use `<box flexDirection="row">` with sibling `<text>` elements, matching WorkspaceRow pattern (colored segments, highlighted background)
- Reverted App.tsx to original Switch/Match — conditional rendering works correctly when components don't crash
- Gated Space key, batch operations (`c`/`r`), and BatchBar to workspaces tab only
- Fixed rename: `setView({ view: "list" })` after successful rename; error stays on progress view

## Files Modified

- `src/tui/dashboard/App.tsx` — Restored Switch/Match, scoped selection/batch to workspaces tab, kept rename fix
- `src/tui/dashboard/TemplateList.tsx` — Flattened to row-box pattern with sibling text segments
- `src/tui/dashboard/RepoList.tsx` — Flattened to row-box pattern with colored disk indicator

## Decisions Made

- The original plan's hypothesis (Switch/Match causes no-repaint) was wrong — the actual issue was nested `<text>` crashing before content could render
- `visible` prop works (`yogaNode.setDisplay(Display.None)` + `requestRender()`) but is unnecessary when Switch/Match works
- Show/Switch/Match all work fine for conditional rendering in OpenTUI as long as no nested `<text>` is involved

## Deviations from Plan

- Plan prescribed height-based visibility approach — this was incorrect. Reverted to original Switch/Match after identifying the real root cause (nested `<text>` crash)
- Added selection scoping fix (not in original plan) — discovered during testing

---
*Phase: 08-dashboard-tab-layout*
*Completed: 2026-03-20*
