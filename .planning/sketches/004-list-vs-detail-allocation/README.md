---
sketch: 004
name: list-vs-detail-allocation
question: "What belongs in the workspace list row versus the focused detail pane?"
winner: null
tags: [list, detail, density, tui]
---

# Sketch 004: List vs Detail Allocation

## Design Question

In a limited TUI, what information should be visible in every workspace row, and what should only appear in the focused workspace detail pane?

## How to View

open .planning/sketches/004-list-vs-detail-allocation/index.html

## Variants

- **A: Minimal Rows, Strong Detail** - Rows show only attention/state/name/branch/age; detail carries repo, messages, services, merge readiness.
- **B: Operational Rows** - Rows include compact git/message/service signals; detail provides the full control surface.
- **C: Grouped Rows with Control Detail** - Group headers carry real grouping modes, rows stay compact, and detail shows selected workspace repos, running services, messages, links, and expanded workspace configuration.

## What to Look For

Compare scan speed against control density. The list should help choose the right workspace quickly; the detail pane should provide status and direct controls without explanatory filler.

## Feedback Notes

- Grouping should be toggleable: no grouping, label grouping, or state grouping.
- State grouping should be derived only from currently available data: messages, labels, loaded repo status, dirty/missing/ahead/behind state, and known integration configuration. Actual live runtime/service state should be displayed only when implemented.
- Keep multi-select workflows visible. Batch operations such as deleting/removing several workspaces are important.
- Preserve the bottom hotkey row and the `1`/`2`/`3` shortcuts for Workspaces, Templates, and Repos.
- Do not repeat tab switching in the bottom hotkey row. The top tab title already teaches `1`/`2`/`3`; the bottom row should show current-tab operations.
- The focused detail pane should include the repo list within the workspace and running services collected from integrations.
- Repos per workspace are expected to be small, so the focused detail pane can usually show every repo plus workspace configuration summaries.
- The detail pane should increasingly surface workspace configuration with concrete values: env/env_file, files sync/copy/symlink entries, integrations, forge PR/MR source, linked ticket/issue references, hooks, and ports.
- Avoid explanatory labels. Use operational headers and data.
