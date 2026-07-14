---
spike: 012-delegated-browser-identity
status: validated
date: 2026-07-14
---

# Spike 012: Delegated Browser Identity

## Verdict

**VALIDATED** — a durable localhost helper identity can delegate a short-lived browser key without exposing the helper private key or making the browser itself the durable trust anchor. The browser can persist a non-exportable P-256 `CryptoKey` in IndexedDB, prove possession against fresh service challenges, and reconnect while its delegation remains valid.

This validates the identity protocol independently of WebTransport. The retained prototype uses a WebSocket only as a replaceable framed carrier; the same authentication messages can run after WebTransport encryption is established.

## Validated Flow

```text
explicit launch pairing fragment (one use)
  -> HttpOnly, SameSite=Strict local browser principal
  -> browser creates non-exportable P-256 key in origin-scoped IndexedDB
  -> local helper signs a short-lived delegation
       [service audience, browser origin, browser key, scopes, issued, expires]
  -> service verifies helper signature and sends a fresh nonce
  -> browser signs [delegation id, nonce, service audience]
  -> service verifies possession and consumes the challenge
```

The helper signing identity survives helper restarts. Its private key is never sent to browser JavaScript. In the prototype it is written atomically to a mode `0600` file; production should use an operating-system credential store when available and retain a narrowly scoped `0600` fallback.

## Browser Results

Chrome 150 passed all 11 checks against the running Bun prototype:

1. Durable helper identity file has mode `0600`.
2. The browser private key reports `extractable: false`, and PKCS#8 export fails.
3. IndexedDB restores the same `CryptoKey` and the restored private key can sign.
4. A page on a different localhost port cannot see the stored key.
5. The consumed launch pairing code cannot be exchanged again.
6. The paired browser principal is not visible to `document.cookie`.
7. A valid helper-signed delegation plus proof of key possession authenticates.
8. The same unexpired delegation reconnects through two fresh challenges.
9. Changing a signed scope invalidates the helper signature.
10. An expired delegation is rejected.
11. Reusing a consumed challenge proof is rejected.

Reloading the same browser origin restored the browser key and resumed through its HttpOnly principal without placing another secret in the URL. Restarting the helper retained the exact helper identity while issuing a new service audience.

## Security Properties

- Delegations are audience-, origin-, key-, scope-, and time-bound.
- Signed structures use fixed canonical arrays rather than relying on object property ordering.
- Every connection receives a cryptographically random, one-use challenge.
- Pairing codes are random, one-use, removed from browser history, and compared by digest.
- The bootstrap principal is HttpOnly and SameSite=Strict.
- Browser routes enforce exact Host and Origin expectations, reject cross-site Fetch Metadata, disable caching, and serve a restrictive CSP.
- The browser private key cannot be exported through WebCrypto.
- Different localhost ports are different origins and therefore have separate IndexedDB databases.

## Important Boundaries

- Non-exportable does not mean non-invocable. Malicious JavaScript executing on the same origin could ask WebCrypto to sign with the key. Production still requires exclusive origin ownership, a strict CSP, trustworthy static assets, and no third-party scripts.
- Filesystem mode `0600` protects against other users, not malware running as the same user. A production helper should prefer Keychain on macOS and a suitable system secret store on Linux where available.
- IndexedDB availability is origin-based, not application-based. Another process that later binds the same scheme, host, and port could invoke the old key. Short token lifetime limits this window, but clean and abrupt helper-session revocation must close it; Spike 013 validates that behavior.
- The service audience in this harness is per-process. A real remote service has a stable paired identity, while each active local helper session contributes a separately revocable epoch.
- The prototype verifier and helper run in one process for observability. In deployment, the remote service stores the paired helper public identity and independently verifies delegations.

## Dependency and Portability Review

The runtime uses only Bun's standard APIs, Node-compatible standard modules, and browser WebCrypto/IndexedDB. There are no runtime package dependencies, native addons, subprocesses, Linux-specific paths, or command-line cryptography tools.

The only development packages are TypeScript (Apache-2.0) and `@types/bun` (MIT). `bun audit` reports no known vulnerabilities. Both licenses are compatible with this MIT project, and no additional attribution-bearing runtime code is redistributed by the prototype.

The design uses standardized browser primitives: [`CryptoKey`](https://developer.mozilla.org/en-US/docs/Web/API/CryptoKey), [WebCrypto](https://www.w3.org/TR/WebCryptoAPI/), [IndexedDB](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API), cookies, and WebSocket framing. It does not depend on a Linux ABI and is suitable for modern macOS on both Apple Silicon and Intel. Production keychain integration should itself be an adapter so macOS and Linux can use native credential stores without changing the delegation protocol.

## How to Run

```bash
cd .planning/spikes/012-delegated-browser-identity
bun install --frozen-lockfile
bun run check
bun run start
```

Open the printed URL containing `#pair=...`, then select **Run all checks**. Reloading the cleaned URL demonstrates key and principal restoration. Restarting the server demonstrates durable helper identity.

## Observability

The page renders every positive and negative test and emits structured `WT012` records to its forensic log and browser console. The service emits JSON records for pairing consumption, delegation issuance, challenge issuance, authentication success or rejection, replay rejection, startup identity, and shutdown.

The identity file is intentionally ignored by Git. Its helper ID and permission mode are exposed to the test page, but its JWK contents are never served.

## Investigation Trail

1. Created a durable P-256 helper signing identity with atomic, permission-restricted storage.
2. Added one-use fragment pairing and a script-inaccessible browser principal.
3. Generated a non-exportable browser key and stored the structured-cloneable `CryptoKeyPair` in IndexedDB.
4. Bound helper-signed delegations to service, browser origin, key, scopes, and expiry.
5. Proved browser key possession over a fresh challenge and rejected proof replay.
6. Exercised signature tampering, expiry, pairing replay, and different-port origin isolation in Chrome.
7. Reloaded the browser and restarted the service to verify the intended persistence boundaries.
8. Audited dependencies, licenses, vulnerabilities, native requirements, and modern macOS portability.

## Resulting Architecture Constraint

The durable local helper identity is the client trust anchor. Browser state is an ephemeral, scoped delegate:

```text
OS-protected helper identity
  -> explicit pairing with remote service identity
  -> revocable helper-session epoch
  -> short-lived browser-key delegation
  -> fresh proof of possession per encrypted connection
  -> authorized shared service protocol
```

The next spike must make the helper-session epoch authoritative, prove immediate clean-shutdown revocation, bound abrupt-loss revocation, and demonstrate that a process taking over the old localhost port cannot reuse the old browser key.
