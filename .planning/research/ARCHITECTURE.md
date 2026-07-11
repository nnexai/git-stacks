# Architecture Research

**Domain:** Local native workspace client with embedded terminal surfaces
**Researched:** 2026-07-11
**Confidence:** HIGH for service and ownership boundaries; MEDIUM for the exact libghostty adapter API because upstream has not tagged a stable libghostty release

## Recommendation

Build a local, three-part system:

1. a **Bun/TypeScript workspace service** that is the only native-client path into git-stacks workspace configuration and operations;
2. a small **portable Zig application core** containing protocol DTOs, identity types, connection state, normalized client state, and pure action/reducer logic; and
3. **platform-native application shells** (GTK4/libadwaita first, SwiftUI proof second) that own windows, terminal tabs, PTYs, libghostty surfaces, focus, and persistence.

Do not move the existing workspace engine to Zig in this milestone. The service should call the existing TypeScript modules directly, not shell out to the CLI and not reimplement YAML semantics. Do not put libghostty objects or GTK/Swift types into the portable core. The resulting boundary is deliberately asymmetric: git-stacks owns durable workspace truth; each running native client owns ephemeral terminal truth.

## Standard Architecture

### System Overview

```text
┌──────────────────────────── Native client process ────────────────────────────┐
│                                                                              │
│  ┌──────────────── platform-native shell ─────────────────────────────────┐  │
│  │ Linux: GTK4/libadwaita             macOS proof: SwiftUI/AppKit         │  │
│  │ windows • navigation • focus • menus • lifecycle • state persistence   │  │
│  └──────────────┬──────────────────────────────┬───────────────────────────┘  │
│                 │ actions/view state           │ terminal callbacks           │
│  ┌──────────────▼──────────────┐  ┌────────────▼──────────────────────────┐  │
│  │ portable Zig app core      │  │ platform libghostty adapter          │  │
│  │ models • reducer • RPC     │  │ surface/config/renderer/PTTY bridge  │  │
│  │ connection • event routing│  │ PINNED upstream API, narrow wrapper   │  │
│  └──────────────┬──────────────┘  └────────────┬──────────────────────────┘  │
│                 │ JSON-RPC 2.0 over NDJSON      │ owns child processes/PTYs    │
└─────────────────┼───────────────────────────────┼──────────────────────────────┘
                  │ AF_UNIX stream               └── shells / named commands
┌─────────────────▼──────── git-stacks workspace service ──────────────────────┐
│ handshake/version • queries • mutations • operation registry • event fanout │
│ authorization by local socket ownership • schema validation • backpressure  │
└─────────────────┬─────────────────────────────────────────────────────────────┘
                  │ direct typed calls (no CLI subprocess, no duplicated YAML)
┌─────────────────▼──────── existing git-stacks TypeScript engine ─────────────┐
│ config/index • resolution/env/ports • status • lifecycle • operation runner  │
│ commands • messages/agent hooks • git/files • integrations                   │
└─────────────────┬─────────────────────────────────────────────────────────────┘
                  │
          YAML/config root, git worktrees, message journal, external tools
```

The workspace service and native client should be separate processes. This preserves the CLI/TUI, makes crashes and upgrades independently recoverable, gives all native shells the same contract, and avoids loading Bun plus the workspace engine into every platform UI runtime.

### Component Responsibilities

| Component | Responsibility | Must not own |
|---|---|---|
| Workspace engine (existing, modified) | Canonical config, validation, resolution, env/ports, workspace/repo status, mutations, rollback semantics | GUI state, terminal processes, client persistence |
| Workspace service (new) | Version handshake, RPC dispatch, DTO mapping, operation IDs, progress/events, cancellation requests, connection lifecycle | YAML interpretation duplicated from engine, terminal state |
| Protocol package (new) | JSON schemas/types, method and event names, error taxonomy, fixtures, compatibility rules | Runtime I/O or business logic |
| Portable Zig app core (new) | Stable cross-platform IDs/models, normalized state, reducer/actions, RPC client state machine, event-to-attention routing | GTK/Swift/libghostty handles, workspace mutations, PTYs |
| GTK4/libadwaita shell (new) | Linux application lifecycle, windows/navigation, presentation, focus, persisted layout | Workspace truth, YAML parsing |
| SwiftUI shell proof (new) | Proves C ABI/model/protocol portability and one embedded surface | Linux parity or independent model semantics |
| libghostty adapter per platform (new) | Encapsulates pinned upstream surface/config/render/input callbacks and translates to shell/core actions | Workspace service calls or workspace identity policy |
| Terminal session registry (new, client-local) | Stable surface IDs, workspace/repo binding, PTY/child lifetime, tabs/splits, exit status, restart/close policy | Durable workspace lifecycle |

