# Pitfalls Research

**Domain:** Native workspace client with embedded terminal surfaces and a local workspace service
**Researched:** 2026-07-11
**Confidence:** HIGH

## Critical Pitfalls

### Pitfall 1: Treating libghostty as a stable application framework

**What goes wrong:**
The client binds application state, window lifecycle, and build tooling directly to current libghostty symbols. A Ghostty update then becomes a cross-application rewrite, or the project silently forks an old terminal core with no upgrade path.

**Why it happens:**
Ghostty is production-grade as a terminal, but its own documentation says the standalone `libghostty` API is not versioned and its signatures remain in flux. The available `libghostty-vt` surface also does not supply the complete renderer, windowing, tabs, splits, or session-management product.

**How to avoid:**
Pin an exact upstream commit (including Zig/toolchain requirements), record its license and build provenance, and expose only a narrow repo-owned adapter: create/destroy surface, attach native view, resize/scale, send input, receive title/bell/exit/attention callbacks, and report capabilities/errors. Keep all upstream types out of shared application and IPC models. Add one compile-and-smoke conformance fixture based on the upstream examples and require an explicit adapter migration note before changing the pin.

**Warning signs:**
libghostty headers imported outside one adapter package; shared models contain Ghostty handles; builds fetch `main`; changing the pin modifies UI or service code; the adapter has no destruction/error-path test.

**Phase to address:**
Terminal adapter and build-reproducibility phase, before application-shell work.

---

### Pitfall 2: Confusing a terminal state engine with a complete embedded terminal

**What goes wrong:**
A demo renders shell output but production lacks correct PTY resize, scrollback, selection, clipboard, hyperlinks, alternate screen, mouse reporting, Unicode width, Kitty keyboard input, IME, or clean teardown. The existing OpenTUI spikes already classify the PTY/state substrate as only PARTIAL for this reason.

**Why it happens:**
Rendering rows of cells is visually persuasive. Ghostling explicitly leaves rendering/windowing and product session features to the consumer, and documents that insufficiently rich host input events break advanced keyboard protocols.

**How to avoid:**
Define a terminal-surface acceptance matrix before UI polish: interactive programs, resize/reflow, UTF-8 and wide glyphs, compose/dead keys/IME preedit, modifiers, mouse, alternate screen, clipboard/selection, OSC/title/bell, focus transitions, shell exit, and destruction under load. Prefer the full supported libghostty embedding seam where available; never fill missing features with an ad-hoc ANSI parser.

**Warning signs:**
Tests use only `echo`; input is reduced to character strings; rows/columns update without pixel scale; background tabs share emulator or callback state; terminal output is scraped to infer agent attention.

**Phase to address:**
Terminal adapter phase, with the full matrix repeated in the Linux vertical-slice phase.

---

### Pitfall 3: Violating GPU and native-view lifecycle rules

**What goes wrong:**
Surfaces render black, leak GPU resources, crash after tab/window removal, blur on scale changes, or call graphics APIs from the wrong context/thread. Linux works with one compositor but fails when context creation or the OpenGL API differs; macOS has analogous drawable/layer lifecycle hazards with Metal.

**Why it happens:**
The renderer is treated like an ordinary GTK or SwiftUI child. GTK states that GL resources belong in `realize`/`unrealize`, the context must be current, framebuffer ownership remains with GTK, and context creation may fail. Metal presents through a `CAMetalLayer`; SwiftUI view identity and native view lifetime are not terminal-surface lifetime.

**How to avoid:**
Make platform hosts thin but explicit. On GTK, create/check the context during realization, render only with the correct current context/framebuffer, resize from allocated pixel dimensions and scale factor, stop frame callbacks before unrealize, and show a recoverable renderer error. On macOS, isolate an AppKit/Metal host behind `NSViewRepresentable`, bind drawable size to backing scale, and destroy the surface exactly once from native-view teardown. Test repeated mount/unmount, tab moves, window close, monitor/DPI changes, suspend/resume, software-renderer fallback, Wayland, and X11.

**Warning signs:**
GPU work in widget constructors; no context-error UI; logical points used as framebuffer pixels; render callbacks outlive widgets; one rendering implementation is conditionally compiled for both OpenGL and Metal.

