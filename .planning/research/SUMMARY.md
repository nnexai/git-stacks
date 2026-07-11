# Project Research Summary

**Project:** git-stacks v0.20.0 Native Workspace Client
**Domain:** Native desktop workspace and terminal command center
**Researched:** 2026-07-11
**Confidence:** HIGH overall; MEDIUM for libghostty embedding details

## Executive Summary

The milestone should add a native companion to git-stacks, not a replacement workspace engine or a new terminal multiplexer. The existing Bun/TypeScript code remains authoritative for workspace queries, mutations, resolved execution context, progress, and structured attention. Native clients consume a versioned machine contract, while each client exclusively owns its terminal processes, surface lifecycle, tabs, and session metadata. The first credible product is a Linux GTK4/libadwaita application with correct libghostty input/render/lifecycle behavior, workspace and repository navigation, multiple workspace-bound tabs, contextual named-command launch, and attention routing.

The recommended native boundary is a small Zig model/reducer with an opaque product-owned C ABI, plus platform-specific libghostty adapters: Zig/GTK/OpenGL on Linux and SwiftUI with an AppKit/Metal host on macOS. Pin libghostty to the Ghostty v1.3.1 commit and Zig 0.15.2 as a compatibility pair; no upstream types may escape the adapter. Validate one real Linux terminal early, but establish the service contract and stable identities first so neither frontend duplicates YAML or engine policy.

For the MVP protocol, use authenticated HTTP/1.1 JSON on an ephemeral `127.0.0.1` port for queries and mutations, with SSE for ordered progress and attention events. This is the only researched option directly supported by both Linux libsoup and macOS URLSession and therefore best fits the same-protocol proof constraint. Launch the service/client as a trust pair with a per-launch bearer token, bind loopback only, validate Host/Origin where applicable, cap bodies and queues, and negotiate `/v1` capabilities. Unix-domain-socket NDJSON/JSON-RPC offers stronger OS-local peer controls and full duplex, but creates a macOS transport adapter and conflicts with the common-denominator proof; defer it to post-MVP Linux hardening. WebSocket is also deferred until bidirectional high-frequency traffic is demonstrated. The largest remaining risks are unstable libghostty embedding, GPU/native-view teardown, IME/accessibility, PTY process-tree ownership, reconnect correctness, and installed-artifact packaging.

## Key Findings

### Recommended Stack

Keep the production workspace engine in Bun/TypeScript with Zod as the canonical runtime schema source. Generate OpenAPI 3.1/JSON Schema and golden fixtures for native consumers. Use Zig 0.15.2 for the portable reducer/C ABI and Linux adapter, exact-pinned libghostty from Ghostty v1.3.1, GTK 4.14+ and libadwaita 1.5+ for Linux, libsoup 3 for HTTP/SSE, and SwiftUI/AppKit with URLSession for the thin macOS proof.

**Core technologies:**

- **Bun + TypeScript + Zod:** authoritative service and wire-schema source, preserving existing CLI/TUI behavior.
- **HTTP/1.1 JSON + SSE:** common cross-platform MVP transport with ordinary mutations and replayable one-way events.
- **Zig 0.15.2 + opaque C ABI:** shared stable identities and deterministic state transitions without leaking Zig or Ghostty layouts.
- **Pinned libghostty v1.3.1 commit:** terminal core behind narrow platform adapters and explicit compatibility tests.
- **GTK4/libadwaita/libsoup:** Linux native shell, lifecycle, accessibility, and networking at the declared distro floor.
- **SwiftUI/AppKit/URLSession:** macOS-native proof using the same contract and model, not Linux view reuse.

Critical compatibility pairs are libghostty v1.3.1 with Zig 0.15.2, GTK 4.14+ with libadwaita 1.5+, and a product-owned C ABI version independent of upstream libghostty. Detailed evidence is in [STACK.md](./STACK.md).

### Expected Features

**Must have (v0.20.0):**

- Versioned query, resolved-launch, operation, error, and structured-event contract with stable IDs.
- Shared workspace/repository/command/operation/surface/attention model.
- GTK4 workspace and repository navigation with explicit loading, disconnected, incompatible, empty, and failure states.
- One fully correct embedded terminal, followed by multiple independent workspace-bound tabs.
- Shell and named-command launch from git-stacks-resolved cwd/environment/ports/configuration only.
- Honest session continuity: live tabs survive navigation; restart restores metadata but never claims dead processes survived.
- Attention badges and exact-surface routing without scraping output or stealing focus.
- CLI, OpenTUI, tmux/cmux, IDE integrations, and YAML authority remain intact.
- Thin macOS proof using the same protocol/model and one interactive native libghostty surface.

