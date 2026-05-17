---
sketch: 005
name: responsive-terminal-layout
question: "How should the TUI degrade across narrow, medium, wide, and short terminal sizes?"
winner: "base"
tags: [responsive, terminal, layout]
---

# Sketch 005: Responsive Terminal Layout

## Design Question

How should `git-stacks manage` use space when the terminal is not full-screen, and how should the detail pane avoid becoming a cramped dashboard?

## How to View

open .planning/sketches/005-responsive-terminal-layout/index.html

## Variants

- **A: Current-Shape Responsive Stack** - Preserve the current list-over-detail structure, but improve row density and stack detail sections while height allows.
- **B: Wide Split with Stacked Detail** - Use side-by-side list/detail only above a width threshold; keep detail sections stacked while height allows.
- **C: Short Terminal Focus Mode** - For limited height, show list plus a one-line status strip; detail opens as an overlay.

## What to Look For

This sketch is about layout rules, not content breadth. The TUI should never depend on seeing every detail section at once.

## Design Constraints

- Keep `1`/`2`/`3` tab switching.
- Keep top tab title as the place that teaches `1`/`2`/`3` switching.
- Keep bottom hotkey row for operations available in the current tab only; do not waste it repeating top navigation.
- Keep batch selection visible.
- Keep menus and deep detail as overlays.
- Use detail section switching for repos, services, messages, links, and config only when vertical space is constrained.
- Treat running services as a first-class future detail section, not as always-visible dashboard chrome.
- Stack detail sections when vertical space allows; use detail section switching only as overflow behavior.

## Selected Direction Notes

- Use these responsive rules as the base layout direction.
- Prefer stacked layout as the default. It matches the current TUI and degrades better when terminal width is limited.
- Treat horizontal split as a wide-terminal enhancement only, behind a clear width threshold.
- Combine with Sketch 006 Variant A: Message Banner.
- Active tab controls detail content:
  - Workspaces detail: repos, running services, message banner, general details.
  - Templates detail: template repos, files/env/hooks/integrations/labels.
  - Repos detail: registry metadata, disk health, template/workspace references.
  - Menus remain overlays for actions.
- Detail rows are read-only status summaries. Do not render row-level action words in the detail pane unless the UI is explicitly in an action/menu overlay.
- Running services are fire-and-forget status. Show configured task/session and alive/unknown/stopped if the implementation can check it; do not imply logs/stop controls.
- Detail section switching is proposed, not existing. Use an explicit key such as `d`, and label it as a detail section, not a tab.
- Do not show `d Detail Section` in the footer when the visible layout is stacking the sections.