## Versioned Local Service Boundary

### Transport and framing

Use one JSON object per UTF-8 line over an `AF_UNIX` stream socket. JSON-RPC 2.0 is transport-agnostic; NDJSON supplies the message boundary that a byte stream does not. A connection is full duplex and long-lived so requests, responses, progress, and attention notifications can interleave. Correlate responses only by JSON-RPC `id`; never assume response order.

Recommended socket location is `$XDG_RUNTIME_DIR/git-stacks/service-v1.sock` on Linux, with a private per-user fallback directory only when the runtime directory is unavailable. Do not use a shared predictable `/tmp/git-stacks.sock`: the current TUI notification socket is useful prior art for framing and stale-socket handling, but not an adequate authenticated service endpoint. On macOS use a user-private Application Support/cache runtime directory initially; launchd socket activation can be added without changing the protocol.

On accept, require `system.hello` before other methods:

```json
{"jsonrpc":"2.0","id":"1","method":"system.hello","params":{"protocol":{"major":1,"minor":0},"client":{"name":"git-stacks-gtk","version":"0.20.0"},"capabilities":["operations.cancel","events.agentAttention"]}}
```

The result selects a compatible protocol minor and advertises server capabilities. A major mismatch fails closed with a typed incompatibility error. Additive fields and methods increment the minor version; breaking field meaning, identity, or framing increments the major and uses a new socket name. Unknown object fields must be ignored, but unknown enum variants must map to an explicit `unknown` representation in clients rather than crashing.

Use namespaced methods such as `workspace.list`, `workspace.get`, `workspace.create`, `workspace.status`, `command.list`, `command.resolve`, and `operation.cancel`. Prefer object parameters. Preserve standard JSON-RPC error codes for parse/request/method/params failures and reserve a documented application range for conflicts, validation, not-found, busy, cancellation, and incompatible-version errors.

### Long operations and events

A mutating call that can exceed a UI interaction budget should quickly return an operation descriptor rather than holding the request open:

```json
{"jsonrpc":"2.0","id":"17","result":{"operationId":"op_01...","state":"accepted"}}
{"jsonrpc":"2.0","method":"event.operation","params":{"seq":42,"operationId":"op_01...","state":"running","phase":"worktree.create","message":"Creating api","completed":1,"total":3}}
{"jsonrpc":"2.0","method":"event.operation","params":{"seq":47,"operationId":"op_01...","state":"succeeded","result":{"workspace":"feature-x"}}}
```

The service owns an in-memory operation registry with bounded completed-operation retention. Every event carries a monotonically increasing per-service-instance sequence and a `serviceInstanceId`; reconnection uses a fresh snapshot plus current operation states, not an assumption that notifications were replayed. For milestone v0.20.0, delivery is **at-most-once live notification plus explicit resynchronization**, which is honest and sufficient for a local UI. Durable event replay can follow only if a concrete need appears.

Terminal output from client-owned commands does not traverse the service. Workspace mutation progress does. Convert existing callback strings into structured phases at the engine/service seam, retaining a human message as presentation fallback. Cancellation is cooperative: `operation.cancel` records intent and the operation reports `cancelling` then `cancelled` only after a safe checkpoint. Never claim cancellation for a non-interruptible git/filesystem step, and never kill an engine operation in a way that bypasses its compensation stack.

Apply per-connection output bounds. Coalesce replaceable progress events, never drop terminal operation states or agent-attention events, and disconnect persistently slow consumers after emitting a diagnostic when possible. Cap line/frame size and reject invalid UTF-8 or malformed envelopes before dispatch.

