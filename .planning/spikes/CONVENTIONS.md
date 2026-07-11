# Spike Conventions

Patterns and stack choices established across spike sessions.

## Stack

- Bun/TypeScript remains the orchestration and verification layer.
- Native terminal experiments use the repo-pinned Zig and Ghostty revisions.

## Structure

- Native feasibility claims must distinguish terminal-state APIs from rendered surface APIs.
- A human-verification checkpoint requires a runnable interface, not only synthetic lifecycle tests.

## Patterns

- For complete Linux terminal panes, the GTK host owns pane/workspace layout while one Ghostty rendered surface owns each terminal leaf, including its PTY, renderer, fonts, input protocol, and terminal compatibility.
- Do not build a product renderer over `libghostty-vt` when Ghostty visual and behavioral fidelity is a requirement; `libghostty-vt` is appropriate only when the consumer intentionally owns rendering and platform behavior.
- Prefer supported upstream module boundaries; importing private application runtimes requires an explicit architecture decision.
- Record exact upstream commit identities for time-sensitive API conclusions.
- Any downstream Ghostty surface patch must pin an exact commit and carry automated ABI, build, rebase, and interactive smoke checks.

## Tools and Libraries

- `libghostty-vt` is the supported cross-platform embedding primitive as of upstream commit `53bd14fecfd68c6c0ab64d37b5943247299e2b40`.
- The full `ghostty_surface_*` embedding API is not a supported Linux/GTK surface boundary at that commit.
- Limux fork commit `81ab8ffa90185221782baf785e85387321e16f8d` proves a full Linux `ghostty_surface_*` host boundary using a current `GtkGLArea` OpenGL context.
- GNOME VTE GTK4 is the mature non-Ghostty fallback if maintaining the Linux surface patch becomes unacceptable.
