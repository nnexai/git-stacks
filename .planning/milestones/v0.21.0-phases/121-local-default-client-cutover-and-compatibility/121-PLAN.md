---
phase: 121
status: complete
depends_on: [120]
requirements: [ROUTE-01, ROUTE-02, ROUTE-03, ROUTE-04]
---

# Phase 121 Plan: Local-Default Client Cutover and Compatibility

## Objective

Cut web and TUI to secure target-aware sessions while preserving zero-configuration local use and a daemonless local CLI.

## Work packages

1. Make local target implicit in web/TUI and provision local certificates/tokens automatically; add deliberate paired-target selection and status without exposing trust material or persisting browser state.
2. Replace web HTTP/SSE/WebSocket API and terminal clients with the self-contained packaged client and secure session transport. Delete the service HTTP listener; unsupported-browser/readiness state renders locally without service data.
3. Replace TUI service client with TLS carrier plus shared authenticated session/reducers; preserve foreground exit, focus, dismiss, viewport, and terminal behavior.
4. Keep ordinary CLI commands direct-to-core. Isolate service exposure, pairing, targets, trust, and diagnostics under explicit commands.
5. Enforce relayed authorization as the intersection of local client grant, selected target, helper pairing scopes, operation type, and terminal ownership. Tag channels with an unforgeable helper-side local-session owner and prevent cross-browser/TUI attachment.
6. Delete all old HTTP routes, classified SSE/WebSocket routes, compatibility flags, cookie/IndexedDB/browser-storage principals, direct browser remote code, and duplicate transport reducers in the same phase.

## Verification

Run full web/TUI feature parity locally and against a paired LAN authority, shell-secret packet recording on both relay hops, fresh-launch browser restart and terminal reattach, hostile old-origin storage, hostile proxy/PAC, CLI-with-service-running atomic coherency, unsupported-browser fail-closed behavior, and packaged-bundle/import audits.

## Completion gate

Normal local launches remain one command; remote access needs one pairing ceremony; no product path can carry classified plaintext.
