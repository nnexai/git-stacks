# Native Terminal Acceptance Evidence

Status: NOT YET OBSERVED

This template records the required D-13/D-14 real-session evidence. An unchecked row is not a pass.

## Configuration boundary

This application embeds the pinned `ghostty-vt` parser/state library, not the Ghostty application or its configuration loader. It therefore does **not** inherit `~/.config/ghostty/config`, Ghostty themes, fonts, shaders, keybindings, or other arbitrary Ghostty settings. Phase 105 uses product-owned terminal defaults and the VT-provided ANSI/256/truecolor/style state. Full Ghostty application-configuration parity is not claimed by this foundation.

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
