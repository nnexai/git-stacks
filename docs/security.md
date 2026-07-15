# Security model

## What the encrypted service protects

Snapshots, operations, events, signals, terminal input/output, credentials typed into terminals, and remote pairing traffic are never sent through a plaintext product transport. Local browser traffic uses pinned WebTransport. TUI traffic uses TLS 1.3 with hostname verification against a directly trusted self-signed service leaf plus application authentication. Helper-to-authority traffic uses certificate-hash-pinned WebTransport plus a durable helper-key proof.

The service has no HTTP, SSE, WebSocket, readiness, or executable-bootstrap route. The browser UI is an installed self-contained `file:` asset with hashed script/style CSP, no external executable resources, no workers, and no product persistence.

## Trust boundaries

The design protects against passive LAN recording, hostile local-network peers, wrong/self-signed certificates, stale or substituted remote endpoints, unauthenticated local processes, browser origin reuse, and stale browser storage. A network observer should see encrypted TLS/QUIC records, not terminal bytes or credentials.

The following remain trusted:

- the current OS user account and processes with equivalent access;
- the installed git-stacks package and Node/Bun runtimes;
- the browser binary used to render the packaged client;
- the out-of-band channel used to compare a remote authority fingerprint.

A process running as the same user can generally read process memory, protected files, terminal devices, or inject input. Git-stacks does not claim to defend against a fully compromised user account, kernel, browser, or package supply chain.

## Browser storage and localhost

Cookies, local/session storage, IndexedDB, Cache Storage, OPFS, service/shared workers, browser profiles, and localhost origin ownership are never authentication or product authority. Every new document needs a fresh one-use fragment and creates a new non-exportable key in memory. The CLI places that fragment only in a mode-0600 launcher file; stdout and the browser-opening process receive the random launcher path, not the bearer. The client clears the fragment before connection. Durable targets, pins, credentials, terminal state, signals, and workspace preferences remain in the helper/service or workspace files.

## Protected machine state

Durable authority and helper keys use the native macOS Keychain or Linux Secret Service through the exact-pinned `@napi-rs/keyring` adapter when the OS store is available and unlocked. Key material is passed through the native API, never command arguments. If the native store is unavailable when an identity is first created, git-stacks uses the protected-file fallback below. An identity already assigned to the OS store fails closed if that store or key later disappears; it does not silently create a replacement identity.

Service security records live below the mode-0700 service directory. Fallback secret files and descriptors are mode 0600 and are validated for owner, type, mode, and symlink substitution. Writes use new private temporary files, fsync, and atomic rename. The fallback defines the same-user boundary; do not copy the service directory into a workspace or backup shared with other users. `GIT_STACKS_KEY_STORE=file` exists for isolated CI and recovery environments that deliberately require the documented fallback.

## Operational safeguards

- Remote exposure is disabled until explicitly enabled for a bind and advertised address.
- Pairing bundles are short-lived, one-use, mode-0600 files (or stdin), and require an independently confirmed authority fingerprint.
- Browser launch grants expire after 30 seconds, are consumed atomically, and replace an older browser session without waiting on its stale transport writer.
- Scope expansion requires a new pairing. Helpers and targets can be revoked or removed independently.
- Pairing transport closes immediately after proof and commit. Trust/target administration is local-only, and revoking a helper or removing a target closes its active relays.
- Ten-day WebTransport certificates use signed current/next endpoint-and-hash sets. The next listener starts for a three-day overlap; helpers try both signed endpoints and retain monotonic generations without repeating pairing.
- Wrong certificate pins, signatures, protocol versions, ALPN, epochs, proofs, tokens, sequence numbers, or frame lengths fail closed before product requests are accepted.
- `SSLKEYLOGFILE`, `NODE_OPTIONS=--tls-keylog`, `DEBUG_TRACE`, and WebTransport/QUIC debug namespaces are rejected for secure service processes.
- Status output excludes launch tokens, private keys, certificate private material, and pairing bearer values.
- Remote carriers are isolated per authenticated local principal. Git-stacks does not share one helper-authenticated carrier across unrelated browser/TUI principals.
- A dropped authenticated carrier fails closed. Initial/fresh-session connection retries are bounded and cancellable; non-idempotent requests are never silently replayed. Re-launching the client establishes a fresh session and can reattach service-owned terminals.

## Reporting a vulnerability

Do not place live credentials, pairing bundles, private keys, or terminal captures in a public issue. Contact the maintainer privately with the affected version, platform, reproduction boundary, and sanitized evidence.
