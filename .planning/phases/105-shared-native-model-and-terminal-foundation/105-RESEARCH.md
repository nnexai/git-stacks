# Phase 105: Shared Native Model and Terminal Foundation - Research

**Researched:** 2026-07-11
**Domain:** Portable Zig reducer/C ABI, pinned libghostty GTK embedding, PTY ownership, restoration, and lifecycle verification
**Confidence:** HIGH for the state/ownership architecture and exact source/toolchain pin; MEDIUM for the complete embedded GTK accessibility contract until the real host spike runs

<user_constraints>
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
- **Add workspace notes** — separate product capability unrelated to shared reducer and terminal ownership.
- **Plan broader code quality improvement run** — prior planning stream unrelated to the v0.20.0 Phase 105 boundary.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CORE-01 | Linux and macOS clients share stable workspace, repository, command, operation, surface, and attention identities. | Recommends tagged opaque ID domains in one portable core and fixture-driven ABI tests. |
| CORE-02 | A shared state reducer models connection, loading, failure, operation, tab, and attention transitions independently of platform UI types. | Defines a pure reducer with normalized state and explicit effects. |
| CORE-03 | Native shells access shared behavior through an opaque, versioned product-owned ABI. | Defines an opaque-handle C ABI with explicit buffer ownership and version negotiation. |
| CORE-04 | Cross-language golden fixtures verify native decoding and state transitions against the TypeScript contract. | Reuses Phase 104 fixtures and adds C/Zig plus macOS-compatible harness parity. |
| CORE-05 | Restored session metadata never represents terminated processes as still running. | Defines presentation-only persistence, independent quarantine, and lineage on relaunch. |
| TERM-01 | Linux embeds one fully interactive libghostty terminal. | Pins the upstream source/toolchain and makes GTK input/render/IME/clipboard a real-session gate. |
| TERM-02 | Every surface exclusively owns one PTY/process group with explicit cleanup. | Defines a surface registry, bounded close escalation, group verification, and crash guard. |
| TERM-03 | libghostty and Zig are exactly pinned behind an adapter with upgrade tests. | Identifies the immutable commit and Zig version and isolates all upstream symbols. |
| TERM-04 | Repeated surface/GPU lifecycle does not leak or orphan. | Defines stress-cycle accounting, subprocess assertions, and resource trend thresholds. |
| TERM-05 | Host exposes an honest native accessibility contract. | Requires focus/input semantics and documentation of unverified cell-level AT behavior. |
</phase_requirements>

## Summary

Build the native foundation as a separate `native/` tree with two product-owned boundaries: a portable Zig model library exported through a versioned opaque C ABI, and a Linux terminal adapter that is the only code allowed to import libghostty/GTK details. The existing Bun/TypeScript service remains authoritative; Phase 104's `/v1` schemas and golden fixtures are inputs, not code to port. [VERIFIED: Phase 104 implementation and repository architecture]

Pin Ghostty to the peeled commit for annotated tag `v1.3.1`, **`332b2aefc6e72d363aa93ab6ecfc86eeeeb5ed28`**, and pin Zig **`0.15.2`**. The tag object itself is `22efb0be…`; it is not the source commit and must not be recorded as one. [VERIFIED: `git ls-remote` and local checkout] The checked-out upstream manifest declares version `1.3.1` and `minimum_zig_version = "0.15.2"`; Ghostty's official build matrix maps all 1.3.x releases to Zig 0.15.2. [VERIFIED: upstream `build.zig.zon`] [CITED: https://ghostty.org/docs/install/build]

