---
created: 2026-05-17T11:01:03.605Z
title: Add repo edit action
area: ui
resolves_phase: 99
files:
  - src/tui/dashboard/RepoActionMenu.tsx
  - src/tui/dashboard/App.tsx
---

## Problem

The `git-stacks manage` repo view does not expose an edit action, while workspaces and templates already have edit flows. This makes the Repos tab feel inconsistent with the other management tabs and forces repo configuration edits outside the TUI.

## Solution

Add an edit action to the repo action menu and route it through the dashboard action handling, matching the existing workspace/template edit behavior as closely as the repo registry model allows. Include focused TUI/menu tests or snapshot coverage for the new repo action.
