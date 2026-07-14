# Spike Manifest

## Product Boundary

git-stacks remains integration-neutral for external terminal products. The local web client is the one supported path where the Bun/TypeScript service owns terminal processes directly.

## Idea

Secure current and future local-network clients without public DNS or installing a browser CA by pairing a persistent service identity and using short-lived, certificate-hash-pinned WebTransport connections.

## Requirements

- Keep machine and shell authority in the service; web clients remain thin.
- Work without a public hostname and without modifying browser or operating-system trust stores.
- Support Linux and modern macOS, including Apple Silicon.
- Use trusted, actively maintained dependencies with MIT-compatible licenses.
- Authenticate clients in an encrypted application handshake; TLS certificate hashes authenticate only the server.
- Keep the shared service protocol independent from WebTransport so TUI, web, and migration transports can coexist.

## Spikes

| # | Name | Type | Validates | Verdict | Tags |
|---|---|---|---|---|---|
| 001 | interactive-pty-surface | vertical | Historical OpenTUI terminal experiment | PARTIAL | tui, terminal |
| 002 | multiple-shell-surfaces | vertical | Historical multi-session behavior experiment | PARTIAL | tui, terminal |
| 003 | tmux-control-plane | horizontal | External-session integration boundary | VALIDATED | terminal, integration |
| 010 | web-terminal-tabs | vertical | Foundation for service-owned browser terminal tabs | VALIDATED | web, terminal |
| 011 | webtransport-certificate-pinning | horizontal | Self-signed encrypted browser transport without public DNS or a local CA | PARTIAL | security, webtransport, macos, dependencies |

Unsupported desktop-renderer experiments were removed from the active branch and remain available through repository history and the archive tag recorded in `.planning/notes/native-client-retirement.md`.
