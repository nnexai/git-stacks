---
sketch: 001
name: control-center-shell
question: "Which overall pane structure best uses terminal space for workspace management?"
winner: null
tags: [layout, tui, lazygit]
---

# Sketch 001: Control Center Shell

## Design Question

Which overall pane structure best turns `git-stacks manage` into a lazygit-like control center for several active workspaces?

## How to View

open .planning/sketches/001-control-center-shell/index.html

## Variants

- **A: Three Column Control Center** - Workspaces, repo/runtime detail, and action/attention panes are visible together.
- **B: Lazygit Stack** - Left workspace tree with stacked right-side panels for repos, services, messages, and actions.
- **C: Activity Board** - Workspaces grouped by operational state with details for the focused lane item.
- **D: Workspace Status Groups** - Refines B/C for limited terminal space: workspaces stay primary, Templates and Repos remain separate tabs, menus remain overlays, and the main list groups workspaces by operational status derived from labels, messages, and repo/runtime state.

## What to Look For

Compare whether each variant makes it easy to see 6-8 workspaces at once, spot which one needs attention, and decide the next action without opening a modal.

## Feedback Notes

- Variant B is the strongest base direction.
- Keep the design terminal-realistic: assume space is limited and do not depend on a wide dashboard-only layout.
- Do not lose existing functionality. Workspaces are primary, but Templates and Repos should remain on their existing separate tabs rather than always-visible panes.
- Menus do not need permanent screen space; keep them as overlays/dialogs.
- Status grouping is promising. Current available signals are labels, messages from tools/agents running inside a workspace, and existing repo state. Future runtime/service state such as tmux should be an additional status signal when available.