**Should have after the slice is validated:**

- Split panes and richer layout persistence.
- Terminal search, richer attention history, and additional native workspace mutations.
- Broader packaging, update, signing, and platform polish.

**Defer:**

- Built-in editor, diff/PR/CI dashboard, merge automation, or issue UI.
- Agent-specific orchestration, prompts, fan-out, or naming policy.
- External tmux/cmux inventory and control plane.
- New command palette/configuration language, exhaustive Ghostty settings, Windows, and polished macOS parity.

Detailed prioritization is in [FEATURES.md](./FEATURES.md).

### Architecture Approach

Use a functional core with imperative platform shells. The service exposes semantic DTOs and engine-backed operations; the Zig core decodes contract data and reduces application state; GTK and SwiftUI project that state; platform adapters own native views, rendering, input, clipboard, and libghostty churn; the client-local session registry owns PTYs and process trees. Stable identity is shared, presentation identity is platform-local, and snapshots remain authoritative over events after reconnect.

**Major components:**

1. **Workspace service:** engine-backed snapshots, command resolution, mutations, progress, attention, auth, and protocol compatibility.
2. **Protocol contract and fixtures:** `/v1` HTTP schemas, operation IDs, event cursors, error taxonomy, capability negotiation, limits, and cross-language golden tests.
3. **Shared Zig core/C ABI:** stable IDs, reducer, connection/operation state, attention correlation, and metadata restoration semantics.
4. **Platform shells:** GTK4/libadwaita Linux product and thin SwiftUI macOS proof.
5. **Platform libghostty adapters:** pinned upstream isolation plus native input/render/view lifecycle.
6. **Client session registry:** terminal surfaces, PTYs/process groups, workspace/repository binding, exit and idempotent teardown.

### MVP Protocol Decision

Adopt HTTP/1.1 JSON over an ephemeral loopback TCP port plus SSE `/v1/events`.

- `/v1/hello` negotiates protocol minor/capabilities and rejects major incompatibility.
- Requests use opaque workspace/repository/command IDs; raw executable/cwd/environment triples are forbidden.
- Mutations use idempotency keys and return an operation descriptor quickly; clients query terminal operation state after reconnect.
- SSE events carry `serviceInstanceId`, monotonic event ID/cursor, typed payload version, and operation or attention identity. Reconnect uses `Last-Event-ID` when retained; a gap forces a fresh authoritative snapshot and operation-state query.
- The service binds `127.0.0.1` only, selects an ephemeral port, requires a high-entropy per-launch bearer token, applies strict Host/Origin policy, redacts secrets, and limits request size, event retention, subscriber queues, rates, and timeouts.
- Progress is coalescible; operation terminal states and attention are retained within bounded replay windows. Terminal output never crosses this service.

**Deferred alternatives:** Unix-domain-socket NDJSON/JSON-RPC is a strong Linux hardening option once a macOS-compatible transport abstraction or platform-specific endpoint is justified; it is not the MVP because Foundation URLSession has no direct UDS support. WebSocket remains unnecessary until client-to-service streaming or high-frequency bidirectional messaging appears. Neither alternative changes DTOs, operation semantics, reducer behavior, or golden fixtures.

### Critical Pitfalls

1. **libghostty churn leaks across layers** — exact-pin source and toolchain, isolate symbols in adapters, and require compatibility smoke tests for upgrades.
2. **A visual terminal demo masks missing behavior** — gate on resize/reflow, alternate screen, mouse, Unicode, keyboard protocols, IME, clipboard, exit, and repeated teardown.
3. **GPU/native-view lifecycle is mishandled** — explicitly model GTK realize/render/unrealize and AppKit/Metal create/resize/destroy, including DPI and failure paths.
4. **PTY ownership is ambiguous** — one client surface owns one process group; service owns no terminals; close/quit/crash semantics and reaping are explicit and idempotent.
5. **Protocol works only on a happy connection** — version/capability negotiation, idempotency, bounded replay, snapshot resync, frame/body limits, slow-consumer policy, and mixed-version tests are required.
6. **Local IPC is assumed safe** — pair process launch with bearer auth, bind loopback only, forbid raw command context, redact secrets, and test endpoint discovery/token permissions.
7. **GUI becomes a second workspace engine** — forbid YAML/config-engine dependencies and parity-test service DTOs against existing engine functions.
8. **IME, focus, and accessibility arrive late** — define native input and shortcut arbitration before tab UX; attention never steals focus automatically.
9. **Installed builds depend on the checkout** — pin/build native dependencies reproducibly and smoke a clean installed artifact outside the source tree.