### Structured agent attention

Replace the current free-form socket notification as the native routing contract with a typed event containing at least:

- `eventId`, timestamp, kind, urgency, and optional display text;
- canonical workspace identity and optional repository identity;
- optional client terminal `surfaceId` supplied earlier through a client registration/correlation method;
- source framework/session metadata that is safe to expose.

The service validates and persists workspace-oriented attention through the existing message/hook subsystem, then fans it out. The client reducer resolves workspace/repo IDs and requests the platform shell to raise/focus; the shell decides whether focus stealing is allowed. If no matching surface exists, focus the workspace and show attention in navigation rather than inventing a terminal association. Production attention must not scrape terminal output, consistent with the validated tmux control-plane spike.

## Shared Zig Core Versus Native Shells

Use Zig for the smallest portion that benefits from identical behavior on Linux and macOS:

- protocol envelopes and generated/hand-maintained DTO decoding;
- canonical IDs and normalized workspace/repository/terminal-surface models;
- connection and resynchronization state machine;
- pure reducer from actions/events to app state;
- attention target resolution and deterministic selection policy.

Expose an opaque C ABI (`gs_app_create`, `gs_app_dispatch_json`, `gs_app_snapshot_json`, `gs_app_destroy`) or similarly narrow callback interface. Opaque handles keep Zig allocation and layout private; callers copy or explicitly free returned buffers. Do not expose Zig structs by layout across the ABI. Keep the C header versioned and exercise it from a tiny C harness plus Swift and GTK bindings.

Keep platform concerns native:

- GTK/SwiftUI view trees and observable bindings;
- application/window lifecycle and single-instance activation;
- filesystem locations and state restoration integration;
- libghostty surface/view creation, renderer integration, clipboard, IME, menus, drag/drop, accessibility;
- PTY creation, process groups, signals, resize, child reaping, and terminal session persistence policy.

This is not a mandate for a broad Zig rewrite. If the C ABI spike cannot demonstrate clean reducer snapshots and callbacks early, keep the protocol client/model native per platform for v0.20.0 rather than delaying Linux. The non-negotiable shared boundary is the wire protocol; shared in-process code is valuable but subordinate to the vertical slice.

## Terminal Ownership and libghostty Adapter

The native client creates each terminal from a **resolved launch specification**, never from raw workspace YAML. For a shell this contains resolved `cwd`, environment delta, shell/argv, workspace/repo IDs, and display metadata. For a named command, the workspace service should resolve path/env/ports/config and return a launch specification; the client starts the PTY so output, input, job control, and lifetime remain local to the surface.

Each terminal session has a client-generated stable `surfaceId` and bindings to workspace/repo/command identities. A session registry owns:

```text
SurfaceId → binding + PTY + child process group + libghostty surface + view placement
```

Closing a workspace in git-stacks must not implicitly kill native terminals unless the user explicitly chooses that client action. Conversely, closing a terminal never mutates the workspace. App shutdown must apply an explicit policy: warn for live foreground jobs, terminate gracefully, escalate after a timeout, reap children, then persist only reconstructable metadata. “Persistent tabs” in this milestone should mean persistence while the app remains alive and restoration metadata across launches; true surviving processes require a separate daemon/multiplexer architecture and should not be implied.

Pin libghostty to an exact upstream revision/submodule or reproducible package artifact. Put every unstable call behind one adapter target per platform, with a repo-owned stable interface for create/destroy, resize, focus, input, clipboard, title/cwd callbacks, child exit, and render invalidation. Compile-time/API smoke tests should fail at the adapter boundary on pin updates. Do not fork Ghostty’s application-level tab/split/window model: consume libghostty as terminal machinery and keep git-stacks-specific session organization in the client.

## Recommended Project Structure

