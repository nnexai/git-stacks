---
spike: 005
name: libghostty-ecosystem-survey
type: comparison
validates: "Given the current libghostty ecosystem, when Linux embedders are inspected, then a complete Ghostty-rendered pane path exists beyond a product-owned ghostty-vt renderer"
verdict: VALIDATED
related: [004a, 004b]
tags: [ghostty, linux, embedding, ecosystem]
---

# Spike 005: libghostty Ecosystem Survey

## What This Validates

Whether the earlier conclusion that Linux has no viable full Ghostty pane integration still holds in the current ecosystem.

## Research

| Approach | Evidence | Result |
|---|---|---|
| Upstream `libghostty-vt` | Ghostty README and Ghostling | Correct VT/state library, but consumer still owns rendering and platform behavior. Not a full pane. |
| Upstream rendered C surface | Current upstream `include/ghostty.h` / `src/apprt/embedded.zig` | Apple rendered platforms are public; Linux is not currently exposed by upstream. |
| Supacode/GhosttyKit | `supabitapp/supacode` | Full configuration and surface fidelity on macOS through GhosttyKit; useful architecture precedent but not Linux. |
| Limux embedded Ghostty | `am-will/limux` plus `am-will/ghostty` | Complete Linux GTK4/OpenGL surfaces hosted inside panes. This is the viable path. |
| VTE | GNOME VTE GTK4 API | Mature complete GTK widget, but not Ghostty and does not inherit Ghostty behavior/configuration. |

Primary sources:

- https://github.com/ghostty-org/ghostty
- https://github.com/ghostty-org/ghostling
- https://github.com/supabitapp/supacode
- https://github.com/am-will/limux
- https://github.com/am-will/ghostty
- https://gnome.pages.gitlab.gnome.org/vte/gtk4/class.Terminal.html

## Investigation Trail

1. Rechecked upstream public headers and embedded runtime at current main. The upstream project describes libghostty as embeddable, but the complete cross-platform public deliverable remains `libghostty-vt`; Ghostling explicitly supplies its own renderer.
2. Inspected Supacode source. It delegates configuration and surfaces to full GhosttyKit rather than parsing/rendering terminal state itself.
3. Found Limux, a current Linux GTK4 workspace manager with Ghostty-rendered tabs and split panes.
4. Inspected Limux's Rust FFI and terminal host. It calls the full `ghostty_config_*`, `ghostty_app_*`, and `ghostty_surface_*` API, hosts each surface in a `GtkGLArea`, and forwards GTK input, IME, clipboard, focus, scale, size, realize, draw, and unrealize events.
5. Confirmed the Limux Ghostty fork adds a Linux platform payload to the embedded surface API. This invalidates the old assumption that the only Linux choices were `ghostty-vt` or importing Ghostty's entire standalone GTK application.

## Results

**VALIDATED.** A complete Ghostty-owned Linux terminal pane path exists today through the Limux Ghostty fork. The correct architectural unit is the embedded core surface hosted by a GTK `GLArea`, not `ghostty-vt` plus a product renderer and not the standalone Ghostty GTK application graph.

The earlier Spike 004b conclusion was over-constrained by requiring git-stacks to retain exclusive PTY ownership and by examining only the pinned upstream API. Fully functional panes require Ghostty to own the terminal surface, renderer, configuration, PTY behavior, and compatibility machinery.