Detailed mitigations are in [PITFALLS.md](./PITFALLS.md).

## Implications for Roadmap

### Phase 1: Protocol, Authority, and Security Contract

**Rationale:** Every native feature depends on stable semantic identities and an engine-owned boundary.
**Delivers:** Zod schemas, OpenAPI/JSON Schema, golden fixtures, `/v1` hello/auth/errors, workspace/repository/command snapshots, loopback endpoint discovery, limits, and architecture dependency tests.
**Addresses:** versioned API, stable IDs, authoritative resolved context, CLI/TUI continuity.
**Avoids:** second YAML engine, insecure local endpoint, incompatible lockstep clients.

### Phase 2: Operations, Progress, Events, and Resynchronization

**Rationale:** Long mutations and attention require semantics beyond ordinary request/response before either GUI consumes them.
**Delivers:** idempotency keys, operation registry/states, structured progress, cancellation checkpoints, SSE cursor/replay/gap behavior, authoritative resync, structured attention envelope, backpressure tests.
**Addresses:** loading/progress/failure/retry and agent-neutral attention production.
**Avoids:** duplicate destructive mutations, lost terminal states, stale events, unbounded queues.

### Phase 3: Shared Native Model and ABI

**Rationale:** Freeze portable behavior before platform view identity and libghostty details become entangled.
**Delivers:** Zig DTO decoding, IDs, reducer, connection/operation/attention state, metadata-restoration semantics, opaque C ABI, C/Swift contract harnesses.
**Addresses:** shared application model and cross-platform engine/client separation.
**Avoids:** platform types in shared state, unstable ABI layouts, false process restoration.

### Phase 4: Pinned Linux Terminal Adapter

**Rationale:** libghostty embedding, GPU lifecycle, PTY teardown, and IME are the highest technical risks and must be proven before a broad UI.
**Delivers:** reproducible libghostty/Zig build, GTK host widget, one interactive surface, process-group ownership, input/IME/clipboard/accessibility contract, terminal acceptance and lifecycle stress tests.
**Addresses:** correct embedded terminal baseline.
**Avoids:** API leakage, ANSI-parser fallback, black/leaking surfaces, orphaned processes, ASCII-only input.

### Phase 5: Linux Navigation and Persistent Tabs

**Rationale:** Once the service/model and terminal lifecycle are sound, compose the first user-visible daily workflow.
**Delivers:** GtkApplication/libadwaita shell, service startup/reconnect UX, workspace/repository navigator, selection persistence, multiple workspace-bound tabs, visible running/exited/failed state, honest metadata restoration.
**Addresses:** navigation, tab management, workspace-bound continuity, keyboard-first Linux UX.
**Avoids:** UI-thread engine work, terminal recreation on selection, false empty states, focus loss.

### Phase 6: Resolved Launch and Attention Vertical Slice

**Rationale:** Command launch and exact-surface attention depend on stable client-owned surface registration established by Phase 5.
**Delivers:** resolved shell launch, contextual named-command launch, opaque-ID authorization/parity tests, surface correlation, unread aggregation, nearest-surviving-context fallback, explicit focus action.
**Addresses:** git-stacks differentiation through multi-repo context, resolved environment/ports, commands, and structured attention.
**Avoids:** raw command injection, shell-wrapping drift, output scraping, unsolicited focus stealing.

### Phase 7: Linux Packaging and Vertical-Slice Acceptance

**Rationale:** The slice is usable only when it launches outside a developer checkout and passes integrated behavior on supported Linux variants.
**Delivers:** desktop metadata, relocatable service/native discovery, pinned dependency provenance, clean-prefix artifact, Wayland/X11 smoke, shutdown/crash cleanup, performance and accessibility acceptance.
**Addresses:** usable Linux deliverable and non-regression gate.
**Avoids:** checkout-relative assets, ABI surprises, background rendering drain, untested endpoint permissions.

### Phase 8: macOS Architectural Proof

**Rationale:** Validate portability only after Linux stabilizes contract and model behavior; share semantics and fixtures, not widgets.
**Delivers:** SwiftUI navigation/state binding, URLSession protocol client, AppKit/Metal libghostty host, one interactive service-resolved terminal, input/resize/exit/teardown and attention proof.
**Addresses:** shared protocol/model architectural proof.
**Avoids:** Linux UI reuse, screenshot-parity goals, incomplete `NSTextInputClient` lifecycle, premature signing/polish scope.

### Phase Ordering Rationale