**Phase to address:**
Platform embedding spike immediately after the adapter; lifecycle stress gates in each frontend phase.

---

### Pitfall 4: Ambiguous PTY and session ownership

**What goes wrong:**
Closing a tab leaves shells or grandchildren running, quitting the client kills sessions users expected to persist, reconnect duplicates a command, or both the service and GUI believe they own the same PTY. Restored UI tabs point to nonexistent processes.

**Why it happens:**
Process lifetime, UI lifetime, and persistence are conflated. The earlier spikes established that persistence across dashboard restarts requires a daemon/external owner, while this milestone explicitly assigns terminal processes and session state to the native client.

**How to avoid:**
Write the ownership contract into the shared model: one client-owned surface owns one PTY/process tree; the workspace service never owns terminal processes; tab close performs graceful hangup then bounded escalation; app quit has an explicit close-or-confirm policy; crash recovery restores metadata only and labels dead sessions rather than pretending processes survived. Spawn named commands without a shell unless shell semantics are explicitly part of the resolved command. Track PID/process group, PTY fd, exit status, and one idempotent teardown state machine.

**Warning signs:**
PTY handles cross IPC; service methods named `createTerminal`; detached children without a documented persistence mode; teardown only calls `kill(pid)`; app restart automatically reruns prior commands.

**Phase to address:**
Shared model/terminal lifecycle phase before persistent tabs and named-command launch.

---

### Pitfall 5: An IPC protocol that works only on the happy-path connection

**What goes wrong:**
Client and service upgrades become lockstep; reconnect loses mutations or events; stale responses overwrite fresh state; event floods exhaust memory; half-written frames corrupt the stream; a restart causes duplicate destructive operations.

**Why it happens:**
A local socket is mistaken for an in-process function call. Request/response, progress, events, cancellation, snapshots, and compatibility have different delivery semantics.

**How to avoid:**
Start with a framed, schema-validated envelope containing protocol version, request/operation ID, message kind, and payload version. Negotiate a supported version range and fail with an actionable incompatibility error. Mutations get idempotency keys and terminal results; progress is replaceable by operation ID; events carry a monotonic cursor; reconnect performs handshake then authoritative snapshot then cursor-based resume (or an explicit gap/resync). Bound every writer queue, coalesce replaceable status/progress events, pause reads/writes under backpressure, cap frame size, set timeouts, and cancel subscriptions on disconnect. Test fragmentation, concatenation, malformed frames, slow readers, service restart, cursor gaps, duplicate mutation delivery, and mixed-version peers.

**Warning signs:**
Newline JSON without size limits; unbounded arrays per subscriber; UI applies events before a snapshot generation; reconnect simply retries every request; compatibility is inferred from the app package version.

**Phase to address:**
Versioned local-service protocol phase, before either GUI consumes the service.

---

### Pitfall 6: Assuming “local” IPC is authenticated and safe

**What goes wrong:**
Another local user or process invokes workspace mutations or launches named commands, a symlink/socket replacement redirects a client, sensitive environment values leak through responses/logs, or commands execute in attacker-controlled paths.

**Why it happens:**
Unix-domain transport is treated as an authorization boundary by itself. Workspace operations and command launch are powerful capabilities.

**How to avoid:**
On Linux place the socket in `$XDG_RUNTIME_DIR`, whose specification requires user ownership and mode 0700; create a private subdirectory, reject unsafe ownership/modes and symlinks, use restrictive umask, and verify peer credentials where supported. On macOS use an equivalently user-scoped endpoint and peer check. Never accept arbitrary executable/cwd/environment triples from the GUI: accept a workspace ID plus named-command ID and resolve all paths/config/env inside git-stacks. Redact environment secrets from DTOs, errors, and logs. Add request authorization by capability, even with one current client.

**Warning signs:**
Socket under world-writable `/tmp`; GUI sends raw shell text for a named command; API returns the entire merged environment; endpoint permissions are untested; logs dump protocol payloads.

**Phase to address:**
Protocol/security phase, with command-resolution tests in named-command phase and packaging permission tests later.

---

