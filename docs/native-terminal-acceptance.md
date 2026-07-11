# Native Terminal Acceptance Evidence

Status: NOT YET OBSERVED

This template records the required D-13/D-14 real-session evidence. An unchecked row is not a pass.

## Configuration boundary

This application embeds pinned `ghostty-vt`, not GhosttyKit/full libghostty. A product-owned compatibility reader inherits the regular `font-family` fallback list and `font-size` from `$XDG_CONFIG_HOME/ghostty/config.ghostty` (falling back to the pre-1.3 `config`; `$HOME/.config` when XDG is unset). It follows Ghostty's whitespace, comment, quoting, repeat, and empty-reset semantics for those keys. `config-file` includes and all other Ghostty keys—including themes, shaders, adjustments, keybindings, and dynamic reload—remain unsupported. Invalid values fall back safely and are counted without logging configuration contents. This is intentionally not full Ghostty configuration parity.

## Observation identity

- Observer:
- Date:
- Distro and version:
- Session protocol: [ ] Wayland [ ] X11 [ ] Unsupported (explain):
- Desktop/compositor and version:
- GTK/libadwaita versions:
- Zig version:
- Ghostty peeled commit:
- GPU and driver:
- Locale:
- IME framework and input method:
- Command/build identifier:
- Launch command: `bun run native:run`
- Resolved font family / size from readiness evidence:

## Interaction matrix

Fill every row with `PASS`, `FAIL`, or `UNSUPPORTED`, then attach concise observations and artifact references.

| Check | Result | Observation / artifact |
| --- | --- | --- |
| Plain keys, modifiers, shortcuts, and rich keyboard protocol | | |
| Mouse selection and mouse-reporting application | | |
| Unicode, combining marks, emoji, and grapheme clusters | | |
| Resize and reflow while output is visible | | |
| Alternate-screen application enter/exit | | |
| System clipboard copy and paste | | |
| Primary selection copy and paste | | |
| IME preedit, commit, and cursor placement | | |
| Window and terminal focus in/out | | |
| Natural child exit | | |
| Graceful close and meaningful-activity confirmation | | |
| Forced close after bounded graceful period | | |
| Application quit cleanup | | |
| Simulated client-crash guard cleanup | | |

## Ownership and cleanup evidence

- Commands/process tree used:
- Surface, child, and PGID counts after each teardown:
- Absence proof method:
- Any `failed_cleanup` observed (must not be hidden):
- Diagnostic artifact references (do not attach terminal/clipboard secrets):

## Real-GPU lifecycle: 25 cycles

- Cycle range/date:
- Per-cycle create/resize/draw/destroy result artifact:
- Final live surfaces / children / PGIDs (all must be zero):
- FD baseline/final:
- Thread baseline/final:
- RSS warm median/final median:
- GPU or compositor warnings:

## Automated stress evidence

- `bun run native:verify` result/artifact:
- 100-cycle result:
- Optional 500-cycle command: `GIT_STACKS_NATIVE_EXTENDED_STRESS=1 bun run native:verify`
- Optional 500-cycle result/artifact:

## Sign-off

- Overall result: [ ] PASS [ ] FAIL
- Failures or unsupported observations:
- Observer signature/reference:
