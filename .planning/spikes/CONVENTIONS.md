# Spike Conventions

## Stack

- The currently released implementation remains Bun/TypeScript while the next architecture is evaluated.
- The intended default distribution uses Node 24 LTS for the local-only CLI, shared core, service, and web build; Bun remains isolated to the optional OpenTUI client.
- Pin TypeScript 6.x during the runtime/package migration. Treat TypeScript 7 adoption as separate compatibility work.
- xterm.js renders browser terminals while `Bun.Terminal` owns local PTYs.
- Keep the shared service protocol independent from its carrier. WebTransport is the service carrier; pinned TLS 1.3 is the optional Bun TUI's local carrier. Plaintext HTTP is static web bootstrap only.

## Node Migration Patterns

- Keep the existing CLI daemonless and local-only. It calls the shared core directly; remote scripting belongs to a future dedicated client.
- Keep protocol contracts separate from domain execution. Service, web, TUI, and future clients share protocol/client packages; CLI and service share core domain operations.
- Put process execution, clocks/delay, globbing, executable lookup, logging, PTYs, and network carriers behind narrow adapters instead of scattering runtime substitutions through domain modules.
- Use per-package ESM builds with declared third-party dependencies external. Do not bundle an entire dependency tree into ESM when a package contains non-analyzable CommonJS requires.
- Use Node's standard HTTP server and `ws` with WebSocket compression disabled by default. Preserve SSE and terminal policy above transport adapters.
- Treat filesystem notifications as latency hints. Rebuild authoritative state after debounce and use a bounded full-content reconciliation digest to recover missed events.
- Use unique same-directory temporary paths for atomic replacement. Do not share `${path}.tmp` between processes.
- Avoid global locks. Reserve narrow per-target serialization for demonstrated read-modify-write races that would otherwise lose valid field-level updates.

## Browser Terminal Patterns

- Carry browser API, events, signals, operations, and terminal streams over authenticated pinned WebTransport. Never fall back to plaintext HTTP/SSE/WebSocket for classified channels.
- Open xterm only in a visible, dimensioned pane and stream bulk output only for the visible terminal.
- Load one self-contained browser asset from the installed package, deliver a one-use secret and certificate hash in its fragment, use an ephemeral in-memory browser key, validate loopback/request shape, scope lifecycle to the browser WebTransport listener, and bound all resources. Do not serve executable browser code over HTTP.
- Treat every browser persistence API as hostile and non-authoritative. Store no credentials, trust, targets, terminal cursors/output, or persistent UI state in cookies, IndexedDB, local/session storage, Cache Storage, OPFS, workers, or history state.
- Treat retained raw output as cursor-based delta replay; report history loss explicitly.
- Authenticate and strip app-owned OSC signal frames in the service before terminal bytes reach browser replay or xterm.
- Keep external terminal integration sessions independent from service-owned browser PTYs.

## Secure Remote Transport Patterns

- Treat a WebTransport certificate hash as server authentication only; perform client authentication and authorization inside the encrypted framed protocol.
- Use short-lived X.509v3 ECDSA P-256 leaf certificates with a validity comfortably below the two-week browser maximum and rotate before expiry.
- Keep persistent service identity separate from rotating transport certificates; pairing pins identity and authorizes certificate rotation.
- Let the localhost helper hold all durable remote identity and target trust. Browser identity is per-document, non-exportable, memory-only, and local to the helper.
- Keep the browser connected only to its local helper. Bind each ephemeral browser grant to the in-memory public key, target ceiling, scopes, protocol/build, issue time, expiry, and revocable browser-listener epoch using canonical framing. Treat opaque origin as request-shape defense, not identity.
- Require a fresh one-use challenge and proof of possession for every connection, including reconnects; accepting one proof must never authorize replay on another connection.
- Revoke a browser-listener epoch and invalidate browser grants before releasing the local WebTransport socket; manage remote helper epochs independently so remote shells can persist after browser closure.
- Treat expired and revoked epochs as terminal. A helper restart registers a new remote epoch; every browser document receives only a fresh local in-memory grant.
- Never accept browser storage, possession of a localhost port, or a browser document as a remote credential. The paired Node helper is the only remote principal.
- Use bounded length-prefixed framing on byte-stream transports; WebTransport stream reads and writes do not preserve application message boundaries.
- Keep PTY ownership, cursor acknowledgement, replay retention, visibility policy, and lifecycle in the shared terminal core; adapt only writing, pressure, drain, cancellation, and close behavior per carrier.
- Await WebTransport stream writes with at most one attachment pump per terminal. A blocked or cancelled carrier must not create an unbounded queue or implicitly terminate the service-owned PTY.
- Use WebTransport for browser-to-service and Node-helper-to-remote-authority connections. Keep it behind the secure session interface and never load its native addon in Bun.
- Use Bun's Node-compatible `node:tls` boundary only for the TUI-to-local-Node-helper connection. Require TLS 1.3, private-CA verification, hostname verification, and `git-stacks/2` ALPN; do not use native `Bun.connect` unless its wrong-CA regression passes.
- Rotate short-lived WebTransport certificates through stable-service-identity-signed endpoint/pin sets and overlapping listeners. Treat stable identity replacement as a trust reset requiring explicit re-pairing.
- Prefer an operating-system credential store for persistent helper keys, with an atomic mode `0600` file as an explicit portable fallback rather than a protocol dependency.
- Require exact protocol framing, replay protection, bounded streams, backpressure, idle expiry, and revocation regardless of transport.
- Do not adopt a native transport addon until Linux and modern macOS runtime, active-session shutdown, reconnect, rotation, vulnerability, maintenance, and license-notice gates pass.
- Preserve exact loopback protections for local bootstrap. A random port, opaque file origin, and browser document are discovery/request context only; none is durable identity or authorization.

## Tools and Libraries

- `ws` 8.21.1 is the validated Node WebSocket adapter: MIT, no required transitive runtime dependencies, and sufficient backpressure/lifecycle APIs.
- `node-pty@1.2.0-beta.14` is the accepted temporary Node PTY dependency. Pin it exactly, verify package integrity and the Linux x64/arm64 plus macOS x64/arm64 prebuilds, forbid compiler fallback on supported installs, run actual-host lifecycle tests, and review each update explicitly. Move to an equivalent stable Microsoft release when available.
- esbuild is acceptable as an MIT-licensed build-time tool for project-code ESM output; runtime dependencies remain external.
- Raw `fs.watch` plus content reconciliation is preferred initially over adding Chokidar for the small authoritative config tree.
