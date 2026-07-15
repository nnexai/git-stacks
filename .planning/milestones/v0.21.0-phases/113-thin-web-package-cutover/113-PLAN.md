---
phase: 113
status: planned
depends_on: [112]
requirements: [WEB-01, WEB-02, CLIENT-01]
---

# Phase 113 Plan: Thin Web Package Cutover

## Objective

Move the shipped browser UI into an independently built browser-only package and prove full v0.20 behavior against the Node service.

## Work packages

### 1. Browser-only package

- Move Solid UI, styles, icons, xterm, and web assets into the web workspace.
- Consume protocol DTOs and browser-safe client APIs only; provide same-origin HTTP/SSE/WebSocket carrier adapters.
- Move shared event/replay, operation-progress, priority, and signal-presentation state into client when both web and TUI need identical semantics.
- Add package/bundle gates rejecting Node built-ins, core, service implementation, filesystem, process, and PTY imports.

### 2. Versioned asset serving

- Build deterministic hashed static assets and a manifest consumed by the service package.
- Serve immutable assets and no-store bootstrap HTML as appropriate.
- Negotiate protocol/client asset version and show a clear reload/upgrade state on mismatch.
- Preserve one-use pairing, HttpOnly principal, Host/Origin/Fetch Metadata checks, browser-safe projection, and quotas.

### 3. Functional parity

- Verify workspace-first sidebar, labels/repositories views, priority ordering, workspace creation, commands, operations, context menus, signals, and responsive layout.
- Verify multiple terminal tabs, title updates, focus restoration, exact sizing, hidden stream policy, reconnect/replay, close/exit, and ended command-shell behavior.
- Verify browser closure does not kill retained service terminals and reopening reattaches within retention bounds.
- Keep machine paths, launch environments, credentials, and service bearer material out of browser payloads/storage.

## Tests and evidence

- Web typecheck/unit tests in a browser-compatible environment.
- Dependency and generated-bundle audits.
- Playwright parity suite against a real Node service, including reload/browser-close reconnect scenarios.
- Security route suite for pairing replay, wrong origin/host/fetch metadata, expired principal, and protocol mismatch.
- Screenshot baselines at supported compact/default/wide layouts; changes are reviewed as migration parity, not redesign.

## Completion gate

- Web package has no machine-side imports.
- Node service serves version-matched assets and all v0.20 browser behavior passes.
- Shared client semantics exist in one package where reused by TUI.
- Legacy in-tree web build/source paths are removed or forwarding-only with Phase 115 removal entries.

## Rollback

Revert the static asset manifest and package move together. Service protocol remains unchanged, so retained terminals and state are unaffected.
