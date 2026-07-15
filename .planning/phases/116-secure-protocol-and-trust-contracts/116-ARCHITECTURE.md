# Secure Local/Remote Service Architecture

## Decision

git-stacks will expose one authenticated, carrier-neutral service protocol. Every channel that can contain workspace data, operations, signals, events, terminal input/output, environment values, credentials, or secrets requires an encrypted carrier. There is no classified plaintext compatibility mode.

WebTransport is the primary service carrier for browsers and Node helpers. The optional Bun/OpenTUI package uses private-CA-pinned TLS 1.3 only to reach its local Node helper because the accepted WebTransport addon is not safe inside Bun. The local helper then uses the same Node WebTransport connector as every other remote client.

Ordinary CLI commands remain daemonless and machine-local. They call `@git-stacks/core` directly and rely on atomic persistence plus service watchers. Only explicit `service`, `pair`, `target`, `trust`, and recovery commands participate in the service security topology.

## Topologies

### Local browser

```text
git-stacks web
  -> start/discover local Node authority
  -> static HTTP listener on 127.0.0.1
  -> one-use launch token + current pin in URL fragment
browser
  -> GET static assets (fragment is not transmitted)
  -> pinned WebTransport to local authority
  -> encrypted pairing, delegation, API, events, terminals
```

### Remote browser

```text
browser --WebTransport--> local helper
  receive encrypted target record + scoped delegation
browser --WebTransport--> paired remote authority
```

The remote authority validates the helper-signed browser delegation, browser proof, active helper epoch, target audience, origin, scopes, quotas, and stream ownership. Closing the browser does not close service-owned shells. Reopening and authenticating reattaches through terminal cursors and bounded replay.

### Local and remote TUI

```text
Bun/OpenTUI --TLS 1.3--> local Node helper/authority
local target: execute there
remote target: helper --WebTransport--> remote authority
```

Every hop is encrypted and authenticated. The TUI does not load or bind the native WebTransport dependency.

## Package ownership

- `@git-stacks/protocol`: frame envelope, canonical control messages, capability/version negotiation, channel classification, limits, IDs, auth transcript schemas, target/pin/delegation DTOs.
- `@git-stacks/client`: `SecureSessionCarrier`, authenticated session establishment, request correlation, reconnect/replay reducers, target selection, and carrier-independent client operations.
- `@git-stacks/core`: unchanged local domain and persistence authority; no transport imports.
- `@git-stacks/service`: service identity, pairing authority, target registry, helper epochs, authorization, WebTransport server/client adapters, TLS local listener, routing, quotas, PTYs, signals, and projections.
- `@git-stacks/web`: static renderer, launch-fragment consumption, non-exportable browser key, WebTransport browser adapter, target UX; no machine logic.
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

WebTransport uses independent bidirectional streams for control/request traffic, event delivery, and each attached terminal. The TLS TUI adapter multiplexes the same logical channel IDs with a fair bounded scheduler because its loopback carrier is one ordered stream. Carrier differences never alter terminal retention, visibility, signal, operation, or authorization policy.

## Identity, pairing, and credentials

Each authority has a stable P-256 signing identity. Each paired helper has a stable P-256 signing identity. Private keys live in macOS Keychain or a maintained Linux secret-service adapter where available, with an atomic mode-`0600` file fallback that clearly documents the same-user threat boundary.

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

## Browser bootstrap and delegation

Loopback HTTP serves immutable HTML/CSS/JS and optional non-sensitive readiness. It has no JSON configuration, API, SSE, WebSocket, terminal, pairing, or error-detail route.

The launch fragment contains a one-use local token and current local certificate hash. The page clears it immediately, opens pinned WebTransport, and consumes the token under encryption. It creates a non-exportable P-256 key in IndexedDB and receives a short-lived helper-signed delegation bound to exact origin, key, remote service audience, scopes, helper epoch, issued time, and expiry.

Every connection uses a fresh service challenge and browser signature. A clean helper shutdown revokes its epoch before releasing the localhost listener; abrupt loss expires after bounded grace. Old IndexedDB state and a process that captures the old port cannot reactivate a revoked/expired epoch.

## Confidentiality boundary

The design protects against passive packet recording and active MITM or localhost-port takeover between uncompromised endpoints. Terminal keystrokes such as API keys are encrypted before leaving the browser/TUI and are not exposed to HTTP, SSE, WebSocket, or logs.

It cannot protect secrets from a compromised authority, compromised browser renderer/extension, same-user malware able to inspect process memory, ptrace/debug privileges, or terminal applications that themselves record input. Pairing bundles also require a trusted out-of-band transfer. These boundaries must be explicit documentation, not implied exceptions.

## Failure behavior

- No secure carrier support: fail closed with a static compatibility message.
- Unknown/wrong/expired pin: do not send auth or classified data.
- Auth/delegation/epoch failure: close with a generic reason and require helper recovery or re-pairing.
- Replay gap: fetch a fresh bounded snapshot; terminal gap emits explicit reset.
- Browser close/network loss: service-owned PTY continues according to existing lifecycle; reconnect reattaches.
- Helper clean stop: revoke epoch, close clients, release listener.
- Helper crash: epoch expires after grace; stale browser state remains unusable.
- Rotation failure: retain prior listener inside rollback window; never downgrade to plaintext.

## Release gates

- Node 24 Linux x64/arm64 and macOS x64/arm64 runtime jobs for WebTransport server/client, rotation, reconnect soak, and active-session shutdown.
- Bun/OpenTUI jobs on the same platforms for local TLS positive/wrong-CA/ALPN/shutdown behavior.
- Browser jobs for current supported Chromium and any other browser explicitly claimed by release notes.
- Packet-recording tests with randomized classified markers for every carrier.
- MIT-compatible license inventory, exact dependency integrity, reviewed native install script, required notices, zero unsupported compiler fallback, and vulnerability/maintenance review.
- Adversarial pairing, replay, malformed frame, resource pressure, origin takeover, log redaction, and authorization-enumeration suites.

## Migration rule

The existing HTTP/SSE/WebSocket adapters may remain only while the secure path is built behind tests. Cutover is atomic from the product perspective: once web/TUI use secure sessions, all classified old routes are deleted in the same milestone. There is no runtime flag that silently re-enables plaintext.
