---
phase: 105-shared-native-model-and-terminal-foundation
plan: 07
subsystem: native-terminal
tags: [ghostty, gtk4, opengl, process-lifecycle, configuration]
requires:
  - phase: 105-05
    provides: Pinned full Ghostty Linux rendered-surface ABI
  - phase: 105-06
    provides: Birth-token process registration and bounded cleanup controller
provides:
  - Process-wide Ghostty configuration and application runtime
  - Reusable GtkGLArea-hosted Ghostty terminal leaf
  - Production host with Ghostty-owned rendering, fonts, PTY, and terminal behavior
affects: [105-08, linux-workspaces, terminal-panes]
tech-stack:
  added: [GtkGLArea, full-libghostty]
  patterns: [host-owned-layout-ghostty-owned-leaf, registration-before-live, generation-tagged-callbacks]
key-files:
  created:
    - native/linux/ghostty_runtime.zig
    - native/linux/ghostty_surface.zig
    - native/tests/ghostty_surface_test.zig
  modified:
    - native/linux/app.zig
    - native/build.zig
    - scripts/verify-native.ts
    - package.json
key-decisions:
  - "GTK owns windows and layout while every terminal leaf is rendered and operated by full Ghostty."
  - "A Ghostty child remains internal until its PID, PGID, and birth token are registered successfully."
patterns-established:
  - "All Ghostty GL lifecycle calls occur with the GtkGLArea context current."
  - "Runtime callbacks resolve a surface-local generation before touching GTK state."
requirements-completed: [TERM-01, TERM-02, TERM-03]
coverage:
  - id: D1
    description: Full Ghostty configuration/app and surface ABI compile and execute
    requirement: TERM-03
    verification:
      - kind: integration
        ref: bun run native:test:surface
        status: pass
    human_judgment: false
  - id: D2
    description: A graphical GTK smoke renders a nonzero Ghostty grid and exits cleanly
    requirement: TERM-01
    verification:
      - kind: graphical-smoke
        ref: bun run native:smoke-app
        status: pass
    human_judgment: false
  - id: D3
    description: Ghostty-issued process identity is registered before live and absent before unregister
    requirement: TERM-02
    verification:
      - kind: integration
        ref: bun run native:test:lifecycle
        status: pass
    human_judgment: false
duration: 24min
completed: 2026-07-11
status: complete
---

# Phase 105 Plan 07: Full Ghostty GTK Surface Summary

**The production Linux host now embeds a real Ghostty-rendered terminal leaf in `GtkGLArea`; the superseded Pango renderer and product PTY are no longer on the executable path.**

## Performance

- **Duration:** 24 min
- **Completed:** 2026-07-11
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments

- Added one process-wide Ghostty runtime that initializes Ghostty, loads default files, recursive includes and CLI overrides, finalizes configuration, creates the shared app, and drains its mailbox on GLib's main context.
- Added a reusable `GtkGLArea` terminal leaf with current-context realize, render, physical-pixel resize, content-scale, focus, map, unrealize, re-realize, and idempotent destruction handling.
- Connected every created surface to the Phase 105-06 process controller. Asynchronous child identity acquisition is retried without exposing the surface; successful birth-token registration is the live commit point.
- Replaced the production custom renderer composition and changed smoke evidence to require a real nonzero Ghostty grid and rendered frames.

## Task Commits

1. **Tasks 1-2: Shared runtime and production Ghostty surface host** - `a4c794ef`

## Files Created/Modified

- `native/linux/ghostty_runtime.zig` - Shared configuration/app lifecycle and generation-safe callback routing.
- `native/linux/ghostty_surface.zig` - Reusable full-Ghostty `GtkGLArea` leaf and guarded process lifecycle.
- `native/linux/app.zig` - Minimal GTK product host containing the Ghostty leaf.
- `native/tests/ghostty_surface_test.zig` - Callback generation and bounded seam tests.
- `native/build.zig` - GTK/full-Ghostty application and surface-test graph.
- `scripts/verify-native.ts` - New production composition and graphical readiness requirements.
- `package.json` - `native:test:surface` command.

## Decisions Made

- The app does not parse Ghostty configuration or derive font settings. The exact finalized Ghostty config owns those semantics.
- Surface creation and process birth are asynchronous. The host polls only for Ghostty's process identity and does not publish or operate the surface until guard registration succeeds.
- GTK unrealize releases Ghostty display resources under the current GL context; actual widget destruction additionally performs guarded child cleanup before freeing the surface and shared runtime.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Deferred process registration until Ghostty's asynchronous child identity exists**

- **Found during:** Graphical smoke
- **Issue:** Process identity is not available immediately when `ghostty_surface_new` returns.
- **Fix:** Added bounded main-loop retries while the surface remains internal, then atomically attached callbacks and rendering after successful guard registration.
- **Verification:** `bun run native:smoke-app` and `bun run native:test:lifecycle` pass.
- **Committed in:** `a4c794ef`

**2. [Rule 3 - Blocking] Updated stale production-composition verification**

- **Found during:** Application build
- **Issue:** The verifier still mandated the removed Pango widget, product PTY, and manual input graph.
- **Fix:** It now requires full Ghostty configuration, surface, draw, display, resize, and graphical grid evidence.
- **Verification:** `bun run native:audit-production-graph` passes.
- **Committed in:** `a4c794ef`

---

**Total deviations:** 2 auto-fixed (1 bug, 1 blocking issue)
**Impact on plan:** Both changes enforce rather than weaken Ghostty ownership and registration-before-live.

## Issues Encountered

- The fork's checked-in generated C header predates its Linux platform enum declaration even though `embedded.zig` defines ABI tag `3`; the adapter records and uses that stable fork ABI value pending header regeneration upstream.
- Zig creates distinct C types for separate `@cImport` modules, so the leaf exports its widget as opaque host data at the module boundary.

## User Setup Required

None.

## Next Phase Readiness

- Plan 105-08 can add complete Ghostty key, text, IME, mouse, selection, clipboard, and multi-pane routing against this reusable leaf.
- The graphical smoke has proven a real Ghostty surface with nonzero rows, columns, pixels, frames, and clean process teardown.

---
*Phase: 105-shared-native-model-and-terminal-foundation*
*Completed: 2026-07-11*
