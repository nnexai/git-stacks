---
phase: 121
status: planned
depends_on: [120]
requirements: [ROUTE-01, ROUTE-02, ROUTE-03]
---

# Phase 121 Plan: Local-Default Client Cutover and Compatibility

## Objective

Cut web and TUI to secure target-aware sessions while preserving zero-configuration local use and a daemonless local CLI.

## Work packages

1. Make local target implicit in web/TUI and provision local certificates/tokens automatically; add deliberate paired-target selection and status without exposing trust material.
2. Replace web HTTP/SSE/WebSocket API and terminal clients with secure session clients. Retain HTTP only for immutable assets and non-sensitive unsupported-browser/readiness pages.
3. Replace TUI service client with TLS carrier plus shared authenticated session/reducers; preserve foreground exit, focus, dismiss, viewport, and terminal behavior.
4. Keep ordinary CLI commands direct-to-core. Isolate service exposure, pairing, targets, trust, and diagnostics under explicit commands.
5. Delete classified old routes, compatibility flags, cookies/principals made obsolete by delegation, and duplicate transport reducers in the same phase.

## Verification

Run full web/TUI feature parity locally and against a paired LAN authority, shell-secret packet recording, browser restart and terminal reattach, CLI-with-service-running atomic coherency, unsupported-browser fail-closed behavior, and bundle/import audits.

## Completion gate

Normal local launches remain one command; remote access needs one pairing ceremony; no product path can carry classified plaintext.
