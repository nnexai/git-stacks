# Phase 105: Shared Native Model and Terminal Foundation - Research

**Researched:** 2026-07-11 (forced refresh after Spike 004)
**Domain:** Product-owned GTK terminal built on pinned `libghostty-vt`, PTY/process ownership, rendering, input, and accessibility
**Confidence:** HIGH for the invalidated full-surface conclusion, pin/toolchain, existing-code disposition, and ownership boundary; MEDIUM for the detailed GTK renderer plan until its first real graphical vertical slice runs

## User Constraints

### Shared State Semantics
- **D-01:** When the live event connection is interrupted, retain the last valid snapshot for context but mark it explicitly stale.
- **D-02:** When an event indicates a newer authoritative revision, keep navigation available during refresh but freeze mutations against affected state.
- **D-03:** If the service protocol is reachable but incompatible, preserve local presentation and session metadata only; prior service data is not usable state.
- **D-04:** Preserve unknown, unnegotiated optional items as inert diagnostic data and surface degraded compatibility. Never invent behavior for them or ignore contract drift silently.

### Restored Terminal Truth
- **D-05:** After restart, restore terminal identity and presentation context only: surface identity, workspace/repository binding, title, ordering, cwd label, and last known exit status. Do not persist or infer process liveness or retain sensitive launch details.
- **D-06:** A restored surface whose process cannot be proven alive remains visible as explicitly ended and offers an explicit relaunch action.
- **D-07:** Relaunch creates a new surface identity linked to the ended predecessor; a new process lifetime never masquerades as the old surface.
- **D-08:** Restore valid session entries independently. Quarantine corrupt entries or entries with missing identities and expose diagnostics rather than rejecting the entire session or silently dropping them.

### Terminal Ownership and Teardown
- **D-09:** Closing a live surface requests graceful shutdown, waits for a bounded interval, then terminates the entire owned process group.
- **D-10:** Require close confirmation only when meaningful foreground activity is detected; idle shells and ended surfaces do not prompt.
- **D-11:** If cleanup cannot prove all owned processes are gone, retain a visible failed-cleanup state and diagnostics. Do not silently dispose of the surface record.
- **D-12:** A separate ownership guard terminates all client-owned process groups after a native-client crash; do not rely only on ordinary parent-death behavior or preserve processes for reconnection.

### Terminal Proof Standard
- **D-13:** Terminal acceptance requires automated lifecycle tests plus a documented real-session run covering keyboard, mouse, Unicode, resize/reflow, alternate screen, clipboard, and IME behavior.
- **D-14:** Repeated create/resize/destroy stress cycles must leave zero surviving owned processes or surfaces, with resource use returning to a bounded baseline and no cycle-over-cycle growth. Exact byte equality is not required across GTK/GPU/allocator behavior.
- **D-15:** libghostty and its compatible Zig toolchain use immutable exact pins. Advancing either is dedicated compatibility work that reruns the full terminal smoke suite.
- **D-16:** Expose only verified native accessibility semantics, document upstream gaps, and fail acceptance for misleading or broken core focus/input behavior. Complete upstream screen-reader parity is not an unconditional Phase 105 blocker.

### the agent's Discretion
- Choose concrete reducer representation, ABI encoding, persistence format, timeout values, activity-detection mechanism, ownership-guard implementation, stress-cycle count, bounded resource thresholds, and test harnesses while preserving the locked semantics above.

### Deferred Ideas

None — discussion stayed within the Phase 105 boundary.

### Reviewed Todos (not folded)
- **Improve TUI dashboard experience** — existing OpenTUI product work, unrelated to the native model and single-terminal foundation.
- **Add manual workspace commands** — command authoring/product breadth is outside this phase; later clients consume the existing command model.
- **Create workspace from forge source** — workspace creation breadth is outside this foundation phase.
- **Improve template composition understanding** — template UX and documentation are outside the native foundation.
- **Add workspace notes** — separate product capability unrelated to the shared reducer and terminal ownership.
- **Plan broader code quality improvement run** — prior planning stream unrelated to the v0.20.0 Phase 105 boundary.

### Locked corrective decisions (post-context)

- Phase 105 must produce a genuinely runnable, interactive Linux GTK terminal surface.
- A maintained Ghostty fork and standalone Ghostty process composition are out of scope.
- The full `ghostty_surface_*` API is not a Linux embedding API, and Ghostty's private GTK application runtime cannot cross the product-owned PTY/process boundary.
- Replan remaining work around pinned `libghostty-vt` plus a git-stacks-owned GTK widget, renderer, PTY, process group, and guard.
- Preserve completed Plans 105-01 through 105-04.

## Executive conclusion

Plan 105-05 must be replaced, not patched. Its automated tests prove only a synthetic event recorder: `native/linux/app.zig` has no `main`, `native/linux/terminal_host.zig` owns no GTK object, and `native/terminal/adapter.zig` never creates a surface or terminal. The human gate correctly exposed that no executable interface existed. [VERIFIED: repository source inspection]

