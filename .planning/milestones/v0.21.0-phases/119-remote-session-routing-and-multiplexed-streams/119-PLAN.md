---
phase: 119
status: complete
depends_on: [118]
requirements: [STREAM-01, STREAM-02, STREAM-03]
---

# Phase 119 Plan: Remote Session Routing and Multiplexed Streams

## Objective

Carry existing service functionality over authenticated logical channels without creating a remote implementation of domain policy.

## Work packages

1. Adapt snapshots, operations, events, dismissals, signals, replay gaps, and errors to request/control/event streams using the existing service handlers and shared client reducers.
2. Adapt terminal attach/input/output/title/resize/visibility/cursor/reset/cancel to independent streams while retaining the existing PTY manager, 1 MiB retention, 64 KiB chunks, visible-only bulk policy, and lifecycle.
3. Add stream/principal/target/global quotas, fair bounded logical-stream scheduling over both carriers, and bounded cancellation/idle cleanup. The current canonical framed session uses one ordered carrier stream, so carrier-level backpressure may delay the session but cannot create unbounded buffering or application-level starvation.
4. Add target routing and client-channel relay at the local helper boundary. The browser never opens a remote carrier; no workspace state, signal reducer, operation behavior, or terminal policy is copied into connector code.

## Verification

Run local/remote parity fixtures, multi-terminal visibility, hidden retention, 16–48 MiB backpressure, slow reader isolation, replay/reset, process exit, browser-close persistence, reconnect attach, cancellation, malformed stream, and cross-principal ownership tests.

## Completion gate

All current service behavior is available over secure sessions and produces identical client state for local and remote authorities.
