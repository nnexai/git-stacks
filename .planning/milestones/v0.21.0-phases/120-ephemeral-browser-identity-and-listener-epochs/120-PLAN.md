---
phase: 120
status: complete
depends_on: [119]
requirements: [AUTH-01, AUTH-02, AUTH-03, AUTH-04, AUTH-05]
---

# Phase 120 Plan: Ephemeral Browser Identity and Listener Epochs

## Objective

Make every browser document a fresh, memory-only client loaded from the installed package so browser storage, executable HTTP substitution, origin reuse, reload, profile restore, or localhost port takeover can never become durable authority.

## Work packages

1. Replace runtime-config/static HTTP with one self-contained installed `file:` client and fragment bootstrap. Build CSP-hashed script/style into the asset, allow no remote executable resources, atomically bind local WebTransport before emitting the file URL, consume the token inside pinned WebTransport, and clear the fragment synchronously.
2. Generate a non-exportable ephemeral P-256 key only in document memory. Bind the local grant to browser-listener epoch, key, target ceiling, scopes, protocol/build, issue/expiry, and fresh challenge. Enforce one active connection plus a short renewable lease. Enforce loopback at the kernel bind; do not treat inconsistent browser/native peer or opaque-origin metadata as identity. A new document always requires a new launch.
3. Add one lifecycle/abort tree for the browser WebTransport listener, launch tokens, and browser sessions. Listener loss invalidates grants and closes browser channels before releasing the socket, independently of the remote helper epoch. Expire frozen, crashed, duplicated, or disconnected documents without ending service-owned shells.
4. Keep the browser connected only to the local helper. Route remote browser channels through the same paired Node WebTransport connector used by the TUI; never send remote credentials, pairing records, durable pins, or persistable delegations to browser code.
5. Remove all browser product persistence. Store preferences, target selection, terminal cursors, replay state, and reconnect metadata in the helper/service. Add a bundle/static-analysis gate forbidding cookies, IndexedDB, local/session storage, Cache Storage, OPFS, service/shared workers, and browser-side credential/target stores.
6. Keep the page inert until authenticated-session success. Add build/package integrity checks, meta no-referrer and restrictive CSP, loopback-only `connect-src`, no opener, frame-busting defense in depth, no source maps or runtime configuration, and no service HTTP listener.

## Verification

Use the actual packaged client in real-browser tests to seed attacker cookies, storage, IndexedDB keys, caches, OPFS, history state, and service workers on old localhost origins and prove none is consulted. Exercise hostile proxy/PAC settings, old-origin and old-port takeover, helper-alive/listener-dead injection, pre-bind/race, consumed-fragment replay, reload, BFCache/history restore, browser crash/restore, tab duplication, copied profile, fresh challenge, opaque-origin tamper, scope tamper, bundle corruption, and listener/helper epoch expiry. Instrument persistence APIs and fail on product reads/writes. Verify fresh launch reattaches service-owned shells without repeating remote pairing on Linux and modern macOS.

## Completion gate

The browser can be deleted at any time without losing product state, executable code is never loaded from a plaintext service route, and no browser-retained value or reused localhost origin can authenticate to the helper or remote authority.