Use the pinned Ghostty **Zig `ghostty-vt` module**, not the full-surface C header. At the pinned `v1.3.1` peeled commit, `src/lib_vt.zig` publicly exports `Terminal`, `Stream`, `RenderState`, selection/page primitives, and terminal input encoding. Its own header warns that API signatures are unstable; exact pinning and adapter-only imports are therefore mandatory. [VERIFIED: pinned `src/lib_vt.zig`] The pinned C library exports parsers and key/paste helpers but does not expose the complete `Terminal`/`RenderState` object graph required by this host, so the Zig module is the correct boundary at this revision. [VERIFIED: pinned `src/lib_vt.zig` and `include/ghostty/vt*.h`]

Implement a custom focusable GTK4 widget whose snapshot uses GTK/GSK/Pango rendering. GTK owns compositor/GPU backend selection; git-stacks owns terminal state, cell-to-glyph conversion, PTY I/O, input encoding, clipboard/IME integration, and lifecycle. This is the shortest in-scope route to a real terminal: it avoids a custom OpenGL renderer in the first slice while still using GTK's accelerated render pipeline where available. A later measured optimization may replace the snapshot renderer behind the product renderer interface without changing PTY or VT architecture. [CITED: https://docs.gtk.org/gtk4/class.Snapshot.html]

