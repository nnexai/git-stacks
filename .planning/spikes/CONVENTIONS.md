# Spike Conventions

## Stack

- Bun/TypeScript owns orchestration, service behavior, and verification.
- xterm.js renders browser terminals while `Bun.Terminal` owns local PTYs.

## Browser Terminal Patterns

- Keep the HTTP/SSE workspace control plane separate from the WebSocket terminal data plane.
- Open xterm only in a visible, dimensioned pane and stream bulk output only for the visible terminal.
- Use same-origin loopback access, one-use pairing, a scoped HttpOnly principal, strict Host/Origin/Fetch Metadata validation, and bounded resources.
- Treat retained raw output as cursor-based delta replay; report history loss explicitly.
- Authenticate and strip app-owned OSC signal frames in the service before terminal bytes reach browser replay or xterm.
- Keep external terminal integration sessions independent from service-owned browser PTYs.
