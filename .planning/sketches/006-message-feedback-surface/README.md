---
sketch: 006
name: message-feedback-surface
question: "How should workspace messages surface agent/tool feedback without wasting detail-pane space?"
winner: "A"
tags: [messages, feedback, detail, tui]
---

# Sketch 006: Message Feedback Surface

## Design Question

How should the workspace detail area show repos, running services, and general details while treating messages as a feedback/attention mechanism rather than a tiny scrolling pane?

## How to View

open .planning/sketches/006-message-feedback-surface/index.html

## Variants

- **A: Message Banner** - Detail pane is repos, services, details; messages appear as a compact attention banner above details and open the full overlay.
- **B: Focus Queue** - Messages become a focused queue row between list and detail, optimized for "agent is waiting for user input".
- **C: Message Mode** - Normal detail shows repos/services/details; pressing `m` switches the detail pane into a message-focused view without leaving the main layout.

## What to Look For

Compare how well each variant handles messages as actionable feedback while keeping the normal detail pane stable and responsive.

## Design Constraints

- Detail order: repos first, running services second, general details last.
- Avoid stacking many unknown-height panes in one column.
- Links belong in general details, not a standalone permanent pane.
- Full message overlay remains available.
- Message preview must emphasize attention state: unread, stale/fresh, sender, waiting/question state, and shortcut to the full message overlay.
- Bottom row remains current-tab operations only.

## Selected Direction Notes

- Prefer Variant A: Message Banner.
- Messages are receive-only in the TUI; do not include answer/reply affordances.
- Message banner should route to the full message overlay for reading/clearing.
- Combine this with the responsive layout rules from Sketch 005.
- Detail panes are scoped to the active tab:
  - Workspaces: repos, running services, messages banner, links, env/files/integrations.
  - Templates: template repos, files/env/hooks/integrations/labels.
  - Repos: registry path/type/default branch, disk health, and where the repo is used.
- Detail rows are not buttons. Do not show `open`, `edit`, `logs`, `stop`, or similar row-level action labels in the normal detail pane.
- Navigation model: list rows are navigable; detail sections are switched as whole sections; operations happen through current-tab shortcuts or action overlays.
- Running services are fire-and-forget. Show configured task/session and alive/unknown/stopped status only unless a real control is implemented.
- Detail sections are a proposed keyboard mode, e.g. `d` cycles sections. They are not clickable sub-tabs.
