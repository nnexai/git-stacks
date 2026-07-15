# Secure Local/Remote Service Architecture

## Decision

git-stacks will expose one authenticated, carrier-neutral service protocol. Every channel that can contain workspace data, operations, signals, events, terminal input/output, environment values, credentials, or secrets requires an encrypted carrier. There is no classified plaintext compatibility mode.

WebTransport is the primary service carrier for browser-to-local-helper and Node-helper-to-authority connections. Browser code loads as a self-contained asset from the installed git-stacks package, not from a plaintext localhost response. The browser never connects directly to a remote authority and never stores remote trust. The optional Bun/OpenTUI package directly trusts a self-signed service leaf for one TLS 1.3 connection to its local Node helper because the accepted WebTransport addon is not safe inside Bun. No CA is installed. Both UI clients therefore route remote work through the same Node helper connector implementation.

Ordinary CLI commands remain daemonless and machine-local. They call `@git-stacks/core` directly and rely on atomic persistence plus service watchers. Only explicit `service`, `pair`, `target`, `trust`, and recovery commands participate in the service security topology.

## Topologies

### Local browser

```text
git-stacks web
  -> start/discover local Node authority
  -> atomically bind WebTransport on loopback
  -> open packaged file:///.../git-stacks-web.html
  -> one-use launch token + current pin in fragment
browser
  -> self-contained installed UI (fragment is not transmitted)
  -> pinned WebTransport to local authority
  -> ephemeral memory-only key
  -> encrypted launch, API, events, terminals
```

### Remote browser

```text
browser --WebTransport(loopback)--> local helper
local helper --WebTransport(LAN)--> paired remote authority
```

The remote authority validates the paired helper identity, active helper epoch, scopes, quotas, and stream ownership. The helper validates each ephemeral local browser launch and forwards only authorized typed channels. Closing the browser does not close service-owned shells. A fresh `git-stacks web` launch authenticates a new document and reattaches through service-owned terminal cursors and bounded replay.

### Local and remote TUI

```text
Bun/OpenTUI --TLS 1.3--> local Node helper/authority
local target: execute there
remote target: helper --WebTransport--> remote authority
```

Every hop is encrypted and authenticated. The TUI does not load or bind the native WebTransport dependency.

## Package ownership

- `@git-stacks/protocol`: frame envelope, canonical control messages, capability/version negotiation, channel classification, limits, IDs, auth transcript schemas, target/pin/local-grant DTOs.
- `@git-stacks/client`: `SecureSessionCarrier`, authenticated session establishment, request correlation, reconnect/replay reducers, target selection, and carrier-independent client operations.
- `@git-stacks/core`: unchanged local domain and persistence authority; no transport imports.
- `@git-stacks/service`: service identity, pairing authority, target registry, helper and browser-listener epochs, authorization, WebTransport server/client adapters, TLS local listener, routing/relay, quotas, PTYs, signals, and projections.
- `@git-stacks/web`: self-contained packaged renderer, launch-fragment consumption, ephemeral non-exportable in-memory browser key, WebTransport browser adapter, target UX; no machine logic, HTTP bootstrap, or persistent state.
- `@git-stacks/tui`: OpenTUI renderer plus Bun TLS carrier adapter; no service policy or remote connector.
- `@git-stacks/cli`: local core commands plus explicitly named service/pairing setup commands; no general service fallback.

## Secure session layers

```text
domain operation / terminal policy
  -> authenticated logical channel
  -> canonical bounded frame protocol
  -> SecureSessionCarrier
       WebTransportCarrier (browser and Node)
       TlsLocalCarrier (Bun TUI only)
  -> encrypted network bytes
```

`SecureSessionCarrier` is not merely a byte stream. It can be constructed only after transport encryption and server pin validation. It exposes peer/channel binding, independent logical streams, asynchronous pressure, cancellation, and deterministic close. Authentication then upgrades it to an `AuthenticatedSession` carrying a principal, target, scopes, helper epoch, negotiated protocol, and quotas. Service clients receive no classified methods before that upgrade.

The protocol uses a fixed header containing version/kind, payload length, logical stream or cursor, and sequence. Payload size is checked before allocation. Canonical CBOR is preferred for production control payloads; raw terminal chunks remain binary. Unknown mandatory kinds, non-canonical values, sequence rollback, oversize input, and capability downgrade close the session without detailed authorization disclosure.

