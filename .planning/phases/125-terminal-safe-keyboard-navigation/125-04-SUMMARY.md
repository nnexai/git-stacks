---
phase: 125-terminal-safe-keyboard-navigation
plan: "04"
subsystem: web-keyboard-navigation
tags: [xterm, shortcuts, attention, terminal-navigation, keyboard-safety]

requires:
  - phase: 125-terminal-safe-keyboard-navigation
    plan: "02"
    provides: Authoritative revisioned shortcut settings service
  - phase: 125-terminal-safe-keyboard-navigation
    plan: "03"
    provides: Exact shortcut matcher and validated attention selector
provides:
  - One canonical eight-action registry with centralized availability and repeat policy
  - Explicit one-owner xterm/document dispatch with rejected-input pass-through
  - Service-backed terminal and validated Next Attention actions
  - Executable production-bundle rejection of Keyboard Lock APIs
affects: [125-05, web-overlays, shortcut-help, terminal-uat]

tech-stack:
  added: []
  patterns: [fail-closed authoritative loading, weak event ownership, handled-only xterm consumption, service-callback reuse]

key-files:
  created:
    - packages/web/src/navigation.ts
    - tests/service/web-keyboard-navigation.test.ts
  modified:
    - packages/web/src/app.ts
    - tests/service/web-shortcut-contract.test.ts
    - tests/architecture/secure-browser-bundle.test.mjs

key-decisions:
  - "Shortcut settings remain absent until shortcuts.get succeeds; load or reload failure clears bindings so browser defaults never impersonate authority."
  - "A WeakMap gives each handled KeyboardEvent exactly one xterm or document owner; only handled events are prevented and stopped."
  - "Direct repeats are consumed without callbacks, while workspace and command overlay repeats deliver only a refocus invocation."
  - "Terminal and attention actions project current app state into existing create, close, selectPair, and selectTerminal callbacks instead of issuing parallel service operations."

requirements-completed: [KEY-01, KEY-02, KEY-03, KEY-04, KEY-05, KEY-09, KEY-10, ATTN-01, ATTN-02, ATTN-03]

duration: 7min
completed: 2026-07-16
status: complete
---

# Phase 125 Plan 04: Terminal-Safe Keyboard Navigation Summary

**The web client now routes authoritative app shortcuts through one xterm-safe dispatcher, preserves every rejected shell keystroke, and reuses current terminal and attention selection authority.**

## Performance

- **Duration:** 7 min
- **Completed:** 2026-07-16
- **Tasks:** 3
- **Files modified:** 5

## Accomplishments

- Added a complete canonical action registry exposing stable metadata, effective bindings, dynamic availability, disabled reasons, repeat policy, and one callback per action.
- Attached the shared dispatcher to xterm before `onData` and to the document boundary, with one-owner consumption and unchanged pass-through for unmatched, composing, AltGraph, keyup, non-US, familiar, and legacy chords.
- Suppressed repeated creation, closure, movement, and attention mutations while keeping their recognized events consumed; overlay repeats refocus without creating another modal.
- Loaded `shortcuts.get` after secure pairing and failed closed on initial or later load failure without flashing platform defaults as authoritative.
- Removed legacy `Ctrl/Cmd+K`, `Ctrl/Cmd+Shift+T`, and `Ctrl+PageUp/PageDown` document handlers.
- Connected New/Close/Previous/Next Terminal and Next Attention to current service-owned views, shared attention validation, established tab order, wrap behavior, and exact empty-result copy.
- Factored the secure bundle assertion and proved a hostile Keyboard Lock fixture fails before applying the same assertion to the production bundle.

## Task Commits

1. **RED: Canonical keyboard boundary** - `614b020f` (test)
2. **Task 1: Canonical action registry and dispatcher** - `637e9307` (feat)
3. **RED: Authoritative app wiring** - `59a32fd0` (test)
4. **Task 2: Authoritative xterm/document integration** - `aad58ad2` (feat)
5. **RED: Terminal and attention actions** - `df3c034e` (test)
6. **Task 3: Service-owned terminal and attention actions** - `7e936818` (feat)
7. **Repeat coverage completion** - `ce73b9b5` (test)

## Files Created/Modified

- `packages/web/src/navigation.ts` - Canonical registry, authoritative loading, terminal traversal, and xterm/document dispatcher.
- `packages/web/src/app.ts` - Secure settings load, xterm preprocessor, document dispatch, modal refocus seam, and current-state action callbacks.
- `tests/service/web-keyboard-navigation.test.ts` - Executable dispatch, ownership, repeat, pass-through, loading, terminal, attention, and app-wiring evidence.
- `tests/service/web-shortcut-contract.test.ts` - Protocol, core defaults, and client metadata/default inventory agreement.
- `tests/architecture/secure-browser-bundle.test.mjs` - Reusable forbidden-bundle assertion plus hostile Keyboard Lock fixture.

## Decisions Made

- Recognized but currently unavailable actions remain consumed so a registered app chord cannot leak into the PTY; events rejected by the exact matcher remain untouched.
- The registry validates every service-projected settings inventory before accepting it and removes prior bindings before every authoritative reload attempt.
- Previous/Next considers ended command tabs because `visibleTerminals()` is the established selected-pair projection; one or zero tabs reports `No other terminal is available.` without selection change.
- Next Attention applies only the shared selector's current resolvable target, never dismisses signals, and selects the repository before an optional live terminal.

## Deviations from Plan

None - plan executed as written.

## Issues Encountered

- The isolated worktree initially followed shared `node_modules/@git-stacks/*` symlinks to stale main-checkout package outputs. Verification used a temporary local symlink overlay pointing workspace package names at this worktree; package metadata and dependencies were unchanged.

## TDD Gate Compliance

- Task 1 RED failed on the absent navigation module; GREEN proved registry inventory, ownership, consumption, repeat policy, availability, and legacy/rejected pass-through.
- Task 2 RED failed on the absent authoritative loader and app integration; GREEN proved fail-closed reloads, handler ordering, and legacy-handler removal.
- Task 3 RED failed on the absent traversal helper and action feedback; GREEN proved deterministic wrap, exact empty results, and validated attention application.

## Verification

- `./node_modules/.bin/vitest run tests/service/web-keyboard-navigation.test.ts tests/service/web-presentation.test.ts tests/service/web-shortcut-contract.test.ts` - 27 tests passed.
- `npm run typecheck` - all seven workspace typechecks passed.
- `npm run test:deps` - package architecture and cycle checks passed.
- `npm run web:build` - production browser bundle built.
- `node --test tests/architecture/secure-browser-bundle.test.mjs` - hostile fixture and real production bundle passed (2 tests).
- `git diff --check` - passed.

## Known Stubs

- `workspace.switch` intentionally remains unavailable until Plan 05 registers the workspace-switcher overlay through the explicit `registerOverlayShortcutAction` seam. This is the planned dependency boundary and does not affect the live direct actions or command overlay.

## User Setup Required

None.

## Next Phase Readiness

- Plan 05 can register the workspace switcher and extend the existing command modal through the one overlay callback/refocus seam.
- Help and settings controls can render `webActionRegistry.entries()` without defining a second action inventory.
- Physical-keyboard terminal pass-through remains a Phase 127 pre-tag UAT item as planned.

## Self-Check: PASSED

- All five declared source/test artifacts exist.
- All seven listed task/test commits exist on `codex/phase125-04`.
- Focused tests, all workspace typechecks, dependency gates, production bundle, hostile Keyboard Lock assertion, and diff checks pass.

---
*Phase: 125-terminal-safe-keyboard-navigation*
*Completed: 2026-07-16*
