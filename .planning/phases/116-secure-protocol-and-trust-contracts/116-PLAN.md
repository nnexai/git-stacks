---
phase: 116
status: planned
depends_on: [115]
requirements: [PROTO-01, PROTO-02, PROTO-03, PROTO-04]
---

# Phase 116 Plan: Secure Protocol and Trust Contracts

## Objective

Make confidentiality and authentication executable type/protocol invariants before adding credentials or listeners.

<threat_model>
trust_boundaries:
  - browser document -> local Node helper
  - local Node helper -> remote authority
  - Bun TUI -> local Node helper
  - untrusted browser origin storage -> fresh browser document
threats:
  - threat_id: BROWSER-01
    category: Information Disclosure / Elevation of Privilege
    component: browser origin persistence
    severity: critical
    disposition: mitigate
    mitigation_plan: prohibit browser persistence, use memory-only keys and fresh launches
  - threat_id: BROWSER-03
    category: Spoofing
    component: localhost listener lifecycle
    severity: high
    disposition: mitigate
    mitigation_plan: separate browser-listener epoch and revoke before socket release
  - threat_id: BROWSER-04
    category: Spoofing / Tampering
    component: stale service worker and origin reuse
    severity: critical
    disposition: mitigate
    mitigation_plan: packaged file client, no executable HTTP bootstrap, and no workers
  - threat_id: BOOTSTRAP-01
    category: Spoofing / Tampering
    component: executable browser bootstrap
    severity: critical
    disposition: eliminate
    mitigation_plan: self-contained installed file client and no plaintext service route
  - threat_id: BROWSER-10
    category: Elevation of Privilege
    component: direct browser remote authority
    severity: high
    disposition: eliminate
    mitigation_plan: browser talks only to local helper; paired helper relays remote channels
  - threat_id: TRANSPORT-01
    category: Information Disclosure
    component: classified protocol channels
    severity: critical
    disposition: mitigate
    mitigation_plan: authenticated encrypted carrier type gate and no plaintext fallback
</threat_model>

## Work packages

1. Add the binary envelope, canonical control codec, channel registry, request/stream IDs, sequences, limits, negotiation, and protocol conformance fixtures to `protocol`.
2. Define `EncryptedCarrier`, `SecureSessionCarrier`, `AuthenticatedSession`, logical channel, pressure/cancel/close, peer binding, and classified-channel types in `client`; plaintext adapters cannot satisfy classified interfaces.
3. Add threat model, data classification, transcript definitions, log-redaction schema, error taxonomy, browser-persistence prohibition, and downgrade/fail-closed rules. Treat [116-ADVERSARIAL-REVIEW.md](./116-ADVERSARIAL-REVIEW.md) as normative input.
4. Add architecture gates prohibiting classified HTTP/SSE/WebSocket routes and preventing core/domain imports from carrier packages.

## Verification

Property/fuzz tests cover fragmentation/coalescing, canonical round trips, pre-allocation limits, unknown kinds, sequence rollback, downgrade, malformed auth transcripts, and cross-carrier conformance. Negative TypeScript fixtures prove unauthenticated/plaintext carriers cannot construct classified clients. Browser architecture fixtures prove durable storage, executable HTTP bootstrap, and direct remote imports are forbidden.

## Completion gate

All later phases can implement against frozen contracts without inventing carrier-specific auth or terminal semantics.
