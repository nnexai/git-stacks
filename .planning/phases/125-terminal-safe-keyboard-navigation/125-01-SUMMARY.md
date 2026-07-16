---
phase: 125-terminal-safe-keyboard-navigation
plan: "01"
subsystem: protocol
tags: [zod, shortcuts, web, schema]

requires:
  - phase: 124-user-shell-and-environment-authority
    provides: Browser-safe service and terminal boundaries
provides:
  - Canonical eight-action shortcut vocabulary and platform contract
  - Strict normalized physical binding and complete effective settings schemas
  - Distinct set-primary, set-aliases, unbind, and reset mutation intents
affects: [125-02, 125-03, shortcut-authority, web-navigation]

tech-stack:
  added: []
  patterns: [strict Zod transport schemas, discriminated mutation intents, bounded complete inventories]

key-files:
  created: [tests/service/web-shortcut-contract.test.ts]
  modified: [packages/protocol/src/web.ts]

key-decisions:
  - "Transport settings contain exactly one row for each of the eight stable action IDs."
  - "Bindings use physical KeyA-KeyZ codes with all four modifiers explicit, and alias lists are capped at four."
  - "Reset and unbind remain separate strict intents; labels, defaults, persistence, and host configuration stay outside protocol transport."

patterns-established:
  - "Complete inventory schema: fixed length plus unique enum IDs makes downstream action handling exhaustive."
  - "Mutation isolation: each shortcut intent has one strict body and cannot carry fields from another intent."

requirements-completed: [KEY-01, KEY-02, KEY-05, KEY-06]

coverage:
  - id: D1
    description: Canonical browser-safe shortcut settings vocabulary with complete bounded effective state
    requirement: KEY-01
    verification:
      - kind: unit
        ref: tests/service/web-shortcut-contract.test.ts#freezes the complete action and platform vocabulary
        status: pass
      - kind: unit
        ref: tests/service/web-shortcut-contract.test.ts#requires a bounded unique complete effective inventory
        status: pass
      - kind: other
        ref: npm run typecheck --workspace @git-stacks/protocol
        status: pass
    human_judgment: false
  - id: D2
    description: Strict and unambiguous set-primary, set-aliases, unbind, and reset mutation intents
    requirement: KEY-05
    verification:
      - kind: unit
        ref: tests/service/web-shortcut-contract.test.ts#keeps set-primary set-aliases unbind and reset distinct
        status: pass
      - kind: unit
        ref: tests/service/web-shortcut-contract.test.ts#rejects hybrid duplicate oversized and host-detail mutation bodies
        status: pass
    human_judgment: false

duration: 4min
completed: 2026-07-16
status: complete
---

# Phase 125 Plan 01: Shortcut Protocol Contract Summary

**A strict browser-safe shortcut protocol now freezes the full action inventory, physical bindings, effective state, and explicit mutation semantics for downstream authority and client plans.**

## Performance

- **Duration:** 4 min
- **Started:** 2026-07-16T15:02:05Z
- **Completed:** 2026-07-16T15:05:44Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Defined exactly eight stable shortcut actions and the macOS/Linux platform vocabulary.
- Added strict physical letter bindings, complete unique effective settings, nullable primaries, and bounded aliases.
- Separated primary replacement, alias replacement, explicit unbind, and reset-to-default into non-overlapping request schemas.
- Proved strict rejection of malformed codes, unknown fields, incomplete/duplicate inventories, duplicate/oversized aliases, hybrid intents, and host-detail payloads.

## Task Commits

1. **RED: Add failing shortcut protocol contract** - `56cb3db3` (test)
2. **Task 1: Define canonical effective settings schemas** - `23bb9917` (feat)
3. **Task 2: Define distinct mutation intents** - `7bb7bcc0` (feat)

## Files Created/Modified

- `packages/protocol/src/web.ts` - Canonical shortcut platform, action, binding, settings, get, and mutation schemas/types.
- `tests/service/web-shortcut-contract.test.ts` - Executable inventory, strictness, bounds, non-disclosure, and mutation-semantics contract.

## Decisions Made

- Alias lists are bounded at four entries and reject duplicate normalized bindings.
- Effective settings require all eight unique actions; derived labels and platform defaults remain out of transport.
- A primary binding cannot be repeated in its own alias list.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- The isolated worktree did not contain `node_modules`; verification used a temporary symlink to the main checkout's existing dependency installation without changing package metadata.

## TDD Gate Compliance

- RED commit `56cb3db3` failed before protocol exports existed.
- GREEN commits `23bb9917` and `7bb7bcc0` made the effective-settings and mutation contract tests pass in task order.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan 02 can map these strict requests to core-owned persistence without exposing global configuration.
- Plan 03 can import the same canonical action and binding types for defaults, matching, conflict checks, and display metadata.
- No persistence, matcher, service routing, DOM behavior, or default registry was added here.

## Self-Check: PASSED

- Both declared files exist.
- Commits `56cb3db3`, `23bb9917`, and `7bb7bcc0` exist on `codex/phase125-01`.
- Focused Vitest contract suite and protocol workspace typecheck pass.

---
*Phase: 125-terminal-safe-keyboard-navigation*
*Completed: 2026-07-16*
