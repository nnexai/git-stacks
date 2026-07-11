---
phase: 105-shared-native-model-and-terminal-foundation
plan: 01
subsystem: native-build
tags: [zig, ghostty, provenance, supply-chain, terminal]

requires:
  - phase: 104-workspace-service-and-event-contract
    provides: Stable service contract that later native model plans consume
provides:
  - Exact Zig 0.15.2 platform artifact pins and offline provenance verification
  - Exact Ghostty v1.3.1 annotated tag and peeled source commit verification
  - Compile-time proof of the pinned full libghostty terminal surface API
affects: [105-02, 105-03, 105-04, 105-05, native-terminal]

tech-stack:
  added: [Zig 0.15.2, Ghostty 1.3.1 source pin]
  patterns: [repo-controlled native cache, fail-closed provenance gate, compile-only upstream API smoke]

key-files:
  created: [native/build.zig, native/build.zig.zon, native/deps/ghostty.lock, scripts/verify-native.ts]
  modified: [package.json]

key-decisions:
  - "Ordinary native verification is offline and consumes a setup-populated user cache whose artifact and checkout identities are revalidated before every compile."
  - "The feasibility spike imports the pinned full ghostty.h surface into a Zig object, proving API declarations without prematurely implementing or linking the later GTK host."

patterns-established:
  - "Native provenance gate: collect every compiler, artifact, repository, tag, commit, tree, and upstream-manifest mismatch before compilation."
  - "Exact API smoke: reference all required upstream seams at compile time from native/build.zig."

requirements-completed: [TERM-03]

coverage:
  - id: D1
    description: "Exact Zig and Ghostty pins fail closed before the native compile when compiler or source identity diverges."
    requirement: TERM-03
    verification:
      - kind: integration
        ref: "bun run native:test:terminal-build plus ambient-Zig and divergent-checkout negative invocations"
        status: pass
    human_judgment: false
  - id: D2
    description: "Pinned ghostty.h exposes every required full-surface terminal seam to Zig 0.15.2."
    requirement: TERM-03
    verification:
      - kind: integration
        ref: "bun run native:test:terminal-build"
        status: pass
    human_judgment: false

duration: 8min
completed: 2026-07-11
status: complete
---

# Phase 105 Plan 01: Exact Native Stack Feasibility Summary

**Checksum-locked Zig 0.15.2 and peeled Ghostty v1.3.1 provenance with an offline, fail-closed full-surface API compile gate**

## Performance

- **Duration:** 8 min
- **Started:** 2026-07-11T13:03:35Z
- **Completed:** 2026-07-11T13:11:06Z
- **Tasks:** 1
- **Files modified:** 5

## Accomplishments

- Pinned official Zig artifacts for Linux and macOS architectures, including exact SHA-256 provenance.
- Kept Ghostty's annotated `v1.3.1` tag object distinct from its peeled source commit and verified canonical origin, HEAD, tag peel, source tree, cleanliness, release version, and minimum Zig version.
- Compiled the pinned `ghostty.h` through Zig 0.15.2 while referencing create/free, draw, focus, size/content scale, input, mouse, IME, clipboard, child-exit, process-exit, and close-confirmation seams.
- Added setup, quick, focused terminal-build, and full native verification package entrypoints; ordinary verification performs no network access.

## Task Commits

Each task was committed atomically:

1. **Task 1: Run the exact-pin feasibility spike and freeze native provenance** - `202ba10` (feat)

## Files Created/Modified

- `native/build.zig` - Compile-only full libghostty surface API smoke using the exact checked-out header.
- `native/build.zig.zon` - Zig 0.15.2 minimum and native build package metadata.
- `native/deps/ghostty.lock` - Canonical repository, annotated tag, peeled commit, source tree, compiler, URL, and artifact checksum provenance.
- `scripts/verify-native.ts` - Explicit networked setup and offline fail-closed prerequisite/build orchestration.
- `package.json` - Native setup, quick-test, terminal-build, and verify commands.

## Decisions Made

- The native cache lives under the user's cache directory by default, with a test/CI override, so source and compiler payloads are not vendored while their identities remain repo-controlled.
- The first spike compiles the complete public embedding declarations as an object. Linking and real GTK lifecycle behavior remain owned by the later terminal-host plan.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added Zig package fingerprint and libc header linkage**
- **Found during:** Task 1 build smoke
- **Issue:** Zig 0.15.2 requires a package fingerprint and libc headers for `ghostty.h`; an executable-style smoke also tried to resolve upstream symbols before the host library existed.
- **Fix:** Added the suggested package fingerprint, enabled libc headers, and emitted a compile-only object so declarations are type-checked without claiming the later host link.
- **Files modified:** `native/build.zig`, `native/build.zig.zon`
- **Verification:** `bun run native:test:terminal-build`
- **Committed in:** `202ba10`

**2. [Rule 1 - Bug] Collected missing upstream manifest as a provenance diagnostic**
- **Found during:** Task 1 divergent-source negative verification
- **Issue:** A malformed checkout lacking `build.zig.zon` could throw a raw file error after other provenance failures.
- **Fix:** Made manifest absence another collected fail-closed diagnostic.
- **Files modified:** `scripts/verify-native.ts`
- **Verification:** Divergent-checkout negative invocation exits nonzero with all provenance mismatches.
- **Committed in:** `202ba10`

---

**Total deviations:** 2 auto-fixed (1 blocking issue, 1 bug)
**Impact on plan:** Both fixes were required for a truthful compile-only feasibility proof and clean fail-closed diagnostics; no terminal implementation scope was added.

## Issues Encountered

- The ambient Zig compiler is 0.16.0 as research predicted. The new verifier rejected it, while the official checksum-verified Zig 0.15.2 artifact passed.

## User Setup Required

Run `bun run native:setup` once on a new machine to populate the checksum-verified compiler and canonical source cache. All ordinary native verification is offline afterward.

## Next Phase Readiness

- Plans 105-02 through 105-05 can rely on an exact compiler path and immutable upstream source identity.
- The spike proves the named embedding API declarations; it intentionally does not claim GTK lifecycle, rendering, or interactive terminal acceptance before Plan 105-05.

## Self-Check: PASSED

- All five task files exist.
- Task commit `202ba10` exists.
- Positive native build, ambient compiler rejection, divergent source rejection, TypeScript typecheck, and diff hygiene passed.

---
*Phase: 105-shared-native-model-and-terminal-foundation*
*Completed: 2026-07-11*
