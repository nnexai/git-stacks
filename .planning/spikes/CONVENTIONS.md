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
- Require exact protocol framing, replay protection, bounded streams, backpressure, idle expiry, and revocation regardless of transport.
- Do not adopt a native transport addon until Linux and modern macOS runtime, active-session shutdown, reconnect, rotation, vulnerability, maintenance, and license-notice gates pass.
- Preserve same-origin loopback protections for local bootstrap. A random localhost port is discovery, not durable identity or an authorization boundary.
