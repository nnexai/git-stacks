# Native Full-Ghostty Terminal Acceptance Evidence

Status: NOT YET OBSERVED

This matrix is for the exact production `GtkGLArea`-hosted `ghostty_surface_t`. Automated results are prerequisites, not substitutes for the D-13/D-14/D-23 human observations below. An empty row is not a pass.

## Automated artifact identity

- Architecture: host-owned GTK pane layout; Ghostty-owned PTY, renderer, fonts, configuration, input protocol, and terminal state
- Ghostty base commit: `81ab8ffa90185221782baf785e85387321e16f8d`
- Repository patch digest: `581a77479ec62fc55d7e6822766a6a68db4e9a5d3655388f95b08aac84ff055b`
- Zig: `0.15.2`
- Lock source: `native/deps/ghostty.lock`
- Production source: `native/linux/app.zig` → `ghostty_runtime.zig` → `ghostty_surface.zig`
- Automated gate: `bun run native:verify`
- Ordinary stress: 25 alternating single/two-surface production processes
- Extended stress: `GIT_STACKS_NATIVE_EXTENDED_STRESS=1 bun run native:test:stress` (250 cycles)

The 25-cycle lane is the bounded ordinary `native:verify` gate. The 250-cycle lane is deliberately opt-in for Ghostty dependency upgrades, release qualification, and focused leak investigations; it is not part of the inner development loop.

Ghostty loads its normal default and recursive configuration files through `ghostty_config_load_default_files`, `ghostty_config_load_recursive_files`, `ghostty_config_load_cli_args`, and `ghostty_config_finalize`. Git-stacks does not parse or reinterpret font, cursor, palette, theme, include, keybinding, or shell-integration settings.

## Human observation identity

- Observer:
- Date:
- Distro and version:
- Session protocol: [ ] Wayland [ ] X11
- Desktop/compositor and version:
- GTK version:
- GPU, renderer, and driver:
- Locale:
- IME framework and input method:
- Standalone Ghostty command/version:
- Production artifact SHA-256:
- `native/deps/ghostty.lock` SHA-256:
- Effective Ghostty configuration paths/includes:
- Launch command: `bun run native:run`

## Standalone Ghostty fidelity

Use the same shell, working directory, environment, and Ghostty configuration on both sides.

| Check | Result | Observation / artifact |
| --- | --- | --- |
| Font family, fallback, size, weight, shaping, and glyph clarity match | | |
| Cursor shape, color, visibility, and blink match | | |
| Palette, foreground/background, bold/dim, and theme match | | |
| Config includes, keybindings, and shell integration take effect | | |
| Fish starts without terminal-query timeout | | |
| Fish autosuggestions remain visually distinguishable | | |

## D-23 interaction matrix

Fill every row with `PASS`, `FAIL`, or `UNSUPPORTED`, plus concise evidence.

| Check | Result | Observation / artifact |
| --- | --- | --- |
| Plain typing and key release | | |
| Ctrl/Alt/Super, function, navigation, and rich keyboard protocol | | |
| Unicode, combining marks, emoji, grapheme clusters, and complex scripts | | |
| Mouse selection and application mouse reporting | | |
| Smooth/discrete scrolling and scrollback | | |
| System clipboard copy and paste | | |
| Primary selection copy and paste | | |
| IME preedit, commit, cancellation, and cursor placement | | |
| Focus in/out and visible focus/cursor | | |
| Resize/reflow with nonzero full-pane geometry | | |
| Alternate screen enter/exit | | |
| Full-screen TUI uses the complete pane | | |
| Terminal queries receive valid responses | | |
| Natural child exit | | |
| Close request with meaningful activity | | |
| Ordinary close and application quit | | |
| Abrupt host/crash guard cleanup | | |

## Two-surface isolation

| Check | Result | Observation / artifact |
| --- | --- | --- |
| Both leaves render nonzero independent grids | | |
| Focus and typing stay in the selected leaf | | |
| Selection and both clipboards do not crosstalk | | |
| Independent resize/reflow and TUI state | | |
| Close left then right leaves no child | | |
| Close right then left leaves no child | | |

## Automated lifecycle evidence

- Ordinary JSON diagnostic:
- Extended JSON diagnostic:
- Final live surfaces/callbacks/clipboard/GL areas/GL contexts/children (all zero):
- RSS median/range/slope:
- FD range:
- Thread range:
- GPU/compositor warnings:

## Sign-off

- Overall result: [ ] PASS [ ] FAIL
- Failures or unsupported observations:
- Observer signature/reference:
