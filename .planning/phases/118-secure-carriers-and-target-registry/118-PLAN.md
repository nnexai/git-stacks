---
phase: 118
status: planned
depends_on: [117]
requirements: [REMOTE-01, REMOTE-02, REMOTE-03, REMOTE-04, REMOTE-05]
---

# Phase 118 Plan: Secure Carriers and Target Registry

## Objective

Ship the two validated encrypted adapters and one target-aware authenticated session pool.

## Work packages

1. Add exact-pinned Node WebTransport server/client dependencies behind `SecureSessionCarrier`; enforce signed hashes, freshness, protocol negotiation, fresh helper proof, cancellation, pressure, reconnect, and deterministic shutdown.
2. Add browser-native WebTransport adapter with equivalent conformance behavior and no classified HTTP fallback.
3. Add private-CA TLS 1.3 local listener and Bun TUI adapter with hostname verification and `git-stacks/2` ALPN. The TUI never imports WebTransport native code.
4. Add implicit-local plus paired-remote target registry, connector/session pooling, bounded jitter, one live helper epoch per target, rotation handoff, and shutdown ownership.
5. Pin native artifacts/integrity, allow only the reviewed install script, retain notices, and wire supported-platform prebuild checks.

## Verification

Run shared carrier conformance plus wrong pin/CA/name/ALPN, unsigned/expired/rollback pin, pairing replay, challenge replay, disconnect races, 17+ reconnect soak, packet-marker secrecy, active-session shutdown, timer/socket leak, and bounded RSS tests under Node 24 and Bun.

## Completion gate

Authenticated empty protocol sessions work locally and remotely on every claimed platform with zero classified plaintext and zero leaked resources.