The canonical protocol multiplexes control/request traffic, event delivery, and attached terminals by logical stream ID over one ordered carrier stream. A fair bounded scheduler and per-stream/global quotas prevent unbounded buffering and application-level starvation; carrier backpressure can still delay the authenticated session as a whole. This conservative common denominator keeps TLS and WebTransport behavior identical and leaves native multi-stream carriers as a compatible future optimization rather than a security assumption.

## Identity, pairing, and credentials

Each authority has a stable P-256 signing identity. Each paired helper has a stable P-256 signing identity. Private keys live in macOS Keychain or a maintained Linux secret-service adapter where available, with an atomic mode-`0600` file fallback that clearly documents the same-user threat boundary. The browser has no durable identity: each launched document generates a new non-exportable key in memory.

Remote pairing is explicit:

1. Remote administrator enables a specific bind address and creates a short-lived pairing bundle with requested scopes.
2. The bundle contains endpoint, stable service public identity/fingerprint, current signed pin set, protocol range, expiry, and a high-entropy one-use token.
3. The bundle is moved through a trusted out-of-band channel as a protected file or stdin. Tokens are forbidden in argv, query strings, logs, workspace YAML, shell completions, and telemetry.
4. The local command displays the short fingerprint for comparison, creates a helper key, pins WebTransport, consumes the token inside encryption, and registers the helper public key/scopes.
5. The target registry persists public trust metadata and a reference to the helper private credential. Subsequent connections use fresh signed challenges, never the pairing token.

Commands should follow this shape:

- `git-stacks service expose --listen <address> --port <port>`
- `git-stacks service pair create --scope web --scope tui --output <protected-file>`
- `git-stacks service pair accept --input <file|->`
- `git-stacks service targets list|remove|rename|verify`
- `git-stacks service trust rotate|reset|diagnose`

Exact names may be aligned with existing Commander conventions during implementation, but secrets must use file/stdin or an interactive protected prompt.

## Certificates and rollover

WebTransport listeners use self-signed X.509v3 ECDSA P-256 certificates with at most ten days validity. The stable service identity signs a canonical pin-set statement containing service ID, endpoint, hashes, issued/expiry times, protocol version, and monotonic generation.

Rotation starts an overlapping next listener before distributing its signed statement. Clients verify and store it through an authenticated session, reconnect to the next listener, and acknowledge the generation. The previous listener remains for a bounded rollback window and then stops. A wrong, expired, unsigned, rolled-back, or unknown pin fails before application data. Stable service identity replacement is an explicit trust reset.

The local TUI listener uses TLS 1.3, an automatically provisioned private local CA, hostname verification, and `git-stacks/2` ALPN. Its CA is supplied only to the TUI connection and is never installed globally. The descriptor and client credential are permission-restricted local state. Bun's `node:tls` adapter is required; native `Bun.connect` is forbidden until its wrong-CA behavior passes release tests.

## Packaged browser bootstrap and ephemeral authority

The service exposes no HTTP bootstrap, runtime configuration, API, SSE, WebSocket, terminal, pairing, or readiness route. `@git-stacks/web` produces one self-contained installed HTML asset with build-generated CSP hashes and no remote executable resources. Serving this code over plaintext loopback HTTP is forbidden because transport pinning cannot authenticate JavaScript that was already replaced before WebTransport starts.

The helper atomically owns a loopback WebTransport listener before emitting a URL such as `file:///.../git-stacks-web.html#<descriptor>`. The descriptor contains only a 256-bit one-use token, listener address, current certificate hash, expected protocol/build, and expiry. It contains no remote credential or product state. The helper accepts only a loopback peer and the explicitly supported opaque-origin request shape, but never treats the serialized `Origin` as identity.

The page clears the fragment synchronously, creates an ephemeral non-exportable P-256 key in document memory, opens pinned WebTransport, and consumes the token under encryption. The transcript binds browser-listener epoch, key, requested target ceiling, scopes, protocol/build, issue/expiry, and a fresh challenge. The page renders no product state and accepts no terminal input until the encrypted carrier and application authentication both succeed.

