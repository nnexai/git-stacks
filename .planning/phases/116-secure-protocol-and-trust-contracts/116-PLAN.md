---
phase: 116
status: planned
depends_on: [115]
requirements: [PROTO-01, PROTO-02, PROTO-03, PROTO-04]
---

# Phase 116 Plan: Secure Protocol and Trust Contracts

## Objective

Make confidentiality and authentication executable type/protocol invariants before adding credentials or listeners.

## Work packages

1. Add the binary envelope, canonical control codec, channel registry, request/stream IDs, sequences, limits, negotiation, and protocol conformance fixtures to `protocol`.
2. Define `EncryptedCarrier`, `SecureSessionCarrier`, `AuthenticatedSession`, logical channel, pressure/cancel/close, peer binding, and classified-channel types in `client`; plaintext adapters cannot satisfy classified interfaces.
3. Add threat model, data classification, transcript definitions, log-redaction schema, error taxonomy, and downgrade/fail-closed rules.
4. Add architecture gates prohibiting classified HTTP/SSE/WebSocket routes and preventing core/domain imports from carrier packages.

## Verification

Property/fuzz tests cover fragmentation/coalescing, canonical round trips, pre-allocation limits, unknown kinds, sequence rollback, downgrade, malformed auth transcripts, and cross-carrier conformance. Negative TypeScript fixtures prove unauthenticated/plaintext carriers cannot construct classified clients.

## Completion gate

All later phases can implement against frozen contracts without inventing carrier-specific auth or terminal semantics.
