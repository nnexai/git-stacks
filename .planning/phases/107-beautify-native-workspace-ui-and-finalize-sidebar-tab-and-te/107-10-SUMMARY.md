---
phase: 107-beautify-native-workspace-ui-and-finalize-sidebar-tab-and-te
plan: 10
subsystem: native-linux-client
tags: [gtk, workspace-creation, synchronization, ghostty]
requires: [107-09]
provides: [zero-workspace-startup, native-creation-dialog, worker-owned-refresh, production-create-sync-smoke]
affects: [107-11, native-linux-client]
tech-stack:
  added: []
  patterns: [single-gaction-entry, worker-owned-http, main-context-owned-projection]
key-files:
  created: []
  modified: [native/linux/app.zig, native/linux/application.zig, native/linux/service_client.zig, native/linux/app_contract_test.zig, scripts/verify-native.ts, package.json]
decisions:
  - Workspace creation and snapshot HTTP are owned by background workers; GTK receives only owned decoded projection payloads.
  - Empty authoritative state constructs the full application shell without creating a Ghostty surface.
metrics:
  duration: 32m
  completed: 2026-07-12
status: complete
---

# Phase 107 Plan 10: Native Workspace Creation and Synchronization Summary

The production GTK client now starts usefully with zero workspaces, creates through one reusable Name/Branch/Source dialog, opens a registered shell after authoritative reconciliation, and refreshes outside mutations through a coalesced worker without network activity on GTK.

## Tasks Completed

1. Added `win.new-workspace`, Ctrl+Shift+N, header/menu/sidebar/empty-state entry points, optional initial terminal startup, and the reusable controller-backed creation dialog.
2. Added worker-owned creation polling and snapshot synchronization, main-context application, independent 30-second recovery, and cancellation/join-before-widget teardown.
3. Added `native:smoke-create-sync`, which drives the real production GAction/dialog callbacks from empty state and observes an outside-process authoritative update while retaining a registered Ghostty host.

## Verification

- `bun run typecheck` — passed
- `bun run native:build-app` — passed
- `bun run native:smoke-create-sync` — passed
- `bun run native:test:application-actions` — passed
- `bun run native:test:workspace-ui` — passed
- `bun run native:test:workspace-creation` — passed
- `bun run native:test:service-sync` — passed
- `bun run native:test:app-graph` — passed
- `bun run native:audit-production-graph` — passed
- `bun run native:test:quick` — passed

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Corrected the native workspace-create endpoint**
- **Found during:** Task 3 production fixture composition
- **Issue:** The client requested `/v1/workspaces`, while the authenticated service exposes workspace creation at `/v1/operations/workspace.create`.
- **Fix:** Updated the request and transport contract test to use the real operation endpoint.
- **Files modified:** `native/linux/service_client.zig`, `native/tests/service_client_test.zig`
- **Commit:** `cabd87ba`

**2. [Rule 3 - Blocking] Made the create/sync application non-unique**
- **Found during:** Task 3 production smoke
- **Issue:** An existing application registration could consume activation, causing the smoke process to exit without exercising callbacks.
- **Fix:** Added the focused smoke flag to the production non-unique application mode.
- **Files modified:** `native/linux/app.zig`
- **Commit:** `cabd87ba`

## Known Stubs

None.

## Self-Check: PASSED

All task commits and modified files exist, and the production binary, focused GTK smoke, controller/model, graph, synchronization, and combined quick gates pass.
