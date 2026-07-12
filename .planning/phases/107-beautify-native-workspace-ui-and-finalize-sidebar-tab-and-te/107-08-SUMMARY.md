---
phase: 107-beautify-native-workspace-ui-and-finalize-sidebar-tab-and-te
plan: 08
subsystem: native-service-creation
tags: [zig, service-client, workspace-creation, idempotency, replay]
requires: [107-03, 107-05, 107-07]
provides: [strict-native-creation-requests, replay-gap-recovery, gtk-free-creation-controller, focused-native-gates]
affects: [107-09, 107-10, native-ui]
key-files:
  created: [native/linux/workspace_creation.zig, native/tests/workspace_creation_test.zig]
  modified: [native/linux/service_client.zig, native/tests/service_client_test.zig, native/tests/fixtures/discovery.json, native/build.zig, scripts/verify-native.ts, package.json]
requirements-completed: [LNX-07, LNX-08, ACT-07]
completed: 2026-07-12
status: complete
---

# Phase 107 Plan 08: Native creation protocol and controller Summary

The native boundary now owns authenticated creation requests, idempotency and replay-gap recovery, while a GTK-free controller owns deterministic workspace form and operation state.

## Accomplishments

- Extended native requests with exact JSON content-type and idempotency headers, creation catalog/create/operation routes, strict native-model discovery limits, and server-cursor replay recovery.
- Added a bounded UTF-8 creation controller with template and repository selection, manual branch preservation, JSON writer encoding, frozen idempotency, and operation progress.
- Registered focused creation tests and included both creation suites in the offline native quick and full verification gates.
- Resolved the known discovery fixture drift against the canonical service fixture and explicitly distinguished the native-only ABI compatibility fixture.

## Task Commits

1. `481147ab` — extend native creation protocol and recovery tests
2. `235314b4` — add workspace creation controller and tests
3. `f8e0f2ed`, `49dd2c9f`, `8d122aec` — register and harden native verification gates

## Verification

- `bun run native:test:service-client` — passed
- `bun run native:test:workspace-creation` — passed
- `bun run native:test:quick` — passed, including model ABI, service client, creation controller, restore, lifecycle, and production graph audit

## Deviations from Plan

- [Rule 3 - Blocking] The documented discovery export drift blocked all wrapper-backed native tests. The native export was synchronized byte-for-byte with the canonical service fixture.
- [Rule 1 - Bug] Plan 107-07's native-only ABI fixture was incorrectly treated as a non-canonical service export; verification now distinguishes canonical exported fixtures from native-only compatibility fixtures.

## Self-Check: PASSED

All declared artifacts exist, task commits are present, and focused plus combined gates pass.
