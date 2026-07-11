---
phase: 105-shared-native-model-and-terminal-foundation
plan: 09
subsystem: native-terminal
tags: [ghostty, gtk4, stress, accessibility, ime, terminfo, acceptance]
requires:
  - phase: 105-08
    provides: Full Ghostty input forwarding and independent multi-surface host
provides:
  - Production 25/250-cycle graphical lifecycle stress with exact-zero teardown
  - Truthful GtkGLArea accessibility contract and completed acceptance evidence
  - Raw/cooked/IME key arbitration matching the proven Limux integration
  - Ghostty child capability preservation without launcher NO_COLOR leakage
affects: [106-linux-workspace-commands-and-attention, terminal-panes, native-delivery]
tech-stack:
  added: []
  patterns: [production-subprocess-stress, ime-key-event-buffering, child-capability-inspection]
key-files:
  created:
    - native/linux/terminal_environment.zig
  modified:
    - native/tests/lifecycle_stress.zig
    - native/linux/ghostty_input.zig
    - native/linux/ghostty_surface.zig
    - native/linux/ghostty_runtime.zig
    - native/linux/app.zig
    - scripts/verify-native.ts
    - docs/native-terminal-acceptance.md
    - docs/native-terminal-accessibility.md
key-decisions:
  - "Ordinary native verification runs 25 production graphical cycles; the 250-cycle lane is explicit for releases, dependency upgrades, and leak investigation."
  - "Plain synchronous IM commits populate the original physical Ghostty key event; only true composition commits outside that event."
  - "Launcher-scoped NO_COLOR is removed before Ghostty initialization while Ghostty remains owner of TERM, truecolor, terminfo, resources, and configuration."
requirements-completed: [CORE-02, CORE-05, TERM-01, TERM-02, TERM-03, TERM-04, TERM-05]
duration: 75min
completed: 2026-07-11
status: complete
---

# Phase 105 Plan 09: Production Ghostty Acceptance Summary

**The exact GtkGLArea-hosted Ghostty artifact passed production lifecycle stress and human acceptance for configuration fidelity, cooked/raw/IME input, full-screen TUIs, colors, clipboard, focus, resize, and independent panes.**

## Performance

- **Duration:** 75 min
- **Completed:** 2026-07-11
- **Tasks:** 3
- **Human checkpoints:** 3 remediation rounds, final approval received

## Accomplishments

- Replaced the obsolete product-PTY stress with 25 ordinary and 250 opt-in cycles of the actual production executable, alternating one/two surfaces and destroy order while proving zero surfaces, callbacks, clipboard work, GL resources, and child registrations.
- Fixed teardown bugs exposed by stress: a recurring GLib idle source, unsafe GtkGLArea ownership, and double display-realize during asynchronous child registration.
- Replaced custom-widget accessibility claims with the actual GtkGLArea `GENERIC` role, name, focusability, input behavior, and explicit unsupported cell text/caret/selection/actions.
- Fixed printable input twice through observed acceptance: first restoring cooked IM commits, then adopting Limux-style buffering so raw TUI keys preserve physical identity without cooked duplication.
- Traced simplified lazygit colors to inherited launcher `NO_COLOR=1`, removed only that launcher-scoped variable, and verified live Ghostty children retain `xterm-ghostty`, truecolor, and terminfo.
- Completed real-session evidence against standalone Ghostty and received user approval of the final artifact.

## Task Commits

1. **Task 1: Production lifecycle stress** — `3ad2554d`, `78efbb21`
2. **Task 2: Truthful accessibility and composed acceptance gate** — `fc1074cf`, `dd4f6279`, `63ba6e0e`, `a0a68ec3`
3. **Task 3: Human acceptance remediations and approval** — `32302c77`, `7dffab90`, `f2ce3ec4`, `2ad87cc2`, `2748ba2d`, `c43c30cf`, `462d3deb`, `7e2a32b7`

## Verification

- `bun run native:verify` — PASS; ordinary 25-cycle stress exact-zero, RSS slope negative, FD/thread ranges bounded
- `GIT_STACKS_NATIVE_EXTENDED_STRESS=1 bun run native:test:stress` — PASS; 250 cycles exact-zero (run once before checkpoint, not repeated at closeout)
- `bun run test` — PASS; unit and 85/85 integration files
- `bun run typecheck` — PASS
- `bun run test:deps` — PASS; no circular dependencies
- `bun run verify:gates` — PASS
- Human acceptance — PASS on artifact `b9587c34e90ef440c1c17d21b4fd7fe776dcae944152b51588fbc77170dbf99f`

## Deviations from Plan

### Auto-fixed Issues

1. **[Rule 1 - Bug] Production lifecycle was not safe under repeated real GTK/Ghostty teardown.** Fixed callback, widget, display-realize, and resource accounting defects found by the new gate.
2. **[Rule 2 - Missing Critical] Interactive launcher target was absent.** Added an exact production artifact launcher and isolated two-surface acceptance host.
3. **[Rule 1 - Bug] GTK IM filtering lost cooked then raw printable input.** Added RED regressions and implemented physical-key-preserving IM arbitration based on working Limux behavior.
4. **[Rule 1 - Bug] Launcher NO_COLOR suppressed terminal child colors.** Added live child capability evidence and removed only the launcher-scoped variable.

## Accessibility Limitations

- The production GtkGLArea does not expose cell-level accessible text, caret, selection, or terminal actions. These remain explicitly unsupported/unverified rather than being represented as passing screen-reader semantics.
- Focus, keyboard, IME, selection, clipboard, and visible Ghostty cursor behavior passed the supported contract.

## Next Phase Readiness

- Phase 106 can compose the approved full Ghostty leaf into workspace navigation and tabs.
- The ordinary gate stays bounded at 25 cycles; use the 250-cycle lane for fork upgrades, releases, or leak investigations.
- The pinned Linux surface fork still requires ongoing upstream/rebase maintenance.

---
*Phase: 105-shared-native-model-and-terminal-foundation*
*Completed: 2026-07-11*
