# Phase 105: Shared Native Model and Terminal Foundation — Corrective Pattern Map

**Refreshed:** 2026-07-11
**Authority:** Use with refreshed `105-RESEARCH.md`, `105-VALIDATION.md`, and Spikes 004a/004b. This file supersedes the invalid full-surface Linux pattern map.

## Corrected Architecture

```text
GtkApplication / GtkWindow
  -> terminal_widget.zig (custom focusable widget, snapshot, controllers, accessibility)
       -> renderer.zig (detached RenderFrame -> Pango/GSK/GtkSnapshot)
       -> input.zig (keys, IM context, mouse, selection, clipboards)
       -> runtime.zig (generation, redraw, event and lifecycle composition)
            -> vt_adapter.zig (sole pinned ghostty-vt import)
            -> pty.zig (product-owned PTY, child session and process group)
            -> ownership.zig + guard.zig (retained registration and cleanup truth)
            -> reducer.zig + persistence.zig (retained product state only)
```

The pinned Zig `ghostty-vt` module supplies terminal parsing/state, resize/reflow, RenderState, selection primitives, and key/paste encoding. It does not supply GTK windowing, drawing, PTY ownership, IME, clipboard, or accessibility. The product owns those layers.

## File Classification

| File or group | Pattern and responsibility |
|---|---|
| `native/terminal/vt_adapter.zig` | Sole production Ghostty import; owns Terminal, Stream, RenderState, encoding and bounded product frames. |
| `native/terminal/pty.zig` | POSIX PTY/session/process-group acquisition, bounded nonblocking I/O, winsize, reap and absence proof. |
| `native/terminal/runtime.zig` | One-owner PTY↔VT composition, immutable frame transfer, generation-safe GLib sources, reducer events. |
| `native/terminal/{ownership,guard,diagnostics}.zig` | Retained Phase 105-04 exclusive ownership, birth-token validation, crash cleanup, redacted diagnostics. |
| `native/linux/terminal_widget.zig` | Real custom GTK type: focus, measure/allocation, snapshot, controllers, accessible properties, teardown. |
| `native/linux/renderer.zig` | Replaceable renderer seam; initial GtkSnapshot/GSK/Pango implementation with bounded caches. |
| `native/linux/input.zig` | Shortcut arbitration, native key identity, GtkIMContext, mouse modes/selection, system/primary clipboards. |
| `native/linux/app.zig` | Production `main`, GtkApplication, one window and widget; shared by `native:run` and graphical smokes. |
| `native/build.zig` | Exact pinned Zig module declaration, production executable, and focused test targets. |
| `scripts/verify-native.ts` | Exact-pin/source audit, graphical prerequisite diagnostics, bounded production smokes and gate composition. |
| `native/tests/**` | Focused VT, PTY, runtime, renderer, input, widget, stress and accessibility evidence using production types. |

## Patterns to Preserve from Completed Plans

### Product boundary and deterministic state

Keep `native/core/**` and `native/include/git_stacks_native_v1.h` platform-neutral. The public ABI exchanges versioned JSON bytes and opaque product handles; no Ghostty, GTK, Pango, PID/PGID, FD, or platform layout crosses it. The reducer remains pure `{ state, effects }`; adapters perform I/O. Retain explicit stale, refresh-required, incompatible, ended, quarantined, and failed-cleanup outcomes.

### Atomic presentation-only persistence

Retain the owner-only `0700` directory, `0600` file, symlink refusal, exclusive temporary file, validation, fsync and atomic rename pattern. Persist presentation context only. Restored entries are ended; relaunch creates a new identity and predecessor lineage.

### Acquisition and teardown truth

Acquire forward and release in reverse. A terminal becomes live only after PTY, child PID/PGID/birth token, guard registration, VT/runtime, and event source setup succeed. Close stops input, requests graceful exit, performs bounded whole-group escalation, reaps and proves absence, unregisters the guard, then emits ended. Unproven absence emits `failed_cleanup` and keeps visible state.

### Exact dependency provenance

Retain Zig 0.15.2 and peeled Ghostty commit `332b2aefc6e72d363aa93ab6ecfc86eeeeb5ed28`, including tag/source/checksum verification and ordinary offline builds. Replace the obsolete C full-surface compile probe with a construction/run probe over the pinned Zig VT module. Pin advancement is dedicated D-15 compatibility work.

## New Native Patterns

### Detached render frames

