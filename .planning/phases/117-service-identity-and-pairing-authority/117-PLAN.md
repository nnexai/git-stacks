---
phase: 117
status: planned
depends_on: [116]
requirements: [TRUST-01, TRUST-02, TRUST-03, TRUST-04]
---

# Phase 117 Plan: Service Identity and Pairing Authority

## Objective

Implement durable authority/helper identity, protected credentials, explicit remote exposure, and one-use pairing without yet routing product operations remotely.

## Work packages

1. Add stable P-256 service/helper identities, key-store abstraction, macOS Keychain and Linux secret-service adapters, atomic mode-`0600` fallback, migration, backup/reset, and redacted diagnostics.
2. Add 10-day WebTransport certificate generation, signed monotonic endpoint/pin sets, overlapping rollover state, expiry alarms, and stable-identity trust reset.
3. Add disabled-by-default remote listener configuration and pairing create/accept/revoke/list commands using protected file/stdin input, short expiry, scopes, rate limits, fingerprint comparison, and one-use consumption.
4. Add target trust records separate from workspace definitions and private-key references separate from public metadata.

## Verification

Test permissions, atomic recovery, wrong user-visible fingerprint, token replay/expiry, scope tampering, argv/log redaction, identity reset, signed rollover/rollback, and unavailable key-store fallback. Pairing exposes no workspace or service data before success.

## Completion gate

Two machines can establish and retain trust once, but no product channel is enabled until secure carriers and authorization land.
