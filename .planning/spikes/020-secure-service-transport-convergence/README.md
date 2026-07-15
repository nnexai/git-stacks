---
spike: 020-secure-service-transport-convergence
status: validated
date: 2026-07-15
---

# Spike 020: Secure Service Transport Convergence

## Verdict

**VALIDATED** — git-stacks can enforce one confidentiality rule across the browser, optional Bun/OpenTUI client, local service, and a remote service without public DNS, a public CA, or installing a private CA in a browser.

The architecture uses a carrier-neutral authenticated session protocol with two encrypted carrier adapters:

- WebTransport over HTTP/3 for browser-to-service and Node-helper-to-remote-service connections.
- Pinned TLS 1.3 for the Bun TUI-to-local-Node-helper connection.

Every request, snapshot, event, signal, operation, terminal control, terminal input byte, and terminal output byte travels inside one of those encrypted carriers. Loopback HTTP may serve immutable web assets and non-sensitive readiness only. It must never carry API data, credentials, pairing material, events, SSE, WebSockets, or terminal bytes. Unsupported secure transport fails closed; there is no plaintext fallback.

## Proven topology

```text
local browser
  HTTP loopback: static assets only
  WebTransport: authenticated API/events/terminals
             |
             v
local Node helper/authority
  ^                  |
  | TLS 1.3          | WebTransport
  |                  v
Bun/OpenTUI      paired remote Node authority
```

In local mode the helper is also the authority. In remote mode it retains the paired target and helper identity. The browser may establish a direct pinned WebTransport connection to the selected remote authority after the local helper delegates a short-lived browser key over the encrypted local WebTransport session. The TUI remains connected to the local helper over TLS; the helper connects to the remote authority over WebTransport. Both remote paths therefore remain encrypted on every hop.

The daemonless CLI does not join this topology. Ordinary CLI commands continue calling the local core directly. Only explicit service lifecycle, target, pairing, trust, and recovery commands communicate with or configure a service.

## Retained proof

The executable probe uses the same strict 13-byte length-prefixed frame codec over both carriers and sends randomized terminal-secret markers through byte-recording UDP and TCP proxies.

Validated on Linux x64:

1. Chrome loaded static assets from `http://127.0.0.1`, read a one-use launch descriptor from the URL fragment, cleared the fragment, pinned a 10-day ECDSA P-256 WebTransport certificate, authenticated inside the encrypted stream, and sent terminal-secret input.
2. The HTTP server observed only `/`, `/client.js`, `/favicon.ico`, `/rotate`, and `/metrics`; no pairing token, pin, or terminal marker appeared in an HTTP request.
3. The Node helper paired once over WebTransport with a durable P-256 public key, rejected reuse of the pairing token, rejected a wrong certificate hash, verified a stable-service-identity signature over the next endpoint and certificate hash, and reconnected through the rotated listener.
4. Seventeen fresh-challenge reconnects completed on Node 24.18.0. After settlement, the authority reported zero active WebTransport sessions and approximately 109 MiB RSS for the two-listener integration probe.
5. Bun 1.3.14 connected through a private-CA-pinned TLS 1.3 stream with the `git-stacks/2` ALPN, used the same frame codec, and sent terminal-secret input. A different valid authority was rejected.
6. The recording proxies captured about 196 KiB of QUIC traffic and 4 KiB of TLS traffic in the combined run. None of the 19 randomized classified markers appeared in captured wire bytes, while the decrypted authority accepted every marker.
7. Browser, helper, and TUI sessions shut down cleanly. The WebTransport server and client completed under the project's Node 24 target; the Bun process contains only the TLS client adapter and never loads the native WebTransport addon.

The earlier focused spikes remain part of the proof set:

- Spike 012 validated non-exportable browser P-256 keys, exact-origin delegations, one-use launch pairing, and challenge proof.
- Spike 013 validated helper epochs, heartbeat expiry, clean revocation before localhost port release, and hostile old-origin takeover rejection.
- Spike 014 validated independent WebTransport terminal streams, 16–48 MiB transfer, backpressure, visible-only bulk output, bounded replay, reconnect/reset, and cancellation.
- Spike 015 independently validated Bun `node:tls` private-CA enforcement and wrong-authority rejection.

## Security architecture

### Stable identity and rotating transport certificates

Each authority has a stable P-256 signing identity. Pairing pins that identity, not a long-lived transport leaf. WebTransport listeners use X.509v3 ECDSA P-256 certificates valid for at most ten days. Before expiry, the authority starts an overlapping listener and signs the next endpoint and certificate-hash set with the stable identity. Authenticated clients verify and persist the update before reconnecting. The old listener remains available for a bounded rollback window, then closes.

Changing the stable service identity is a trust reset and requires explicit re-pairing. A certificate rollover signed by the already paired identity does not.

### Local bootstrap

