# Requirements: git-stacks

**Defined:** 2026-07-11
**Core Value:** One command takes you from "I need to work on feature X" to a fully running dev environment — right repos, right branches, right IDE/terminal open, hooks run — without manual steps.

## v0.20.0 Native Workspace Client Requirements

### Workspace Service Contract

- [ ] **SVC-01**: Native clients can negotiate a versioned `/v1` protocol and discover supported capabilities.
- [ ] **SVC-02**: Native clients can query workspace, repository, and named-command snapshots using stable opaque identities.
- [ ] **SVC-03**: Native clients receive git-stacks-resolved launch specifications without reading workspace YAML.
- [ ] **SVC-04**: Existing CLI and OpenTUI behavior remains compatible with the extracted service boundary.
- [ ] **SVC-05**: The local service accepts authenticated requests only from the paired native client and enforces bounded request, rate, and timeout policies.

### Operations and Events

- [ ] **EVT-01**: Long-running workspace mutations return operation identities and structured progress without blocking ordinary queries.
- [ ] **EVT-02**: Retried mutations use idempotency keys so destructive work is not duplicated.
- [ ] **EVT-03**: Native clients receive ordered operation and agent-attention events over SSE.
- [ ] **EVT-04**: A reconnecting client can replay retained events or detect a gap and rebuild state from an authoritative snapshot.
- [ ] **EVT-05**: Slow or disconnected clients cannot create unbounded service memory or event queues.

### Shared Native Model

- [ ] **CORE-01**: Linux and macOS clients share stable workspace, repository, command, operation, surface, and attention identities.
- [ ] **CORE-02**: A shared state reducer models connection, loading, failure, operation, tab, and attention transitions independently of platform UI types.
- [ ] **CORE-03**: Native shells access shared behavior through an opaque, versioned product-owned ABI.
- [ ] **CORE-04**: Cross-language golden fixtures verify native decoding and state transitions against the TypeScript contract.
- [ ] **CORE-05**: Restored session metadata never represents terminated processes as still running.

### Linux Terminal Foundation

- [ ] **TERM-01**: The Linux client embeds one interactive libghostty terminal with correct keyboard, mouse, Unicode, resize, reflow, alternate-screen, clipboard, and IME behavior.
- [ ] **TERM-02**: Each terminal surface exclusively owns one PTY and process group with explicit exit, close, application-quit, and crash cleanup semantics.
- [ ] **TERM-03**: libghostty and its compatible Zig toolchain are exactly pinned behind a narrow adapter with upgrade smoke tests.
- [ ] **TERM-04**: Repeated terminal creation, resize, destruction, and GPU view lifecycle do not leak surfaces or leave orphaned processes.
- [ ] **TERM-05**: The terminal host exposes an honest native accessibility contract and documents any upstream limitations.

### Linux Workspace Client

- [ ] **LNX-01**: Users can browse git-stacks workspaces and their repositories in a GTK4/libadwaita application.
- [ ] **LNX-02**: Users see explicit loading, empty, disconnected, incompatible, and failure states.
- [ ] **LNX-03**: Users can open multiple independent terminal tabs bound to selected workspace repositories.
- [ ] **LNX-04**: Live terminal tabs survive workspace navigation without recreation.
- [ ] **LNX-05**: Restarted clients restore tab metadata and clearly distinguish surfaces whose processes are no longer alive.
- [ ] **LNX-06**: Keyboard navigation, focus movement, IME interaction, and native accessibility work across the sidebar and terminal surfaces.

### Commands and Attention

- [ ] **ACT-01**: Users can launch a shell using a service-resolved workspace/repository context.
- [ ] **ACT-02**: Users can launch a named workspace command in a new terminal tab using resolved cwd, environment, ports, and configuration.
- [ ] **ACT-03**: Agent hooks publish structured working, waiting, completed, failed, and idle states associated with workspace and surface identities.
- [ ] **ACT-04**: Users can see unread attention aggregated at workspace, repository, and terminal-tab levels.
- [ ] **ACT-05**: Selecting an attention item focuses the exact surviving surface or a documented nearest surviving context.
- [ ] **ACT-06**: Attention events never steal focus automatically and do not depend on scraping terminal output.

### Linux Delivery

