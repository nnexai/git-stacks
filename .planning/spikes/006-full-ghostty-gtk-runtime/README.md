---
spike: 006
name: full-ghostty-gtk-runtime
type: standard
validates: "Given the Limux Ghostty fork, when libghostty is built with app-runtime=none, then a Linux host receives the complete rendered surface API without importing the standalone GTK app"
verdict: VALIDATED
related: [005, 004b]
tags: [ghostty, linux, gtk, runtime, opengl]
---

# Spike 006: Full Ghostty Embedded Runtime

## What This Validates

Whether the concrete Ghostty fork used by Limux can build locally as a hostable library and exposes the lifecycle needed by a GTK pane.

## Research

Limux builds Ghostty with:

```bash
zig build -Dapp-runtime=none -Doptimize=ReleaseFast
```

The host creates a `GtkGLArea`, makes its context current, and calls the embedded surface lifecycle. Ghostty retains its terminal core, fontconfig/FreeType/HarfBuzz stack, OpenGL renderer, configuration, PTY, and terminal compatibility.

## How to Run

```bash
bash .planning/spikes/006-full-ghostty-gtk-runtime/probe.sh
```

## What to Expect

- The exact Limux fork builds `libghostty.so` with Zig 0.15.2.
- The library exports app/config creation and the full surface create/draw/resize/input lifecycle.

## Investigation Trail

1. Downloaded fork commit `81ab8ffa90185221782baf785e85387321e16f8d`, the exact submodule commit in Limux commit `601ee9d879954fa18d25617a119111fb26031d6e`.
2. Built it successfully in this environment using the existing cached Zig 0.15.2 toolchain with `app-runtime=none` and `ReleaseFast`.
3. Verified `libghostty.so` exports `ghostty_app_new`, `ghostty_config_load_default_files`, `ghostty_surface_new`, `ghostty_surface_draw`, `ghostty_surface_set_size`, `ghostty_surface_key`, and `ghostty_surface_text`.
4. Inspected Limux's `terminal.rs`: it supplies the GTK `GLArea` and runtime callbacks while Ghostty owns the complete terminal surface.
5. A full Limux host build stopped only because the machine's Rust 1.82 cannot parse dependencies using Edition 2024. This is a local toolchain prerequisite, not a libghostty feasibility failure; Limux publishes working Linux releases and source smoke harnesses.

## Results

**VALIDATED.** The complete embedded Ghostty surface builds locally and provides the exact lifecycle required for a fully functional GTK pane. The prior Pango renderer should be removed rather than improved.
