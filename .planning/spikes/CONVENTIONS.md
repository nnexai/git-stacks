# Spike Conventions

## Stack

- Bun/TypeScript owns orchestration, service behavior, and verification.
- xterm.js renders browser terminals while `Bun.Terminal` owns local PTYs.
- Keep the shared service protocol independent from its carrier; TUI IPC, HTTP/SSE/WebSocket, and future WebTransport are adapters around one service core.

## Browser Terminal Patterns

- Keep the HTTP/SSE workspace control plane separate from the WebSocket terminal data plane.
- Open xterm only in a visible, dimensioned pane and stream bulk output only for the visible terminal.
- Use same-origin loopback access, one-use pairing, a scoped HttpOnly principal, strict Host/Origin/Fetch Metadata validation, and bounded resources.
- Treat retained raw output as cursor-based delta replay; report history loss explicitly.
- Authenticate and strip app-owned OSC signal frames in the service before terminal bytes reach browser replay or xterm.
- Keep external terminal integration sessions independent from service-owned browser PTYs.

## Secure Remote Transport Patterns

- Treat a WebTransport certificate hash as server authentication only; perform client authentication and authorization inside the encrypted framed protocol.
- Use short-lived X.509v3 ECDSA P-256 leaf certificates with a validity comfortably below the two-week browser maximum and rotate before expiry.
- Keep persistent service identity separate from rotating transport certificates; pairing pins identity and authorizes certificate rotation.
- Let a localhost helper hold durable browser-client identity outside browser storage and delegate a short-lived, non-exportable browser session key after explicit pairing.
- Bind each helper-signed browser delegation to the exact service audience, browser origin, browser public key, scopes, issue time, expiry, and a revocable helper-session epoch using canonical signed framing.
- Require a fresh one-use challenge and proof of possession for every connection, including reconnects; accepting one proof must never authorize replay on another connection.
- Revoke a helper-session epoch before releasing its localhost listener on clean shutdown; expire an abruptly disconnected epoch after a short, explicit heartbeat lease.
- Treat expired and revoked epochs as terminal. A helper restart registers a new random epoch and issues fresh browser delegations.
- Never accept localhost cookies, IndexedDB state, or possession of a localhost port as credentials at the remote service.
- Use bounded length-prefixed framing on byte-stream transports; WebTransport stream reads and writes do not preserve application message boundaries.
- Keep PTY ownership, cursor acknowledgement, replay retention, visibility policy, and lifecycle in the shared terminal core; adapt only writing, pressure, drain, cancellation, and close behavior per carrier.
- Await WebTransport stream writes with at most one attachment pump per terminal. A blocked or cancelled carrier must not create an unbounded queue or implicitly terminate the service-owned PTY.
- Prefer a pinned TLS 1.3 helper-to-remote relay as the first production remote carrier; keep direct browser WebTransport replaceable until its Bun implementation passes production gates.
- Use Bun's Node-compatible `node:tls` boundary with a connection-specific paired CA. Do not use native `Bun.connect` for private-CA enforcement unless its wrong-CA regression test passes on the exact supported runtime.
- Treat leaf rotation under the paired private CA as routine transport maintenance; treat CA replacement as remote service identity rotation requiring explicit authorization.
- Prefer an operating-system credential store for persistent helper keys, with an atomic mode `0600` file as an explicit portable fallback rather than a protocol dependency.
- Require exact protocol framing, replay protection, bounded streams, backpressure, idle expiry, and revocation regardless of transport.
- Do not adopt a native transport addon until Linux and modern macOS runtime, active-session shutdown, reconnect, rotation, vulnerability, maintenance, and license-notice gates pass.
- Preserve same-origin loopback protections for local bootstrap. A random localhost port is discovery, not durable identity or an authorization boundary.