- [ ] **PKG-01**: Users can install and launch the Linux client outside the source checkout with all service, native, and libghostty assets discoverable.
- [ ] **PKG-02**: The supported Linux package passes clean-install smoke tests on the selected GTK/libadwaita distro floor.
- [ ] **PKG-03**: The client passes Wayland and X11 terminal lifecycle, input, shutdown, and crash-cleanup acceptance checks.
- [ ] **PKG-04**: Installed artifacts record pinned native dependency provenance and fail clearly on incompatible runtime dependencies.

### macOS Architectural Proof

- [ ] **MAC-01**: A SwiftUI client connects to the same authenticated service protocol and consumes the shared workspace model.
- [ ] **MAC-02**: The macOS proof embeds one interactive libghostty surface through an AppKit/Metal host.
- [ ] **MAC-03**: Users can select a workspace repository and launch one service-resolved terminal on macOS.
- [ ] **MAC-04**: The macOS proof handles native keyboard, IME, resize, exit, attention, and teardown behavior.
- [ ] **MAC-05**: Protocol and shared-model conformance tests run against both Linux and macOS clients.
- [ ] **MAC-06**: macOS proof requirements are compiled and verified on a macOS CI runner or physical macOS host; Linux-only source inspection is not accepted as proof.

## Out of Scope

| Feature | Reason |
|---------|--------|
| Split panes, terminal search, advanced layout persistence | Defer until the tab-based vertical slice is validated. |
| Built-in editor, diff browser, PR/CI dashboard, merge automation | Separate product breadth; not required to validate the native workspace client. |
| Agent prompt orchestration, fan-out, AI naming | git-stacks supplies neutral attention and workspace context, not agent policy. |
| tmux/cmux session inventory and control | External-session control is distinct from the native client's owned terminals. |
| New command palette or configuration language | Existing named workspace commands already provide the composable command model. |
| Polished macOS parity, signing, distribution, and updates | v0.20.0 proves architecture and one terminal on an actual macOS execution environment. |
| Windows support | Linux-first with macOS architectural proof. |
| Replacing the CLI or OpenTUI dashboard | The native client is additive. |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| SVC-01 | Phase 104 | Pending |
| SVC-02 | Phase 104 | Pending |
| SVC-03 | Phase 104 | Pending |
| SVC-04 | Phase 104 | Pending |
| SVC-05 | Phase 104 | Pending |
| EVT-01 | Phase 104 | Pending |
| EVT-02 | Phase 104 | Pending |
| EVT-03 | Phase 104 | Pending |
| EVT-04 | Phase 104 | Pending |
| EVT-05 | Phase 104 | Pending |
| CORE-01 | Phase 105 | Pending |
| CORE-02 | Phase 105 | Pending |
| CORE-03 | Phase 105 | Pending |
| CORE-04 | Phase 105 | Pending |
| CORE-05 | Phase 105 | Pending |
| TERM-01 | Phase 105 | Pending |
| TERM-02 | Phase 105 | Pending |
| TERM-03 | Phase 105 | Pending |
| TERM-04 | Phase 105 | Pending |
| TERM-05 | Phase 105 | Pending |
| LNX-01 | Phase 106 | Pending |
| LNX-02 | Phase 106 | Pending |
| LNX-03 | Phase 106 | Pending |
| LNX-04 | Phase 106 | Pending |
| LNX-05 | Phase 106 | Pending |
| LNX-06 | Phase 106 | Pending |
| ACT-01 | Phase 106 | Pending |
| ACT-02 | Phase 106 | Pending |
| ACT-03 | Phase 106 | Pending |
| ACT-04 | Phase 106 | Pending |
| ACT-05 | Phase 106 | Pending |
| ACT-06 | Phase 106 | Pending |
| PKG-01 | Phase 107 | Pending |
| PKG-02 | Phase 107 | Pending |
| PKG-03 | Phase 107 | Pending |
| PKG-04 | Phase 107 | Pending |
| MAC-01 | Phase 107 | Pending |
| MAC-02 | Phase 107 | Pending |
| MAC-03 | Phase 107 | Pending |
| MAC-04 | Phase 107 | Pending |
| MAC-05 | Phase 107 | Pending |
| MAC-06 | Phase 107 | Pending |

**Coverage:** 42/42 requirements mapped exactly once.

---
*Requirements defined: 2026-07-11*
*Last updated: 2026-07-11 after milestone research and scope confirmation*