`git-stacks web` starts or discovers the local Node helper, provisions its short-lived certificate, and opens a URL whose fragment contains the one-use local bootstrap token and current certificate hash. URL fragments are not part of HTTP requests. The page reads the fragment, clears it with `history.replaceState`, establishes pinned WebTransport, consumes the token inside encryption, creates or restores a non-exportable browser key, and receives a short-lived delegation.

Every invocation may issue a fresh local bootstrap. This keeps default local use non-interactive even when the helper port or browser origin changes. IndexedDB preserves the non-exportable key across reloads on the same origin; a helper restart creates a new epoch and can automatically provision a fresh key/delegation from the new one-use launch fragment.

### Remote pairing

Remote listening is disabled by default and is never enabled by `git-stacks web`. An administrator explicitly enables an address and creates a short-lived one-use pairing bundle containing the endpoint, stable service public identity and fingerprint, current signed certificate hashes, requested scopes, expiry, and pairing token.

The bundle is transferred out of band as a protected file or through stdin. It is not accepted as a command-line argument, URL query, workspace field, or log value. The local pairing command displays the same short fingerprint as the remote service for manual comparison, generates a helper key, opens the pinned encrypted carrier, consumes the token, and registers the helper public key and scopes. Subsequent connections use fresh challenges signed by the helper key; no bearer token is reused.

### Browser delegation and helper epochs

The local helper signs short-lived browser delegations bound to the service audience, exact localhost origin, browser public key, scopes, helper epoch, issue time, and expiry. The remote authority knows the paired helper public key, independently verifies the delegation and a fresh browser proof, and rejects replay, scope expansion, wrong origin, inactive epoch, and old-port takeover.

The helper registers a random epoch, heartbeats it, revokes it before releasing the localhost listener on clean shutdown, and lets it expire irreversibly after a bounded abrupt-loss grace. A helper restart creates a new epoch and new delegations.

### Session and carrier boundary

The shared client/session layer exposes authenticated logical streams rather than HTTP concepts:

```ts
interface SecureSessionCarrier {
  readonly peer: AuthenticatedPeer
  open(kind: ChannelKind, options?: StreamOptions): Promise<SecureDuplex>
  incoming(): AsyncIterable<SecureIncomingStream>
  close(reason: CloseReason): Promise<void>
}
```

The carrier is responsible for encryption, server pinning, ordered stream bytes, pressure, cancellation, and close. The protocol/session layer owns canonical framing, negotiation, challenge transcripts, scopes, replay sequences, stream kinds, and limits. Domain/service layers continue owning workspace state, operations, signals, PTYs, terminal retention, visibility, and process lifecycle.

No caller may obtain a classified protocol client from a carrier that has not completed encryption, pin validation, peer authentication, and protocol negotiation.

## Dependencies and portability

The validated WebTransport implementation is `@fails-components/webtransport` and its quiche transport at exact version 1.6.6. It is BSD-3-Clause, supports Node 20+, was current on 2026-07-15, and publishes native support for Linux and macOS on x64 and arm64. `@peculiar/x509` 2.0.0 is MIT and `reflect-metadata` 0.2.2 is Apache-2.0. `npm audit --omit=dev` reported zero known vulnerabilities. The complete runtime license set is permissive and compatible with an MIT project when required notices are retained.

The quiche package is a native addon and includes a deprecated `prebuild-install` transitive installer. That does not invalidate the architecture, but it makes dependency governance a release gate: pin exact versions and integrity, allow only the reviewed install script, retain third-party notices, prohibit compiler fallback on supported platforms, verify published artifacts in CI, and repeat maintenance/vulnerability review on every update.

Actual Linux arm64 and modern macOS x64/arm64 runtime jobs remain release gates. The implementation must not claim those platforms from package metadata alone.

## Required production rules

- Classify every protocol channel. Classified channels require an authenticated `SecureSessionCarrier`; plaintext adapters cannot implement that interface.
- Remove current HTTP API, SSE, and WebSocket classified paths after cutover. Do not retain a compatibility fallback.
- Keep static HTTP responses immutable, CSP-restricted, non-sensitive, and free of runtime configuration endpoints.
- Use strict canonical frames, pre-allocation size checks, stream/principal/global quotas, monotonic replay state, and bounded terminal retention.
- Redact pairing tokens, private keys, delegations, terminal bytes, certificate material, proof signatures, and detailed authorization failures from logs.
- Prefer macOS Keychain and a maintained Linux secret-store adapter for durable helper/service keys; use an atomic mode-`0600` fallback with an explicit same-user threat limitation.
- Treat endpoint compromise, browser extensions with page privileges, ptrace/debug access, and same-user malware as outside transport confidentiality. The guarantee is against passive recording and active network/localhost interception between uncompromised endpoints.

## Conclusion

The complete approach is feasible. WebTransport is the primary service carrier, including Node helper-to-remote authority. Pinned TLS is a narrow local adapter required only because the optional TUI runs under Bun. Both implement one secure session contract, and neither permits classified plaintext. This supersedes Spike 015's Bun-era recommendation to make a TLS relay the first remote carrier.
