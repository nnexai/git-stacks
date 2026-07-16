---
phase: 125-terminal-safe-keyboard-navigation
plan: "03"
subsystem: client
tags: [shortcuts, fuzzy-search, attention, deterministic, tdd]

requires:
  - phase: 125-terminal-safe-keyboard-navigation
    plan: "01"
    provides: Canonical shortcut action, platform, binding, and settings types
provides:
  - Exact physical-code shortcut defaults, normalization, matching, display, and conflict semantics
  - One dependency-free weighted fuzzy scorer with deterministic active-result navigation
  - Resolvable active-only Next Attention candidate construction and traversal
affects: [125-04, 125-05, web-navigation, keyboard-overlays]

tech-stack:
  added: []
  patterns: [pure client semantics, structural keyboard events, weighted fuzzy tiers, validated attention projections]

key-files:
  created:
    - packages/client/src/shortcuts.ts
    - packages/client/src/fuzzy.ts
    - packages/client/src/attention.ts
    - tests/lib/client-shortcuts.test.ts
    - tests/lib/client-fuzzy.test.ts
    - tests/lib/client-attention.test.ts
  modified: [packages/client/src/index.ts]

key-decisions:
  - "The protocol action inventory is the only shortcut inventory; client metadata is derived in canonical order."
  - "Field weight dominates match tier, then fuzzy quality, recency on exact score ties, and stable ID."
  - "Attention signals naming absent or ended surfaces are skipped instead of degraded to repository targets."

patterns-established:
  - "Shortcut ownership: normalization returns data only; DOM/xterm boundaries decide whether to consume an event."
  - "Fuzzy callers supply fields, weights, recency, and default order while sharing one scorer and navigation contract."
  - "Attention selection validates current projected membership and live surfaces before returning a non-mutating target."

requirements-completed: [KEY-02, KEY-03, KEY-04, KEY-05, KEY-06, KEY-07, KEY-08, ATTN-01, ATTN-02]

coverage:
  - id: D1
    description: Exact layout-independent shortcut matching and complete conflict ownership
    requirement: KEY-02
    verification:
      - kind: unit
        ref: tests/lib/client-shortcuts.test.ts
        status: pass
      - kind: other
        ref: npm run typecheck -w @git-stacks/client
        status: pass
    human_judgment: false
  - id: D2
    description: Shared weighted partial-query ranking and active-result movement
    requirement: KEY-07
    verification:
      - kind: unit
        ref: tests/lib/client-fuzzy.test.ts
        status: pass
    human_judgment: false
  - id: D3
    description: Active resolvable Next Attention ordering, deduplication, and wrap
    requirement: ATTN-01
    verification:
      - kind: unit
        ref: tests/lib/client-attention.test.ts
        status: pass
      - kind: unit
        ref: tests/service/web-presentation.test.ts
        status: pass
    human_judgment: false

duration: 9min
completed: 2026-07-16
status: complete
---

# Phase 125 Plan 03: Pure Keyboard, Fuzzy, and Attention Semantics Summary

**The shared client now owns exact terminal-safe shortcut matching, real weighted fuzzy ranking, and stale-safe Next Attention traversal as deterministic pure functions.**

## Performance

- **Duration:** 9 min
- **Completed:** 2026-07-16
- **Tasks:** 3
- **Files modified:** 7

## Accomplishments

- Derived macOS `Control+Command` and Linux `Ctrl+Alt+Shift` defaults for all eight canonical actions, with physical-code matching, exact modifiers, composition/AltGraph rejection, optional familiar aliases, and complete primary/alias conflict ownership.
- Added a dependency-free fuzzy scorer with exact, prefix, word-boundary, contiguous, and subsequence tiers; workspace/repository/branch weights; recency-after-score ties; stable IDs; top-result activation; and wrapped list movement.
- Added active workspace/repository validation, stale or ended surface rejection, target deduplication, shared successor ordering, terminal tab ordering, deterministic representative selection, and non-mutating wrapped attention traversal.

## Task Commits

1. **RED: Shortcut semantics** - `77a7e236` (test)
2. **RED: Fuzzy ranking** - `89d5b110` (test)
3. **RED: Attention traversal** - `9d19c0f5` (test)
4. **Task 1: Safe shortcut matching** - `134977db` (feat)
5. **Task 2: Deterministic fuzzy ranking** - `0eee1e6a` (feat)
6. **Task 3: Resolvable attention traversal** - `1a208c89` (feat)

## Files Created/Modified

- `packages/client/src/shortcuts.ts` - Canonical client metadata, safe defaults, exact matcher, labels, and complete conflict validation.
- `packages/client/src/fuzzy.ts` - Shared weighted fuzzy scoring, deterministic ranking, and active-index movement.
- `packages/client/src/attention.ts` - Pure candidate validation, deduplication, ordering, and next-target selection.
- `packages/client/src/index.ts` - Public exports for all three modules.
- `tests/lib/client-shortcuts.test.ts` - Default, layout, modifier, composition, alias, conflict, and label evidence.
- `tests/lib/client-fuzzy.test.ts` - Match-tier, field-weight, tie-break, command, empty, and movement evidence.
- `tests/lib/client-attention.test.ts` - Scope, stale-surface, ordering, representative, wrap, empty, and non-mutation evidence.

## Decisions Made

- Familiar `Ctrl+K` and `Ctrl+Shift+P` aliases remain absent from defaults but are valid explicit aliases.
- A binding must use `KeyA` through `KeyZ` and at least one modifier before it can be matched.
- Ended, closing, and failed-cleanup terminal surfaces are not valid attention redirection targets.
- Repository-only attention sorts before terminal targets within the same repository; terminal targets then follow established tab order.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- The isolated worktree had no dependency installation, so focused verification used and then removed a temporary symlink to the main checkout's existing `node_modules`.
- The optional repository `verify:gates` probe could not close in the isolated unbuilt worktree because coverage and package `dist` artifacts were absent. The plan-required focused suites, client/protocol typechecks, architecture checks, and dependency gate all passed; the parent integration lane must run repository gates after merge/build.

## TDD Gate Compliance

- RED commits `77a7e236`, `89d5b110`, and `9d19c0f5` each failed because their target client exports did not yet exist.
- GREEN commits `134977db`, `0eee1e6a`, and `1a208c89` made the corresponding focused suites pass.

## User Setup Required

None.

## Next Phase Readiness

- Plan 04 can consume the exact matcher and attention selector from one web dispatcher without duplicating policy.
- Plan 05 can use the same scorer and active-index mechanics for workspace and command overlays, and the conflict metadata for binding capture.
- Real xterm pass-through and physical keyboard behavior remain Phase 127 pre-tag UAT as planned.

## Self-Check: PASSED

- All seven declared files exist.
- All six RED/GREEN task commits exist on `codex/phase125-03`.
- Combined focused Vitest evidence passed: 4 files, 28 tests.
- Client and protocol workspace typechecks passed.
- Package architecture, cycle detection, and `git diff --check` passed.

---
*Phase: 125-terminal-safe-keyboard-navigation*
*Completed: 2026-07-16*
