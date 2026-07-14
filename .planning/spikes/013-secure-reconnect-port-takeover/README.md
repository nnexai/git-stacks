---
spike: 013-secure-reconnect-port-takeover
status: validated
date: 2026-07-14
---

# Spike 013: Secure Reconnect and Port Takeover

## Verdict

**VALIDATED** — a remote service can distinguish a live delegated browser from stale same-origin browser state by requiring every delegation to belong to an active helper-session epoch. Browser reconnect remains seamless while the helper is live, abrupt helper loss is bounded by a short heartbeat grace period, and clean helper shutdown revokes access before releasing the localhost port.

The decisive adversarial test used a separate process to bind the exact scheme, host, and port after the legitimate helper stopped. Chrome exposed the old origin's IndexedDB key handle and the hostile page successfully invoked that non-exportable private key. The remote service still rejected the otherwise valid delegation because its helper epoch had already been revoked.

## Validated State Model

```text
paired durable helper identity
  -> register random helper-session epoch with remote service
  -> authenticated heartbeat keeps epoch active
  -> browser delegation includes signed epoch
  -> fresh proof succeeds only while epoch is active

clean helper shutdown
  -> authenticated epoch revocation acknowledged
  -> then release localhost listener

abrupt helper loss
  -> no heartbeat
  -> bounded grace expires
  -> epoch becomes permanently expired
```

Epochs are monotonic states: `active -> revoked` or `active -> expired`. Neither state can become active again. A helper restart creates a new random epoch and requires fresh browser delegations.

## Results

Chrome 150 passed nine live checks:

1. A valid delegation authenticates while its epoch is live.
2. The same short-lived delegation reconnects through fresh per-connection challenges.
3. A brief heartbeat interruption remains reconnectable inside the configured grace window.
4. The remote service rejects the delegation after abrupt-loss grace expires.
5. A fresh helper epoch authenticates without reviving the expired epoch.
6. The durable helper identity remains permission-restricted and requires no native dependency.
7. A separate process on the exact old localhost origin recovers the IndexedDB key and delegation.
8. That hostile same-origin page can invoke the non-exportable private key.
9. The remote service rejects the resulting authentication because clean shutdown revoked the epoch before port release.

The server event trail independently recorded live accepts, heartbeat cessation, expiry, new-epoch registration, stale-epoch rejection, clean revocation, attacker port binding, and revoked-epoch rejection.

## Security Decisions

- A random localhost port is not an identity or authorization boundary.
- IndexedDB and an HttpOnly cookie are both exposed to a future server process that acquires the exact origin. Neither can be a durable remote credential.
- The durable helper key authenticates epoch registration and revocation; browser keys are short-lived delegates only.
- The remote service owns epoch state. A browser cannot reactivate an expired or revoked epoch.
- Every connection still proves key possession against a fresh nonce. Epoch liveness supplements rather than replaces challenge replay protection.
- Clean shutdown revokes before closing the listener. Releasing the port first creates an avoidable takeover race.
- Abrupt loss must fail closed after a deliberately short grace period. The prototype uses one second for test speed; production should derive the interval from measured reconnect behavior and expose the policy explicitly.
- A localhost helper principal authorizes only the currently running helper API. It must never be accepted by the remote service and must rotate on helper restart.

## Protocol Requirements for Production

The paired remote service stores the durable helper public identity. Epoch control messages use that identity over the encrypted control channel:

- `epoch.register`: helper ID, random epoch, issued time, protocol version, service audience.
- `epoch.heartbeat`: helper ID, epoch, monotonic sequence, service challenge or channel binding.
- `epoch.revoke`: helper ID, epoch, reason, monotonic sequence.
- `browser.delegate`: service audience, helper epoch, exact localhost origin, browser key, scopes, issued time, expiry.

All messages need canonical framing, signatures or an already mutually authenticated channel, replay rejection, sequence validation, and bounded clocks. A network disconnect does not immediately prove helper death, which is why abrupt revocation uses a short lease rather than an unbounded idle timer.

Certificate rotation does not change this state model. A paired persistent service identity authorizes the next short-lived WebTransport certificate hash; reconnect then performs the same browser-delegation proof against the still-active helper epoch.

## Dependency, License, and Portability Review

The runtime has no package dependencies. It uses Bun, standard TypeScript/JavaScript APIs, P-256 WebCrypto, IndexedDB, and a separate `Bun.spawn` process for the hostile listener. There are no native addons, Linux-only syscalls, shell commands, architecture-specific binaries, or external cryptography tools.

Development dependencies are TypeScript (Apache-2.0) and `@types/bun` (MIT). Both are compatible with the project's MIT license. `bun audit` reports no known vulnerabilities. The design is portable to current Bun releases on modern macOS Intel and Apple Silicon as well as Linux; operating-system credential storage remains an adapter behind the helper identity interface.

## How to Run

```bash
cd .planning/spikes/013-secure-reconnect-port-takeover
bun install --frozen-lockfile
bun run check
bun run start
```

Opening the printed one-use URL runs the sequence automatically. The final state is served by the separate attacker process on the original helper origin.

## Observability

The service emits structured records for epoch registration, heartbeat stop, expiration, revocation, delegation issuance, authentication acceptance/rejection, attacker binding, and shutdown. The browser test records its aggregate result in `document.body.dataset` for automation. No private key or pairing secret is logged.

## Investigation Trail

1. Added service-owned helper epoch leases to the signed delegation from Spike 012.
2. Verified ordinary reconnect uses a fresh challenge while reusing an unexpired delegation.
3. Stopped heartbeats and tested both sides of a bounded grace period.
4. Registered a new epoch and confirmed the old state remained terminally expired.
5. Revoked the new epoch before stopping the helper listener.
6. Spawned a separate process to take over the identical localhost port.
7. Confirmed Chrome gave that process's page access to the previous origin's IndexedDB key handle.
8. Used the old non-exportable key in a real proof attempt and observed remote rejection due to the revoked epoch.
9. Removed inline scripts and unrelated console noise, then reran the complete browser and server trace.

## Resulting Architecture Constraint

The local helper must maintain an authenticated, leased control relationship with each remote service. Browser reconnect is authorized by the intersection of four independently checked facts:

```text
paired helper identity
AND active helper-session epoch
AND valid short-lived browser delegation
AND fresh browser proof of possession
```

No browser storage primitive or localhost port can replace any of those checks.
