---
spike: 008
name: multi-pane-ghostty-integration
type: standard
validates: "Given multiple embedded Ghostty surfaces, when a GTK host places them in tabs and split panes, then focus, resize, lifecycle, and surface isolation remain functional"
verdict: VALIDATED
related: [005, 006, 007]
tags: [ghostty, gtk, panes, tabs, lifecycle]
---

# Spike 008: Multi-Pane Ghostty Integration

## What This Validates

Whether the full embedded surface is merely a single-terminal proof or is already proven in the multi-pane product shape git-stacks requires.

## Research

Limux is direct prior art, not an analogy. Its GTK host provides:

- Multiple workspaces, split panes, and tabs.
- One `ghostty_surface_t` per terminal tab.
- A shared `ghostty_app_t` and config.
- Per-surface `GtkGLArea`, realize/unrealize, content scale, size, focus, key, text, IME, mouse, scroll, clipboard, and close handling.
- Pane/tab persistence and surface identity.
- A live control bridge for surface health, text injection, text reads, pane creation, and agent workflows.
- Xvfb smoke coverage and published Linux releases.

Primary implementation paths inspected:

- `rust/limux-host-linux/src/terminal.rs`
- `rust/limux-host-linux/src/pane.rs`
- `rust/limux-host-linux/src/split_tree.rs`
- `rust/limux-host-linux/src/window.rs`
- `rust/limux-ghostty-sys/src/lib.rs`

## Investigation Trail

1. Cloned Limux main at `601ee9d879954fa18d25617a119111fb26031d6e` and inspected the actual FFI and GTK host.
2. Confirmed the terminal root is an embeddable GTK widget composed around `GtkGLArea`, not a separate Ghostty process or captured window.
3. Confirmed split panes are host-owned GTK layout nodes while each leaf embeds a Ghostty surface.
4. Confirmed focus and resize are forwarded per surface and the surface API reports columns, rows, width, and height for health checks.
5. Confirmed Limux documents and ships terminal panes, tabs, split navigation, copy/paste, search, font-size actions, and agent-created panes.

## Results

**VALIDATED.** Multiple fully functional Ghostty terminal panes are already a working Linux architecture. git-stacks should adapt this model: host-owned pane/workspace layout plus Ghostty-owned leaf surfaces.
