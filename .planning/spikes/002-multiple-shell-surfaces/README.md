---
spike: 002
name: multiple-shell-surfaces
type: standard
validates: "Given multiple PTYs, when visible tabs change, then background processes and independent terminal state continue correctly"
verdict: PARTIAL
related: [001]
tags: [opentui, pty, tabs]
---

# Spike 002: Multiple Shell Surfaces

## What This Validates

Whether multiple PTY/emulator pairs can remain active independently while a dashboard chooses which buffer to render.

## Research

This builds directly on spike 001. Each surface requires its own PTY, emulator buffer, dimensions, lifecycle, and input focus. OpenTUI tab selection alone does not suspend background callbacks.

## How to Run

```bash
cd .planning/spikes/002-multiple-shell-surfaces
bun install
bun run spike.ts
```

## What to Expect

Both simulated surfaces advance while not visible, retain separate buffers, and accept independent resizing.

## Observability

The JSON event trail records per-surface output and simulated visibility changes.

## Investigation Trail

- Modeled tab switching as projection selection, leaving both PTYs active.
- Resized only one surface to detect accidental shared state.

## Results

**PARTIAL.** Two PTY/emulator pairs advanced concurrently while their simulated visible tab changed. Their buffers remained isolated and resizing one from 48 to 60 columns did not affect the other.

The concurrency mechanism is straightforward, but every surface is a process git-stacks must own, monitor, resize, terminate, and restore. Switching the rendered projection is easy; delivering persistence across dashboard restarts would require a daemon or an external owner such as tmux. That conflicts with git-stacks' integration-neutral session boundary.
