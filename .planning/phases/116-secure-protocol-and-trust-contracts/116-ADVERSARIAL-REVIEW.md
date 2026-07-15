# Adversarial Review: Secure Client and Remote-Service Architecture

**Reviewed:** 2026-07-15
**Scope:** Planned secure local/remote service architecture from Phase 116
**Disposition:** Design accepted for implementation with mandatory gates; no runtime security claim until Phases 116–122 execute and retain evidence

## Executive finding

The initial design correctly treated a localhost port and IndexedDB as insufficient durable identity, but it still gave browser persistence too much responsibility. A future process serving the same scheme/host/port is the same web origin and can read or invoke origin-scoped state. Spike 013 proved this concretely: after exact-origin takeover, Chrome recovered the old IndexedDB key handle and the hostile page could sign with the supposedly non-exportable private key.

The hardened design therefore assumes all browser-retained state is attacker-readable, attacker-invocable, attacker-replaceable, or attacker-poisonable. This includes cookies, local/session storage, IndexedDB and non-exportable keys, Cache Storage, service workers, shared workers, OPFS, history state, browser-restored pages, and any future origin-scoped storage API.

The review also found that certificate-pinning the WebTransport connection does not authenticate JavaScript first delivered over plaintext loopback HTTP. A proxy or other bootstrap-path interceptor able to replace that page could read the fragment and run a convincing fake terminal before the encrypted session exists. The production design therefore does not serve executable browser code over HTTP: `git-stacks web` opens a packaged, self-contained `file:` client and uses WebTransport for all service communication. A retained Chrome probe completed a pinned bidirectional WebTransport stream from that file client.

No security authority or long-term product persistence may live in the browser. The service/helper owns all durable state. The design has no unresolved critical/high finding on paper after the changes below, but it is not “secure by review”: every mitigation remains a release-blocking implementation and adversarial-test obligation.

## Architectural changes

1. The browser no longer connects directly to a remote authority. It connects only to the local Node helper over pinned WebTransport. The helper is the paired remote principal and relays typed channels over its own WebTransport connection.
2. Browser keys are non-exportable but ephemeral and held only in the current document's memory. They are never stored in IndexedDB or another browser persistence API.
3. Browser launch tokens, grants, pins, targets, terminal cursors, and authenticated snapshots are memory-only. Reload, browser restart, restored history, or a new document requires a fresh `git-stacks web` launch URL.
4. Browser code is a packaged, self-contained `file:` asset opened by `git-stacks web`; there is no executable loopback HTTP bootstrap and no localhost web origin to reclaim. Chrome on Linux was exercised from `file:` and reached the pinned WebTransport server through `127.0.0.1`; modern macOS and every claimed browser remain release gates.
5. A distinct browser-listener epoch owns the local WebTransport listener, launch tokens, and browser sessions. Closing that listener invalidates all unused tokens and grants, closes browser sessions, and only then releases the socket.
6. Remote pairing identities, remote pin sets, target definitions, and helper credentials remain exclusively in helper/service protected storage.

## Revised topology

```text
browser document
  memory-only ephemeral key and render state
       |
       | pinned WebTransport on loopback
       v
local Node helper
  durable target trust and helper identity
       |
       | pinned WebTransport on LAN
       v
remote Node authority
```

The optional TUI uses directly trusted self-signed-leaf TLS 1.3 to the same local helper, with no installed CA. Both clients use the same remote connector implementation, while each authenticated local principal receives an isolated remote carrier and every hop remains encrypted.

## Threat register

