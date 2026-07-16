---
phase: 125-terminal-safe-keyboard-navigation
plan: "02"
subsystem: shortcut-authority
tags: [shortcuts, global-config, optimistic-concurrency, secure-router]

requires:
  - phase: 125-terminal-safe-keyboard-navigation
    plan: "01"
    provides: Canonical browser-safe shortcut action and mutation contract
provides:
  - Core-owned platform defaults and strict global shortcut overrides
  - Atomic revisioned rebind, alias, unbind, and reset authority
  - Scoped non-disclosing shortcuts.get and shortcuts.set service methods
affects: [125-04, 125-05, web-shortcut-settings, secure-service]

tech-stack:
  added: []
  patterns: [leased global-config mutation, deterministic subdocument revision, explicit protocol-to-core mapping]

key-files:
  created:
    - packages/core/src/web-shortcuts.ts
    - tests/lib/web-shortcut-config.test.ts
    - tests/service/web-shortcut-authority.test.ts
  modified:
    - packages/core/src/config.ts
    - packages/service/src/secure/router.ts
    - packages/service/src/main.ts
    - tests/service/web-shortcut-contract.test.ts

key-decisions:
  - "Shortcut optimistic concurrency fingerprints only the canonical shortcut subdocument, while one revision covers both platform registries."
  - "Core validates the complete macOS and Linux effective registries before the leased global-config write can commit."
  - "Service routing explicitly maps strict protocol values to core intents and projects only normalized effective settings."

requirements-completed: [KEY-01, KEY-02, KEY-05, KEY-06]

duration: 8min
completed: 2026-07-16
status: complete
---

# Phase 125 Plan 02: Authoritative Shortcut Settings Summary

**Durable platform shortcut overrides now use core-owned global configuration with complete-registry conflict validation, shortcut-specific optimistic concurrency, and narrow scoped service methods.**

## Performance

- **Duration:** 8 min
- **Started:** 2026-07-16T15:08:16Z
- **Completed:** 2026-07-16T15:16:00Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments

- Added all eight locked macOS and Linux safe defaults without creating a core-to-protocol dependency.
- Persisted primary replacements, bounded aliases, explicit unbinds, and resets as strict global-config overrides while preserving unrelated configuration.
- Rejected stale revisions, unsafe bindings, unknown actions, and collisions across every effective primary and alias before any write occurs.
- Added `shortcuts.get` under `snapshot.read` and `shortcuts.set` under `operation.write`, with stable errors and path/config/environment non-disclosure.
- Composed the core reader and updater into the managed service through narrow capabilities next to the existing pin and priority setters.

## Task Commits

1. **RED: Add failing shortcut authority contract** - `2e37b62a` (test)
2. **Task 1: Add authoritative shortcut settings** - `e73a192d` (feat)
3. **RED: Add failing shortcut service authority tests** - `55baa88b` (test)
4. **Task 2: Expose scoped shortcut settings methods** - `cd63d964` (feat)

## Files Created/Modified

- `packages/core/src/web-shortcuts.ts` - Defaults, effective derivation, revisioning, validation, errors, read, and atomic mutation authority.
- `packages/core/src/config.ts` - Strict optional platform/action override schema under global `web.shortcuts`.
- `packages/service/src/secure/router.ts` - Scoped strict get/set parsing, mapping, projection, and stable error translation.
- `packages/service/src/main.ts` - Managed-service composition for the narrow core capabilities.
- `tests/lib/web-shortcut-config.test.ts` - Defaults, persistence modes, conflict, stale, validation, and no-write coverage.
- `tests/service/web-shortcut-authority.test.ts` - Scope, capability, strict request, projection, error, and composition coverage.
- `tests/service/web-shortcut-contract.test.ts` - Protocol/core literal action and default inventory agreement.

## Decisions Made

- The deterministic decimal revision is derived from the stable complete shortcut subdocument, not from unrelated global configuration fields.
- User-selected bindings require a physical letter plus Ctrl, Alt, or Command; optional familiar aliases remain absent until explicitly added.
- Any conflict in either platform registry aborts the full global-config mutation, including conflicts between one action's primary and any alias.
- Unknown core failures become a stable `internal_error`; validation details and arbitrary config errors are never reflected through the browser boundary.

## Deviations from Plan

None - plan executed as written.

## Issues Encountered

- The isolated worktree's shared `node_modules` link initially resolved workspace package symlinks into the main checkout. Verification used a temporary local symlink tree whose `@git-stacks/*` entries point into this worktree; package metadata was unchanged.

## TDD Gate Compliance

- Task 1 RED commit `2e37b62a` failed because the core authority module did not exist; GREEN commit `e73a192d` passed the authority and inventory contract suites.
- Task 2 RED commit `55baa88b` failed because the scoped methods and runtime composition did not exist; GREEN commit `cd63d964` passed all focused authority/contract suites.

## Verification

- `GIT_STACKS_KEY_STORE=file ./node_modules/.bin/vitest run tests/lib/web-shortcut-config.test.ts tests/service/web-shortcut-authority.test.ts tests/service/web-shortcut-contract.test.ts` - 17 tests passed.
- `npm run typecheck` - all seven workspace typechecks passed.
- `npm run test:deps` - package architecture and cycle gate passed.
- `git diff --check` - passed.

## Known Stubs

None.

## User Setup Required

None.

## Next Phase Readiness

- Web help/settings can read and replace the complete effective registry without browser-local durability.
- Client/web plans can surface conflict names and retry stale revisions through stable service errors.
- Live shortcut editing remains part of the Phase 127 pre-tag UAT boundary.

## Self-Check: PASSED

- All declared source and test artifacts exist.
- Task commits `2e37b62a`, `e73a192d`, `55baa88b`, and `cd63d964` exist on `codex/phase125-02`.
- Focused tests, all workspace typechecks, dependency gates, and non-disclosure assertions pass.

---
*Phase: 125-terminal-safe-keyboard-navigation*
*Completed: 2026-07-16*
