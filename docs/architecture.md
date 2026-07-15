# Architecture

## Runtime and package split

The production system has one implementation per responsibility:

| Package | Runtime | Responsibility |
|---|---|---|
| `@git-stacks/protocol` | neutral | `git-stacks/2` frames, canonical control messages, schemas, scopes, and hard limits |
| `@git-stacks/client` | neutral/browser | encrypted-carrier contract, authenticated sessions, RPC/event dispatch, and shared presentation reduction |
| `@git-stacks/core` | Node.js | config, atomic persistence, Git/filesystem access, and workspace domain behavior |
| `@git-stacks/cli` | Node.js | daemonless local commands plus explicit service, pairing, target, and web launch commands |
| `@git-stacks/service` | Node.js | interactive authority, projections, operations, signals, encrypted listeners, remote relay, PTYs, and trust records |
| `@git-stacks/web` | browser | self-contained `file:` renderer, ephemeral authentication key, xterm viewport, and browser-native WebTransport |
| `@git-stacks/tui` | Bun | optional OpenTUI renderer using the official TLS client; no machine-side domain implementation |
| `git-stacks` | Node.js | public facade and executable |

`scripts/check-architecture.mjs` enforces the dependency graph and rejects browser persistence, classified browser HTTP/SSE/WebSocket APIs, service HTTP routes, and Bun imports outside the optional TUI.

## Local data flow

Ordinary CLI commands call core directly and remain local to the current machine. Core writes human-editable YAML atomically. A running service watches those files, treats changes as invalidation hints, rebuilds authoritative state, and emits ordered encrypted events. The CLI does not need a service refresh command.

The browser and TUI are thin clients. They request typed snapshots and operations from the service and render locally. The browser receives a narrower projection than the TUI; machine paths, resolved commands, environments, trust records, and private keys stay in the Node service.

The service owns PTYs. Terminal input, resize, title, output, cursor acknowledgements, replay/reset, and visibility flow over authenticated secure frames. Hidden browser tabs stop live bulk streaming while the service retains up to 1 MiB per terminal. Closing or replacing a browser document detaches it without ending service-owned shells. Service shutdown or machine restart still ends those PTYs.

## Encrypted transport topology

```text
packaged browser file -- pinned WebTransport on loopback --+
                                                        local Node helper/service
optional Bun TUI ------ trusted-leaf TLS 1.3 on loopback -+
                                                             |
                                                             +-- pinned WebTransport --> paired remote authority
```

All product state and terminal bytes travel only after encrypted carrier setup and the in-channel challenge/proof handshake. There is no HTTP server, executable loopback bootstrap, REST API, SSE endpoint, WebSocket endpoint, cookie principal, or plaintext fallback.

The browser connects only to `127.0.0.1`. `git-stacks web` first starts or discovers the helper, preflights and if necessary recovers its local WebTransport listener, then obtains a one-use launch grant over the authenticated local client. It writes an owner-only copy of the installed self-contained HTML containing the grant in a removable meta element and opens only that random file path. The document removes the element, creates a non-exportable ephemeral P-256 key, pins the WebTransport certificate hash, and proves the grant inside encryption. Browser URLs, history, storage, and localhost origins are not authority.

The TUI reads a mode-0600 descriptor, directly trusts the advertised self-signed leaf for one TLS 1.3 connection, verifies its hostname and `git-stacks/2` ALPN, then consumes a one-use application grant. It never imports the native WebTransport addon, and no CA is installed into the operating system or browser.

For remote targets, the local helper owns the durable helper key, target registry, signed certificate pins, and remote connector. Browser/TUI grants are scope ceilings. The relay intersects that ceiling with paired-helper and target scopes and binds the remote principal to the local authenticated principal. The browser never receives remote credentials and never connects directly to a remote authority.

Each authenticated local principal gets an isolated remote carrier. The helper does not pool unrelated browser/TUI principals into one helper-authenticated session because that would collapse stream ownership and increase the effect of a compromised client. Initial connection uses bounded cancellable retry. Once authenticated, carrier loss fails that local session closed; a fresh launch creates a fresh authenticated session and reattaches retained service-owned terminals. Non-idempotent operations are never replayed implicitly.

## Identity and lifecycle

- Authority and helper identities are stable ECDSA P-256 keys in native macOS Keychain/Linux Secret Service storage when available, with an owner-only protected-file fallback. The implementation refuses symlinks, wrong owners, unsafe modes, missing OS credentials, partial records, and metadata/key mismatches.
- WebTransport certificates are ECDSA P-256, valid for at most ten days, and represented by stable-identity-signed monotonic current/next endpoint-and-hash sets. Alternate listeners overlap for three days and use consecutive configured UDP ports remotely.
- Remote listening is disabled by default and uses a separate listener epoch from local browser/TUI listeners.
- Pairing uses a 256-bit short-lived token, explicit fingerprint confirmation, helper proof, scope intersection, proof-before-commit, atomic one-use consumption, and explicit revocation.
- Browser grants are short-lived and one-use. One browser document is active at a time; a new authenticated document closes the old one. Browser leases renew every 15 seconds and expire after 30 seconds without renewal.
- Helper handshakes include a fresh process epoch in the signed transcript. A new epoch supersedes live sessions from the previous helper process.
- Frame sequence numbers are monotonic. Control payloads and frame sizes are bounded before allocation; request, session, terminal, and replay quotas prevent unbounded growth.
- Logical streams use bounded per-stream/global queues and round-robin scheduling. One ordered carrier stream is the portable baseline, so carrier-level backpressure may delay the session as a whole without allowing unbounded memory or application-level starvation.
- Inherited TLS key logging and WebTransport payload tracing are rejected before a listener or connector starts.

See [security.md](./security.md) for the threat boundary and [remote-service.md](./remote-service.md) for pairing and recovery commands.

## Persistence and concurrency

Registry, template, workspace, label, pin, and priority data remain user-owned YAML. Writes use same-directory temporary files, file sync, atomic rename, and directory sync. Service descriptors, event journals, operation records, identity metadata, certificates, pairing records, and targets live under the owner-only service directory. No trust or product state is persisted by the browser.

## Runtime dependencies

`node-pty@1.2.0-beta.14`, `@fails-components/webtransport@1.6.6`, `@fails-components/webtransport-transport-http3-quiche@1.6.6`, and `@napi-rs/keyring@1.3.0` are exact-pinned because they own native process, encrypted transport, or credential-store behavior. `@peculiar/x509@2.0.0` generates certificates. Package validation verifies installed native addons, production SPDX licenses, package contents, and default-runtime vulnerabilities. CI exercises Node 24 on Linux and macOS, x64 and arm64; Bun remains isolated to the optional TUI.
