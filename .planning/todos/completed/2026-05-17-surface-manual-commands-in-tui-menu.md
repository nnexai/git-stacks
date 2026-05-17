---
created: 2026-05-17T14:43:00.000Z
title: Surface manual commands in TUI workspace menu
area: ui
resolves_phase: 99
files:
  - src/tui/dashboard/ActionMenu.tsx
  - src/tui/dashboard/WorkspaceDetail.tsx
  - src/tui/dashboard/App.tsx
---

## Problem

Phase 95 adds named manual workspace commands through the CLI. The user also wants those commands visible from the `git-stacks manage` TUI menu for workspaces, so operators can discover and run workspace commands without leaving the dashboard.

## Solution

Fold this into Phase 99, where dashboard action menus expose missing useful actions and menu labels, disabled states, shortcuts, and footer hints are already in scope.

Phase 98 may prepare details-page summaries, but the actionable workspace-menu entry belongs in Phase 99.

Potential behavior:

- Workspace action menu shows available main manual commands for the selected workspace.
- Hidden `pre*` / `post*` commands follow the Phase 95 default and are not shown as primary menu entries.
- Running from the TUI uses the same resolved execution behavior as `git-stacks command run`.
- Disabled/error states are clear when a workspace has no commands or command resolution fails.
