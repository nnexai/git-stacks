---
phase: 120
status: planned
depends_on: [119]
requirements: [AUTH-01, AUTH-02, AUTH-03, AUTH-04]
---

# Phase 120 Plan: Delegated Browser Identity and Helper Epochs

## Objective

Make browser access durable across reload/reconnect but unusable after helper loss, port reuse, origin change, or scope change.

## Work packages

1. Replace runtime-config HTTP with fragment bootstrap; consume token inside pinned local WebTransport and clear the fragment before rendering data.
2. Add non-exportable IndexedDB P-256 key management, helper-signed exact-origin/target/scope delegation, fresh service challenge proof, renewal, and explicit discard.
3. Add helper epoch register/heartbeat/clean revoke/abrupt expiry state and bind every delegation and session to it.
4. Connect remote browser directly through its delegated secure session; keep TUI remote routing through the helper and shared Node connector.

## Verification

Use real browser tests for reload, browser close/reopen, random-origin reprovision, fresh challenge, replay, expiry, scope tamper, wrong origin, clean port takeover, abrupt-loss grace, old IndexedDB recovery, and remote reconnect. Inspect HTTP requests and logs for token/pin/terminal leakage.

## Completion gate

The browser can safely reconnect without repeating remote pairing, and stale browser state cannot outlive helper authority.