```text
src/
├── lib/                         # existing workspace engine
│   ├── workspace-*.ts           # MODIFIED: DTO-friendly query/operation seams
│   ├── workspace-command.ts     # MODIFIED: resolved launch-plan seam
│   ├── operation-runner.ts      # MODIFIED: structured progress/checkpoints
│   └── messages.ts              # MODIFIED: structured attention ingestion
├── service/                     # NEW: Bun local service
│   ├── server.ts                # socket accept, lifecycle, peer credentials
│   ├── connection.ts            # NDJSON framing, bounds, backpressure
│   ├── router.ts                # JSON-RPC validation and dispatch
│   ├── operations.ts            # registry, progress, cancellation, retention
│   ├── events.ts                # fanout and resync metadata
│   └── methods/                 # thin adapters into src/lib
└── protocol/                    # NEW: canonical schemas and fixtures
    ├── v1.ts                    # Zod wire schemas/types
    ├── errors.ts
    └── fixtures/
native/
├── core/                        # NEW: optional portable Zig app core
│   ├── src/{model,reducer,rpc}.zig
│   ├── include/git_stacks_app.h
│   └── tests/
├── ghostty/                     # NEW: pinned dependency + adapter contract
│   ├── include/git_stacks_terminal.h
│   └── pin metadata
├── linux/                       # NEW: GTK4/libadwaita application
│   ├── src/{app,window,state,terminal}/
│   └── packaging/{desktop,metainfo,systemd}/
└── macos/                       # NEW: thin SwiftUI proof
    └── GitStacksNative/{App,Model,Terminal}/
tests/
├── service/                     # NEW: socket/RPC/operation integration tests
├── protocol/                    # NEW: compatibility and malformed-input tests
└── fixtures/protocol-v1/        # NEW: shared cross-language golden messages
```

Keep protocol schemas owned by the TypeScript service because it validates untrusted input there. Generate or verify C/Zig/Swift fixture compatibility in CI, but do not create multiple manually authoritative schemas.

## Process Lifecycle and Packaging

For development and the first vertical slice, the native app may spawn `git-stacks service --stdio-ready` or connect to an already-running user service, using a startup lock and readiness handshake to avoid races. The service must survive client disconnects only while it has other clients or active non-cancellable operations, then exit after an inactivity timeout. The client reconnects with bounded exponential backoff and always resynchronizes snapshots.

For Linux packaging, install a user `systemd.socket`/`systemd.service` pair when systemd user services are available; socket activation removes stale-socket races and starts the service on demand. Also support direct app-managed startup for non-systemd desktops and development. `GtkApplication`/`GApplication` should own GUI uniqueness and window lifecycle; it already routes later activations to the primary session instance. These are separate uniqueness domains: GTK owns one GUI instance per desktop session, while the service socket owns one workspace service per user/runtime directory.

For macOS, bundle the SwiftUI app, Zig core library, and pinned libghostty artifacts with correct code signing and runtime search paths. Begin with app-managed child-service startup for the architectural proof; design service acceptance around an inherited listening FD so later launchd socket activation (`launch_activate_socket`) does not require a protocol redesign.

The service executable version may follow git-stacks releases, but wire compatibility is independent. Packaging must never silently connect a new client to an incompatible old service: the hello exchange reports both product and protocol versions and gives an actionable restart/upgrade error.

## Data Flows

### Query and resynchronization

```text
platform activate
  → connect/start service
  → system.hello
  → workspace.snapshot + operation.listActive
  → Zig reducer replaces normalized authoritative workspace slice
  → native shell renders navigation
```

### Workspace mutation

```text
UI action
  → reducer emits RPC effect
  → service validates request and returns operationId
  → engine mutation + structured progress/rollback callbacks
  → event.operation notifications
  → terminal state event + workspace.changed revision hint
  → client refreshes affected authoritative entities
```

Do not optimistically mutate canonical workspace state for destructive actions. The UI may show an operation placeholder immediately, but refresh workspace truth after completion or `workspace.changed`.

### Named-command launch

```text
UI selects command
  → command.resolve(workspaceId, repoId?, commandName)
  → service uses workspace-command + workspace-env to return launch steps
  → client session registry creates PTY/libghostty surface per chosen policy
  → process output stays client-local
```

For multi-step pre/main/post command sequences, either create one shell script/PTY launch spec preserving current sequence semantics, or explicitly model steps. Do not ask each platform client to rediscover ordering and environment rules.

### Agent attention

