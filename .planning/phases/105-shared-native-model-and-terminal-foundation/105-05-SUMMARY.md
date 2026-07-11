---
phase: 105-shared-native-model-and-terminal-foundation
plan: 05
subsystem: native-terminal
tags: [zig, ghostty-vt, gtk4, pango, wayland]
requires:
  - phase: 105-shared-native-model-and-terminal-foundation
    provides: Exact Ghostty and Zig pins plus terminal ownership lifecycle
provides:
  - Exact-pin ghostty-vt adapter and detached render frames
  - Focusable GTK4 terminal widget with generation-safe teardown
  - Production GtkApplication executable and bounded graphical smoke
affects: [106-linux-native-client, 107-macos-native-client]
tech-stack:
  added: [ghostty-vt, GTK4, Pango, GSK]
  patterns: [exact-pin adapter boundary, detached render frame, bounded graphical smoke]
key-files:
  created: [native/terminal/vt_adapter.zig, native/linux/renderer.zig, native/linux/terminal_widget.zig, native/tests/vt_adapter_test.zig, native/tests/renderer_test.zig, native/tests/terminal_widget_test.zig]
  modified: [native/build.zig, native/build.zig.zon, native/linux/app.zig, scripts/verify-native.ts, package.json]
key-decisions:
  - "Only vt_adapter.zig imports ghostty-vt; GTK consumes product-owned detached frames."
  - "The same GtkApplication main serves human runs and deterministic smoke execution."
requirements-completed: [TERM-01, TERM-03, TERM-05]
duration: 32min
completed: 2026-07-11
status: complete
---

# Phase 105 Plan 05: Pinned VT and GTK Terminal Frame Summary

**The corrective Linux slice now parses the exact pinned ghostty-vt state and displays it through a focusable, runnable GTK application with bounded graphical evidence.**

## Performance

- **Duration:** 32 min
- **Completed:** 2026-07-11T14:34:51Z
- **Tasks:** 3
- **Task commits:** 3

## Accomplishments

- Replaced the synthetic full-surface event recorder with a sole exact-pin `ghostty-vt` boundary owning real Terminal, Stream, and RenderState objects.
- Added product-owned immutable render frames, resize/reflow and alternate-screen evidence, key encoding, and safe-paste classification.
- Added a focusable GTK4 widget whose renderer consumes detached VT frames through GtkSnapshot and Pango and invalidates stale redraw tokens after teardown.
- Added a production `git-stacks-native` GtkApplication executable shared by human run and deterministic smoke modes.
- Added fail-closed source audits, graphical prerequisite diagnostics, 30-second bounds, readiness evidence, and clean-exit checks.

## Task Commits

1. **Replace the synthetic full-surface seam with the pinned VT adapter** — `7a4a1115`
2. **Build the real focusable GTK widget and snapshot renderer seam** — `10104de9`
3. **Ship and smoke the production GTK executable** — `eda2ccb9`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Build dependency wiring] Reproduce the pinned module's generated Unicode dependencies**

- **Found during:** Task 1 compatibility compilation
- **Issue:** Importing `src/lib_vt.zig` directly also requires the pinned `terminal_options`, `uucode`, and generated Unicode-table modules used by Ghostty's build.
- **Fix:** Declared the exact uucode dependency and generated the same property table from the pinned checkout without broadening the production API boundary.
- **Verification:** `bun run native:test:vt`
- **Committed in:** `7a4a1115`

**2. [Rule 1 - Pointer lifetime] Stabilize the real terminal behind its VT stream**

- **Found during:** Task 1 alternate-screen test
- **Issue:** Returning a by-value Terminal moved the object after `vtStream()` captured its address.
- **Fix:** Allocated the upstream Terminal at a stable private address owned by VtAdapter.
- **Verification:** alternate-screen entry and exit pass under `native:test:vt`
- **Committed in:** `7a4a1115`

**Total deviations:** 2 auto-fixed (1 blocking build issue, 1 correctness bug).
**Impact:** Both fixes are internal requirements of the exact-pin boundary; no public API or architecture changed.

## Verification

- `bun run native:test:vt` — passed
- `bun run native:test:renderer` — passed on the active Wayland display
- `bun run native:test:widget` — passed on the active Wayland display
- `bun run native:build-app` — installed `git-stacks-native`
- `bun run native:smoke-app` — real window readiness and clean quit passed
- `bun run native:test:quick` — passed, including model, source boundary, lifecycle stress, and GTK host coverage
- `git diff --check` — passed

## Issues Encountered

- The host has an active Wayland display but no installed Weston or Xvfb binary. The verifier uses the active display when present and otherwise fails closed with an explicit prerequisite diagnostic.

## User Setup Required

Run `bun run native:setup` once to populate the exact pinned Zig, Ghostty, and uucode cache. A GTK4/Pango development installation and a real or virtual graphical display are required for graphical gates.

## Next Phase Readiness

- Phase 106 can compose workspace UI around the production terminal widget and exact-pin VT boundary.
- PTY byte transport remains intentionally outside this corrective frame slice and can attach to `VtAdapter.feed` without exposing Ghostty types.

## Self-Check: PASSED

- All three corrective task commits exist.
- All six plan acceptance commands pass.
- The summary exists before state closeout.
- Unrelated Phase 106 planning changes were neither staged nor modified by this executor.

---
*Phase: 105-shared-native-model-and-terminal-foundation*
*Completed: 2026-07-11*
