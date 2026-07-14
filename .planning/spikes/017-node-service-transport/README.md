---
spike: 017
name: node-service-transport
type: standard
validates: "Given the current HTTP, SSE, and terminal WebSocket contract, when Bun.serve is replaced by Node HTTP plus ws, then authentication, replay, heartbeats, bounded streaming, and clean shutdown retain their semantics"
verdict: VALIDATED
related: [010, 013, 014, 015, 016]
tags: [node, service, http, sse, websocket, backpressure, dependencies]
---

# Spike 017: Node Service Transport

## What This Validates

Given the current service contract, when `Bun.serve` is replaced with a Node.js server, then ordinary API responses, durable SSE, browser WebSocket upgrades, bounded binary terminal streaming, and lifecycle cleanup remain feasible without changing the web client protocol.

## Research

| Approach | Tool | Pros | Cons | Status |
|---|---|---|---|---|
| Standard HTTP plus focused WebSocket dependency | `node:http` + [`ws`](https://github.com/websockets/ws) | One server/port, mature and heavily used, MIT, no required transitive dependencies, explicit buffered amount and send callbacks | Requires a small upgrade adapter and manual routing | Selected |
| Full web framework | Fastify plus WebSocket plugin | Rich routing/plugin ecosystem | More dependencies and lifecycle abstraction than this local service requires | Not needed for migration |
| Node built-ins only | `node:http` | No runtime dependency | Node provides a WebSocket client, not the browser-compatible server needed here | Insufficient |

`ws` 8.21.1 is the current stable line, is MIT licensed, and documents external HTTP server integration, authentication during upgrade, `bufferedAmount`, send callbacks, and a Node stream adapter. Its optional native performance addon is unnecessary for this workload. The probe disables per-message compression because terminal output is already latency-sensitive and upstream documents meaningful memory/performance costs under concurrency.

SSE requires no third-party dependency: Node's standard response stream supports durable event delivery, comments as heartbeats, cursor replay, abort cleanup, and normal socket backpressure. Production should preserve the existing bounded journal and replay-gap semantics rather than treating the spike's small in-memory history as an implementation.

## How to Run

```bash
cd .planning/spikes/017-node-service-transport
npm install
npm run check
```

## What to Expect

The probe starts on an ephemeral loopback port, exercises authentication, SSE heartbeat/replay/reconnect, WebSocket Origin rejection, binary streaming, and clean shutdown, prints JSON, and exits nonzero on failure.

## Observability

The JSON report contains timestamps, event cursors, subscriber/socket counts, transferred bytes, and maximum WebSocket buffered bytes. All payloads are synthetic.

## Investigation Trail

- Selected built-in `node:http` plus `ws` to minimize dependencies while retaining a mature WebSocket server implementation.
- The first 16 MiB loopback run completed without filling the WebSocket buffer. That was not accepted as backpressure evidence.
- The probe was strengthened by pausing the client TCP socket for 150 ms, sending 32 MiB through bounded concurrent writes, and requiring the server to encounter pressure.
- The strengthened run waited for pressure 30 times, transferred exactly 33,554,432 bytes, and kept `bufferedAmount` at 524,368 bytes against a 512 KiB threshold plus one frame.
- A durable SSE connection received a heartbeat and event, disconnected, then replayed an event published while disconnected from the requested cursor. Subscriber cleanup returned to zero after each cancellation.
- A wrong browser Origin was rejected during WebSocket upgrade; the paired Origin/cookie path exchanged data successfully.
- Explicit shutdown left zero SSE subscribers, WebSocket clients, and TCP sockets.
- The complete probe passed under Node 20.20.2, 22.23.1, and 26.5.0 on Linux x64. The implementation uses standard Node networking and pure-JavaScript `ws`; modern macOS still belongs in CI, but there is no architecture-specific addon in this layer.

## Results

**VALIDATED** — `Bun.serve` is not an architectural blocker. Node's standard HTTP server plus `ws` can preserve the current single-port API/SSE/WebSocket shape, authentication gates, replay, durable heartbeat behavior, bounded terminal streaming, and deterministic shutdown.

The real migration should introduce transport adapters instead of rewriting service policy:

- HTTP request/response routing maps Node requests into the existing route/service operations.
- SSE owns response writes, heartbeat scheduling, cursor replay, close/abort cleanup, and drain handling.
- A `TerminalAttachment` adapter translates `ws` messages, `bufferedAmount`, send callbacks, and close into the carrier-neutral terminal core already identified by Spike 014.
- WebSocket compression remains disabled unless a representative resource benchmark proves it useful.

No full HTTP framework is justified by the current service. A future public remote API may revisit routing and observability needs without changing the core protocol boundary.