| ID | Threat | Severity | Finding | Required mitigation |
|----|--------|----------|---------|---------------------|
| BROWSER-01 | Exact localhost origin takeover recovers IndexedDB key/delegation | Critical | Confirmed by Spike 013 | No browser-persisted credential or delegation; ephemeral memory-only key; fresh launch required |
| BROWSER-02 | Storage poisoning causes the client to trust attacker-written target, pin, cursor, or principal | Critical | Initial design did not prohibit all persisted input | Never read security/product authority from browser storage; authoritative snapshot and preferences come from helper |
| BROWSER-03 | Helper remains alive while browser WebTransport listener dies; attacker captures its port during an active helper epoch | High | Helper epoch was too broad | Separate browser-listener epoch and abort tree; listener loss revokes browser sessions/tokens before socket release |
| BROWSER-04 | A stale service worker from a previous localhost owner returns hostile bootstrap code and steals the launch fragment | Critical | Same-origin active code survives independently of normal storage reads | Do not navigate to a localhost HTTP origin; packaged `file:` client cannot be intercepted by a stale localhost service worker |
| BROWSER-05 | Malicious process pre-binds the intended service port | Critical | Check-then-bind could open a client against an attacker | Bind WebTransport atomically before generating a launch URL; derive descriptor from owned socket; pinned certificate and encrypted auth must both fail against another process |
| BROWSER-06 | Old fragment remains in history, crash report, referrer, or restored tab | High | Fragment avoids HTTP but can remain browser-visible | 30-second maximum, atomically one-use, listener-epoch-bound token; clear synchronously before other work; `Referrer-Policy: no-referrer`; stale token is harmless |
| BROWSER-07 | Browser reload/history restore silently reuses stale authority | High | “Durable across reload” contradicted the threat model | Reload/history restore fails closed and instructs a fresh launch; shells persist service-side and reattach after new authentication |
| BROWSER-08 | Browser stores terminal output, API responses, workspace names, or secrets in caches | High | Static caching rules alone were incomplete | No product data in any browser persistence API; no fetch/cache/service worker; all terminal buffers remain document memory only |
| BROWSER-09 | Browser grant is replayed from another tab/document or resumed from BFCache | High | A scoped delegation alone could be copied or frozen | Launch token binds listener epoch, target ceiling, protocol/build, and ephemeral public key; one active connection; short renewable lease; fresh challenge; no bearer renewal |
| BROWSER-10 | Browser directly holding remote trust expands compromise impact | High | Direct remote path was unnecessary | Browser only talks to local helper; helper owns remote identity, pin rollover, scopes, connector, and audit trail |
| BROWSER-11 | Listener loss leaves direct remote browser sessions active | High | Direct topology complicated revocation | Removed direct remote sessions; helper relay can immediately stop forwarding while remote shells remain service-owned |
| BROWSER-12 | Same port is later reused and old UI state becomes visible | Medium | Inherent risk of stable localhost origins | No localhost document origin and no browser-persisted product state; old launch descriptors are consumed/expired and pins mismatch a replacement listener |
| BOOTSTRAP-01 | Plaintext loopback HTTP is replaced or proxied before pinned WebTransport starts | Critical | Pinning the data carrier cannot authenticate already-hostile JavaScript | Eliminate executable HTTP delivery; open a packaged self-contained `file:` client and require encryption before rendering product state or accepting terminal input |
| BOOTSTRAP-02 | Another opaque-origin page attempts local WebTransport authentication | High | `file:` serializes to an opaque/null request origin and origin alone is not identity | Require loopback peer, one-use launch token, ephemeral-key proof, listener epoch, expected protocol/build, and reject every non-allowlisted request origin; never treat `Origin` as authority |
| RELAY-01 | Browser-controlled target/channel fields turn the helper into a confused deputy | Critical | Introduced by the safer relay topology | Effective authority is the intersection of local grant, helper pairing scope, selected target, operation type, and helper-owned stream ownership |
| TUI-01 | Any local process connects to the correctly pinned TUI TLS listener | High | TLS authenticates only the helper server | Require fresh application authentication using a permission-restricted one-use descriptor after TLS/ALPN succeeds |
| LOCAL-01 | Another local OS user observes or races the one-use launch URL | Medium | URL launch crosses OS/browser integration | 256-bit token, listener/key binding, 30-second expiry, atomic use, no logging; hostile same-user/process inspection remains endpoint compromise and hostile multi-user hosts are unsupported |
| PAIR-01 | Pairing bundle is copied or raced before legitimate use | High | Pairing is intentionally an out-of-band bearer bootstrap | 256-bit token, protected file/stdin only, short expiry, atomic one-use consumption, displayed service fingerprint, scope ceiling, audit/revocation, and explicit trusted-channel requirement |
| TRUST-01 | Key/trust fallback is replaced through symlink, wrong ownership, or rollback | High | Mode `0600` alone is insufficient | Private `0700` parent, owner/type/mode checks, no-follow opens, atomic durable writes, monotonic trust generations, corruption fail-closed, OS key store where available |
| ROTATE-01 | Attacker freezes or rolls back a valid old certificate pin set | High | Signed old data remains cryptographically valid | Bind endpoint, protocol, generation, issued/expiry to stable identity; persist highest accepted generation; bounded overlap only; stable identity change requires reset |
| PROTOCOL-01 | Downgrade, type confusion, oversized allocation, or replay exposes classified channels | Critical | Carrier encryption does not make application framing safe | Canonical transcript/frame encoding, negotiation bound into authentication, pre-allocation limits, monotonic sequences, generic failure, no plaintext/legacy fallback |
| RESOURCE-01 | Hostile client exhausts streams, PTYs, buffers, timers, or reconnect work | High | Remote exposure adds an untrusted resource boundary | Per-frame/stream/principal/target/global quotas, fair scheduling, bounded replay, rate limits, cancellation, idle expiry, and soak/RSS gates |
| LOG-01 | Pairing or terminal secrets enter logs, errors, crash diagnostics, or telemetry | Critical | Structured payloads make accidental logging easy | Allowlisted metadata-only logging, typed secret wrappers, terminal-byte exclusion, generic auth errors, randomized canary tests across logs and crash paths |
| KEYLOG-01 | TLS/QUIC session keys are emitted through debug flags, inherited environment, or transport tracing | Critical | Packet encryption is defeated by a key log | Release builds never enable key logging/payload tracing; service startup sanitizes or rejects known key-log options/environment; CI scans artifacts/logs and decrypts captures only in an isolated positive-control test |
| NETWORK-01 | Service is unintentionally exposed beyond loopback or leaks data before auth | Critical | A secure protocol can still be dangerously discoverable | Remote bind disabled by default, explicit address, authenticated encrypted handshake before metadata, no unauthenticated enumeration, clear exposure diagnostics |
| SUPPLY-01 | Native transport install script/artifact is compromised or unavailable on a platform | High | WebTransport currently relies on native prebuilds | Exact versions/integrity, reviewed lifecycle script only, provenance/notices, vulnerability gate, Linux/macOS x64/arm64 prebuild proof, replaceable carrier boundary |