Do **not** call this a reusable full Ghostty surface. `libghostty-vt` supplies VT parsing/state, reflow, selection primitives, render state, and key/paste encoding; it deliberately supplies neither windowing nor drawing. The official Ghostling example demonstrates the same consumer-owned boundary and explicitly warns that incomplete native key events break Kitty keyboard protocol. [CITED: https://github.com/ghostty-org/ghostling]

## Requirement coverage and current truth

| ID | Current truth | Replan consequence |
|---|---|---|
| CORE-01 | Implemented by 105-02 identity domains and fixtures. | Retain; rerun model/ABI tests. |
| CORE-02 | Implemented by 105-02 and extended by 105-04 cleanup states. | Retain; terminal runtime emits reducer actions only, never GTK types. |
| CORE-03 | Implemented by 105-02 opaque C ABI. | Retain; VT/GTK stay out of public ABI. |
| CORE-04 | Implemented by 105-02 cross-language fixtures. | Retain; keep full gate in closeout. |
| CORE-05 | Implemented by 105-03/04 persistence and lifecycle truth. | Retain; real child exit/cleanup must now drive these states. |
| TERM-01 | **Not met.** Existing host is synthetic and non-runnable. | New executable, real GTK widget, PTY I/O, VT stream, rendering, keyboard/mouse/Unicode/resize/alternate-screen/clipboard/IME. |
| TERM-02 | Ownership state machine/guard exist, but no real terminal runtime uses them. | Connect PTY spawn registration-before-live, reads/writes, close/exit/quit/crash to retained ownership code. |
| TERM-03 | Exact source/toolchain lock exists, but it audits the wrong API. | Keep pin machinery; replace full-surface smoke with `ghostty-vt` module/API compatibility tests. |
| TERM-04 | Synthetic counter/resource stress exists. | Retain threshold logic as a harness pattern; replace lifecycle body with real GTK widget + VT + PTY cycles and separate real-compositor lane. |
| TERM-05 | Evidence template exists, no actual GTK widget exists. | Add truthful focusable custom-widget semantics; verify AT-SPI observations, without claiming cell-level text parity. |

## Standard stack

| Component | Exact choice | Purpose and evidence |
|---|---|---|
| Zig | `0.15.2`, repo-controlled artifact/checksum | Pinned Ghostty 1.3.x toolchain. [CITED: https://ghostty.org/docs/install/build] |
| Ghostty | peeled commit `332b2aefc6e72d363aa93ab6ecfc86eeeeb5ed28` | Keep existing immutable source lock; import `src/lib_vt.zig` as a Zig module. Upgrades are compatibility phases. [VERIFIED: `native/deps/ghostty.lock`, pinned source] |
| GTK | GTK4, current repo floor `>=4.14,<5` | Application/window, custom focusable widget, controllers, IME, clipboard, snapshot rendering, accessibility. [CITED: https://docs.gtk.org/gtk4/] |
| Pango + Cairo/GSK | GTK-distributed platform stack | Font discovery/shaping and drawing into `GtkSnapshot`; do not create a new package dependency. [CITED: https://docs.gtk.org/gtk4/class.Snapshot.html] |
| POSIX PTY | `posix_openpt`/`grantpt`/`unlockpt` + fork/session/group/exec, or a small libc shim | Product-owned PTY master, child session, winsize, nonblocking I/O, signals. Keep argv/env launch policy outside persistence and diagnostics. [VERIFIED: existing ownership boundary] |
| GLib main context | GTK runtime | Watch PTY master, child exit, redraw scheduling, and main-thread widget mutation. |
| Bun/TypeScript | existing repository stack | Setup, pin audit, build/test orchestration, and Phase 104 fixtures. |

No new third-party language package is recommended; package legitimacy audit is therefore not applicable.

## Public API/version realities

1. Ghostty 1.3.1's release is pinned to Zig 0.15.2. Ghostty documents that each release line is guaranteed only for its specified Zig compiler. [CITED: https://ghostty.org/docs/install/build]
2. Ghostty says `libghostty-vt` is cross-platform and usable, but API signatures remain in flux and it has not yet received an independent versioned release. Exact source pin plus compile probes are a requirement, not optional hardening. [CITED: https://github.com/ghostty-org/ghostty] [CITED: https://ghostty.org/docs/install/release-notes/1-3-0]
3. The pinned Zig module publicly exports the complete terminal-side primitives needed here: terminal, stream, render state, input encoding, selection, page/screen, colors/styles, and search primitives. [VERIFIED: pinned `src/lib_vt.zig`]
4. `RenderState.update` is the supported terminal-to-renderer snapshot seam. It retains allocation capacity, and upstream recommends periodically deinitializing it after unusually large frames; lifecycle/resource tests must account for this explicit retention. [VERIFIED: pinned `src/terminal/render.zig`]
5. `ghostty_surface_*` symbol presence in `include/ghostty.h` proves compilation only, not Linux constructibility. Current upstream's embedded platform payloads remain Apple-only; Spike 004-A invalidated pin advancement as a solution. [VERIFIED: `.planning/spikes/004-a-upstream-linux-embedding-api/README.md` and official upstream source]
6. Ghostty's private GTK surface owns/initializes its own core surface and terminal I/O graph and is not exported as a standalone module. Importing it would be application-sized private coupling and violate D-09/D-12 ownership. [VERIFIED: `.planning/spikes/004-b-pinned-internal-gtk-integration/README.md` and pinned source]

## Target architecture

```text
GtkApplication / GtkWindow
  -> GitStacksTerminalWidget (focus, snapshot, controllers, AT-SPI metadata)
       -> gtk_input.zig (key, text, IM context, mouse, clipboard)
       -> renderer.zig (RenderState -> shaped runs -> GtkSnapshot)
       -> runtime.zig (generation/liveness, redraw scheduling)
            -> vt_adapter.zig (only ghostty-vt import)
            -> pty.zig (master FD, winsize, read/write, child PID/PGID)
            -> existing ownership.zig + guard.zig
            -> existing reducer/persistence through product events
```

Recommended source layout:

- `native/terminal/vt_adapter.zig`: sole import of pinned `ghostty-vt`; owns `Terminal`, `Stream`, `RenderState`, key/paste encoding, selection commands, mode/event extraction. No GTK.
- `native/terminal/pty.zig`: allocate PTY, create session/process group, spawn shell through explicit safe launch configuration, nonblocking master reads/writes, `TIOCSWINSZ`, child reaping. No Ghostty or GTK.
- `native/terminal/runtime.zig`: binds PTY bytes to VT stream; binds encoded user input to PTY; owns thread/main-loop synchronization, generation, dirty/redraw, title/bell/clipboard/working-directory events; connects lifecycle to ownership/guard/reducer.
- `native/linux/terminal_widget.zig`: custom GTK type, measure/size-allocate/snapshot/focus and controller wiring.
- `native/linux/renderer.zig`: converts immutable/copied render state to cell backgrounds, shaped glyph runs, decorations, selection, cursor, and visible focus through GTK snapshot/Pango.
- `native/linux/input.zig`: `GtkEventControllerKey`, `GtkIMContext`, focus, click/motion/scroll, shortcuts, selection, system clipboard and primary selection.
- `native/linux/app.zig`: actual `pub fn main`, `GtkApplication`, one window/one widget, clean application shutdown.
- `native/tests/`: adapter stream fixtures, PTY integration, renderer snapshots/semantic frames, GTK event/lifecycle tests, and real lifecycle stress.

Keep the platform-neutral runtime free of Gtk/Gdk/Pango types. Keep the public product C ABI free of both Ghostty and GTK. Permit Ghostty symbols only in `vt_adapter.zig`, the build module declaration, and named compatibility tests.

## Vertical slicing: plan runnable software first

The old plan deferred reality to a human checkpoint. The new plan must produce an executable in its first remaining slice and grow fidelity incrementally:

### Slice A — pinned VT compatibility and real executable skeleton

- Replace `terminal-api-smoke` with a compile/run test against the pinned Zig `ghostty-vt` module: initialize a terminal/stream, feed printable text plus resize/alternate-screen sequences, update render state, assert cells/modes.
- Add a native executable build target and `bun run native:run` (or equivalent) that opens a GTK window containing a focusable terminal widget.
- Render a deterministic in-memory VT frame before PTY integration. Human observable gate: a real window displays known text and responds to resize/focus.

### Slice B — product-owned PTY and shell interaction

- Spawn exactly one shell in a new owned session/process group, obtain PID/PGID/birth token, register guard before `live`, and watch the PTY master.
- Feed PTY output through VT stream; encode key/text/paste through VT adapter; write to PTY with bounded buffering/backpressure.
- Route resize to both terminal grid and `TIOCSWINSZ`; route EOF/`SIGCHLD` through child-exit and ownership/reducer state.
- Human observable gate: user types a command and sees output in the GTK terminal.

### Slice C — correct rendering and interaction

- Cell metrics derive rows/columns from allocated pixels and selected monospace font metrics. Shape contiguous style/font runs with Pango; clip every row/cell region so wide/combining glyphs cannot corrupt adjacent rows.
- Render background runs, glyphs, underline/strikethrough, selection, cursor, and focus ring. Respect wide cells, grapheme clusters, combining marks, fallback fonts, bold/italic, inverse, palette/truecolor, and cursor styles.
- Map native key event plus consumed modifiers/composition status to Ghostty input encoder; do not synthesize key identity from text alone. Implement mouse reporting versus local selection based on terminal modes and modifiers.
- Add system clipboard and Linux primary selection; sanitize/bracket paste through Ghostty paste/input facilities. Add IM context filter, preedit overlay, commit, surrounding cursor rectangle.
- Human observable gate: D-13 interaction subset passes on one compositor before adding long stress.

### Slice D — lifecycle, accessibility, and evidence closure

- Connect window close, child exit, application quit, and guard EOF/crash to retained ownership semantics. Make callback sources inert and remove GLib watches before freeing runtime/widget data.
- Replace synthetic lifecycle cycles with real VT/runtime/PTY/widget creation. Add headless/display-server CI lane and a real-compositor 25-cycle lane.
- Publish only observed accessibility role/name/description/focus state and keyboard input behavior; inspect AT-SPI. Then complete Wayland/X11 evidence where supported.

Do not create a human checkpoint until Slice B has produced an executable command a human can actually use.

## Rendering and font architecture

- Prefer a custom `GtkWidgetClass.snapshot` renderer over `GtkGLArea` for the initial proof. `GtkSnapshot` creates GSK render nodes and allows GTK to choose GL/Vulkan/Cairo; this materially reduces bespoke GPU lifetime and shader work. [CITED: https://docs.gtk.org/gtk4/class.Snapshot.html]
- Maintain one `RenderFrame` value detached from mutable VT state. Update it on the owning runtime synchronization point, then queue a draw on the GTK main thread. Never let GTK snapshot traverse terminal state while the PTY parser mutates it.
- Cache fonts and shaped runs by font face/size/style/text/features. Bound the cache and clear it on scale/font changes. Cache ownership must be included in stress accounting.
- Compute cell width/height from the selected monospace face but allow fallback glyphs to shape; position runs on the cell grid and clip. Test ASCII, CJK wide cells, emoji, combining accents, RTL/complex scripts, ligatures, and missing-glyph fallback. Ghostty 1.3 notes improved complex shaping, but that benefit belongs to the Ghostty GUI renderer; a consumer renderer must independently prove its shaping. [CITED: https://ghostty.org/docs/install/release-notes/1-3-0]
- Treat images/advanced graphics protocols as explicit unsupported/deferred behavior unless the pinned RenderState exposes enough data and Phase 105 requirements demand it. Do not silently claim full Ghostty GUI renderer parity.

## Input, IME, mouse, and clipboard architecture

- Shortcut arbitration order: product/window action first; if unhandled, IM context filtering; then rich key encoding; committed text only when appropriate. Preserve physical/logical key, modifiers, consumed modifiers, repeat, press/release, and composing state.
- `GtkIMContext` must receive focus-in/out, client widget, key filtering, surrounding cursor rectangle, preedit start/change/end, and commit. Render preedit as a host overlay at the VT cursor without feeding it to the PTY until commit. [CITED: https://docs.gtk.org/gtk4/class.IMContext.html]
- Convert pointer coordinates to clamped terminal cells. When terminal mouse reporting is enabled, encode press/release/motion/scroll; otherwise manage local selection and autoscroll. Modifier override must allow selection in mouse-reporting applications.
- Use `GdkClipboard` for the system clipboard and the display's primary clipboard where available. Clipboard reads are asynchronous and must carry generation tokens so completion after teardown is ignored.
- Treat pasted/clipboard bytes as untrusted terminal input. Use bracketed paste mode and Ghostty paste safety primitives; never include clipboard contents in diagnostics. Ghostty 1.3 fixed a control-character paste vulnerability, so pin compatibility tests must cover control bytes and safe paste behavior. [CITED: https://ghostty.org/docs/install/release-notes/1-3-0]

## Accessibility contract

GTK custom widgets must provide their own accessible properties and virtual behavior; ordinary GTK controls get semantics automatically, custom terminal widgets do not. GTK maps its accessibility context to AT-SPI on Linux and provides Inspector support for examining attributes. [CITED: https://docs.gtk.org/gtk4/section-accessibility.html]

Phase 105 should guarantee only:

- focusability, visible focus, stable terminal role/name/description/help text;
- correct focus state changes and keyboard/IME operability;
- discoverable copy/paste/select-all actions where actually implemented;
- no misleading claim that terminal cell contents or selection are exposed as a fully navigable text document.

Cell-level text, caret, selection ranges, line navigation, and live-region events require a substantial AT-SPI text-provider design. D-16 explicitly permits documenting these as unsupported/unverified. Do not fake them with a stale accessible label containing the screen buffer. The acceptance matrix must record GTK Inspector and an AT such as Orca observations on the exact executable.

## PTY, ownership, and concurrency details

- Spawn flow: open PTY -> fork -> child `setsid`/controlling terminal/dup stdio/set process group/exec -> parent validates child, PGID and Linux birth token -> registers guard -> exposes runtime live. Any failure unwinds in reverse order and proves the group absent.
- One runtime owns one master FD, child PID, PGID, birth token, VT terminal/stream/render state, write queue, and widget generation.
- The GTK main thread owns widget and clipboard/IME objects. PTY parsing may run on a worker only if VT state has one clear owner and render frames/events cross a queue. A GLib nonblocking FD source on the main context is acceptable for the first slice and simpler to prove.
- Backpressure: cap pending PTY writes and terminal event queues. Handle partial reads/writes, `EINTR`, `EAGAIN`, EOF, HUP, and child exit in any order.
- Close: stop accepting input -> request graceful shell exit -> wait bounded interval -> retained ownership escalation for whole group -> reap/absence proof -> unregister guard -> mark ended. Failure remains `failed_cleanup`.
- Crash: guard owns only validated registered PGIDs and cleans on private channel EOF. Do not persist or reconnect live PTYs.
- Security: terminal bytes, OSC payloads, titles, hyperlinks, clipboard requests, and child exit timing are untrusted. Bound titles/URLs/event payloads, validate schemes before later activation, and never interpret terminal output as workflow instructions.

## Existing code: retain, replace, remove

### Retain unchanged unless integration reveals a real defect

- All completed 105-01 through 105-04 artifacts: `native/core/**`, `native/include/git_stacks_native_v1.h`, fixtures, `native/terminal/{ownership,guard,diagnostics}.zig`, their tests, lock/setup code, and summaries.
- `native/deps/ghostty.lock` exact commit/toolchain pin.
- `scripts/verify-native.ts` pin/source integrity machinery and public-boundary audits.
- `native/tests/lifecycle_stress.zig` threshold math and evidence vocabulary only; its synthetic lifecycle body is not acceptance evidence.
- `docs/native-terminal-{acceptance,accessibility}.md` as uncompleted templates; revise commands and architecture claims.

### Replace

- `native/terminal/adapter.zig`: replace `ghostty.h`/nullable `ghostty_surface_t` event recorder with a real pinned `ghostty-vt` Zig adapter. Rename to `vt_adapter.zig` if practical so audits state the boundary honestly.
- `native/linux/terminal_host.zig`: replace synthetic booleans and recorded events with runtime/widget integration; split into widget, renderer, input, and runtime modules.
- `native/linux/app.zig`: replace factory-only helper with a runnable `main` and real GTK application/window.
- `native/tests/terminal_host_test.zig`: replace assertions over recorded events with VT state/render frames, real PTY integration, and GTK controller/lifecycle behavior.
- `native/build.zig`: replace the full `ghostty_surface_*` compile smoke; declare/import the pinned `ghostty-vt` module, GTK executable, and new tests.
- `scripts/verify-native.ts`: change allowlist/audit vocabulary from full surface API to `ghostty-vt`; verify an executable artifact and expose a launch command.
- `native/tests/lifecycle_stress.zig`: keep resource thresholds but cycle actual runtime/widget/PTY resources.

### Remove

- Every compile assertion and production reference to `ghostty_surface_*`, `ghostty_runtime_*`, and `ghostty.h` full-surface hosting.
- Synthetic `Adapter.events`, fake `surface = null`, fake `graphics_ready`, and tests that equate event recording with interaction.
- Documentation wording that calls current code a hosted libghostty surface or implies human approval is possible before a runnable GTK executable exists.

Use `git diff dc71c8d9^..HEAD` plus commit `69507e14`/`b79e3241` when implementing the deletion map; do not revert 105-01..04 or their state/requirement evidence.

## Testing and acceptance strategy

### Fast deterministic tests

- VT adapter: feed recorded bytes, resize, alternate-screen enter/exit, colors, Unicode/graphemes, scrollback, title/clipboard events, render-state updates, key protocol modes, safe paste.
- Renderer: convert known RenderState fixtures to a semantic draw list; assert cells/runs/colors/cursor/selection/clipping without pixel brittleness. Add a small set of image snapshots under a deterministic font/display environment.
- PTY: spawn a deterministic fixture child, verify stdout/input/resize/exit, group identity, partial I/O and EOF races.
- Input: table tests from GTK-like normalized events to Ghostty key encoding and PTY bytes; include Kitty keyboard cases, compose/IME, modifiers, repeat/release, mouse modes, bracketed paste.
- Lifecycle: late FD/clipboard/timeout/draw callbacks rejected by generation; every error injection unwinds resources; ownership register-before-live and absence-before-unregister.

### Graphical integration

- Run the executable under a virtual display where possible and assert window/widget realization, focus, snapshot, resize, PTY command roundtrip, and clean quit.
- Run real Wayland and X11 sessions where supported. Capture compositor, GTK, Pango/font, locale/IME, renderer backend, GPU/driver, Zig, and peeled Ghostty commit.
- D-13 matrix: modifiers/rich keys, mouse selection/reporting, ASCII/Unicode/graphemes/complex scripts, resize/reflow, alternate-screen app, system/primary clipboard, IME preedit/commit/cursor, focus, child exit, graceful/forced close, quit, crash cleanup.
- D-14: 100 automated real-runtime cycles after warmup; exact zero owned surface/child/PGID/watch counters each cycle; bounded FD/thread/RSS trends. Retain the existing documented thresholds unless measurement shows they are invalid, then record evidence and change explicitly. Add 25 real-compositor create/type/resize/destroy cycles and optional 500-cycle extended lane.
- D-16: inspect GTK accessibility tree and Orca behavior; fail for missing focus/input, misleading labels, or claimed-but-absent semantics.

Phase close must run `bun run native:verify`, the real terminal executable smoke, focused native suites, `bun run test`, `bun run typecheck`, `bun run test:deps`, and `bun run verify:gates`. Passing synthetic unit tests is never sufficient proof of TERM-01/04/05.

## Validation Architecture

Validation follows the proposed 105-05 through 105-08 dependency sequence and moves from deterministic library seams to a real graphical shell. Every implementation task must have a focused automated command that fails before its production change and returns quickly enough for TDD. Human observation is a final evidence gate, never a substitute for an executable smoke or automated integration coverage.

### Harness ownership

| Harness | Owner | Proves | Must not claim |
|---|---|---|---|
| `native/tests/vt_adapter_test.zig` | `native/terminal/vt_adapter.zig` | Pinned VT construction, stream parsing, resize/reflow, alternate screen, Unicode, render state, key/paste encoding | GTK rendering, PTY ownership, or human usability |
| `native/tests/renderer_test.zig` | `native/linux/renderer.zig` | RenderState-to-semantic-draw-list conversion, colors, styles, wide/combining cells, cursor, selection, clipping | Real compositor/GPU behavior from semantic assertions alone |
| `native/tests/input_test.zig` | `native/linux/input.zig` | Normalized key/modifier/action mapping, IME state transitions, mouse modes, clipboard/paste policy | Native toolkit delivery without GTK integration tests |
| `native/tests/pty_test.zig` | `native/terminal/pty.zig` | Real PTY child roundtrip, winsize, partial I/O, EOF/exit races, PID/PGID identity | GTK or render correctness |
| `native/tests/terminal_runtime_test.zig` | `native/terminal/runtime.zig` | Real PTY bytes -> VT -> frame and input -> encoded bytes -> child, register-before-live, reducer exit truth | Native event delivery or compositor fidelity |
| `native/tests/terminal_widget_test.zig` | `native/linux/terminal_widget.zig` | GTK realize/focus/snapshot/resize/controller wiring and teardown under a display harness | Wayland/X11/IME/AT behavior on every real desktop |
| `native/tests/lifecycle_stress.zig` | runtime/widget/ownership integration | Actual widget, VT, PTY, GLib source and process resource return across repeated cycles | Leak freedom if it cycles synthetic counters only |
| `scripts/verify-native.ts` | repository integration | Exact pin/toolchain/source integrity, source-boundary allowlist, target orchestration, executable existence | Interaction acceptance merely because compilation passes |
| `docs/native-terminal-acceptance.md` and `docs/native-terminal-accessibility.md` | human verification | Exact-environment real-session behavior and observed AT-SPI semantics | Any unobserved behavior or cell-level accessibility parity |

Tests may use normalized adapter values at narrow unit seams, but the runtime, widget, and lifecycle harnesses must construct the real production types they claim to verify. The source audit must reject a test-only parallel terminal implementation.

### 105-05 validation: pinned VT pivot and runnable GTK frame

Focused commands to establish during this plan:

```bash
bun run native:test:vt
bun run native:test:renderer
bun run native:test:widget
bun run native:build-app
bun run native:smoke-app
```

- `native:test:vt` compiles the exact pinned Zig module and feeds deterministic printable, Unicode, resize/reflow, and alternate-screen streams through a real `Terminal`/`Stream`/`RenderState` lifecycle.
- `native:test:renderer` checks semantic drawing primitives with a deterministic bundled test font or controlled font fixture; pixel snapshots are secondary.
- `native:test:widget` runs GTK realize, focus, allocation, snapshot, resize and unrealize under the repository's selected display harness.
- `native:build-app` must create a named executable artifact; `native:smoke-app` launches it with deterministic in-memory terminal content, waits for window/widget readiness through a test hook, captures a frame or semantic readiness assertion, requests clean quit, and fails on crash, timeout, or leftover process.
- The plan cannot complete if `native:smoke-app` only instantiates a headless struct. It must execute the same `main`/GTK application target a human will later launch.

Target feedback latency: VT/renderer unit commands under 10 seconds each; widget and graphical smoke under 30 seconds each; the combined 105-05 focused gate under 60 seconds on a warm cache. If graphical startup cannot complete within 30 seconds, fail with captured stderr/environment diagnostics rather than wait indefinitely.

### 105-06 validation: product-owned PTY terminal runtime

Focused commands to establish during this plan:

```bash
bun run native:test:pty
bun run native:test:runtime
bun run native:smoke-terminal
bun run native:test:lifecycle
```

- `native:test:pty` spawns a repository fixture child in a real PTY/session/process group and proves input/output, `TIOCSWINSZ`, partial nonblocking I/O, EOF, signal, reaping, descriptor inheritance allowlist, and absence proof.
- `native:test:runtime` proves PTY output changes real VT/render state and normalized user input produces expected child bytes; it injects failures at every spawn/register/watch stage and asserts reverse-order unwind.
- `native:smoke-terminal` launches the production GTK executable with a deterministic fixture shell command, waits for a unique prompt, sends input through the widget's production input path, observes expected rendered output, then quits and asserts zero owned children/PGIDs/GLib watches.
- `native:test:lifecycle` retains the completed 105-04 real group/guard tests and adds real runtime close, child-exit, application-quit, and simulated client-crash paths.

Target feedback latency: PTY and runtime tests under 20 seconds each; graphical command roundtrip under 45 seconds; focused plan gate under 90 seconds. All waits and close escalation use explicit bounded test-time durations.

### 105-07 validation: rendering and interaction fidelity

Focused commands to establish during this plan:

```bash
bun run native:test:renderer
bun run native:test:input
bun run native:test:interaction
bun run native:smoke-terminal
```

- Renderer fixtures cover ASCII, CJK width, emoji, combining accents, fallback fonts, bold/italic, inverse, underline/strikethrough, palette/truecolor, cursor styles, selection, clipping, resize/reflow, and alternate-screen frames.
- Input tables cover press/release/repeat, physical/logical key, consumed modifiers, Kitty protocol mode changes, shortcut arbitration, committed text, IME preedit/commit/cursor, local selection versus mouse reporting, scroll, system clipboard, primary selection, safe/bracketed paste, and async completion after teardown.
- `native:test:interaction` realizes the real widget and drives GTK controllers/IM context/clipboard through a display harness wherever those APIs permit deterministic injection. It proves callbacks reach the production input adapter and late asynchronous completions are rejected by generation.
- `native:smoke-terminal` remains in the plan gate so renderer/input unit success cannot regress actual command interaction.

Target feedback latency: renderer/input unit suites under 15 seconds each; graphical interaction under 45 seconds; focused plan gate under 90 seconds. Large font matrices and optional image snapshots may have a separate extended lane, but the core complex-text cases remain in the fast suite.

### 105-08 validation: real lifecycle, accessibility, and phase close

Automated commands to establish or update:

```bash
bun run native:test:stress
bun run native:test:accessibility
bun run native:verify
bun run native:smoke-terminal
```

- `native:test:stress` performs 100 real runtime/widget/PTY cycles after warmup and asserts zero production counters for surfaces/widgets, children, PGIDs, PTY FDs, GLib sources, and outstanding async operations after every cycle. It measures FD/thread/RSS trends using the documented thresholds. `GIT_STACKS_NATIVE_EXTENDED_STRESS=1` runs the 500-cycle lane.
- `native:test:accessibility` verifies declared GTK role/name/description/help/focus/actions through GTK's test accessibility backend or tree inspection APIs and rejects claims absent from the implementation. It does not fabricate a cell text provider.
- `native:verify` composes pin/source audit, core/ABI/restoration/ownership suites, VT/PTy/render/input/widget/runtime/lifecycle/accessibility suites, app build, and graphical terminal smoke.
- Automated 105-08 feedback target: ordinary stress and verification under 5 minutes; fast non-stress native verification remains separately runnable under 2 minutes; extended stress is explicitly outside the inner loop and must report periodic progress.

After all automated commands pass, run the human gates in this order:

1. Launch the exact production artifact using the documented `native:run` command and record exact pin, distro, session, compositor, GTK/Pango/font stack, locale/IME, renderer backend, GPU/driver.
2. Complete one primary real-session interaction matrix on the current graphical session: keyboard/rich protocol, mouse selection/reporting, Unicode/complex scripts, resize/reflow, alternate screen, system/primary clipboard, IME, focus, child exit, close, quit, and crash cleanup.
3. Complete 25 real-compositor create/type/resize/destroy cycles and attach resource/process evidence. Do not ask for approval before this executable interaction is possible.
4. Repeat on Wayland and X11 where each is supported; mark an unavailable backend with environment evidence rather than inventing a pass.
5. Inspect GTK accessibility data with GTK Inspector/AT-SPI tooling and an assistive technology such as Orca. Record observed focus/input/actions and explicitly mark cell text/caret/selection semantics unsupported or unverified when absent.
6. Only then request the blocking human approval signal. Any failed observation returns to the owning automated harness or creates a focused reproduction before another approval request.

Final phase closure after human approval:

```bash
bun run native:verify
bun run test
bun run typecheck
bun run test:deps
bun run verify:gates
```

The validation artifact generated from this research must replace stale references to the invalidated old 105-05 full-surface host. Traceability must map CORE-01..05 to the retained model suites and TERM-01..05 to the new VT/PTy/render/input/widget/runtime/lifecycle/manual evidence above.

## Threat model

| Threat | Severity | Required mitigation/test |
|---|---:|---|
| Signaling unrelated/reused PGID | Critical | Retain birth-token/session validation and guard exclusions; race tests. |
| Terminal output drives unsafe host action | High | Parse as data; bound OSC/title/URI/clipboard events; explicit allow/prompt policy. |
| Paste control bytes execute commands | High | Ghostty safe-paste/bracketed-paste path, control-byte tests, no diagnostic content. |
| Late GTK/GLib async callback uses freed runtime | High | Generation token, remove sources/controllers first, asynchronous clipboard tests. |
| Parser/render race corrupts state | High | Single VT owner or locked immutable render-frame transfer; sanitizer/stress tests. |
| Unbounded scrollback/render/write queue exhausts memory | High | Explicit caps/backpressure and resource trend tests. |
| Child inherits privileged/unintended descriptors or environment | High | Close-on-exec allowlist, explicit environment construction, tests via fixture child. |
| Accessibility claims mislead users | Medium | Observed matrix, exact pin/environment, unsupported semantics stated plainly. |

ASVS web-auth categories are not applicable to this native terminal slice. Applicable security domains are process isolation, native memory/lifecycle safety, untrusted terminal protocol input, clipboard/input confidentiality, and trustworthy diagnostics.

## Do not hand-roll

- Do not hand-write VT parsing, terminal state, reflow, grapheme width, key protocol, or paste encoding; use pinned `ghostty-vt`.
- Do not write a custom OpenGL/Vulkan renderer for the initial proof; use GTK snapshot/GSK/Pango behind a replaceable renderer seam.
- Do not import Ghostty's private GTK application graph.
- Do not duplicate ownership/guard/reducer/persistence work completed in 105-01..04.
- Do not emulate IME by concatenating key text; use GTK's IM context lifecycle.
- Do not represent accessibility by dumping the screen into a label.

## Common pitfalls and planner checks

1. **Compile-time API presence mistaken for runtime platform support:** delete the old full-surface smoke and test actual VT construction/stream/render state.
2. **A window mistaken for a terminal:** first human gate requires command roundtrip through a real owned PTY.
3. **Ghostling treated as production code:** it is an official architectural example but self-described MVP; use it to understand API flow, not as an acceptance bar. [CITED: https://github.com/ghostty-org/ghostling]
4. **Text input mistaken for rich key input:** Kitty protocol needs native key/modifier/action fidelity.
5. **Complex text assumed inherited from Ghostty:** product renderer must shape and test it itself.
6. **GTK objects touched off-main-thread:** isolate parsing and transfer immutable frames/events.
7. **Synthetic counters accepted as leak proof:** count real FDs, watches, processes, VT/render allocations, widgets, and resource trends.
8. **PTY child visible before guard registration:** retain 105-04 registration-before-live invariant.
9. **Cleanup outcome discarded when UI closes:** reducer must retain failed-cleanup even after widget destruction.
10. **Human checkpoint has no runnable command:** planner must put executable construction before checkpoint.

## Planning recommendation

Preserve plans 105-01..04 as completed and replace 105-05 with at least four independently verifiable plans/waves:

1. **105-05: VT pivot and runnable GTK frame** — delete full-surface assumptions, wire pinned Zig module, build executable, deterministic VT frame, real window/focus/resize.
2. **105-06: Product-owned PTY terminal runtime** — spawn/guard/stream/input/resize/exit, shell command roundtrip, reducer integration.
3. **105-07: Renderer and interaction fidelity** — Pango/GSK cell renderer, Unicode, selection/mouse, rich keys, clipboard, IME, alternate screen.
4. **105-08: Lifecycle/accessibility evidence and closeout** — real-resource stress, compositor matrices, AT-SPI inspection, final gates and state/requirements reconciliation.

Dependencies are sequential at the architecture boundary, but tests/docs within each plan may run in parallel. Mark only 105-08 non-autonomous. The executable must exist after 105-05 and a usable shell after 105-06, so failures are discovered before polishing and human evidence.

## Sources

- Ghostty repository/libghostty status: https://github.com/ghostty-org/ghostty
- Ghostty 1.3 release/libghostty lifecycle: https://ghostty.org/docs/install/release-notes/1-3-0
- Ghostty exact Zig compatibility: https://ghostty.org/docs/install/build
- Official Ghostling VT consumer example: https://github.com/ghostty-org/ghostling
- GTK custom rendering: https://docs.gtk.org/gtk4/class.Snapshot.html
- GTK accessibility: https://docs.gtk.org/gtk4/section-accessibility.html
- GTK IM context: https://docs.gtk.org/gtk4/class.IMContext.html
- Pinned source: `$HOME/.cache/git-stacks/native/ghostty-332b2aefc6e72d363aa93ab6ecfc86eeeeb5ed28/src/lib_vt.zig`, `src/terminal/render.zig`, and `include/ghostty/vt*.h`
- Local invalidation evidence: `.planning/spikes/004-a-upstream-linux-embedding-api/README.md`, `.planning/spikes/004-b-pinned-internal-gtk-integration/README.md`

## Research confidence and open validation

- **HIGH:** full `ghostty_surface_*` Linux route invalid; private GTK route rejected; `ghostty-vt` Zig module available at exact pin; completed core/ownership work is reusable.
- **HIGH:** an actual executable and PTY roundtrip are prerequisites to human approval.
- **MEDIUM:** GTK snapshot/Pango is the best initial renderer. It is based on official GTK architecture and minimizes implementation scope, but must be validated for terminal-scale performance and complex shaping during 105-05/07.
- **MEDIUM:** precise pinned `Terminal`/`Stream` construction calls and build-module wiring should be codified by a compile spike in the first task because upstream explicitly says API signatures are unstable.
- **Open validation:** GTK Zig binding strategy/build linkage, exact Pango run segmentation, and whether the pinned render state exposes every desired decoration/event without a narrow adapter extension. These are implementation questions, not reasons to return to full-surface or private-GTK approaches.

## What might have been missed

- Advanced image protocols, hyperlinks, and shell-integration events are not explicit Phase 105 acceptance items; the plan should record their support truth rather than silently expand scope.
- Locale/font availability makes pixel snapshots nondeterministic; semantic draw-list tests are the primary renderer gate.
- Wayland may be the only supported session on some hosts. D-13 requires X11 only where supported; record unavailable lanes honestly.
- A fully navigable terminal accessibility text model is larger than this phase and remains explicitly non-blocking under D-16, but focus/input semantics are blocking.

---
*Phase: 105-shared-native-model-and-terminal-foundation*
*Research refreshed: 2026-07-11 after Spike 004 invalidation*
