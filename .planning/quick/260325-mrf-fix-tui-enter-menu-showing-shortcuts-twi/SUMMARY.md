---
status: complete
phase: quick
plan: 260325-mrf
subsystem: tui-dashboard
tags: [bugfix, tui, version-bump]
dependency_graph:
  requires: []
  provides: [clean-repo-action-menu-display]
  affects: [src/tui/dashboard/RepoActionMenu.tsx]
tech_stack:
  added: []
  patterns: [solidjs-reactive-labels]
key_files:
  created: []
  modified:
    - src/tui/dashboard/RepoActionMenu.tsx
    - package.json
    - CHANGELOG.md
decisions:
  - "Remove [key] prefix from label functions only — JSX template already renders [{item.key}] and must not change"
metrics:
  duration: ~5 minutes
  completed: 2026-03-25T15:26:22Z
  tasks_completed: 2
  files_modified: 3
---

# Quick Fix 260325-mrf: Fix TUI RepoActionMenu Doubled Shortcuts Summary

**One-liner:** Removed embedded `[key]` prefixes from RepoActionMenu label functions to eliminate doubled shortcut display (e.g., `[r] [r] Remove`), then bumped version to 0.9.1.

## What Was Done

### Task 1 — Fix doubled shortcuts in RepoActionMenu
**Commit:** d1c531f

The three label functions (`wsLabel`, `tplLabel`, `removeLabel`) in `src/tui/dashboard/RepoActionMenu.tsx` embedded `[key]` prefixes in their return strings. The JSX render template at line 52 also unconditionally renders `[{item.key}]` before the label — the same pattern used correctly in `ActionMenu.tsx` and `TemplateActionMenu.tsx`.

Removed the `[key]` prefixes from all three label functions. The JSX template was left untouched. Dynamic selection counts (e.g., `Remove (3)`) are preserved.

**Before:** `[r] [r] Remove` / `[w] [w] Create workspace (2 repos)`
**After:** `[r] Remove` / `[w] Create workspace (2 repos)`

### Task 2 — Version bump and changelog
**Commit:** 47c0eb6

- `package.json`: `"version": "0.9.0"` → `"version": "0.9.1"`
- `CHANGELOG.md`: Added `## [0.9.1] — 2026-03-25` section above the 0.9.0 entry with the fix documented

## Verification

- `bun run typecheck` passes clean (no errors)
- Visual inspection confirms label functions return plain text without `[key]` prefix
- `grep '"version": "0.9.1"' package.json` matches
- `grep '## \[0.9.1\]' CHANGELOG.md` matches

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None.

## Self-Check: PASSED

- `src/tui/dashboard/RepoActionMenu.tsx` — FOUND (modified)
- `package.json` — FOUND (version 0.9.1)
- `CHANGELOG.md` — FOUND (0.9.1 section present)
- Commit d1c531f — FOUND
- Commit 47c0eb6 — FOUND
