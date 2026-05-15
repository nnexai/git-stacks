---
created: 2026-05-15T20:42:51.892Z
title: Improve TUI dashboard experience
area: ui
files:
  - src/tui/dashboard/App.tsx
  - src/tui/dashboard/WorkspaceDetail.tsx
  - src/tui/dashboard/WorkspaceList.tsx
---

## Problem

The current `git-stacks manage` TUI is useful but still feels barebones. The user wants a reminder to improve the TUI as a future area, especially after exploring new workspace surfaces such as notes, stale classification, manual commands, and files sync.

## Solution

Plan a future TUI-focused improvement pass that makes the dashboard feel more like the primary workspace control center instead of a thin CRUD surface.

Potential directions to consider later:

- Better workspace detail panels with notes, stale status, branch/PR state, labels, messages, paths, ports, and file sync drift.
- More useful grouping/filtering beyond current labels, such as stale class, dirty/ahead state, last opened age, or template.
- Action menu improvements for common operator workflows: open, sync, push, stale review, files status, notes, and cleanup.
- Stronger visual hierarchy and clearer status indicators while staying terminal-native.
- TUI parity for high-value CLI features once their CLI behavior settles.

Keep this as a reminder only for now; do not start a milestone from it until the next set of ideas is compared.
