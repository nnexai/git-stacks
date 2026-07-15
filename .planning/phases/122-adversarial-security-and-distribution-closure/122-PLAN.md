---
phase: 122
status: planned
depends_on: [121]
requirements: [SEC-01, SEC-02, SEC-03]
---

# Phase 122 Plan: Adversarial Security and Distribution Closure

## Objective

Prove the threat model, platform matrix, dependency posture, recovery paths, and user documentation before the v0.21 release candidate.

## Work packages

1. Add adversarial suites for passive recording, MITM/wrong identity, pair/proof replay, helper impersonation, pin rollback, epoch/port takeover, malformed/oversized frames, slow readers, disconnect races, enumeration, and redaction.
2. Add Linux x64/arm64 and macOS x64/arm64 jobs for Node 24 WebTransport, Bun TLS/TUI, credential stores/fallback, terminal soak, reconnect, rotation, clean shutdown, and packaged-install no-compiler proof.
3. Add exact native artifact/integrity/license/notice gates, dependency maintenance policy, vulnerability response, and WebTransport dependency replacement drill through the carrier abstraction.
4. Update security, pairing, remote operation, rotation/revocation/recovery, threat-boundary, troubleshooting, and emergency local-only documentation.
5. Run final code review, security review, full gates, clean-install UAT, and release-candidate checklist. Do not tag, push, or publish without explicit instruction.

## Completion gate

Every claimed platform and threat mitigation has retained evidence; no critical/high security finding or classified legacy route remains; v0.21.0-rc.1 is ready for explicit release approval.
