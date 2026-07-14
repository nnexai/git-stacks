# Spike Manifest

## Product Boundary

git-stacks remains integration-neutral for external terminal products. The local web client is the one supported path where the Bun/TypeScript service owns terminal processes directly.

## Idea

Secure current and future local-network clients without public DNS or installing a browser CA by pairing a persistent service identity and using short-lived, certificate-hash-pinned WebTransport connections.

The current migration theme additionally evaluates a Node-default distribution around one runtime-neutral domain core: the existing CLI remains local and daemonless, the Node service owns persistent machine state, the browser and optional Bun TUI remain thin service clients, and filesystem changes synchronize through atomic persisted state rather than a CLI refresh protocol.

## Requirements

- Keep machine and shell authority in the service; web clients remain thin.
- Work without a public hostname and without modifying browser or operating-system trust stores.
- Support Linux and modern macOS, including Apple Silicon.
- Use trusted, actively maintained dependencies with MIT-compatible licenses.
- Authenticate clients in an encrypted application handshake; TLS certificate hashes authenticate only the server.
- Keep the shared service protocol independent from WebTransport so TUI, web, and migration transports can coexist.
- Keep the existing CLI local-only and daemonless; a future remote CLI is a separate client surface.
- Share domain behavior between the local CLI and service without importing service transport or UI dependencies into the core.
- Make Node.js the default runtime for the CLI, service, and web distribution while keeping OpenTUI isolated as an optional Bun client.
- Treat persisted workspace/config files as authoritative; service watchers reconcile external atomic changes and emit normal events.
- Avoid global locking. Add narrow concurrency protection only for demonstrated read-modify-write races or multi-step semantic conflicts.
- Do not require compilers on supported Linux x64/arm64 or modern macOS x64/arm64 installations.

## Spikes

| # | Name | Type | Validates | Verdict | Tags |
|---|---|---|---|---|---|
| 001 | interactive-pty-surface | vertical | Historical OpenTUI terminal experiment | PARTIAL | tui, terminal |
| 002 | multiple-shell-surfaces | vertical | Historical multi-session behavior experiment | PARTIAL | tui, terminal |
| 003 | tmux-control-plane | horizontal | External-session integration boundary | VALIDATED | terminal, integration |
| 010 | web-terminal-tabs | vertical | Foundation for service-owned browser terminal tabs | VALIDATED | web, terminal |
| 011 | webtransport-certificate-pinning | horizontal | Self-signed encrypted browser transport without public DNS or a local CA | PARTIAL | security, webtransport, macos, dependencies |
| 012 | delegated-browser-identity | horizontal | Durable helper identity and short-lived proof-of-possession browser delegation | VALIDATED | security, identity, browser, indexeddb, macos |
| 013 | secure-reconnect-port-takeover | horizontal | Helper epoch leases, reconnect, abrupt loss, and hostile localhost port reuse | VALIDATED | security, identity, reconnect, browser, macos |
| 014 | terminal-stream-viability | horizontal | Framed terminal throughput, backpressure, visibility, replay, cancellation, and multiplexing | VALIDATED | security, terminal, webtransport, backpressure, macos |
| 015 | pinned-tls-helper-relay | horizontal | Production-first encrypted helper-to-remote carrier without public PKI or browser trust changes | VALIDATED | security, tls, remote, bun, macos, dependencies |
| 016 | node-pty-runtime | standard | Node PTY behavior, lifecycle, resource, dependency, and distribution parity | PARTIAL | node, terminal, pty, macos, linux, dependencies |
| 017 | node-service-transport | standard | Node HTTP, SSE, WebSocket, backpressure, replay, auth, and shutdown parity | VALIDATED | node, service, http, sse, websocket, backpressure, dependencies |
| 018 | node-core-packages | standard | Runtime-neutral core execution and enforceable CLI/service/web/TUI/protocol package boundaries | VALIDATED | node, core, packages, architecture, esm, dependencies |

Unsupported desktop-renderer experiments were removed from the active branch and remain available through repository history and the archive tag recorded in `.planning/notes/native-client-retirement.md`.
