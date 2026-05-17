---
sketch: 007
name: final-tui-directions
question: "Which implementable TUI direction best combines responsive layout, grouping, details, services, and message attention?"
winner: null
tags: [synthesis, tui, management]
---

# Sketch 007: Final TUI Directions

## Design Question

Given the current `git-stacks manage` behavior and the decisions made during sketching, which concrete terminal layout direction should drive implementation?

## How to View

open .planning/sketches/007-final-tui-directions/index.html

## Variants

- **A: Stacked Control Center** - Closest to the current layout: list over detail, with stacked detail sections when height allows.
- **B: Adaptive Split** - Side-by-side only at wide widths; detail sections stack when height allows and fall back to section cycling when cramped.
- **C: List-First Focus** - Optimized for smaller terminals: list plus selected-workspace summary strip; full detail is a mode/overlay.

## Shared Decisions

- Top title owns tab navigation: `[1 Workspaces]  2 Templates  3 Repos`.
- Bottom row shows operations available in the current tab only.
- Workspaces are primary, but Templates and Repos stay as separate tabs.
- Menus remain overlays/dialogs.
- Grouping toggles between none, label, and derived state.
- Workspace rows stay navigable and batch-selectable.
- Detail sections are read-only status summaries, not buttons.
- Workspace detail section order: message banner, repos, running services, details/config.
- Detail sections should stack when the detail pane has enough vertical space.
- Detail section cycling is an overflow behavior for constrained height, not the default.
- Messages are receive-only and route to the full message overlay.
- Running services are fire-and-forget status from integrations: configured/alive/unknown/done, no invented controls.
- Template and Repo tabs follow the same structure with tab-specific detail content.
- Detail section navigation is a proposed overflow mode, not current behavior:
  - When sections do not fit, show one detail section and use `d` to cycle forward: repos -> services -> details.
  - `Shift+d` can cycle backward if implemented.
  - The footer must show `d Detail Section` only when the layout is in constrained section mode.
  - These are not clickable tabs and do not compete with global `1`/`2`/`3` tabs.
- Workspace rows should reuse the existing `WorkspaceRow` language rather than full written labels:
  - selection/focus prefix
  - status glyph
  - workspace name
  - branch
  - compact git arrows/counts such as `↑2`, `↓5`, `~2`
  - repo counts as space allows
  - latest message preview at the end, otherwise age
- Keep list entries conservative. They should support scanning and selection, not duplicate the detail pane.
- Avoid full words like `git dirty:2 behind:5` in rows; they waste terminal columns.
- Do not show labels in every row if labels are already visible through label grouping, detail/config sections, or filters.

## Layout Decision Notes

- Stack versus split is a core implementation decision.
- Stacked layout is the safer default because it matches the current TUI and scales better when terminal width is limited.
- Horizontal split should be gated behind a generous width threshold; otherwise the workspace list becomes crowded and loses scan value.
- If split is implemented, it should be an adaptive enhancement, not the baseline.
