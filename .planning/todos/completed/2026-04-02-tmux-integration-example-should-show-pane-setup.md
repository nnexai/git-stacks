---
created: 2026-04-02T03:09:40.199Z
title: Tmux integration example should show pane setup
area: docs
files:
  - src/lib/integrations/tmux.ts
---

## Problem

The tmux integration documentation/examples don't demonstrate how to configure pane layouts. Users need to understand what options are available for setting up panes within tmux sessions created by git-stacks (e.g., splitting horizontally/vertically, running specific commands in each pane, setting pane sizes).

## Solution

Update tmux integration examples to show:
- How to define pane splits (horizontal/vertical)
- Running different commands per pane (editor, test watcher, server, etc.)
- Pane layout presets if supported
- Hook-based pane setup via post_open hooks
