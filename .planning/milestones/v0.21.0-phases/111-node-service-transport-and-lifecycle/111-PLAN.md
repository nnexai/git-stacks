---
phase: 111
status: planned
depends_on: [110]
requirements: [SVC-01, SVC-02, SVC-03, SVC-04, SVC-05]
---

# Phase 111 Plan: Node Service Transport and Lifecycle

## Objective

Build and prove the complete non-terminal service carrier/bootstrap implementation on Node while preserving the v0.20 protocol and leaving the current public service entrypoint intact until Phase 112 can cut transport and PTYs together.

## Work packages

### 1. Node carrier adapters

- Map Node `IncomingMessage`/`ServerResponse` into existing route policy without moving authentication or authorization into the adapter.
- Implement SSE writes, heartbeat, cursor replay, replay-gap signaling, abort cleanup, and drain handling over Node streams.
- Integrate exact-pinned `ws` with the same HTTP server, origin/cookie checks, bounded frames, compression disabled, pressure/drain callbacks, and deterministic close.
- Keep route, projection, operation, event, quota, and security policy above the carriers.

### 2. Service bootstrap and discovery

- Replace fixed startup lock behavior with atomic owner election carrying PID, nonce, endpoint, protocol version, and creation time.
- Validate a discovered owner before reuse; recover stale discovery/lock files without deleting a live contender's state.
- Bound startup contention and return actionable diagnostics instead of the current generic timeout.
- Separate carrier-neutral client APIs from Node-only local managed-service startup.

### 3. Lifecycle and operations

- Run operation execution, progress, cancellation, snapshot invalidation, signal journal, client leases, idle shutdown, and error normalization through the shared service policy with Node adapters.
- Track and close HTTP sockets, SSE subscribers, WebSocket clients, watchers, timers, and child processes in a deterministic shutdown sequence.
- Preserve service behavior when the CLI changes files independently.
- Keep this Node candidate behind conformance/integration harnesses until Phase 112 supplies the PTY adapter; do not switch the public `service` or `web` entrypoints to a terminal-incomplete runtime.

## Tests and evidence

- Reuse route/security/projection/operation/event conformance suites against Node.
- Concurrent multi-process startup test elects one service and all clients discover it.
- Kill-before-publish, stale-file, PID-reuse-shaped metadata, port-conflict, and abrupt-owner-loss tests recover safely.
- SSE heartbeat/reconnect/replay and WebSocket pressure tests reproduce Spike 017 under the production service.
- Shutdown resource census reaches zero for tracked resources and process exits naturally.

## Completion gate

- The Node candidate exercises every non-terminal service route through the one shared policy implementation.
- Existing clients require no protocol behavior change.
- Managed startup cannot reproduce the stale-lock timeout failure.
- The only temporary duplication is carrier/bootstrap adapter code; no route, operation, projection, event, signal, or lifecycle policy is copied.
- Phase 112 owns the atomic entrypoint switch and deletion of Bun transport/bootstrap/PTY adapters.

## Rollback

Revert the Node candidate adapters and tests. The public service remains unchanged until Phase 112, and discovery records are versioned so candidate tests cannot corrupt active discovery.