No cookie, IndexedDB, local/session storage, Cache Storage, OPFS, service worker, history state, or other browser-retained value is accepted as identity, trust, target configuration, terminal cursor, or authoritative product state. Browser persistence is treated as hostile input and production code does not consult it. Persistent preferences, terminal retention, and event replay state live in the helper/service.

The WebTransport browser listener, launch tokens, and browser sessions share one browser-listener epoch and abort tree. Listener loss invalidates launch tokens and browser grants and closes local browser sessions before releasing the socket, even when the helper remains alive for TUI or remote connector work. Each authenticated browser connection also holds a short renewable lease and a one-active-connection grant; a frozen BFCache page, crashed renderer, duplicated tab, or lost carrier expires without ending service-owned shells. Browser reload, close/reopen, history restore, BFCache resume, carrier loss, or a new document requires a fresh `git-stacks web` launch. The fresh document receives a new grant and reattaches retained service-owned shells; no browser authority is reconstructed or silently replayed.

The browser never receives durable remote credentials, remote pairing records, or persistable remote delegations. The local helper authenticates to the remote authority and relays the browser's typed channels.

## Confidentiality boundary

The design protects against passive packet recording and active MITM or localhost-port takeover between uncompromised endpoints. Terminal keystrokes such as API keys are encrypted before leaving the browser/TUI and are not exposed to HTTP, SSE, WebSocket, logs, or release key-log output. Browser executable code is read from the installed package rather than from an unauthenticated network response. Service startup sanitizes or rejects known TLS/QUIC key-log and payload-tracing settings; release builds never enable them.

It cannot protect secrets from a compromised authority/helper, compromised active browser renderer/extension, browser deliberately launched with TLS key logging or debugging, same-user malware able to inspect process memory, ptrace/debug privileges, or terminal applications that themselves record input. Pairing bundles also require a trusted out-of-band transfer. Network observers still learn endpoints, timing, and approximate volume. These boundaries must be explicit documentation, not implied exceptions.

## Failure behavior

- No secure carrier support: fail closed in the packaged client before requesting product state.
- Unknown/wrong/expired pin: do not send auth or classified data.
- Auth/grant/epoch failure: close with a generic reason and require a fresh launch, helper recovery, or re-pairing as appropriate.
- Replay gap: fetch a fresh bounded snapshot; terminal gap emits explicit reset.
- Browser reload/close: browser authority ends; service-owned PTY continues and a fresh launch reattaches.
- Browser-listener loss: revoke its listener epoch, invalidate all launch/browser grants, close browser channels, then release the socket.
- Helper clean stop: revoke browser-listener and helper epochs, close clients, release listeners.
- Helper crash: epoch expires after grace; stale browser state remains unusable.
- Rotation failure: retain prior listener inside rollback window; never downgrade to plaintext.

## Release gates

- Node 24 Linux x64/arm64 and macOS x64/arm64 runtime jobs for WebTransport server/client, rotation, reconnect soak, and active-session shutdown.
- Bun/OpenTUI jobs on the same platforms for local TLS positive/wrong-CA/ALPN/shutdown behavior.
- Browser jobs for current supported Chromium and any other browser explicitly claimed by release notes on Linux and modern macOS, including the actual self-contained `file:` bundle, opaque-origin request handling, hostile proxy/PAC settings, storage poisoning, stale localhost service workers, reload/history restore, and old-port takeover.
- Packet-recording tests with randomized classified markers for every carrier.
- MIT-compatible license inventory, exact dependency integrity, reviewed native install script, required notices, zero unsupported compiler fallback, and vulnerability/maintenance review.
- Adversarial pairing, replay, malformed frame, resource pressure, origin takeover, log redaction, and authorization-enumeration suites.
- A browser-bundle forbidden-API gate for cookies, IndexedDB, local/session storage, Cache Storage, OPFS, service/shared workers, and any browser-side durable credential/target store.

## Migration rule

The existing HTTP/SSE/WebSocket adapters may remain only while the secure path is built behind tests. Cutover is atomic from the product perspective: once web/TUI use secure sessions, all old HTTP routes and classified SSE/WebSocket routes are deleted in the same milestone. There is no runtime flag that silently re-enables plaintext or executable HTTP bootstrap.