## Bootstrap protocol

1. The helper atomically binds the local WebTransport listener under one browser-listener abort controller.
2. It generates a random listener epoch, 256-bit short-lived one-use token, and current local WebTransport certificate hash.
3. Only after the encrypted listener is ready does it open the packaged self-contained client as `file:///.../git-stacks-web.html#<descriptor>`.
4. The packaged page has a build-generated restrictive meta CSP, no external executable resources, no network destination except loopback WebTransport, and no target, credential, workspace, or runtime data baked into it.
5. The page synchronously copies the fragment to a local variable and removes it with `history.replaceState` before loading product state. It does not render service state or enable terminal input before authenticated-session establishment succeeds.
6. It creates an ephemeral non-exportable P-256 key in memory and opens pinned local WebTransport.
7. The first encrypted transcript binds token, listener epoch, ephemeral public key, protocol/build version, connection nonce, intended target ceiling, and requested scopes. The helper atomically consumes the token and returns an in-memory session grant.
8. All snapshots, operations, events, signals, and terminal bytes flow through that session. The browser never receives the helper private key, remote pairing token, durable target credential, or a persistable remote delegation.

## Lifecycle rules

- Browser storage is optional hostile input. Production code should not open it. Known legacy git-stacks databases/cookies may be cleared as hygiene, but successful clearing is never a security condition.
- A normal reload or new document cannot reconstruct authentication. The packaged page displays a non-sensitive “run `git-stacks web` to reconnect” state.
- The existing helper/service retains shells, terminal replay, target selection, and UI preferences. A fresh browser launch obtains an authoritative snapshot and reattaches.
- Carrier loss, reload, and BFCache resume require a fresh launch and fresh document grant. Service-owned terminals survive browser-document loss and reattach after that launch; browser authority itself is never reconstructed.
- Closing or losing the local WebTransport listener invalidates unused launch tokens and active browser grants even if the Node helper remains alive for TUI or remote connector work.
- The helper-to-remote connection can remain alive after browser closure so service-owned shells continue. No browser authorization survives that closure.

## Required packaged-client restrictions

- The helper accepts browser WebTransport only from a loopback peer and the explicitly supported opaque-origin request shape; origin is defense in depth, never authentication.
- One self-contained installed HTML asset with build-generated CSP hashes; no remote script, stylesheet, font, image, source map, runtime configuration, or HTTP endpoint.
- Meta `Content-Security-Policy` with `default-src 'none'`, hashed inline script/style, loopback-only WebTransport `connect-src`, `worker-src 'none'`, `object-src 'none'`, `base-uri 'none'`, and `form-action 'none'`. Frame denial is additionally enforced in code because `frame-ancestors` is unavailable from meta CSP.
- Meta `Referrer-Policy: no-referrer`; launch uses no opener; product UI stays inert until authenticated session establishment.
- No service worker, shared worker, BroadcastChannel credential exchange, persistent WebCrypto key, cookie principal, or browser-side target registry.

