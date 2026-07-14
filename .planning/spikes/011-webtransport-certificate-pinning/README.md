---
spike: 011-webtransport-certificate-pinning
status: partial
date: 2026-07-14
---

# Spike 011: WebTransport Certificate Pinning

## Verdict

**PARTIAL** — the browser security mechanism is feasible and behaved correctly in a real modern browser, including over a private LAN address. A production-safe in-process implementation for the current Bun service is not yet available from a dependency that also clears the project's maintenance and trust bar.

The spike therefore validates the protocol direction, not a production dependency choice. WebTransport must remain behind a transport adapter until either Bun exposes a supported server API or an established implementation officially supports Bun without native-runtime failures.

## What This Validates

- A browser served from a random `http://127.0.0.1` origin can open a secure WebTransport session to a self-signed HTTP/3 endpoint by supplying the leaf certificate's SHA-256 DER hash.
- The exact pin succeeds; a one-byte-different pin fails during the TLS handshake.
- Reliable bidirectional streams carry arbitrary bytes and reconnect as independent sessions.
- The same localhost-served page connected to `https://192.168.50.22:<port>` on the untrusted LAN without a public hostname or browser CA installation.
- A 20-day certificate was rejected despite the correct hash, confirming that rotation must respect the specification's two-week maximum.
- Ten-day ECDSA P-256 certificates generated entirely in TypeScript work, avoiding an operating-system `openssl` dependency.
- The maintained reference transport publishes both `darwin-arm64` and `darwin-x64` prebuilds. Its 1.6.6 CI completed successfully on macOS, macOS ARM cross-build, Linux, Linux ARM, and Windows on 2026-07-12.

## What This Does Not Validate

- Safe in-process operation inside the Bun service. `@fails-components/webtransport` completed all browser checks under Bun 1.3.14, but shutdown with an active session produced a reproducible Bun segmentation fault. The same drain and shutdown completed normally under Node 26.5.0.
- Browser-to-service client authentication. Certificate hashes authenticate the server to the browser; the client still requires an encrypted application-level pairing/authentication handshake.
- Durable key delegation, IndexedDB behavior, certificate rotation across reconnects, terminal backpressure, or migration of the current SSE/WebSocket clients. Those belong to later spikes.
- A public product commitment to WebTransport. The WebTransport specification is still a Working Draft and the implementation boundary must remain replaceable.

## Dependency Review

| Candidate | License | Maintenance evidence | Runtime result | Decision |
|---|---|---|---|---|
| Bun built-in HTTP/3 | MIT | Maintained with Bun | HTTP/3 exists, but no documented server-side WebTransport session/stream API | Not sufficient |
| `@webtransport-bun/webtransport` 0.3.0 | MIT | One primary contributor; created 2026-02; last code push 2026-03; 367 npm downloads in the last month; project describes itself as still hardening | Passed Chrome/Bun pinning, streams, LAN, and shutdown checks; ships macOS arm64/x64 prebuilds | Rejected for production maturity |
| `@fails-components/webtransport` 1.6.6 | BSD-3-Clause plus compatible Chromium BSD and Envoy Apache-2.0 notices | Maintained since 2022; released 2026-07-12; 36,557 npm downloads in the last month; current multi-OS CI; multiple contributors | Passed all browser checks in Bun and Node; Bun crashed on active-session shutdown, Node did not | Acceptable reference under Node; not acceptable in-process under Bun |
| `@peculiar/x509` 2.0.0 | MIT | Maintained since 2020; seven npm maintainers; active repository; about 30 million npm downloads in the last month | Generated interoperable P-256 X.509v3 certificates in memory | Acceptable certificate layer |
| `reflect-metadata` 0.2.2 | Apache-2.0 | Mature specification polyfill published since 2015 | Required by the X.509 library's dependency injection layer | Acceptable |

