---
spike: 003
name: tmux-control-plane
type: standard
validates: "Given tmux-owned panes, when the dashboard queries them, then it can show inventory, previews, attention, and attach actions without owning sessions"
verdict: VALIDATED
related: [001, 002]
tags: [tmux, integration, dashboard]
---

# Spike 003: tmux Control Plane

## What This Validates

Whether git-stacks can offer a Supacode-like activity overview by observing an integration's sessions instead of embedding or owning terminals.

## Research

tmux already exposes stable machine-readable primitives: `list-panes -F` for inventory, `capture-pane -p` for preview/attention inference, `send-keys` for optional control, and `attach-session`/`select-pane` for handoff. git-stacks already wraps session creation, pane creation, sending, and focus; inventory and capture are the notable missing read operations.

## How to Run

```bash
bun run .planning/spikes/003-tmux-control-plane/spike.ts
```

## What to Expect

The experiment creates a disposable tmux session with agent and server windows, discovers both, captures their state, prints an attach action, and removes the session.

## Observability

Output includes the discovered pane model, captured previews, checks, and event metadata.

## Investigation Trail

- Used tmux's format strings instead of parsing human display output.
- Kept attention signaling in pane output for the experiment; production should use structured git-stacks hook state.
- Treats attach as a handoff action, preserving tmux ownership.

## Results

**VALIDATED.** A disposable tmux session exposed two independently running windows through `list-panes`; `capture-pane` returned `agent:working`, `agent:waiting`, and `server:ready`; and the experiment produced a direct attach command. Repeated runs passed after increasing the observation delay to remove a legitimate scheduling race.

The initial version falsely matched command echo rather than emitted state. Starting pane commands directly isolated the evidence and proved that preview capture works. Production attention should come from structured agent hooks rather than scraping terminal text, while captured output is suitable for a compact preview.