## Mandatory adversarial tests

1. Seed cookies, local/session storage, IndexedDB keys, Cache Storage, OPFS, history state, and a service worker on former localhost origins; launch the packaged client and prove none is consulted.
2. Stop the helper, bind the exact old origin, recover all old browser storage, and prove no credential exists and no old grant authenticates.
3. Kill only the local WebTransport listener while leaving the helper and remote connector alive; prove the browser-listener epoch aborts, tokens fail, browser channels close, and shells remain service-owned.
4. Pre-bind candidate ports and race launch; prove URLs are emitted only for an atomically owned encrypted listener.
5. Replay consumed/expired fragments from history and another document; prove rejection before product data.
6. Copy the browser profile to another machine/process; prove it provides no authority.
7. Reload, BFCache restore, browser crash/restore, and tab duplication; prove each new document needs a fresh launch while terminal reattachment remains available after it.
8. Instrument all browser persistence APIs and fail tests on product reads/writes; static browser bundles must pass a forbidden-API audit.
9. Record both encrypted hops while entering randomized terminal secrets; prove no marker appears in captured wire bytes, logs, crash output, or key-log files. Run a separate isolated positive control to prove the capture scanner would detect intentionally exported session keys.
10. Forge target, scope, operation, local-session ID, and terminal-owner fields from browser and TUI clients; prove the helper rejects every authority expansion and cross-client stream attachment.
11. Connect to the TUI TLS listener without, with replayed, and with wrong one-use descriptor credentials; prove no classified data is returned.
12. Configure a hostile HTTP proxy/PAC and prove the browser client performs no HTTP request and still connects only to the pinned loopback WebTransport listener.
13. Replace/corrupt the installed client bundle and native transport artifact in release fixtures; prove integrity diagnostics fail before launch and package/release verification catches the mutation.

## Residual trust boundary

The browser document necessarily sees rendered terminal output and user keystrokes in memory. A compromised page bundle, browser extension with page privileges, devtools/debug access, browser TLS key logging, or same-user malware can steal those values and remains an endpoint-compromise risk. The architecture prevents origin reuse or browser persistence from becoming durable authority; it cannot make a compromised active browser renderer trustworthy. A hostile multi-user host where another account can inspect process arguments or race loopback launch credentials is not a supported trust boundary; remote untrusted networks and later benign/malicious origin reuse are. Passive observers still learn endpoint addresses, connection timing, and approximate traffic volume even though payloads remain confidential.

## Standards basis

- The [HTML origin model](https://html.spec.whatwg.org/multipage/browsers.html#origins) defines authority by scheme, host, and port and assumes same-origin actors trust one another. This is why exact origin reuse is hostile.
- The [HTML Web Storage security guidance](https://html.spec.whatwg.org/multipage/webstorage.html#security-storage) warns that persistent origin state is sensitive and can be read or poisoned by same-origin actors.
- [IndexedDB](https://www.w3.org/TR/IndexedDB/) is persistent origin-scoped object storage; non-exportability does not prevent a later same-origin script from invoking a stored key handle, as Spike 013 demonstrated.
- [Service workers](https://www.w3.org/TR/service-workers/) are origin/scope-bound active code and therefore part of the hostile persisted-origin model, not just a cache optimization.
- The [Secure Contexts specification](https://www.w3.org/TR/secure-contexts/) treats `file:` as potentially trustworthy while explicitly warning that secure-context status does not isolate origin storage; the design uses the former only to access WebTransport and relies on no browser storage.
- The [WebTransport specification](https://www.w3.org/TR/webtransport/) requires TLS-equivalent confidentiality, supports explicit SHA-256 certificate hashes for non-publicly-routable endpoints, performs no service-worker interception for the WebTransport request, and explicitly requires application-level client authentication.
- The [Content Security Policy specification](https://www.w3.org/TR/CSP/) permits meta-delivered policies but excludes `frame-ancestors`, `sandbox`, and reporting there; the packaged client therefore uses meta CSP for resource restriction and separate top-level/frame defenses rather than claiming header-equivalent protection.
