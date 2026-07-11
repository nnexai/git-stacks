---
phase: 105-shared-native-model-and-terminal-foundation
plan: 08
subsystem: native-terminal
tags: [ghostty, gtk4, input, ime, clipboard, multisurface]
requires:
  - phase: 105-06
    provides: Ghostty-owned process lifecycle and generation-safe reducer outcomes
  - phase: 105-07
    provides: Reusable GtkGLArea-hosted Ghostty terminal leaf
provides:
  - Complete GTK keyboard, IME, pointer, scroll, focus, and clipboard forwarding
  - Generation-safe asynchronous system and primary clipboard completion
  - Two independently identified, rendered, sized, and registered Ghostty leaves
affects: [106-linux-workspace-commands-and-attention, terminal-panes]
tech-stack:
  added: []
  patterns: [surface-local-userdata, async-generation-validation, host-layout-ghostty-leaf]
key-files:
  created:
    - native/linux/ghostty_input.zig
    - native/linux/ghostty_clipboard.zig
    - native/tests/ghostty_interaction_test.zig
  modified:
    - native/linux/ghostty_surface.zig
    - native/linux/ghostty_runtime.zig
    - native/linux/app.zig
    - native/build.zig
    - scripts/verify-native.ts
    - package.json
key-decisions:
  - "GTK controllers translate complete events directly into each Ghostty surface; no product terminal encoder is used."
  - "User paste is allowed while terminal-initiated OSC 52 reads and writes fail closed until a product confirmation UI exists."
patterns-established:
  - "Every async clipboard request retains stable surface userdata and validates its generation before completion."
  - "Multiple panes share only Ghostty app/config; surface identity, GTK widget, PTY registration, input, size, draw count, and teardown remain independent."
requirements-completed: [CORE-02, CORE-05, TERM-01, TERM-02, TERM-05]
coverage:
  - id: D1
    description: Production Ghostty leaves receive GTK input, IME, pointer, scroll, focus, and both clipboard channels
    requirement: TERM-05
    verification:
      - kind: integration
        ref: bun run native:test:interaction && bun run native:smoke-terminal
        status: pass
    human_judgment: false
  - id: D2
    description: Two concurrent Ghostty leaves retain distinct identities, sizes, render loops, and process registrations
    requirement: CORE-02
    verification:
      - kind: graphical-smoke
        ref: bun run native:smoke-multisurface
        status: pass
    human_judgment: false
duration: 29min
completed: 2026-07-11
status: complete
---

# Phase 105 Plan 08: Ghostty Interaction and Multi-Surface Summary

**Production terminal leaves now delegate complete interaction behavior to Ghostty and coexist as independently operated GTK panes.**

## Performance

- **Duration:** 29 min
- **Completed:** 2026-07-11
- **Tasks:** 2
- **Files modified:** 9

## Accomplishments

- Connected GTK key press/release, committed text, IME preedit, focus, pointer motion/enter/leave, mouse buttons, and smooth/discrete scrolling directly to the matching live Ghostty surface.
- Implemented standard and primary clipboard reads/writes with asynchronous generation validation, safe destruction, and request-specific confirmation policy.
- Assigned distinct product identities to every terminal leaf while retaining the single shared Ghostty app/config runtime.
- Added a production two-pane smoke that proves two nonzero grids, independent render loops, distinct IDs, and two registered Ghostty-owned process groups.
- Replaced the obsolete custom PTY/Pango terminal smoke assertions with evidence from the full Ghostty PTY/render/input path.

## Task Commits

1. **Task 1: Forward complete GTK input, IME, mouse, selection, and clipboard behavior** - `cdb57fb9`
2. **Task 2: Adapt Ghostty lifecycle observations and prove surface isolation** - `c190f4fa`

## Decisions Made

- Regular keyboard input uses `ghostty_surface_key`; IME commits carry composing state, while explicit smoke injection alone uses `ghostty_surface_text`.
- Clipboard callbacks use surface userdata rather than the shared runtime pointer, so completion can never be routed by focus or global state.
- OSC 52 confirmation fails closed. A future product prompt may opt in without changing the surface boundary.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Retained asynchronous clipboard userdata until completion**

- **Found during:** Task 1 safety review
- **Issue:** A late GDK clipboard completion could otherwise inspect userdata embedded in a destroyed surface.
- **Fix:** Clipboard userdata now owns a pending-read count, is invalidated before surface free, and destroys itself only after every outstanding completion drains.
- **Verification:** `bun run native:test:interaction` and terminal smoke pass.
- **Committed in:** `cdb57fb9`

**2. [Rule 3 - Blocking] Replaced superseded terminal smoke expectations**

- **Found during:** Task 2 production smoke wiring
- **Issue:** The verifier still required the removed custom PTY, Pango renderer, font parser, and manual cursor counters.
- **Fix:** Smoke evidence now requires the Ghostty renderer/input/IME/clipboard boundary, live grids, render counts, and independent surface registrations.
- **Verification:** `bun run native:smoke-terminal`, `bun run native:smoke-multisurface`, and `bun run native:audit-production-graph` pass.
- **Committed in:** `c190f4fa`

---

**Total deviations:** 2 auto-fixed (1 missing critical functionality, 1 blocking issue)
**Impact on plan:** Both changes enforce the full-Ghostty architecture and strengthen asynchronous teardown safety.

## Issues Encountered

- Zig treats types from separate `@cImport` modules as incompatible even when their C declarations match; callback wrappers cross module boundaries using primitive values and opaque userdata.
- GTK key events do not expose an explicit repeat signal in the controller callback. Repeated presses are forwarded as complete press events, matching Ghostty's Linux host behavior.

## User Setup Required

None.

## Next Phase Readiness

- Phase 106 can compose terminal leaves into arbitrary splits without owning terminal rendering, PTYs, configuration, fonts, input encoding, or clipboard semantics.
- The production graph contains no competing terminal implementation.

---
*Phase: 105-shared-native-model-and-terminal-foundation*
*Completed: 2026-07-11*