`bun audit --audit-level=low` reported no known vulnerabilities. The installed JavaScript dependency licenses are MIT, ISC, BSD-2/3-Clause, Apache-2.0, 0BSD, BlueOak-1.0.0, and compatible multi-license expressions. If native binaries are ever redistributed inside git-stacks rather than installed as dependencies, their BSD and Apache notices must be reproduced in the distribution.

## Research

- The [WebTransport Working Draft](https://www.w3.org/TR/webtransport/) defines certificate-hash verification and requires custom certificates to be X.509v3, currently valid, no longer than two weeks, and interoperably supports ECDSA P-256 while excluding RSA.
- [MDN's constructor documentation](https://developer.mozilla.org/en-US/docs/Web/API/WebTransport/WebTransport) explicitly positions `serverCertificateHashes` for non-publicly-routable and ephemeral hosts.
- [MDN marks WebTransport Baseline 2026](https://developer.mozilla.org/en-US/docs/Web/API/WebTransport), while warning that some parts can still vary by browser.
- Bun documents experimental HTTP/3 support, but its HTTP server API does not expose WebTransport sessions or streams.
- The selected reference implementation is [`fails-components/webtransport`](https://github.com/fails-components/webtransport). It is more established than the Bun-specific candidate and publishes current macOS arm64/x64 native artifacts.

## How to Run

The retained reference harness intentionally runs the established transport in its supported Node runtime. Bun remains the package manager and typechecker.

It requires Node 22.6 or newer for native TypeScript type stripping.

```bash
cd .planning/spikes/011-webtransport-certificate-pinning
bun install --frozen-lockfile
bun run check
bun run start
```

Open the printed localhost URL and select **Run all checks**.

Useful boundary probes:

```bash
# Correct pin must still fail because the certificate exceeds two weeks.
CERT_DAYS=20 WT_PORT=4434 bun run start

# Serve bootstrap on loopback while WebTransport is addressed through the LAN.
WT_HOST=0.0.0.0 WT_TARGET_HOST=192.168.50.22 WT_PORT=4435 bun run start
```

## Observability

The page displays each positive or negative check and appends structured browser records to its forensic log. The server writes JSON events for readiness, accepted sessions, accepted/closed streams, session closure, and shutdown. Expected wrong-pin and overlong-certificate tests also appear as failed QUIC/TLS handshakes in browser diagnostics.

## Investigation Trail

1. Confirmed Bun 1.3.14 was already the latest stable release available on the machine.
2. Proved Bun's built-in HTTP/3 API lacks the server session/stream surface required by WebTransport.
3. Built and tested the Bun-specific native package. Correct pin, wrong pin, echo, reconnect, LAN addressing, and overlong certificate checks behaved correctly.
4. Rejected that package as a production choice after reviewing its age, maintainer concentration, low adoption, and self-declared hardening status.
5. Audited the established FAILS implementation: release history, current CI, contributors, download volume, native artifacts, lifecycle script, licenses, and vulnerabilities.
6. Confirmed its native addon loads in Bun after explicit lifecycle-script trust and that Chrome interop works.
7. Reproduced a Bun segmentation fault on shutdown with an active native session, including after explicitly closing and awaiting sessions.
8. Moved the retained harness to the package's supported Node runtime. Re-ran the full browser suite and active-session shutdown successfully.
9. Replaced command-line certificate generation with the maintained, MIT-licensed `@peculiar/x509` implementation so the harness and design do not depend on Linux tooling.

## Resulting Architecture Constraint

Treat WebTransport as one encrypted carrier for the shared service protocol:

```text
service core
  -> authenticated framed protocol
      -> WebTransport adapter (future production backend)
      -> local IPC adapter (TUI)
      -> current HTTP/SSE/WebSocket adapters during migration
```

The next spike can validate delegated browser identity over the framed protocol without blessing an unsafe transport dependency. A production WebTransport adapter must pass Linux and modern macOS runtime tests, active-session shutdown, reconnect, rotation, load/backpressure, license-notice, and dependency-health gates before integration.