The VT owner updates RenderState and produces a bounded product `RenderFrame`. GTK snapshot consumes only that detached frame; it never traverses mutable terminal state. Reset unusually retained RenderState capacity and renderer caches under explicit thresholds.

### GTK snapshot rendering

The initial renderer uses GtkSnapshot/GSK/Pango behind a replaceable renderer interface. Derive grid size from allocation and monospace metrics; shape contiguous style/font runs with fallback, place them on the cell grid, and clip rows/cells. Render backgrounds, glyphs, decorations, selection, cursor and visible focus. Measure performance before considering a lower-level renderer.

By explicit user-approved Phase 105 expansion, the Linux host reads a narrow Ghostty-compatible appearance subset (`font-family`, `font-size`) from the pinned version's preferred XDG path and legacy fallback. Supacode's full semantics come from GhosttyKit's `ghostty_config_*` API; that API is not exposed by this phase's `ghostty-vt` boundary, so this host does not claim equivalent full-config parsing, recursive includes, themes, or reload.

Allocation follows the pinned Ghostty pipeline in `apprt/gtk/class/surface.zig::glareaResize`, `Surface.zig::sizeCallback/resize`, and `termio/Exec.zig::Subprocess.resize`: one GTK allocation computes cell and pixel dimensions, updates VT plus `TIOCSWINSZ`, then redraws. Font rendering remains GTK/Pango rather than Ghostty's fontconfig/FreeType/HarfBuzz renderer; the host resolves the actual Pango family, uses widget-context metrics and shapes contiguous style runs, but does not claim pixel identity.

### Rich input and IME

Arbitration order is product/window shortcuts, GtkIMContext filtering, rich key encoding, then committed text when appropriate. Preserve physical/logical key, action, repeat, modifiers, consumed modifiers and composing state. Preedit is a host overlay and reaches the PTY only on commit. Async clipboard completion carries a generation token and clipboard bytes never enter diagnostics.

### Production executable as test subject

`native:run`, `native:smoke-app`, and `native:smoke-terminal` use the same `app.zig` production main. Smokes may inject narrow fixture configuration/readiness hooks, but cannot construct a parallel headless app. All graphical waits are bounded and missing display/GTK/renderer prerequisites fail with captured diagnostics.

### Real resource evidence

Stress cycles the production widget, VT, PTY, child/group, FDs, GLib sources, callbacks and caches. Synthetic counters may instrument those objects but cannot replace them. Exact ownership counters return to zero every cycle; FD/thread/RSS use documented bounded trend checks.

### Honest accessibility

Expose only implemented custom-widget role, name, description/help, focus and actions. Do not synthesize a screen-buffer accessible label or claim cell text/caret/selection semantics without a real provider. Automated declaration checks precede GTK Inspector/AT-SPI/assistive-technology observation.

## Retain / Replace / Remove

### Retain

- Completed 105-01 through 105-04 plans, summaries, core/ABI/model/persistence, lock/setup, ownership/guard/diagnostics, and their tests.
- `scripts/verify-native.ts` provenance and public-boundary machinery.
- Stress threshold math and evidence vocabulary only.
- Acceptance/accessibility documents as uncompleted templates until real observation.

### Replace

- `native/terminal/adapter.zig` with `native/terminal/vt_adapter.zig` and remove the old file when imports migrate.
- Synthetic `native/linux/{app,terminal_host}.zig` with production app/widget/renderer/input/runtime modules.
- Recorded-event `terminal_host_test.zig` with real VT, PTY, runtime and GTK production-type tests.
- Full-surface build/audit vocabulary with exact pinned VT module construction and compatibility checks.
- Synthetic stress body with production resource cycles.

### Remove

- All production/test hosting assumptions based on the Apple-only rendered-surface C API.
- Fake nullable surface state, fake graphics readiness, event recorders treated as interaction, and parallel headless terminal implementations.
- Private Ghostty GTK imports, maintained forks, and standalone Ghostty process composition.
- Documentation implying a hosted terminal or human approval before the production executable and real PTY smoke pass.

## Verification Pattern

1. 105-05: `native:test:vt`, renderer/widget tests, `native:build-app`, and `native:smoke-app` against production main.
2. 105-06: real PTY and runtime tests, retained lifecycle tests, and `native:smoke-terminal` command roundtrip.
3. 105-07: renderer/input/interaction suites while retaining the real terminal smoke.
4. 105-08: production-resource stress, accessibility declarations, complete native gate, then real Wayland/X11 where supported and AT evidence.

No human checkpoint is valid until `native:run` exists and both graphical production smokes pass.
