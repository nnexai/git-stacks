---
phase: 112
status: planned
depends_on: [111]
requirements: [TERM-01, TERM-02, TERM-03, SIG-01, SIG-02]
---

# Phase 112 Plan: Node Terminal and Signal Runtime

## Objective

Replace Bun terminal primitives with exact-pinned node-pty, switch the complete public service to the Phase 111 Node carrier/lifecycle adapters, and retain the service-owned terminal and signal policy already proven in v0.20.

## Work packages

### 1. PTY abstraction and adapter

- Define the minimum PTY interface for spawn, pid, data, exit, input, resize, kill, and disposal.
- Move no replay, visibility, title, attachment, retention, signal, or process policy into the adapter.
- Implement the production adapter using exact `node-pty@1.2.0-beta.14`; record package integrity, provenance, license, included prebuilds, and update procedure.
- Produce clear capability diagnostics when the host/platform artifact cannot load; never silently compile or substitute a pipe-based shell.

### 2. Terminal manager cutover

- Connect the adapter to trusted launch resolution, environment construction, process-group cleanup, command-shell retention, and interactive-shell close behavior.
- Preserve cursor-based ring-buffer replay, history-loss reporting, one-writer ownership, hidden-output suspension, bounded attachment pressure, resize, title, focus, and reconnect.
- Ensure normal shell exit/EOF closes its tab/session while command-script sessions retain their result according to existing semantics.
- Remove Bun terminal code once all production callers use the adapter.

### 2.5. Atomic service entrypoint cutover

- Combine the Phase 111 Node carrier/bootstrap with the Node PTY adapter and run the full service conformance suite before changing public entrypoints.
- Switch `service`, `web`, and managed trusted-client startup to the complete Node service in one change.
- Delete Bun HTTP/SSE/WebSocket, discovery/bootstrap, and PTY adapters immediately after the switch; retain no runtime flag that selects between service implementations.
- Verify existing discovery records are upgraded/replaced safely and mixed-version clients receive an explicit protocol diagnostic.

### 3. Signals under Node

- Keep OSC filtering and provider-neutral signal parsing before bytes enter replay or clients.
- Preserve exact workspace/repository/terminal/provider-session identity, activity coalescing, notification durability, acknowledgement, and stale terminal cleanup.
- Reconcile active signal projection against live retained terminal/session ownership on startup, close, exit, and periodic cleanup.
- Prove sidebar providers are a deduplicated active set while tabs retain exact provider/state.

### 4. Host and resource validation

- Run actual-host suites on Linux x64/arm64 and macOS x64/arm64 for spawn, resize, Unicode, title, exit, Ctrl-D, signal delivery, process descendants, and repeated cycles.
- Verify clean package install never invokes a compiler or downloads an unpinned artifact.
- Benchmark idle sessions, visible streaming, hidden streaming, replay retention, repeated attach/detach, and shutdown for CPU, RSS, file descriptors, and buffered bytes.

## Tests and evidence

- Adapter contract tests with deterministic fake PTYs plus production actual-process tests.
- Browser-level terminal UAT for focus, resize, vertical fill, tab switching, hidden output, reconnect, exit, and close.
- Codex and Copilot cheap-model signal scenarios while workspace/tab is visible and hidden; completion remains until exact-tab acknowledgement.
- Process-tree fixture proves no descendants survive session/service close.
- 100+ create/attach/detach/exit cycles return resources to bounded baseline.

## Completion gate

- All v0.20 terminal and signal behaviors pass through Node.
- All non-terminal service conformance remains green after the public entrypoint cutover.
- Supported clean installs consume prebuilt node-pty artifacts only.
- No stale agent state survives after its terminal/session no longer exists.
- Bun service/terminal implementations and direct PTY calls outside the adapter are gone.

## Rollback

Revert to the Phase 111 terminal-disabled Node service or the v0.20 release line. Do not retain a permanent dual-PTY runtime switch.
