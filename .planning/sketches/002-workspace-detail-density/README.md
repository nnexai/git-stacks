---
sketch: 002
name: workspace-detail-density
question: "How should the selected workspace detail pane summarize state without serialized config dumps?"
winner: null
tags: [detail, state, messages, services]
---

# Sketch 002: Workspace Detail Density

## Design Question

How should the selected workspace detail pane become an operational summary for state, messages, services, and merge readiness?

## How to View

open .planning/sketches/002-workspace-detail-density/index.html

## Variants

- **A: Status Dashboard** - Summary metrics, repo matrix, services, and agent messages all visible at once.
- **B: Merge Readiness Checklist** - Detail pane is organized around what blocks merge or cleanup.
- **C: Timeline Detail** - Recent events, messages, git operations, and service state form a chronological story.

## What to Look For

Compare whether each variant answers "what state is this workspace in?" and "what should I do next?" without opening extra overlays.