- Authority, compatibility, security, and event semantics precede clients so no prototype becomes an accidental second engine or unstable protocol.
- The portable reducer precedes views; the risky terminal adapter precedes broad navigation; multiple tabs precede exact-surface attention.
- Linux packaging is an acceptance gate, not cleanup. macOS follows the Linux slice because its purpose is to falsify or validate portability, not double implementation effort.
- Splits, richer mutations, tmux control, agent orchestration, and product-wide macOS parity remain outside this milestone.

### Research Flags

Phases needing deeper research during planning:

- **Phase 1:** Validate secure token/endpoint handoff and whether the process topology is app-spawned only or also supports user-service activation without weakening bearer lifecycle.
- **Phase 2:** Specify Bun SSE retention, disconnect, cancellation, and slow-consumer behavior with executable fault-injection fixtures.
- **Phase 3:** Time-box the Zig shared-core ABI; define a fallback to duplicated thin platform reducers if ABI friction outweighs deterministic sharing.
- **Phase 4:** Mandatory implementation spike against the exact libghostty commit, GTK/OpenGL host, PTY ownership, IME, clipboard, and destruction matrix.
- **Phase 7:** Research supported distro/container matrix, linkage/rpath strategy, Wayland/X11 CI availability, and clean-install packaging.
- **Phase 8:** Mandatory macOS availability spike for libghostty C/AppKit/Metal integration and `NSTextInputClient` on the selected Xcode/macOS floor.

Phases with established patterns where broad research can be skipped:

- **Phase 5:** GTK application navigation and persisted presentation state are well documented once adapter interfaces are fixed.
- **Phase 6:** Engine-backed command resolution and attention seams already exist repo-locally; planning should emphasize parity and authorization tests.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Official Ghostty, GTK, Apple, Bun, and repository evidence support the shells and service choices; full embedding remains MEDIUM. |
| Features | HIGH | Competitor baselines and existing git-stacks capabilities converge on a narrow daily-use Linux slice. |
| Architecture | HIGH | Authority, PTY ownership, functional-core, and platform-adapter boundaries are strong; exact shared ABI and transport topology require validation. |
| Pitfalls | HIGH | Risks are supported by official lifecycle/input/security documentation and repo-local spikes. |

**Overall confidence:** HIGH, with two mandatory proof points: Linux libghostty embedding and macOS adapter viability.

### Gaps to Address

- **libghostty API surface:** Confirm exact functions and any upstream patching needed at the pinned commit before promising full Linux acceptance.
- **Protocol process topology:** Decide whether v0.20 uses app-spawned ephemeral service only, user activation, or both; keep authentication and discovery explicit in every mode.
- **SSE replay bounds:** Choose retention size/time, cursor-gap response, and terminal-state query semantics from measured event volume.
- **Environment handoff:** Define a secret-safe launch mechanism; command execution needs resolved environment without exposing it in logs or broad display DTOs.
- **Stable identity migration:** Verify how existing workspace/repository records obtain opaque stable IDs across rename and refresh without making display names routing keys.
- **Terminal accessibility:** Confirm what libghostty exposes to native accessibility APIs and document honest limitations if cell text cannot be represented fully.
- **Supported platform matrix:** Select Linux distro/display/driver targets and macOS architecture/Xcode floors before packaging plans.
- **Shared Zig core fallback threshold:** Establish measurable criteria for retaining the shared reducer versus duplicating a very thin platform model.

## Sources

### Primary (HIGH confidence)

- Ghostty official documentation, v1.3 release notes, source repository, and Ghostling example — libghostty status, exact toolchain relationship, native platform architecture, and embedding boundary.
- GTK4, GDK, GLib/GIO, libadwaita, and accessibility/input documentation — Linux lifecycle, rendering, IME, focus, and application patterns.
- Apple SwiftUI/AppKit/Metal and `NSTextInputClient` documentation — macOS host and input lifecycle.
- Bun HTTP/server documentation — loopback service, streaming response, timeout, and Unix-socket alternative capabilities.
- JSON-RPC 2.0 and XDG Base Directory specifications — semantics considered for the deferred UDS alternative and local endpoint security.
- Repository implementation and spikes — workspace command resolution, operation runner, message hooks, PTY feasibility, and tmux attention findings.

### Secondary (MEDIUM confidence)

- Supacode and dmux product documentation — workspace-terminal baseline, attention, commands, and intentionally deferred product breadth.

### Tertiary (LOW confidence)

- Contextual named-command placement and the long-term need for a shared Zig reducer remain product/implementation hypotheses to validate through the vertical slice.

---
*Research completed: 2026-07-11*
*Ready for roadmap: yes*