### Pitfall 7: Creating a second workspace engine in the GUI

**What goes wrong:**
CLI/TUI and native client disagree about workspace identity, paths, ports, command environment, or mutations. Direct YAML writes bypass validation, atomic-write/locking rules, caches, rollback, hooks, and future schema migrations; concurrent writes corrupt or lose data.

**Why it happens:**
Reading YAML appears faster than designing complete query DTOs, and GUI forms tempt developers to mirror domain logic client-side.

**How to avoid:**
Make git-stacks service methods the only workspace authority. DTOs expose stable semantic fields, capability flags, resolved command descriptors safe for display, and opaque IDs—not YAML shapes or paths that invite mutation. All writes call existing engine operations and stream their progress/results. Add an architectural dependency test forbidding YAML/config-engine imports from native/shared UI packages, plus parity fixtures asserting CLI and service views derive from the same engine functions.

**Warning signs:**
YAML dependency in GUI manifests; duplicated Zod schemas; client calculates ports or merged env; filesystem watchers parse workspace files; client-side optimistic mutation writes durable state before service confirmation.

**Phase to address:**
Service boundary/shared model phase, before workspace navigation.

---

### Pitfall 8: Treating Linux and macOS as skins over identical behavior

**What goes wrong:**
The shared model becomes polluted with GTK/SwiftUI assumptions, shortcuts conflict with platform conventions, rendering behavior diverges, or the macOS “proof” compiles but cannot accept real text input or survive lifecycle transitions.

**Why it happens:**
Ghostty deliberately uses GTK/OpenGL on Linux and SwiftUI/Metal/CoreText on macOS to provide native experiences. Only domain state and protocol semantics are naturally shared.

**How to avoid:**
Share immutable domain DTOs, reducer/state-machine semantics, protocol fixtures, and behavior tests. Keep view identity, menus, shortcuts, clipboard, renderer host, font discovery, notifications, and lifecycle in platform adapters. Specify capability negotiation for genuinely unavailable features. Define macOS proof success as a real service handshake, workspace navigation, one interactive terminal, resize/input/exit, and teardown—not pixel parity with Linux.

**Warning signs:**
Platform UI types in shared models; `#if linux` throughout domain code; screenshot parity is the primary cross-platform test; macOS uses an OpenGL assumption; Linux adopts Command-key semantics.

**Phase to address:**
Shared-model phase establishes boundaries; macOS proof phase validates the contract after Linux stabilizes it.

---

### Pitfall 9: Shipping keyboard input while omitting IME, focus, and accessibility

**What goes wrong:**
Dead keys, CJK input, compose sequences, screen readers, keyboard-only tab navigation, and clipboard selection fail. Global app shortcuts steal terminal keys; focus jumps on attention events and destroys active IME composition.

**Why it happens:**
ASCII keydown tests pass. GTK key events participate in capture/target/bubble propagation and require an `IMContext` for commit and preedit; AppKit custom text views must implement `NSTextInputClient`. GPU-rendered terminal cells do not automatically expose meaningful accessible text or tab semantics.

**How to avoid:**
Write an input-routing contract: reserved app actions are minimal and explicit; focused terminal receives unconsumed physical key/modifier events; committed text and preedit are separate; focus-in/out updates the IME; attention marks a surface without stealing focus unless the user invokes focus. Implement platform text-input protocols and cursor rectangle updates. Give workspace/tab controls native accessible roles, relationships, labels, selected state, and actions; establish an explicit terminal accessibility strategy with upstream capabilities rather than claiming support from a canvas. Test keyboard-only use, screen reader smoke, dead keys, compose, emoji, CJK IME, Alt/Meta/Ctrl, paste, and focus during tab switching.

**Warning signs:**
One callback named `onText`; no preedit model; global capture consumes all shortcuts; attention handler calls `grab_focus`; custom tabs expose no selected/controls relation; accessibility is deferred until visual polish.

**Phase to address:**
Input/accessibility contract in terminal adapter phase; full Linux acceptance before vertical-slice completion; macOS-specific protocol proof in macOS phase.

---

### Pitfall 10: Packaging succeeds only in the developer checkout

