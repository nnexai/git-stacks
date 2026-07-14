---
spike: 015-pinned-tls-helper-relay
status: validated
date: 2026-07-14
---

# Spike 015: Pinned TLS Helper Relay

## Verdict

**VALIDATED** — the current Bun service can securely relay web and TUI traffic to a remote git-stacks service over standard TLS 1.3 without public DNS, a public CA, a browser trust-store change, a Node sidecar, or a native package dependency.

The local service uses Bun's Node-compatible `node:tls` implementation with a connection-specific private CA. The private CA certificate is paired and stored by git-stacks; it is passed only to this connection and is never installed in the browser or operating-system trust store. Rotating server leaf certificates remain valid when signed by the paired service CA.

## Why This Is the Recommended First Carrier

```text
browser on localhost
  -> existing same-origin local HTTP/WebSocket adapter
  -> local git-stacks service/helper
  -> pinned TLS 1.3 shared protocol connection
  -> remote git-stacks service on private LAN

TUI
  -> same local service/helper and remote connector
```

The untrusted LAN sees only the TLS connection. The browser never has to validate the remote server's private certificate and therefore avoids the two-week WebTransport certificate rule and the current WebTransport server-runtime gap. Browser identity, helper epochs, replay protection, and terminal framing from Spikes 012–014 remain applicable above the carrier.

This design adds one loopback hop for the web client, which is consistent with the project's thin-client/service architecture. A privileged attacker already running on the client machine remains outside the network-attacker boundary; such an attacker could inspect the local process or browser regardless of loopback encryption.

## Results

The retained Bun 1.3.14 probe validated four properties:

1. A client configured with the paired private CA connected through a byte-recording TCP proxy and exchanged an exact 2 MiB terminal-like payload.
2. The negotiated connection used TLS 1.3 with `TLS_AES_128_GCM_SHA256`; the captured wire bytes did not contain the randomized plaintext marker.
3. Replacing the configured CA with a different valid private CA failed with `UNABLE_TO_VERIFY_LEAF_SIGNATURE`.
4. A newly generated 30-day leaf certificate signed by the same paired CA connected without another pairing step.

The probe generates a long-lived P-256 service CA and P-256 server leaves in TypeScript. The CA certificate is the durable service identity for transport verification; its private key remains server-side. Production pairing should display and compare a digest of that CA identity through an explicit out-of-band step.

## Bun API Finding

Do not use the native `Bun.connect({ tls: ... })` socket API for private-CA verification until a dedicated regression test passes on every supported Bun version. In this evaluation, `Bun.connect` with `ca: wrongCa` and `rejectUnauthorized: true` still opened and exchanged data with the server.

Bun's Node-compatible `node:tls.connect` path correctly rejected the wrong CA and is the validated implementation boundary. This must become a permanent negative integration test; a successful positive connection alone is insufficient evidence of pin enforcement.

## Pairing and Rotation

Initial remote pairing records:

- Stable remote service ID.
- Private CA certificate or its exact SPKI/certificate digest plus the certificate itself.
- Friendly server name used for hostname verification.
- Allowed scopes and local helper identity.

Normal TLS connections pass the paired CA directly as the `ca` option, require authorization, verify the configured server name, and require TLS 1.3. Leaf rotation does not modify trust because the new leaf chains to the same paired CA. Replacing the CA is an identity rotation and requires an explicit re-pair or a separately authenticated rollover protocol.

The CA private key should use an operating-system credential store or permission-restricted service state. It must not be exposed through browser JavaScript, URLs, logs, workspace files, or the web bundle.

## Shared Connector Boundary

The remote connector should live below both user interfaces:

```text
shared service core
  -> authenticated framed protocol
  -> RemoteConnector
       - connect paired service
       - TLS authorization and negative pin check
       - helper epoch registration/heartbeat/revocation
       - stream multiplexing, pressure, reconnect, cancellation
  -> carriers
       - pinned node:tls stream (production first)
       - WebTransport (future direct-browser option)
       - local IPC / current adapters
```

The browser continues using its local principal and delegated key. The local helper terminates that local authorization boundary and forwards only authorized protocol operations. The remote service independently validates helper identity, active epoch, scopes, and terminal ownership.

## Security Requirements

- Bind the remote listener to an explicitly configured interface and port; never expose it merely because web mode is enabled.
- Require explicit pairing before any workspace metadata, signal, terminal, or error detail is returned.
- Require TLS 1.3, hostname verification, the exact paired CA, and an application protocol version on every connection.
- Keep the wrong-CA rejection test in CI for each supported Bun release and platform.
- Use canonical length-prefixed frames with strict size and stream limits from Spike 014.
- Use the helper identity and epoch lease from Spikes 012–013; TLS server authentication does not authenticate the client.
- Rotate leaf certificates automatically; treat CA rotation as a security-sensitive identity change.
- Redact certificate material, pairing codes, terminal bytes, credentials, close details, and authorization failures from normal logs.
- Rate-limit pairing and authentication and make failures indistinguishable enough to avoid identity enumeration.

## Dependency, License, and Portability Review

The runtime dependencies are `@peculiar/x509` 2.0.0 (MIT) and `reflect-metadata` 0.2.2 (Apache-2.0). The network and TLS implementation comes from Bun's standard Node-compatible modules. There are no third-party native addons, OS cryptography commands, Linux-only syscalls, or architecture-specific artifacts.

`@peculiar/x509` was reviewed in Spike 011: it is established, actively maintained, has multiple maintainers and broad adoption. `bun audit` reports no known vulnerabilities. The dependency and transitive license set is compatible with the project's MIT license.

The selected APIs are available in Bun on Linux and modern macOS. The implementation does not pin Linux x64 artifacts. Actual macOS Intel and Apple Silicon runtime tests remain mandatory before remote mode is released.

## How to Run

```bash
cd .planning/spikes/015-pinned-tls-helper-relay
bun install --frozen-lockfile
bun run check
bun audit
bun run start
```

The probe exits nonzero if trusted connection, captured-wire secrecy, wrong-authority rejection, or leaf rotation fails.

## Overall Decision

Use the pinned TLS helper relay for the first remote client/server implementation. Keep direct browser WebTransport as a future adapter once its Bun/runtime dependency passes shutdown, platform, maintenance, and soak gates.

This route meets the stated threat model now: no public DNS, no public certificate, no installed browser CA, encrypted traffic across an untrusted local network, shared behavior for TUI and web, and a thin browser client.
