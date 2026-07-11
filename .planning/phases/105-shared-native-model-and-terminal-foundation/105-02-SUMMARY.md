---
phase: 105-shared-native-model-and-terminal-foundation
plan: 02
subsystem: native-model
tags: [zig, c-abi, json, fixtures, portability]

requires:
  - phase: 105-shared-native-model-and-terminal-foundation
    provides: Exact Zig 0.15.2 toolchain and offline native verification
  - phase: 104-workspace-service-and-event-contract
    provides: Canonical v1 schemas and golden fixture corpus
provides:
  - Strict product-owned v1 C ABI with opaque handles and bounded JSON interchange
  - Deterministic lifecycle, allocation, version, UTF-8, JSON, and identity failures
  - Byte-identical Phase 104 fixture export with Bun, Zig, and Linux C validation
  - Strict portable C11 public-header diagnostics with macOS runtime proof deferred
affects: [105-03, 105-04, 105-05, 107-macos-native-client]

tech-stack:
  added: []
  patterns: [opaque version-suffixed C ABI, product-owned byte allocation, checked golden fixture export]

key-files:
  created: [native/include/git_stacks_native_v1.h, native/core/identity.zig, native/core/contract.zig, native/core/abi.zig, native/tests/abi_harness.c]
  modified: [native/build.zig, scripts/verify-native.ts, package.json]

key-decisions:
  - "ABI interchange preserves caller-provided canonical v1 JSON bytes behind opaque model handles; no Zig or platform layout crosses the header."
  - "Destroyed handles retain a bounded tombstone for deterministic double-destroy and post-destroy rejection; owned payload bytes are released immediately."
  - "Phase 105 proves strict header portability but explicitly leaves actual macOS execution and parity to Phase 107."

patterns-established:
  - "ABI errors are returned as product-owned structured JSON allocations, never thread-local strings."
  - "Native fixture copies must remain byte-identical to tests/fixtures/service-v1 and are checked before compilation."

requirements-completed: [CORE-01, CORE-03, CORE-04]

coverage:
  - id: D1
    description: "Opaque v1 ABI rejects malformed, oversized, mismatched-version, invalid-identity, invalid-lifetime, and allocation-misuse calls deterministically."
    requirement: CORE-03
    verification:
      - kind: integration
        ref: "bun run native:test:model"
        status: pass
    human_judgment: false
  - id: D2
    description: "Canonical Phase 104 bytes validate in Bun and round-trip unchanged through the Zig-backed Linux C consumer."
    requirement: CORE-04
    verification:
      - kind: integration
        ref: "bun run native:test:model && bun run native:test:quick"
        status: pass
    human_judgment: false

duration: 10min
completed: 2026-07-11
status: complete
---

# Phase 105 Plan 02: Portable Native Contract Boundary Summary

**Opaque versioned C ABI with strict bounded contract decoding, explicit allocation ownership, and byte-identical Linux golden-corpus execution**

## Performance

- **Duration:** 10 min
- **Started:** 2026-07-11T13:08:00Z
- **Completed:** 2026-07-11T13:18:00Z
- **Tasks:** 2
- **Files modified:** 12

## Accomplishments

- Added strict workspace/repository, request, operation, and decimal revision identity validation without exposing internal enum or struct layouts.
- Added an opaque version-suffixed ABI whose structured errors, returned bytes, lifecycle state, and product-owned frees are tested across negative paths.
- Ran the canonical service-v1 corpus through Bun schema validation and the Linux Zig/C ABI while rejecting any byte-divergent native fixture copy.
- Added pedantic C11 Clang diagnostics for the platform-neutral header and documented that macOS runtime/parity proof belongs to Phase 107.

## Task Commits

1. **Task 1: Define strict native identities and the versioned opaque ABI** - `d298d376` (feat)
2. **Task 2: Run one canonical golden corpus on Linux and preserve macOS portability** - `6735fed8` (test)

## Files Created/Modified

- `native/include/git_stacks_native_v1.h` - Platform-neutral opaque ABI, statuses, byte buffers, and ownership functions.
- `native/core/identity.zig` - Strict UUID, prefixed opaque identifier, and decimal revision checks.
- `native/core/contract.zig` - Bounded UTF-8/JSON/protocol and known-identity validation.
- `native/core/abi.zig` - Model lifecycle, structured failures, byte ownership, and exported v1 symbols.
- `native/tests/abi_harness.c` - Linux ownership, negative-call, and canonical byte-parity harness.
- `native/tests/fixtures/` - Checked byte-identical export of the Phase 104 service-v1 fixtures.
- `native/build.zig` - Static model library, Zig tests, and C harness build target.
- `scripts/verify-native.ts` - Fixture drift, Bun schema, Clang portability, Zig, and Linux C orchestration.
- `package.json` - Focused native model verification command.

## Decisions Made

- Opaque handle tombstones make double destroy and post-destroy access deterministic instead of invoking undefined behavior; the potentially large JSON allocation is still freed on first destroy.
- Allocation frees are registry checked by pointer and exact length so foreign, altered-length, and duplicate frees fail safely.
- The checked fixture directory is an export, not a second source of truth; every verification compares it byte-for-byte with the Phase 104 corpus.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added the missing native model package entrypoint**
- **Found during:** Task 1 verification
- **Issue:** The plan required `bun run native:test:model`, but Plan 105-01 had not created that script.
- **Fix:** Added the package script and a verifier mode that runs the Zig/C model target.
- **Files modified:** `package.json`, `scripts/verify-native.ts`
- **Verification:** `bun run native:test:model`
- **Committed in:** `d298d376`

---

**Total deviations:** 1 auto-fixed (1 blocking issue)
**Impact on plan:** The entrypoint was required to execute the plan's own acceptance command; no product scope was added.

## Issues Encountered

- Zig run artifacts execute from the native package root, so fixture harness paths are package-relative. The harness was corrected before Task 2 was committed.

## User Setup Required

None beyond the Phase 105-01 `bun run native:setup` cache provisioning.

## Next Phase Readiness

- Plan 105-03 can add reducer and persistence behavior behind the stable opaque model boundary.
- Phase 107 has a platform-neutral header and harness but still owns actual macOS compilation, execution, and byte-parity evidence.

## Self-Check: PASSED

- Both task commits exist and all declared key files exist.
- `bun run native:test:model`, `bun run native:test:quick`, `bun run typecheck`, and `git diff --check` pass.
- The untracked Phase 106 planning directory was not touched.

---
*Phase: 105-shared-native-model-and-terminal-foundation*
*Completed: 2026-07-11*