**What goes wrong:**
The app cannot find libghostty, schemas, icons, service binary, or locale data after installation; ABI/toolchain mismatch appears on another distribution; macOS signing/notarization fails; the socket or child process behaves differently under a launcher/systemd environment.

**Why it happens:**
Native dependencies and runtime paths are resolved relative to the repository, and CI validates only unit tests. GTK/libadwaita minimum versions, graphics drivers, Zig-produced libraries, rpaths, desktop metadata, and macOS bundles introduce independent failure modes.

**How to avoid:**
Decide supported distro/runtime and macOS deployment targets early. Build libghostty from the pinned source in a reproducible build, inspect linkage/rpaths, bundle or declare dependencies deliberately, and never download executable components at first launch. Install into a clean prefix/container/VM and run service handshake plus interactive-terminal smoke without the source tree. Validate desktop file, icon, Wayland/X11 launch, runtime directory, crash cleanup, macOS architecture slices, hardened runtime/signing/notarization assumptions, and upgrade compatibility.

**Warning signs:**
Absolute checkout paths; `LD_LIBRARY_PATH` required; only `bun run` launches work; CI has no packaged-artifact smoke; service discovery depends on current working directory; universal macOS build untested.

**Phase to address:**
Build skeleton in adapter phase; install/package gate after Linux vertical slice; macOS bundle gate in proof phase.

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Expose libghostty handles/types above the adapter | Fewer wrapper calls | Upstream churn crosses every layer | Never |
| Parse workspace YAML in the GUI | Fast list prototype | Duplicate authority, unsafe mutations, migration drift | Never; use a fixture DTO for a throwaway visual mock only |
| Model events as ordinary responses | One message shape | No replay, ordering, resync, or backpressure semantics | Never beyond a disposable spike |
| Persist live PID/PTY identifiers as restorable sessions | Easy-looking restart | Stale/reused PIDs and phantom sessions | Never |
| Implement ASCII key events first and “add IME later” | Quick demo | Input architecture must be rewritten | Never for the production adapter |
| Make macOS share Linux view/controller code | Apparent reuse | Lowest-common-denominator UX and renderer leakage | Never; share models and fixtures instead |
| Shell-wrap resolved named commands | Convenient env/cwd syntax | Quoting, injection, and signal/process-group ambiguity | Only when the command explicitly declares shell semantics |
| Unbounded event buffers | Simple reconnect | Memory growth and stale UI storms | Never |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| libghostty | Track latest branch or copy internal Ghostty GUI code | Pin a commit, use public C boundary/examples, isolate it behind a capability adapter |
| GTK4/OpenGL | Render outside GTK's context/framebuffer lifecycle | Realize, make current/check error, render, resize, and unrealize explicitly |
| SwiftUI/Metal | Equate SwiftUI wrapper identity with native surface lifetime | Own Metal terminal in a thin AppKit view and make creation/destruction idempotent |
| PTY/process | Kill only the immediate shell | Own the process group/session, close PTY, reap, then escalate on a bounded timer |
| Workspace service | Accept raw paths/env/command strings from client | Accept opaque workspace/command IDs and resolve through authoritative engine code |
| Agent attention | Infer state by scraping terminal output and force focus | Consume structured hook events, mark attention, preserve current focus |
| Unix socket | Assume filesystem path implies same-user peer | Private runtime directory, strict permissions, peer credentials, frame limits |
| Desktop packaging | Resolve binaries/assets from cwd | Install/bundle with relocatable discovery and smoke the installed artifact |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Rendering every background surface continuously | High GPU/CPU use, laptop drain | Visibility-aware frame scheduling while PTY parsing continues | A few busy terminals |
| Sending full workspace snapshot for every event | UI stalls and allocation spikes | Initial snapshot plus small revisioned deltas and explicit resync | Dozens of repos or bursty git status |
| Unbounded terminal output/event queues | Memory growth, seconds-late UI | Bounded ring buffers, coalescing, backpressure, gap markers | One runaway command or slow client |
| Synchronous git/YAML work on UI thread | Frozen navigation/input | Service-side async operations with progress and cancellation | First slow/networked multi-repo workspace |
| One polling timer per workspace/repo/surface | Wakeup storm | Central scheduler, invalidation, TTL, and visible-work prioritization | Tens of workspaces/surfaces |
| Recreating terminal on tab selection | Lost state and process churn | Stable surface identity; switch projection/visibility only | Immediately with interactive programs |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| World-accessible or replaceable local socket | Unauthorized mutation/command execution | User-private runtime location, ownership/mode and peer checks |
| Raw command/cwd/env accepted over IPC | Command injection and path escape | Resolve named commands in engine from opaque IDs; validate canonical paths |
| Environment included in DTOs/logs | Credential/token disclosure | Allowlist display fields and redact secrets at serialization/log boundaries |
| Unlimited frames/queues/subscriptions | Local denial of service | Frame, queue, rate, and subscription limits with disconnect policy |
| Automatic rerun after uncertain disconnect | Duplicate destructive operation | Idempotency keys and queryable operation terminal state |
| Loading unpinned native code | Supply-chain/ABI compromise | Vendored or checksummed exact source pin and reproducible build provenance |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Attention event steals keyboard focus | Typing lands in another shell; IME composition lost | Badge/highlight/notification first; focus only on explicit action |
| Hidden background tab is silently killed | Lost servers and agent work | Explicit close semantics and running-process confirmation |
| Dead service looks like empty workspace list | User assumes data vanished | Distinct disconnected/reconnecting/incompatible states with retry details |
| Renderer failure produces a blank panel | No recovery path | Surface-local error with diagnostic and retry/fallback action |
| Tabs are visual-only custom widgets | Keyboard and screen-reader users cannot navigate | Native accessible tab roles, selected state, relations, and actions |
| Restored tab implies restored process | Misleading continuity after crash/restart | Label session ended and offer explicit restart with resolved command |
| Linux and macOS shortcuts are identical | Conflicts with platform muscle memory | Platform-native shortcut maps over shared semantic actions |

