# Roadmap: Node Core and Client Architecture

## Milestone v0.21.0

This milestone replaces the Bun-first monolith with a Node-default package architecture while preserving one domain implementation, a daemonless local CLI, service-owned interactive state, and thin web/TUI clients.

## Dependency order

```text
108 package contracts
  -> 109 shared core + atomic persistence
      -> 110 local Node CLI + service reconciliation
          -> 111 Node service transport/lifecycle
              -> 112 Node PTY + signals
                  -> 113 web package
                  -> 114 optional TUI package
                      -> 115 distribution + legacy removal
```

- [x] **Phase 108: Package and Runtime Foundation** — Establish the workspace graph, builds, contracts, adapters, conformance fixtures, and enforceable dependency rules without changing product behavior.
- [x] **Phase 109: Shared Core and Filesystem Authority** — Move domain behavior into the runtime-neutral core and make every persisted mutation atomic and concurrency-safe.
- [x] **Phase 110: Node Local CLI Cutover** — Run the complete daemonless CLI on Node and make the service reconcile direct filesystem changes.
- [x] **Phase 111: Node Service Transport and Lifecycle** — Build and prove Node HTTP/SSE/WebSocket and managed-lifecycle adapters against the existing shared service policy without switching the public service early.
- [ ] **Phase 112: Node Terminal and Signal Runtime** — Add the accepted exact-pinned node-pty adapter, atomically cut the complete public service to Node, and remove the Bun service/PTY runtime.
- [x] **Phase 113: Thin Web Package Cutover** — Package the browser client independently and serve it from the Node service without machine-side behavior in the browser.
- [x] **Phase 114: Optional TUI Client Package** — Isolate Bun/OpenTUI as an optional thin trusted client and remove its remaining domain/runtime authority.
- [ ] **Phase 115: Distribution Parity and Legacy Removal** — Prove supported Linux/macOS installs, remove compatibility paths, update release assets, and prepare v0.21.0-rc.1.

## Phase details

### Phase 108: Package and Runtime Foundation

**Goal**: Make package ownership and runtime direction mechanically enforceable before moving behavior.
**Depends on**: Nothing (first phase)

**Requirements:** PKG-01, PKG-02, PKG-03, PKG-04

**Success Criteria** (what must be TRUE):

1. Every target workspace builds and tests independently from a clean root install.
2. Forbidden dependency edges fail an architecture test with the exact importer and importee.
3. Shared protocol/conformance fixtures run in Node and browser-compatible environments.
4. Existing product commands still run through temporary package entrypoint shims with no duplicated behavior.

Plan: [Phase 108](./phases/108-package-and-runtime-foundation/108-PLAN.md)

### Phase 109: Shared Core and Filesystem Authority

**Goal**: Establish one Node-compatible domain implementation and safe authoritative persistence.
**Depends on**: Phase 108

**Requirements:** CORE-01, CORE-02, CORE-03, CORE-04, DATA-01, DATA-02

**Success Criteria** (what must be TRUE):

1. Core tests run under Node without Bun, Commander, OpenTUI, service, or browser imports.
2. CLI and service call the same core use cases rather than wrappers around legacy implementations.
3. Crash/partial-write and concurrent field-intent tests leave complete, merged authoritative files.
4. Deleting a migrated legacy implementation causes no behavior loss because all callers use the core package.

Plan: [Phase 109](./phases/109-shared-core-and-filesystem-authority/109-PLAN.md)

### Phase 110: Node Local CLI Cutover

**Goal**: Make the public local CLI fully Node-native, daemonless, and coherent with a separately running service.
**Depends on**: Phase 109

**Requirements:** DATA-03, DATA-04, DATA-05, CLI-01, CLI-02, CLI-03, CLI-04

**Success Criteria** (what must be TRUE):

1. The complete CLI parity suite passes through the Node entrypoint with Bun unavailable.
2. Ordinary commands neither start nor contact the service and still work when discovery state is absent or stale.
3. A running service observes CLI/file mutations through debounce plus digest reconciliation and emits one revised snapshot.
4. TUI prompt imports and Bun process helpers no longer appear in the CLI dependency graph.

Plan: [Phase 110](./phases/110-node-local-cli-cutover/110-PLAN.md)

### Phase 111: Node Service Transport and Lifecycle

**Goal**: Prove the complete non-terminal Node carrier and managed-lifecycle implementation against shared service policy without changing the public runtime before terminal parity exists.
**Depends on**: Phase 110

