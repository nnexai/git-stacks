---
created: 2026-03-22T08:49:26.517Z
title: Add workspace close command
area: workspace
files:
  - src/commands/workspace.ts
  - src/lib/workspace-ops.ts
  - src/lib/integrations/
  - src/tui/dashboard/
---

## Problem

There is no way to "close" a workspace without deleting it. Currently `clean` removes the worktree directories, and `remove` deletes everything. Users need a lighter-weight teardown that ends the tmux session, removes the named workspace from niri, and runs any other integration/hook teardown — but preserves the workspace directory and worktrees so work can be resumed later.

## Solution

Add a `close` command/action that:
- Runs teardown hooks and integrations (end tmux session, remove niri named workspace, etc.)
- Does NOT remove the workspace directory or worktrees
- Available as both `git-stacks close [name]` CLI command and a dashboard action menu entry
- Similar flow to `clean` but skips the filesystem cleanup — only runs the "session end" side of integrations