Use the full libghostty surface API, not `libghostty-vt` alone. The pinned `include/ghostty.h` exposes surface creation/free, focus, size/content scale, draw, key/text/preedit, mouse, IME-point, clipboard callbacks, process-exited, close-confirmation, selection, and child-exit messaging. [VERIFIED: pinned upstream source inspection] `libghostty-vt` deliberately supplies terminal state and renderer state but leaves renderer/windowing, clipboard integration, tabs, splits, session management, and accessibility to the consumer. [CITED: https://github.com/ghostty-org/ghostling] Therefore the Phase 105 GTK adapter must own the GL/view lifecycle and every native interaction seam; a successful draw is not terminal acceptance.

The highest-risk mismatch is lifecycle ownership. Upstream surfaces create and own a PTY session, and upstream termination sends SIGHUP to an owned process group, repeatedly checking until the direct child is reaped. [VERIFIED: pinned `src/Surface.zig` and `src/termio/Exec.zig`] That is useful implementation evidence, but it does not satisfy D-09 through D-12 by itself: git-stacks must track the owned PGID independently, implement graceful-then-force policy and a separate guard process, and retain `failed_cleanup` until `/proc`/`kill(pid, 0)`-style verification proves the group is absent.

**Primary recommendation:** plan four executable slices: (1) fixture-driven portable model and ABI; (2) truth-preserving session persistence; (3) exact-pinned Linux GTK/libghostty surface; (4) process/crash ownership plus automated and real-session acceptance. Do not broaden the phase into workspace navigation, tabs UI, packaging, or the macOS terminal host.

## Standard Stack

| Technology | Exact version/pin | Purpose | Evidence |
|------------|-------------------|---------|----------|
| Zig | `0.15.2` exact compiler artifact + checksum | Portable reducer, C ABI, Linux adapter build | Required by Ghostty 1.3.x. [CITED: https://ghostty.org/docs/install/build] |
| Ghostty/libghostty | commit `332b2aefc6e72d363aa93ab6ecfc86eeeeb5ed28` (peeled `v1.3.1`) | Terminal surface, emulation, renderer, PTY | Upstream tag/source verified; libghostty is not independently versioned yet. [CITED: https://ghostty.org/docs/install/release-notes/1-3-0] |
| GTK | installed `4.22.4`; support floor `>=4.14,<5` | Linux native host, input, IM context, clipboard, GL lifecycle | Ghostty 1.3 declares GTK 4.14 floor. [CITED: https://ghostty.org/docs/install/release-notes/1-3-0] |
| libadwaita | installed `1.9.2`; support floor `>=1.5,<2` | Minimal native application/window shell | Ghostty 1.3 declares libadwaita 1.5 floor. [CITED: https://ghostty.org/docs/install/release-notes/1-3-0] |
| Bun/TypeScript | existing repository stack | Canonical `/v1` fixtures and fixture generation | Existing Phase 104 contract remains authoritative. [VERIFIED: codebase inspection] |
| POSIX process APIs | Linux libc/kernel | sessions/groups, signals, reaping, guard IPC | No external package is required. |

The host currently has Zig `0.16.0`, not the required `0.15.2`; the plan must provision a repo-controlled exact compiler rather than use ambient `zig`. [VERIFIED: local CLI] GTK/libadwaita exceed the declared floor, so CI also needs a minimum-version build lane rather than proving only the developer machine.

## Package Legitimacy Audit

No registry package installation is recommended. Ghostty is a source dependency pinned by full Git commit; Zig is an official compiler artifact pinned by version and checksum. The planner must add provenance/checksum verification and must not introduce an npm package named `libghostty` or download tools through `npx`.

## Architecture Patterns

### Recommended project structure

```text
native/
├── build.zig
├── build.zig.zon
├── deps/
│   └── ghostty.lock             # repo URL, tag object, peeled commit, source checksum, Zig checksum
├── include/
│   └── git_stacks_native_v1.h   # product ABI only
├── core/
│   ├── identity.zig
│   ├── contract.zig
│   ├── model.zig
│   ├── reducer.zig
│   ├── persistence.zig
│   └── abi.zig
├── terminal/
│   ├── adapter.zig              # only libghostty import boundary
│   ├── ownership.zig
│   ├── guard.zig
│   └── diagnostics.zig
├── linux/
│   ├── app.zig
│   └── terminal_host.zig        # GTK widget/input/IME/clipboard/GL lifecycle
└── tests/
    ├── fixtures/                # copied/generated from canonical Phase 104 fixtures
    ├── abi_harness.c
    ├── reducer_test.zig
    ├── persistence_test.zig
    ├── ownership_test.zig
    └── lifecycle_stress.zig
```

### Pattern 1: Functional core with typed effects

The reducer is `reduce(state, action) -> { state, effects }`. State contains only product IDs, negotiated contract values, presentation/session metadata, and explicit lifecycle variants. Effects are tagged (`service_refresh`, `service_mutation`, `terminal_create`, `terminal_close`, `persist_session`, `platform_focus`) and performed by adapters. GTK pointers, libghostty handles, PIDs/FDs, clocks, and filesystem handles never enter reducer state.

Recommended connection variants: `disconnected_no_snapshot`, `connecting`, `ready`, `stale`, `refresh_required`, `incompatible`, and `failed`. Keep last snapshot only in `stale`/`refresh_required`; `incompatible` retains presentation metadata but clears service-derived authoritative entities. Unknown optional data lives in a diagnostic bag keyed by capability/schema identity and cannot produce effects.

### Pattern 2: Opaque ABI with caller-owned copies

Export only opaque handles and fixed-width scalar/status types. Use UTF-8 JSON bytes for versioned action/snapshot interchange in Phase 105 because it preserves exact Phase 104 fixture semantics and keeps Zig layout out of the ABI. Every returned allocation has a matching product-owned free function; errors are structured data, not thread-local strings.

```c
typedef struct gs_model_v1 gs_model_v1;
typedef struct { const uint8_t *ptr; size_t len; } gs_bytes_v1;

uint32_t gs_native_abi_version(void);
gs_model_v1 *gs_model_create_v1(gs_bytes_v1 initial_json);
int32_t gs_model_dispatch_v1(gs_model_v1 *, gs_bytes_v1 action_json);
int32_t gs_model_snapshot_v1(gs_model_v1 *, gs_bytes_v1 *out);
void gs_bytes_free_v1(gs_bytes_v1);
void gs_model_destroy_v1(gs_model_v1 *);
```

The C harness must compile and run on Linux now. A macOS harness/CI compile must consume the same header and fixtures for CORE-01/04, but Phase 105 must not implement the macOS libghostty host.

### Pattern 3: Truthful session restoration

Persist a versioned document containing presentation-only records. Each entry includes `surface_id`, optional binding IDs, title/order/cwd label, last exit status, and lifecycle `ended`; it contains no PID, PTY path, environment, argv, bearer token, or proof of liveness. Parse entries independently, collect quarantine diagnostics with original index/hash and error code, and atomically write the valid next generation. Relaunch allocates a new surface ID and records `predecessor_surface_id`.

### Pattern 4: Explicit surface ownership state machine

```text
creating -> live -> graceful_close_requested -> terminating -> ended
                  \-> failed_cleanup
live -> child_exited -> ended
live -> client_crashed -> guard_terminating -> ended | failed_cleanup
```

Creation is not committed to `live` until the adapter, PTY, child PID/PGID, and guard registration all succeed. Destruction is idempotent and ordered: stop new input/render callbacks, request graceful exit, wait an injected timeout, signal the entire PGID, reap, destroy libghostty surface, unrealize/free GPU host, unregister guard ownership, then remove the record. Any unproven process cleanup stops in `failed_cleanup` with diagnostics.

Use a small sibling guard process with a private inherited pipe/socket and an in-memory registry of `(surface_id, pgid, birth token/start time)`. The client registers before exposing a live surface and unregisters only after cleanup proof. EOF on the control channel means client death: the guard signals registered groups, verifies absence, writes bounded diagnostics, and exits. Authenticate commands structurally through the inherited private channel; never accept arbitrary external PIDs over a public socket.

### Pattern 5: Native terminal host contract

The GTK host translates widget lifecycle and input into the pinned adapter: realize creates graphics resources, resize updates content scale and pixel/cell dimensions, render/draw occurs only with a valid context, focus calls both GTK IM focus and libghostty focus, committed text calls `ghostty_surface_text`, preedit calls `ghostty_surface_preedit`, cursor rectangle comes from `ghostty_surface_ime_point`, and unrealize makes callbacks inert before surface/GPU destruction. [VERIFIED: pinned `ghostty.h` API]

Clipboard read/write must flow through host callbacks with explicit selection-clipboard support and paste confirmation policy. Keyboard shortcuts must first honor product/native actions and then deliver sufficiently rich key events; Ghostling demonstrates that impoverished host events break Kitty keyboard behavior even though libghostty supports it. [CITED: https://github.com/ghostty-org/ghostling]

## Don't Hand-Roll

| Problem | Don't Build | Use Instead |
|---------|-------------|-------------|
| Terminal parser/emulator/reflow | Custom VT parser/grid | Pinned full libghostty surface API. |
| Renderer | A second text renderer or `libghostty-vt` demo renderer | Pinned libghostty renderer through GTK/OpenGL host. |
| Contract source | A manually divergent Zig schema | Phase 104 golden JSON fixtures plus strict Zig decoding. |
| Cross-language ABI layout | Exported Zig structs/slices/enums by layout | Opaque handles, fixed-width values, byte buffers, explicit frees. |
| Process ownership | Shelling out to `ps`/`pkill` by command name | POSIX PID/PGID/session APIs and direct child reaping. |
| Crash cleanup | Parent shutdown callback or Linux parent-death signal alone | Separate ownership guard with inherited private channel. |
| Session resurrection | Persisted PID/PTY/environment and optimistic `running` | Presentation-only ended records and explicit lineage relaunch. |
| Accessibility claims | A generic `role=terminal` claim without AT evidence | Verified GTK focus/input semantics and an explicit limitation document. |

## Common Pitfalls

### 1. Pinning the annotated tag object
`v1.3.1` resolves to tag object `22efb0be…` but source commit `332b2aef…`. A downloader/build expecting a commit may fail or fetch an unintended object. Record both and verify HEAD equals the peeled commit.

### 2. Treating libghostty-vt as a ready GTK terminal
It intentionally excludes renderer/windowing and consumer UI. Use the full pinned surface path and isolate churn behind the adapter.

### 3. Letting upstream surface teardown define product policy
Upstream's SIGHUP/group behavior does not encode D-09 confirmation, timeout/escalation, failed-cleanup visibility, or crash-guard guarantees. Wrap it with product ownership state and verification.

### 4. PGID reuse or self-group signaling
If the child has not completed `setsid`, its PGID may still equal the client's group; a naive `killpg` can terminate the app. Registration must validate PGID differs from client/guard groups and include a birth token/start-time check where Linux exposes it. The pinned upstream implementation explicitly loops while the child still reports the caller's PGID. [VERIFIED: pinned `Exec.zig`]

### 5. Callbacks after unrealize/free
GTK/libghostty/render threads can enqueue invalidation or clipboard/exit callbacks while teardown proceeds. Introduce a generation/liveness token, disconnect GTK controllers first, reject late callbacks, join relevant work, then free.

### 6. IME reduced to committed text
Preedit, commit, focus in/out, cursor rectangle, surrounding behavior, and shortcut arbitration must be tested. `ghostty_surface_preedit` and `ghostty_surface_ime_point` exist at the pin; omitting them makes the visual demo falsely pass.

### 7. Restoration infers liveness from stale OS identifiers
Never probe a persisted PID and call it the old surface: PID reuse and lost ownership make that untrustworthy. All disk-restored surfaces are ended by definition in Phase 105.

### 8. Leak tests demand exact RSS equality
GTK, GL drivers, font caches, and allocators retain bounded caches. Assert object/process counters return to zero and use warm-up plus trend/plateau thresholds for RSS/FD/thread measurements.

### 9. Accessibility overclaim
The pinned source exposes selection/text reads but no clear general GTK screen-reader cell model was found in this research. [VERIFIED: pinned source search] Treat cell-level screen-reader output as unverified; verify focus, keyboard/IME, selection/clipboard, visible focus, and native host semantics, then document the gap rather than advertising full parity.

## Recommended Defaults

| Policy | Default | Rationale |
|--------|---------|-----------|
| Graceful close window | 2 seconds | Interactive shell gets a bounded exit opportunity; fake-clock tests avoid slow suites. |
| Forced group termination | SIGHUP, then SIGTERM after 500 ms, then SIGKILL after 2 seconds | Escalates while bounding shutdown. Exact stages remain product-owned and injectable. |
| Cleanup verification | poll every 25 ms up to 2 seconds after final signal | Short deterministic bound; retain failed state if absence is unproven. |
| Stress cycles | 100 in headless/process CI; 500 nightly; 25 documented real-GPU cycles | Enough to expose monotonic lifecycle drift without making every commit GPU-heavy. |
| Resource trend | after 10-cycle warm-up, zero live surfaces/children/PGIDs each cycle; FD/thread counts return to baseline; RSS slope over final 50 cycles <= 64 KiB/cycle and final median <= warm median + 16 MiB | A tunable bounded baseline, not a claim of exact deallocation. |
| Persistence | versioned JSON, owner-only directory/file, atomic temp+fsync+rename | Cross-language inspectability and existing project atomic-write convention. |

These numeric values are researched defaults, not external standards. Export/inject them so tests cover boundaries and later profiling can tune them without changing lifecycle semantics.

## Runtime State Inventory

This is an additive native foundation, not a rename/refactor phase.

| Category | Inventory | Required handling |
|----------|-----------|-------------------|
| Stored data | No native session store exists. Phase 104 owns service identities/fixtures. | Create versioned presentation-only session file; quarantine per entry; never migrate process liveness. |
| Live service config | Phase 104 service descriptor/credential and `/v1` snapshots/events are authoritative. | Native reducer consumes contract only; incompatible state discards service-derived truth. |
| OS-registered state | No native packaging/service-manager registration belongs in Phase 105. | Guard is child/sibling runtime state only; Phase 108 owns installation. |
| Secrets/env | Phase 104 launch context omits resolved secrets; terminal process environment may still be sensitive. | Never persist argv/env/credentials in session or guard diagnostics. Redact cwd details beyond the locked label contract where needed. |
| Build artifacts | No native build tree exists; ambient Zig is 0.16.0. | Add exact compiler/source manifests and reproducible build entrypoint; do not depend on global Zig. |

## Security Domain

### Applicable ASVS categories

| Category | Applies | Control |
|----------|---------|---------|
| V1 Architecture | yes | Product ABI, reducer, platform adapter, and process guard have explicit trust/ownership boundaries. |
| V2 Authentication | inherited | Phase 104 owns service credentials; Phase 105 must not persist or log them. |
| V5 Validation | yes | Strictly decode service fixtures/actions/session documents; quarantine corrupt entries and inert unknown optionals. |
| V7 Error/Logging | yes | Structured diagnostics are bounded and redact argv/env/tokens; failed cleanup remains visible. |
| V8 Data Protection | yes | Owner-only session storage; no sensitive launch details or false liveness. |
| V10 Malicious Code | yes | Verify exact source/compiler hashes; forbid floating dependencies and unverified package executors. |
| V12 File/Resource | yes | Atomic persistence, symlink-safe owner-only paths, FD/thread/surface cleanup. |
| V13 API | yes | Versioned opaque ABI validates lengths, nulls, versions, and ownership on every call. |

Threat cases to test: malformed/oversized ABI JSON, use-after-destroy/double-free, callback after teardown, symlinked/corrupt session files, PGID equal to app/guard group, PID/PGID reuse, forged guard commands, client SIGKILL, guard SIGKILL (reported limitation/recovery), secrets in diagnostics, and clipboard/terminal escape content treated only as data.

## Validation Architecture

### Test layers

1. **Pure Zig model tests:** every connection/loading/failure/operation/tab/attention transition, stale/frozen/incompatible semantics, unknown optionals, deterministic serialization.
2. **Golden parity:** Bun-generated Phase 104 fixtures consumed by Zig; C ABI harness compares canonical snapshots byte-for-byte or structurally. A macOS compile/test lane runs the same C header and fixture corpus for CORE-01/04.
3. **Persistence tests:** valid/corrupt mixed entries, missing identities, atomic crash points, permissions, ended-only restoration, relaunch lineage, secret-negative assertions.
4. **PTY/guard integration:** real process groups for exit, idle/active confirmation, close, quit, SIGKILL crash, escalation, descendant processes, rapid-close-before-setsid, and failed-cleanup injection.
5. **GTK/libghostty integration:** xvfb/headless where meaningful for create/resize/destroy and callbacks, but never use it as the sole interaction proof.
6. **Real-session UAT:** Wayland and X11 if supported, keyboard modifiers/Kitty protocol, mouse selection/reporting, Unicode/graphemes, resize/reflow, alternate-screen app, primary/system clipboard, IME preedit/commit/cursor, focus, exit, repeated GPU lifecycle, and accessibility inspection.

### Requirements-to-test map

| Req | Automated owner | Required proof |
|-----|-----------------|----------------|
| CORE-01/02 | reducer identity/transition suites | Same fixture/actions yield same canonical state independent of UI. |
| CORE-03 | C ABI compile, ownership, fuzz/negative suite | Version mismatch, null/length errors, create/destroy, allocation/free. |
| CORE-04 | fixture drift gate in Bun + Zig + macOS-compatible C harness | Canonical Phase 104 corpus cannot diverge silently. |
| CORE-05 | persistence and relaunch tests | Every disk-restored entry is ended; new surface ID links predecessor. |
| TERM-01 | adapter integration plus documented real session | Full interaction matrix, not screenshot/render-only. |
| TERM-02 | process group/guard matrix | Zero descendants on close/exit/quit/crash; failed proof remains visible. |
| TERM-03 | clean exact-pin build and intentional pin-bump smoke | Wrong Zig or changed API fails at adapter boundary. |
| TERM-04 | counters plus resource-trend stress | Zero live objects/processes each cycle and bounded plateau. |
| TERM-05 | automated focus/input semantics plus AT inspection document | Honest verified features and explicit upstream gaps. |

### Phase gate

The phase is not complete until all native unit/integration tests pass, the existing Bun suite/typecheck/dependency/release gates remain green, a clean build uses only the declared Zig/Ghostty pins, the crash guard test proves cleanup after `SIGKILL` of the client, and the real-session checklist is checked with captured environment/version evidence. Existing project commands remain `bun run test`, `bun run typecheck`, `bun run test:deps`, and `bun run verify:gates`; add a single repo-native `bun run native:verify` wrapper for the pinned native build/test/stress gates.

## State of the Art

| Previous assumption | Verified current state | Planning impact |
|---------------------|------------------------|-----------------|
| libghostty is only an internal unstable core | 1.3 extracted a standalone full Zig module and WIP C API, but no versioned libghostty release exists yet. [CITED: https://ghostty.org/docs/install/release-notes/1-3-0] | Exact commit remains mandatory; Linux should use Zig/full surface behind adapter. |
| `libghostty-vt` is enough for embedding | It supplies terminal/render state while consumer owns actual renderer/windowing and GUI features. [CITED: https://github.com/ghostty-org/ghostling] | Use full surface API for Phase 105 acceptance. |
| Tag hash is source commit | `v1.3.1` is annotated; peeled source is `332b2aef…`. [VERIFIED: upstream Git] | Lock peeled commit and source checksum. |
| Ambient Zig can build the pin | Host is 0.16.0; upstream requires 0.15.2. [VERIFIED: local CLI and upstream manifest] | Provision exact toolchain in the build. |
| Terminal accessibility follows automatically from GTK | No complete cell-level native accessibility contract was found in the pinned surface/GTK code search. [VERIFIED: pinned source inspection] | Make truthful limitation documentation an acceptance artifact. |

## Assumptions Log

| # | Claim | Risk if wrong / planner action |
|---|-------|--------------------------------|
| A1 | A sibling guard using an inherited private channel is acceptable as the D-12 implementation. | If packaging later forbids a second executable, keep the protocol/registry separable and revisit in Phase 108; do not weaken crash cleanup. |
| A2 | JSON bytes are acceptable for the product ABI in Phase 105. | If performance profiling disproves this, retain opaque handles/ownership and add a later binary ABI version; fixture determinism matters more now. |
| A3 | The proposed timeout/resource numbers fit typical local shells. | They are injectable defaults and require real-session tuning before lock-in. |
| A4 | A macOS-compatible C harness/CI lane is available for CORE parity even though the macOS terminal host is deferred. | If no runner exists, record the Phase 107 hardware/CI dependency and at minimum compile the header with Clang cross checks; do not falsely claim runtime macOS proof. |
| A5 | Full cell-level screen-reader exposure is absent or incomplete at the pin. | This is MEDIUM confidence; the implementation spike must inspect actual GTK accessibility nodes and document observed behavior rather than encode the assumption as fact. |

## Open Questions (resolved for planning)

1. **Exact libghostty/Zig pair:** use peeled Ghostty `v1.3.1` commit `332b2aefc6e72d363aa93ab6ecfc86eeeeb5ed28` plus Zig `0.15.2`, both checksum-locked.
2. **Linux embedding API:** use the full Zig/libghostty surface path with a GTK host; use `ghostty.h` as capability evidence/C-harness reference, not as permission to leak its symbols through the product ABI.
3. **Persistence encoding:** versioned JSON with independent entry validation/quarantine and atomic owner-only writes.
4. **Crash ownership:** sibling guard with inherited private channel and independently tracked PGIDs; no reconnection semantics.
5. **Accessibility acceptance:** verified focus/input/IME/selection/clipboard/native host behavior plus an explicit limitations document; do not claim screen-reader cell parity without observed AT evidence.

## Sources

- [Ghostty 1.3 release notes](https://ghostty.org/docs/install/release-notes/1-3-0) — standalone Zig module, WIP C API, independent/unversioned libghostty release status, GTK/libadwaita floors.
- [Ghostty source build documentation](https://ghostty.org/docs/install/build) — Ghostty 1.3.x requires Zig 0.15.2.
- [Ghostty 1.3.1 release notes](https://ghostty.org/docs/install/release-notes/1-3-1) — selected stable desktop patch release and date.
- [Ghostty repository](https://github.com/ghostty-org/ghostty) — current libghostty scope/status and official examples direction.
- [Ghostling](https://github.com/ghostty-org/ghostling) — official minimum C consumer, libghostty-vt responsibilities, host input limitations, and consumer-owned GUI features.
- Pinned Ghostty source at `332b2aefc6e72d363aa93ab6ecfc86eeeeb5ed28`: `build.zig.zon`, `include/ghostty.h`, `src/Surface.zig`, `src/termio/Exec.zig` — exact toolchain, surface API, PTY ownership, group teardown behavior. [VERIFIED: local source checkout]
- Repository `.planning/research/{STACK,ARCHITECTURE,PITFALLS,SUMMARY}.md`, Phase 104 fixtures/implementation, and Phase 105 context — product boundary and local conventions. [VERIFIED: codebase inspection]

## Research Confidence

| Area | Confidence | Reason |
|------|------------|--------|
| Exact source/toolchain | HIGH | Tag object, peeled commit, manifest, official build matrix, and local environment verified. |
| Reducer/ABI architecture | HIGH | Locked decisions and existing Phase 104 fixture contract support a pure opaque boundary. |
| PTY/process ownership | HIGH | Locked semantics plus pinned upstream implementation and POSIX primitives establish the required design; guard still needs implementation proof. |
| GTK interaction surface | MEDIUM-HIGH | Pinned API exposes required seams, but real GTK/libghostty host has not yet been built in this repo. |
| Accessibility | MEDIUM | Honest gap is verified by source search, but observed AT behavior must come from the implementation spike. |

## What Might Have Been Missed

- The pinned full libghostty Zig module may require build integration patches not visible from header/source inspection; the first native task must be a clean compile spike and preserve patches explicitly if unavoidable.
- GPU behavior differs across Wayland/X11/drivers; headless tests cannot establish real interaction or leak acceptance.
- Descendants that deliberately escape the session/process group cannot be proven owned by PGID alone. The implementation must document whether such daemonization is out of ownership scope or add cgroup/subreaper controls without silently overstating cleanup.
- The exact GTK accessibility tree may be created dynamically by runtime code not found through the source term search; inspect it with platform tools before finalizing TERM-05 documentation.

---

*Phase: 105-shared-native-model-and-terminal-foundation*
*Research completed: 2026-07-11*
