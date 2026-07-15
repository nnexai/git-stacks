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

Every request, snapshot, event, signal, operation, terminal control, terminal input byte, and terminal output byte travels inside one of those encrypted carriers. The retained integration probe used loopback HTTP for static assets, but the subsequent adversarial review and Spike 021 remove executable HTTP bootstrap from the production architecture. Unsupported secure transport fails closed; there is no plaintext fallback.

## Proven topology

```text
local browser
  installed self-contained file client
  WebTransport: authenticated API/events/terminals
             |
             v
local Node helper/authority
  ^                  |
  | TLS 1.3          | WebTransport
  |                  v
Bun/OpenTUI      paired remote Node authority
```

In local mode the helper is also the authority. In remote mode it retains the paired target and helper identity. After the adversarial browser-storage review, the selected production topology keeps the browser connected only to the local helper; the helper relays typed channels to the remote authority over WebTransport. The TUI remains connected to the helper over TLS and uses the same remote connector. Both hops remain encrypted, while no durable remote trust reaches browser code.

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
8. Spike 021 subsequently loaded a packaged `file:` probe as a secure Chrome context and completed a pinned bidirectional WebTransport stream, removing the retained probe's unauthenticated executable HTTP delivery from the selected architecture.

The earlier focused spikes remain part of the proof set:

- Spike 012 validated non-exportable browser P-256 keys, exact-origin grants, one-use launch pairing, and challenge proof. Its persistent-key option is retained only as adversarial evidence, not as the selected architecture.
- Spike 013 proved a hostile exact-origin process can recover and invoke an IndexedDB key. Its epoch rejection validated the threat, and the production design now removes browser persistence and direct remote browser authority entirely.
- Spike 014 validated independent WebTransport terminal streams, 16–48 MiB transfer, backpressure, visible-only bulk output, bounded replay, reconnect/reset, and cancellation.
- Spike 015 independently validated Bun `node:tls` private-CA enforcement and wrong-authority rejection.

## Security architecture

### Stable identity and rotating transport certificates

Each authority has a stable P-256 signing identity. Pairing pins that identity, not a long-lived transport leaf. WebTransport listeners use X.509v3 ECDSA P-256 certificates valid for at most ten days. Before expiry, the authority starts an overlapping listener and signs the next endpoint and certificate-hash set with the stable identity. Authenticated clients verify and persist the update before reconnecting. The old listener remains available for a bounded rollback window, then closes.

Changing the stable service identity is a trust reset and requires explicit re-pairing. A certificate rollover signed by the already paired identity does not.

### Local bootstrap

`git-stacks web` starts or discovers the local Node helper, provisions its short-lived certificate, atomically binds loopback WebTransport, and opens the self-contained installed browser asset as a `file:` URL whose fragment contains the one-use local bootstrap token and current certificate hash. The page clears the fragment with `history.replaceState`, establishes pinned WebTransport, consumes the token inside encryption, creates an ephemeral non-exportable browser key in document memory, and receives a short-lived local grant. No executable browser code is fetched from the service.

Every invocation issues a fresh local bootstrap. Reload, restored history, browser restart, or a new document cannot reuse authority and must be launched again through `git-stacks web`. This remains non-interactive; shells, targets, preferences, terminal cursors, and replay state persist in the helper/service and are restored after fresh authentication.

### Remote pairing

Remote listening is disabled by default and is never enabled by `git-stacks web`. An administrator explicitly enables an address and creates a short-lived one-use pairing bundle containing the endpoint, stable service public identity and fingerprint, current signed certificate hashes, requested scopes, expiry, and pairing token.

The bundle is transferred out of band as a protected file or through stdin. It is not accepted as a command-line argument, URL query, workspace field, or log value. The local pairing command displays the same short fingerprint as the remote service for manual comparison, generates a helper key, opens the pinned encrypted carrier, consumes the token, and registers the helper public key and scopes. Subsequent connections use fresh challenges signed by the helper key; no bearer token is reused.

### Ephemeral browser grants and listener epochs

The local helper issues short-lived browser grants bound to the browser-listener epoch, ephemeral browser public key, target ceiling, scopes, protocol/build, issue time, and expiry. The browser proves possession against a fresh helper challenge and talks only to that helper. Its opaque request origin is checked only as defense in depth, never identity. The remote authority authenticates the paired helper, never a browser credential.

The helper manages separate browser-listener and remote-helper epochs. Loss of the local browser WebTransport listener invalidates grants before releasing the socket; browser closure does not end the remote helper connection or service-owned shells. A helper restart creates a new remote epoch and every browser document receives a new local listener epoch/grant.

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
- Remove every current HTTP route plus classified SSE/WebSocket paths after cutover. Do not retain a compatibility or executable-bootstrap fallback.
- Build the web client as one installed self-contained asset with restrictive CSP hashes and no remote executable resources, runtime configuration, or browser persistence.
- Use strict canonical frames, pre-allocation size checks, stream/principal/global quotas, monotonic replay state, and bounded terminal retention.
- Redact pairing tokens, private keys, browser grants, terminal bytes, certificate material, proof signatures, and detailed authorization failures from logs.
- Prefer macOS Keychain and a maintained Linux secret-store adapter for durable helper/service keys; use an atomic mode-`0600` fallback with an explicit same-user threat limitation.
- Treat endpoint compromise, browser extensions with page privileges, ptrace/debug access, and same-user malware as outside transport confidentiality. The guarantee is against passive recording and active network/localhost interception between uncompromised endpoints.

## Conclusion

The complete approach is feasible. WebTransport is the browser-to-local-helper and Node-helper-to-remote-authority carrier. Pinned TLS is a narrow local adapter required only because the optional TUI runs under Bun. The browser is ephemeral and the local Node helper is the only paired remote principal. All adapters implement one secure session contract, and none permits classified plaintext. This supersedes Spike 015's Bun-era carrier recommendation and the earlier persistent/direct browser design.