```text
agent hook → service ingestion → durable workspace message + event.agentAttention
  → reducer records attention and resolves target
  → shell focuses existing surface or workspace navigation
```

## Architectural Patterns

### Functional core, imperative shells

All durable mutations remain in the TypeScript engine; all cross-platform selection/state transitions in the Zig reducer are pure; OS APIs and libghostty live in imperative adapters. This makes protocol fixtures and reducer transitions testable without a display server or terminal process.

### Snapshot plus invalidation events

Queries return self-contained DTO snapshots. Events announce operation transitions and entity revision hints; clients re-query affected state. Avoid an event-sourced replica in v0.20.0. The local dataset is small, while correctness after sleep, crash, upgrade, or missed notification matters more than minimizing bytes.

### Stable identity, separate presentation

Wire DTOs use canonical workspace names/IDs and repo identity from the engine, plus client-generated surface IDs. Paths are data, not identity. Display labels and ordering can evolve without breaking event routing.

### Explicit effect ownership

Reducer output distinguishes service RPC effects, terminal effects, and platform focus/persistence effects. Only the owning adapter performs each effect. This prevents a server event handler from directly touching GTK/SwiftUI/libghostty objects and makes macOS proof behavior comparable.

## Scaling and Reliability Considerations

This is a single-user local system; user-count scaling tables are irrelevant. The important dimensions are workspaces, repositories, concurrent operations, terminal surfaces, and event rate.

| Pressure | First likely failure | Adjustment |
|---|---|---|
| Hundreds of workspaces/repos | Expensive full status refresh | Existing indexed config plus summary/detail queries, revisions, bounded concurrency |
| Many simultaneous mutations | Conflicting filesystem/git operations | Service-side resource locks keyed by workspace/repo and explicit conflict errors |
| Many terminal surfaces | GPU/PTY/process memory | Lazy surface realization, suspend hidden rendering, visible lifecycle metrics |
| Bursty hook/progress events | Slow UI connection queue | Coalesce progress, bounded queues, preserve terminal events, resync after reconnect |
| Service crash/restart | Missed notifications/stale operations | New serviceInstanceId, snapshot resync, mark former operations interrupted |

The first concurrency rule should be simple: serialize mutations that touch the same workspace or underlying main repository; permit independent read queries and independent workspace operations only where existing engine locking makes them safe.

## Anti-Patterns to Avoid

### GUI parses git-stacks YAML

This creates two authorities and makes schema migration, composition, env/secret resolution, caches, and validation diverge. All GUI reads and writes go through versioned service DTOs.

### Service shells out to the public CLI

Parsing CLI output loses typed errors/progress, adds quoting and process overhead, and couples machine behavior to human presentation. Invoke existing `src/lib` functions directly and add narrow reusable seams where commands still contain orchestration.

### PTYs in the workspace service

This turns the service into a terminal daemon, complicates crash recovery, security, multiplexing, and packaging, and contradicts client ownership. Keep embedded terminal processes with the native client for this milestone.

### Treating JSON-RPC notification as durable delivery

The specification intentionally provides no response for notifications. A disconnected client cannot know what it missed. Use snapshot/resync and operation queries; do not infer exactly-once delivery.

### Raw prose as progress state

Strings cannot reliably drive progress bars, cancellation, rollback UI, or compatibility. Emit stable state/phase fields plus optional human text.

### Leaking libghostty through the shared core

Upstream APIs are still evolving. Passing upstream handles/types across the app ABI expands the blast radius of every pin update. The native adapter is the only code that knows libghostty symbols.

### Premature durable terminal daemon

Restoring tabs is not the same as preserving child processes across app exit. State the milestone semantics accurately and defer survivable PTYs until there is an explicit product requirement.

## Build Order

