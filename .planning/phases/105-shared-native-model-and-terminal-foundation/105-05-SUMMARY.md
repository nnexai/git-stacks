---
phase: 105-shared-native-model-and-terminal-foundation
plan: 05
subsystem: native-infrastructure
tags: [ghostty, zig, gtk, abi, supply-chain]
requires:
  - phase: 105-01
    provides: Native build bootstrap and opaque product ABI
  - phase: 105-04
    provides: Independent terminal ownership and guard contracts
provides:
  - Immutable Limux Ghostty base plus hashed repository-owned process-control patch
  - Full rendered-surface ABI compile/link/runtime gate
  - Production executable linked to full libghostty with the competing terminal graph removed
affects: [105-06, 105-07, 105-08, linux-terminal]
tech-stack:
  added: [full libghostty app-runtime-none]
  patterns: [immutable-base-derived-tree, exact-abi-manifest, sole-terminal-owner]
key-files:
  created:
    - native/deps/ghostty-linux-process-control.patch
    - native/tests/ghostty_surface_abi.zig
  modified:
    - native/deps/ghostty.lock
    - native/build.zig
    - scripts/verify-native.ts
    - package.json
key-decisions:
  - "A pristine cached Limux base is never patched in place; every build consumes a disposable, hash-verified derived tree."
  - "Ghostty owns production rendering, configuration, and PTY behavior; prior product terminal modules remain outside the production graph."
patterns-established:
  - "Dependency provenance: verify base commit/tree, patch digest, derived file manifest, toolchain artifact, exports, and upstream drift separately."
  - "Linux GL embedding links the fork's glad loader source alongside libghostty."
requirements-completed: [TERM-03]
coverage:
  - id: D1
    description: Exact Limux Ghostty source and bounded process-control ABI are reproducible and drift-audited
    requirement: TERM-03
    verification:
      - kind: integration
        ref: bun run native:setup && bun run native:audit-ghostty && bun run native:test:surface-abi
        status: pass
    human_judgment: false
  - id: D2
    description: Native production executable links full libghostty without the superseded renderer or PTY stack
    requirement: TERM-03
    verification:
      - kind: integration
        ref: bun run native:test:surface-abi && bun run native:build-app && bun run native:audit-production-graph
        status: pass
    human_judgment: false
duration: 25min
completed: 2026-07-11
status: complete
---

# Phase 105 Plan 05: Full Ghostty Build Contract Summary

**Pinned full-surface Ghostty runtime with immutable derived-source provenance, guarded Linux process controls, and a single-owner production build graph**

## Performance

- **Duration:** 25 min
- **Started:** 2026-07-11T16:43:00Z
- **Completed:** 2026-07-11T17:08:29Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments

- Replaced release-tag `ghostty-vt` provenance with exact Limux commit `81ab8ffa90185221782baf785e85387321e16f8d`, Zig 0.15.2, and separate base/patch/derived hashes.
- Added process identity and guarded control exports using PID, PGID, and Linux `/proc` birth token checks without moving PTY creation out of Ghostty.
- Built and linked full `app-runtime=none` `libghostty.so`, audited its exports and upstream divergence, and removed the custom VT/Pango/PTY modules from the production build graph.

## Task Commits

1. **Task 1: Freeze and audit the validated Linux surface source** - `23cfcadc`, `ad152484`
2. **Task 2: Build and link full libghostty while excising the competing production stack** - `6e88c98f`

## Files Created/Modified

- `native/deps/ghostty.lock` - Exact base, patch, derived tree, toolchain, upstream, and ABI manifest.
- `native/deps/ghostty-linux-process-control.patch` - Bounded three-file Linux identity/control extension.
- `native/tests/ghostty_surface_abi.zig` - Compile/link/runtime API and identity rejection contract.
- `scripts/verify-native.ts` - Immutable setup, live drift audit, build/export checks, and graph audit.
- `native/build.zig` - Full library linkage, GL loader, ABI test, and independently retained ownership tests.
- `package.json` - Full-surface setup/audit/test command surface.

## Decisions Made

- The cache holds an immutable pristine base and a disposable derived checkout; a patched checkout is never treated as a dirty base failure.
- The ABI allows only SIGHUP, SIGTERM, and SIGKILL after exact PID/PGID/birth-token revalidation and rejects the client or guard process groups.
- `vendor/glad/src/gl.c` is linked by the host because Limux's `libghostty.so` intentionally leaves the GL loader symbols for its embedder.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added the embedder-owned GL loader**
- **Found during:** Task 1 ABI runtime verification
- **Issue:** `libghostty.so` intentionally retained unresolved `gladLoader*` symbols, matching Limux's host build, so the linked ABI test could not start.
- **Fix:** Compiled Ghostty's pinned `vendor/glad/src/gl.c` into the host ABI and application targets.
- **Verification:** `bun run native:test:surface-abi` passes.
- **Committed in:** `6e88c98f`

**2. [Rule 2 - Missing Critical] Required live upstream remote verification**
- **Found during:** Final provenance audit
- **Issue:** Recorded ahead/behind counts alone could not prove the currently configured upstream identity.
- **Fix:** Setup pins and fetches the official upstream remote; audit verifies the merge base and computes current counts without changing source files.
- **Verification:** `bun run native:setup && bun run native:audit-ghostty` reports merge base `a3aa9fa...` and `24/2069` ahead/behind.
- **Committed in:** `ad152484`

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 missing critical)
**Impact on plan:** Both changes complete required linkage and supply-chain guarantees without expanding product scope.

## Issues Encountered

- Calling configuration APIs before `ghostty_init` crashed by contract; the runtime ABI probe now initializes Ghostty once before exercising configuration lifecycle.
- Full ReleaseFast builds take roughly two to three minutes when setup recreates the disposable derived tree; process inspection confirmed active HarfBuzz compilation rather than a hang.

## User Setup Required

None.

## Next Phase Readiness

- Plan 105-06 can replace the temporary link-contract executable root with the GTK `GtkGLArea` surface host.
- Plans 105-06/07 can consume the pinned process identity/control exports and exact full-surface header.

---
*Phase: 105-shared-native-model-and-terminal-foundation*
*Completed: 2026-07-11*