**Requirements:** SVC-01, SVC-02, SVC-03, SVC-04, SVC-05

**Success Criteria** (what must be TRUE):

1. Existing protocol, security, SSE replay, operation, and projection conformance tests pass against the Node service candidate.
2. Concurrent starts elect one service and stale discovery/lock artifacts recover without a timeout loop.
3. Final-client shutdown leaves no sockets, subscribers, watchers, timers, or non-terminal child processes.
4. Web and TUI client packages can connect without importing the concrete service implementation, while the shipped entrypoint still retains terminal parity until Phase 112.

Plan: [Phase 111](./phases/111-node-service-transport-and-lifecycle/111-PLAN.md)

### Phase 112: Node Terminal and Signal Runtime

**Goal**: Move service-owned interactive terminals and exact-surface agent state to Node, switch the complete public service atomically, and remove the Bun service runtime with lifecycle and resource parity.
**Depends on**: Phase 111

**Requirements:** TERM-01, TERM-02, TERM-03, SIG-01, SIG-02

**Success Criteria** (what must be TRUE):

1. Shell and command-shell lifecycle, resize, title, Unicode, replay, visibility, and reconnect tests pass through the PTY adapter on the complete Node service.
2. Closing/exiting a terminal kills its process tree and clears only its own active signals.
3. Hidden terminal output stays bounded while lifecycle and agent signal capture remain live.
4. Clean installs use prebuilt node-pty artifacts on the supported Linux/macOS matrix with no compiler, and no Bun service/PTY entrypoint remains.

Plan: [Phase 112](./phases/112-node-terminal-and-signal-runtime/112-PLAN.md)

### Phase 113: Thin Web Package Cutover

**Goal**: Ship the existing browser experience as an independent, browser-only client of the Node service.
**Depends on**: Phase 112

**Requirements:** WEB-01, WEB-02, CLIENT-01

**Success Criteria** (what must be TRUE):

1. A browser dependency audit finds no core, filesystem, process, PTY, or service implementation imports.
2. Pairing, workspace operations, signals, terminal tabs, focus, sizing, reconnect, and context actions pass browser UAT against Node.
3. Shared reducers handle events, replay gaps, signals, priority, and operation progress consistently with the TUI.
4. The Node service serves version-matched immutable assets and rejects mismatched protocol versions clearly.

Plan: [Phase 113](./phases/113-thin-web-package-cutover/113-PLAN.md)

### Phase 114: Optional TUI Client Package

**Goal**: Make OpenTUI an optional Bun renderer with no domain or persistence authority.
**Depends on**: Phases 112 and 113

**Requirements:** TUI-01, TUI-02

**Success Criteria** (what must be TRUE):

1. The TUI uses protocol/client state, the dedicated local service-client adapter, pure core types/presentation helpers, and explicit foreground handoff adapters; it cannot import the service root or domain persistence authorities.
2. Dashboard reads, mutations, signals, dismissals, commands, and progress pass parity tests against the Node service.
3. Closing the TUI releases its managed client and allows the service to stop under normal lifecycle policy.
4. Default CLI/service/web installs do not install OpenTUI, Solid, Bun types, or TUI-only assets.

Plan: [Phase 114](./phases/114-optional-tui-client-package/114-PLAN.md)

### Phase 115: Distribution Parity and Legacy Removal

**Goal**: Produce a supportable v0.21.0 release candidate with one implementation per capability.
**Depends on**: Phases 113 and 114

**Requirements:** DIST-01, DIST-02, DIST-03, DIST-04, DIST-05

**Success Criteria** (what must be TRUE):

1. Clean-install and lifecycle matrices pass on Linux x64/arm64 and modern macOS x64/arm64.
2. Package contents and license audits contain only intended runtime files and compatible dependencies.
3. No Bun CLI/service entrypoint, duplicate domain implementation, migration shim, or stale Bun-first documentation remains.
4. v0.21.0-rc.1 artifacts can be built locally and in CI, but no tag, push, or release occurs without explicit approval.

Plan: [Phase 115](./phases/115-distribution-parity-and-legacy-removal/115-PLAN.md)

## Scope control

The phase sequence may use temporary import/export shims to keep the repository runnable, but a shim may only forward to the single target implementation and must carry a removal phase. No phase may create a second domain algorithm, persisted model, signal reducer, terminal policy, or client operation semantics for parity purposes.

---
*Last updated: 2026-07-15 after the complete local implementation. Phases 112 and 115 remain open only for the hosted supported-platform matrix.*
