---
phase: 107-beautify-native-workspace-ui-and-finalize-sidebar-tab-and-te
plan: 07
subsystem: native-model
tags: [zig, attention, capacity, abi]
requires: [107-03, 107-06]
provides: [provider-aware-attention, capacity-diagnostics, orphan-tombstone-reserve]
affects: [107-08, 107-09, 108]
tech-stack:
  added: []
  patterns: [fail-closed-fixed-capacity, additive-abi-v1-fields, focus-neutral-receipt]
key-files:
  created: [native/tests/fixtures/abi-v1-attention-legacy.json]
  modified: [native/core/model.zig, native/core/reducer.zig, native/core/abi.zig, native/tests/reducer_test.zig, native/tests/attention_test.zig]
decisions:
  - Native collection limits mirror the service discovery contract and are compile-time bound to storage.
  - Attention duplicates use service IDs when present, with stable internal IDs retained for legacy callers.
metrics:
  duration: 35m
  completed: 2026-07-12
status: complete
---

# Phase 107 Plan 07: Native attention and capacity contract Summary

The portable Zig model now preserves Codex presentation data, reports bounded-state incompatibility without destroying the last safe snapshot, and handles full attention storage deterministically.

## Accomplishments

- Added named collection and UTF-8 byte limits with compile-time backing-storage assertions and independent orphan tombstone capacity.
- Added capacity failure diagnostics that retain product state and emit no focus or persistence effect.
- Added provider, title, detail, occurrence time, service ID, overflow count, additive ABI parsing, and canonical JSON projection.
- Added duplicate-service-ID updates, safe eviction, visible overflow, exact-read, Unicode, and focus-neutral regression coverage.

## Task Commits

- `26af45f0` — enforce native model capacity contract.
- `e0160160` — retain provider-aware native attention.

## Verification

- Direct Zig `model-test`: 9/9 build steps succeeded; 10/10 tests passed; native ABI harness passed.
- `bun run native:test:model` was additionally attempted and stopped before compilation on pre-existing exported discovery fixture drift introduced by the service-contract plan; the same model target passed when invoked directly with the pinned toolchain and Ghostty source.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Used the pinned model target directly around unrelated fixture-export drift**

- **Found during:** Overall verification
- **Issue:** The wrapper rejects a service discovery fixture export that predates this plan's files.
- **Fix:** Ran the identical Zig model target directly with the pinned Zig and Ghostty inputs, preserving the wrapper failure as explicit evidence.

## Known Stubs

None.

## Self-Check: PASSED

- All declared files exist.
- Both task commits exist in repository history.
- Model, attention, ABI, and C harness tests pass under the pinned native toolchain.
