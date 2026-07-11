---
phase: 106-linux-workspace-commands-and-attention
plan: 02
subsystem: native-linux
tags: [zig, attention, service-client, terminal-registry, persistence]
requires:
  - phase: 106-01
    provides: Authenticated native launch and structured attention service contracts
provides:
  - Normalized pair-bound workspace, repository, tab, pin, and presentation state
  - Pure derived attention aggregation with explicit identity-based focus routing
  - Authenticated replay-aware service adapter and navigation-independent host registry
affects: [106-03, linux-native-client]
key-files:
  created: [native/linux/service_client.zig, native/linux/tab_registry.zig, native/tests/attention_test.zig, native/tests/service_client_test.zig, native/tests/tab_registry_test.zig]
  modified: [native/core/model.zig, native/core/reducer.zig, native/core/persistence.zig, native/build.zig, scripts/verify-native.ts, package.json]
key-decisions:
  - "Native product state uses bounded copyable identity collections so reducer transitions remain pure and ABI-safe."
  - "A tab is appended to product state only after ownership-valid host registration succeeds."
  - "Service replay duplicates are ignored, sequence gaps require an authoritative refresh, and shutdown cancels later transport decoding."
requirements-completed: [LNX-01, LNX-02, LNX-03, LNX-04, LNX-05, ACT-01, ACT-02, ACT-03, ACT-04, ACT-05, ACT-06]
status: complete
completed: 2026-07-11
---

# Phase 106 Plan 02: Native State, Attention, Service, and Host Registry Summary

**Pair-local terminal state, structured attention, authenticated replay, and navigation-independent live-host ownership now share stable native identities.**

## Accomplishments

- Replaced the single-surface projection with normalized workspace/repository pairs, manual pins and ordering, deterministic selection fallback, pair-isolated surfaces, and ended-only presentation restoration.
- Added identity-addressed attention with derived unread severity, duplicate-safe receipt, explicit read semantics, diagnostic fallback routes, and a hard zero-focus invariant for asynchronous events and navigation.
- Added the Linux service state machine for authenticated discovery, snapshots, ordered replay, duplicate suppression, gap refresh, bounded reconnect, cancellation, compatibility failures, and strict fresh launch decoding.
- Added a pair-keyed host registry whose attach/detach lifecycle is independent from destruction and whose registration succeeds before a live tab is exposed.

## Task Commits

1. **Normalize pair-bound presentation state** — `0cee9173`
2. **Derive and route structured attention** — `0c915df3`
3. **Synchronize service and retain terminal hosts** — `e0d93b10`

## Verification

- `bun run native:test:restore` — passed
- `bun run native:test:attention` — passed
- `bun run native:test:service-client` — passed
- `bun run native:test:tabs` — passed
- `bun run native:test:quick` — passed, including ABI harness, model, restore, lifecycle, source-boundary, accessibility-contract, and production-graph checks
- `bun run typecheck` — passed
- `git diff --check` — passed

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Synchronized native contract fixtures**
- **Found during:** Task 2 verification
- **Issue:** Plan 106-01 expanded discovery capabilities and named launch data without updating the byte-identical native fixture export, blocking `native:test:model` and `native:test:quick`.
- **Fix:** Updated the native discovery and workspace snapshot exports to match the authoritative Phase 106 service fixtures.
- **Files modified:** `native/tests/fixtures/discovery.json`, `native/tests/fixtures/workspace-snapshot.json`
- **Verification:** `bun run native:test:quick`
- **Committed in:** `e0d93b10`

**2. [Rule 1 - Bug] Prevented decoded launch paths from borrowing parser storage**
- **Found during:** Task 3 implementation
- **Issue:** Returning a parsed JSON string slice would outlive its parse arena.
- **Fix:** Copied the validated cwd into a bounded owned launch value before returning.
- **Files modified:** `native/linux/service_client.zig`
- **Verification:** `bun run native:test:service-client`
- **Committed in:** `e0d93b10`

**Total deviations:** 2 auto-fixed (one blocking integration issue, one lifetime bug). **Impact:** Both fixes preserve the planned service contract and strengthen ownership correctness.

## Issues Encountered

The public model gate initially failed on stale Phase 106-01 fixture exports; no implementation blocker remains.

## Next Phase Readiness

Plan 106-03 can project normalized pair/tab/attention state into GTK and bind real Ghostty surfaces to the registry without navigation owning terminal lifetimes.

## Self-Check: PASSED

---
*Phase: 106-linux-workspace-commands-and-attention*
*Completed: 2026-07-11*