1. **Protocol contract and fixtures.** Define v1 hello, errors, workspace/repo/command DTOs, operation states, events, frame limits, compatibility rules, and golden NDJSON fixtures.
2. **Engine seams and service query slice.** Extract DTO-friendly workspace snapshot/status and command-resolution calls; implement private runtime socket, framing, validation, hello, query methods, and integration tests.
3. **Long-operation model.** Add operation registry, structured progress adapter around existing callbacks/runner, resource locking, cancellation checkpoints, terminal states, reconnect resync, and malformed/slow-client tests.
4. **Portable core ABI spike.** Implement IDs/models/reducer/RPC state machine and C harness against fixtures. Fail fast to native per-platform models if the ABI adds unacceptable schedule risk.
5. **Linux lifecycle and navigation shell.** GtkApplication uniqueness, service startup/connect/reconnect, workspace/repo navigation, state persistence, and error/operation presentation without terminals first.
6. **Pinned libghostty Linux adapter and one terminal.** Prove create/render/input/resize/clipboard/child-exit, then add the client session registry and workspace-bound persistent tabs.
7. **Named commands and attention vertical slice.** Resolve launch specs through the service, own PTYs in the client, route structured attention to workspace/repo/surface, and validate no output scraping.
8. **Linux packaging/lifecycle hardening.** User systemd socket activation plus app-managed fallback, desktop metadata, dependency/runtime checks, crash/restart and shutdown-job behavior.
9. **macOS architectural proof.** Reuse protocol fixtures and Zig ABI, implement SwiftUI state binding and one libghostty surface, verify service lifecycle and attention routing; defer polish and parity.

This order establishes the authority and compatibility boundary before UI work, tests portable state before it becomes expensive to change, and validates the riskiest embedding API on Linux before multiplying it across platforms.

## Modified Versus New Components

| Kind | Components |
|---|---|
| Modified | TypeScript workspace query/status functions for DTO-safe reads; workspace command resolution for launch specs; operation callbacks/runner for structured progress and cooperative cancellation checkpoints; messages/agent hooks for structured attention; CLI program to expose service mode; packaging/build scripts |
| New | Protocol v1 schemas/fixtures; Bun Unix-socket service/router/connection/operation/event modules; portable Zig core and C ABI; GTK4/libadwaita app; platform libghostty adapters; client terminal session registry; Linux user service/desktop packaging; SwiftUI proof |
| Explicitly unchanged in authority | YAML config/index and schemas, CLI commands, OpenTUI dashboard, workspace lifecycle/git/files semantics, external integration ownership outside the new embedded client |

## Sources

- [JSON-RPC 2.0 Specification](https://www.jsonrpc.org/specification) — transport independence, IDs, errors, notifications, and response ordering (HIGH)
- [Ghostty repository and libghostty status](https://github.com/ghostty-org/ghostty) — shared Zig core, native GTK/SwiftUI shells, embeddable C/Zig API, examples, and untagged/in-flux libghostty API (HIGH)
- [Ghostty 1.3 release notes](https://ghostty.org/docs/install/release-notes/1-3-0) — standalone libghostty extraction and independent, not-yet-versioned release status (HIGH)
- [Ghostling](https://github.com/ghostty-org/ghostling) — official minimal C consumer illustrating the narrow embedding boundary (HIGH)
- [Gio.Application](https://docs.gtk.org/gio/class.Application.html) and [Gtk.Application](https://docs.gtk.org/gtk4/class.Application.html) — primary-instance routing, lifecycle, windows, and state saving (HIGH)
- [systemd.socket](https://www.freedesktop.org/software/systemd/man/latest/systemd.socket.html) and [systemd service activation](https://www.freedesktop.org/software/systemd/man/latest/daemon.html) — user socket activation and descriptor-based daemon startup (HIGH)
- [Apple `launch_activate_socket`](https://developer.apple.com/documentation/xpc/launch_activate_socket) — launchd-provided listening descriptors (HIGH)
- [Zig language reference: exporting a C library](https://ziglang.org/documentation/master/#Exporting-a-C-Library) — C ABI export and shared/static library support (HIGH)
- Repo evidence: `.planning/spikes/003-tmux-control-plane/README.md`, `src/lib/messages.ts`, `src/tui/dashboard/run.tsx`, `src/lib/workspace-command.ts`, and `src/lib/operation-runner.ts` — validated structured-attention direction and reusable local framing, command-resolution, and rollback seams (HIGH)

---
*Architecture research for: git-stacks v0.20.0 Native Workspace Client*
*Researched: 2026-07-11*