## "Looks Done But Isn't" Checklist

- [ ] **libghostty integration:** Exact upstream commit/toolchain is recorded; adapter conformance builds without exposing upstream types.
- [ ] **Terminal surface:** `vim`/alternate-screen, resize/reflow, mouse, selection/clipboard, Unicode width, IME, exit, and repeated destroy all pass.
- [ ] **GPU host:** Context/drawable failure, DPI changes, tab move, window close, Wayland/X11, and repeated mount/unmount are tested.
- [ ] **Process lifecycle:** Child and grandchild behavior is verified for tab close, app quit, crash, shell exit, and escalation timeout with no zombies.
- [ ] **Protocol:** Fragmented/malformed/oversized frames, slow readers, version mismatch, service restart, cursor gap, cancellation, and duplicate mutation are tested.
- [ ] **IPC security:** Endpoint location, owner/mode, symlink handling, peer identity, payload redaction, and capability checks are verified.
- [ ] **Workspace authority:** Native packages have no YAML parser/config-engine imports; CLI and service fixtures resolve identical paths/env/ports/commands.
- [ ] **Attention routing:** Structured event targets the correct workspace/surface without output scraping or unsolicited focus.
- [ ] **Accessibility/input:** Keyboard-only navigation, screen-reader smoke, preedit/marked text, dead keys, CJK, modifiers, paste, and focus transitions pass on each platform.
- [ ] **Reconnect UX:** UI distinguishes reconnecting, incompatible, resyncing, and authoritative empty state; stale generations cannot overwrite current state.
- [ ] **Packaging:** Clean installed artifact launches outside checkout and completes service plus interactive-terminal smoke on declared platform variants.
- [ ] **macOS proof:** Uses the same protocol/model fixtures but native Metal/AppKit input lifecycle; it proves behavior, not screenshot parity.

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| libghostty API leaked across layers | HIGH | Freeze pin, inventory imports/types, introduce adapter façade, migrate callers, add boundary test, then upgrade |
| Duplicate YAML/domain engine | HIGH | Make GUI read-only, define missing service DTOs/mutations, parity-test engine calls, remove parser and direct writes |
| Protocol lacks replay/versioning | HIGH | Version old envelope, add handshake/IDs/cursors/snapshot generation, support a compatibility window, migrate clients |
| Orphaned terminal processes | MEDIUM | Enumerate owned process groups, add idempotent teardown/reaping, surface survivors, add crash/quit stress tests |
| Broken IME/focus model | MEDIUM-HIGH | Separate physical keys from committed/preedit text, adopt native input protocol, rewrite shortcut arbitration tests |
| GPU lifecycle crashes | MEDIUM | Disable affected renderer path, add explicit native-host states, serialize teardown, validate context/drawable errors |
| Insecure endpoint | HIGH | Stop service, remove endpoint safely, move to private runtime directory, add peer checks, rotate any exposed secrets |
| Packaging path/ABI failure | MEDIUM | Capture linkage and runtime diagnostics, make discovery relocatable, rebuild pinned dependency, smoke clean install |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Unstable libghostty API | 1. Reproducible terminal adapter | Exact-pin build plus public-boundary dependency test and upstream example smoke |
| GPU/native lifecycle | 2. Linux embedding spike | Repeated realize/render/resize/unrealize under Wayland/X11, DPI and failure injection |
| Duplicate workspace authority | 3. Shared model and service boundary | No YAML imports in client; CLI/service parity fixtures |
| Weak IPC semantics/security | 4. Versioned local protocol | Mixed-version, fragmentation, replay, backpressure, restart, permissions, and peer tests |
| Ambiguous PTY/process ownership | 5. Terminal lifecycle and session model | Close/quit/crash/exit process-tree tests and honest metadata restoration |
| IME/focus/accessibility omissions | 6. Linux interaction foundation | IME/preedit, keyboard protocol, accessible tabs, screen-reader and focus tests |
| Named-command injection/drift | 7. Workspace navigation and command launch | Opaque-ID resolution parity, canonical cwd/env, shell-free spawn, cancellation/progress |
| Attention scraping/focus theft | 8. Structured attention routing | Revisioned event targets correct surface and never changes focus without action |
| Developer-only packaging | 9. Linux vertical-slice packaging | Clean installed-artifact smoke on supported distro/display variants |
| False cross-platform parity | 10. macOS architectural proof | Shared protocol fixtures plus native Metal, `NSTextInputClient`, lifecycle and bundle smoke |

