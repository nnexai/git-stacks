# Native Full-Ghostty Terminal Acceptance Evidence

Status: PASS — approved 2026-07-11

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

- Observer: project owner
- Date: 2026-07-11
- Distro and version: Fedora Linux 44
- Session protocol: [x] Wayland [ ] X11
- Desktop/compositor and version: user Wayland session
- GTK version: 4.22.4
- GPU, renderer, and driver: real user GPU session; GDK Vulkan reported only `VK_SUBOPTIMAL_KHR` during window resize
- Locale: `en_US.UTF-8` / `C.UTF-8`
- IME framework and input method:
- Standalone Ghostty command/version:
- Production artifact SHA-256: `b9587c34e90ef440c1c17d21b4fd7fe776dcae944152b51588fbc77170dbf99f`
- `native/deps/ghostty.lock` SHA-256: `8dbd4cadf59ae08117c8fd643889e8b9c56a40180239c1dbd51bb84d42aa4131`
- Effective Ghostty configuration paths/includes:
- Launch command: `bun run native:run`

## Checkpoint history

- Initial full-surface observation: `FAIL` — normal printable keys produced no text, while shortcuts, Enter, arrows, focus/cursor, selection, and paste worked.
- Root cause: `GtkIMContext` commit bytes were sent as a synthetic composing key event with keycode zero.
- Remediation: commit `7dffab90` forwards committed UTF-8 through `ghostty_surface_text`; automated interaction and full native verification pass.
- Human result for the remediated artifact: NOT YET OBSERVED.
- Second full-surface observation: `FAIL` — cooked-shell typing worked, but raw-mode TUI commands such as `q`, `?`, and digits were swallowed; lazygit also honored an inherited `NO_COLOR=1` and rendered a simplified palette.
- Raw-key remediation: commit `c43c30cf` implements Limux/Ghostty-style IM arbitration, buffering a synchronous plain commit into the original physical `ghostty_surface_key` event while committing true composition only once.
- Capability remediation: commit `462d3deb` removes launcher-scoped `NO_COLOR` before Ghostty initializes while verifying live children retain `TERM=xterm-ghostty`, `COLORTERM=truecolor`, and a nonempty `TERMINFO`.
- Human result for the second remediated artifact: PASS. Cooked typing, raw `q`/`?`/digits in TUIs, color parity, and the prior interaction lanes were approved.

## Standalone Ghostty fidelity

Use the same shell, working directory, environment, and Ghostty configuration on both sides.

| Check | Result | Observation / artifact |
| --- | --- | --- |
| Font family, fallback, size, weight, shaping, and glyph clarity match | PASS | Approved against standalone Ghostty |
| Cursor shape, color, visibility, and blink match | PASS | Approved against standalone Ghostty |
| Palette, foreground/background, bold/dim, and theme match | PASS | Lazygit parity approved after launcher `NO_COLOR` remediation |
| Config includes, keybindings, and shell integration take effect | PASS | Full Ghostty config delegation approved |
| Fish starts without terminal-query timeout | PASS | Observed in production artifact |
| Fish autosuggestions remain visually distinguishable | PASS | Observed in production artifact |

## D-23 interaction matrix

Fill every row with `PASS`, `FAIL`, or `UNSUPPORTED`, plus concise evidence.

| Check | Result | Observation / artifact |
| --- | --- | --- |
| Plain typing and key release | PASS | Cooked and raw-mode typing approved; no duplication |
| Ctrl/Alt/Super, function, navigation, and rich keyboard protocol | PASS | Approved |
| Unicode, combining marks, emoji, grapheme clusters, and complex scripts | PASS | Approved |
| Mouse selection and application mouse reporting | PASS | Approved |
| Smooth/discrete scrolling and scrollback | PASS | Approved |
| System clipboard copy and paste | PASS | Approved |
| Primary selection copy and paste | PASS | Approved |
| IME preedit, commit, cancellation, and cursor placement | PASS | Approved after IM arbitration remediation |
| Focus in/out and visible focus/cursor | PASS | Approved |
| Resize/reflow with nonzero full-pane geometry | PASS | Approved |
| Alternate screen enter/exit | PASS | Approved |
| Full-screen TUI uses the complete pane | PASS | nvim, git-stacks TUI, and lazygit verified |
| Terminal queries receive valid responses | PASS | Fish startup approved |
| Natural child exit | PASS | Ctrl+D/EOF exercised deliberately |
| Close request with meaningful activity | PASS | Approved production behavior |
| Ordinary close and application quit | PASS | Clean validation-host shutdown observed |
| Abrupt host/crash guard cleanup | PASS | Automated independent guard and production stress evidence |

## Two-surface isolation

| Check | Result | Observation / artifact |
| --- | --- | --- |
| Both leaves render nonzero independent grids | PASS | Approved split host |
| Focus and typing stay in the selected leaf | PASS | Approved split host |
| Selection and both clipboards do not crosstalk | PASS | Approved split host |
| Independent resize/reflow and TUI state | PASS | Approved split host |
| Close left then right leaves no child | PASS | Automated alternating destroy-order stress |
| Close right then left leaves no child | PASS | Automated alternating destroy-order stress |

## Automated lifecycle evidence

- Ordinary JSON diagnostic:
- Extended JSON diagnostic:
- Final live surfaces/callbacks/clipboard/GL areas/GL contexts/children (all zero):
- RSS median/range/slope:
- FD range:
- Thread range:
- GPU/compositor warnings:

## Sign-off

- Overall result: [x] PASS [ ] FAIL
- Failures or unsupported observations: Cell-level accessible text remains unsupported as documented separately.
- Observer signature/reference: conversational Phase 105 Plan 09 approval, 2026-07-11