## Sources

- [Ghostty About: architecture and unstable libghostty status](https://ghostty.org/docs/about)
- [Ghostty repository: libghostty roadmap/status, OpenGL on Linux and Metal on macOS](https://github.com/ghostty-org/ghostty)
- [Ghostling: minimum libghostty consumer, consumer-owned features, and input limitations](https://github.com/ghostty-org/ghostling)
- [GTK4 `GtkGLArea`: context, framebuffer, realize/render/unrealize, and error lifecycle](https://docs.gtk.org/gtk4/class.GLArea.html)
- [GDK `GLContext`: current-context and platform-dependent failure constraints](https://docs.gtk.org/gdk4/class.GLContext.html)
- [GTK4 input and event handling: focus, propagation, shortcuts, and IM context wiring](https://docs.gtk.org/gtk4/input-handling.html)
- [GTK4 `IMContext`: preedit, commit, focus, cursor, and surrounding-text contract](https://docs.gtk.org/gtk4/class.IMContext.html)
- [GTK4 accessibility authoring practices: roles, custom entries, and accessible tabs](https://docs.gtk.org/gtk4/section-accessibility.html)
- [Apple `NSTextInputClient`: required custom text-view input protocol](https://developer.apple.com/documentation/AppKit/NSTextInputClient)
- [Apple custom Metal view guidance](https://developer.apple.com/documentation/Metal/creating-a-custom-metal-view)
- [XDG Base Directory specification: security and lifetime requirements for runtime sockets](https://specifications.freedesktop.org/basedir/)
- [Node child-process lifecycle: exit/close/error distinctions and signal behavior](https://nodejs.org/api/child_process.html)
- Repo-local spikes 001–003: PTY/state feasibility is partial; multiple owned surfaces require explicit lifecycle; structured attention should not scrape output.

---
*Pitfalls research for: git-stacks v0.20.0 Native Workspace Client*
*Researched: 2026-07-11*
