---
phase: 10-test-harness
plan: 02
subsystem: testing
tags: [testRender, InlineInput, ActionMenu, TUI, solid-js, headless, keyboard-simulation, bunfig]

# Dependency graph
requires:
  - phase: 10-01
    provides: ActionMenu arrow-key cursor navigation and GIT_STACKS_CONFIG_DIR env override
provides:
  - InlineInput component tests: typing, backspace, escape cancel, enter confirm, label render
  - ActionMenu component tests: all labels, cursor indicator, arrow nav, enter select, escape dismiss, letter shortcuts
  - bun test TUI component testing pattern: testRender + mockInput + 50ms escape timeout
  - bunfig.toml fix: [test] preload section makes Babel/solid plugin intercept tsx imports during bun test
affects:
  - all future TUI component test files (use the same bunfig.toml preload fix and escape timeout pattern)
  - Phase 11 (InlineInput cursor movement) — will extend these tests

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "TUI component test pattern: testRender + mockInput + await renderOnce() + captureCharFrame()"
    - "Escape key test pattern: pressEscape() + await new Promise(r => setTimeout(r, 50)) + renderOnce()"
    - "bunfig.toml [test] preload section required for bun test to apply Babel/solid jsx transform to imported tsx files"

key-files:
  created:
    - tests/tui/dashboard/InlineInput.test.tsx
    - tests/tui/dashboard/ActionMenu.test.tsx
  modified:
    - bunfig.toml

key-decisions:
  - "bunfig.toml [test] preload section (not top-level) required for bun test to apply the Babel solid transform to tsx file imports — top-level preload only applies to bun run"
  - "pressEscape() requires a 50ms setTimeout before asserting callback — the OpenTUI escape-sequence parser waits for more bytes after \\x1B before emitting the event"
  - "Cursor indicator assertions use exact string match (e.g. '> [o] Open') — the ActionMenu renders '>  ' prefix + '[key] Label' per item"

patterns-established:
  - "TUI component test: testRender, await renderOnce(), mockInput interaction, await renderOnce(), captureCharFrame().toContain()"
  - "Escape key handling: add await new Promise(r => setTimeout(r, 50)) between pressEscape() and renderOnce()"
  - "Cursor frame assertions: use toContain('> [key] Label') for selected item, not.toContain for deselected state"

requirements-completed:
  - T-01
  - T-02
  - T-03
  - T-04

# Metrics
duration: 21min
completed: 2026-03-21
---

# Phase 10 Plan 02: Component Tests (InlineInput + ActionMenu) Summary

**15 headless TUI component tests via testRender proving keyboard simulation, frame capture, InlineInput behaviors, and ActionMenu arrow navigation all work in CI without a terminal**

## Performance

- **Duration:** ~21 min
- **Started:** 2026-03-21T06:12:15Z
- **Completed:** 2026-03-21T06:33:20Z
- **Tasks:** 2
- **Files modified:** 3 (2 test files created, 1 config modified)

## Accomplishments

- Created `tests/tui/dashboard/InlineInput.test.tsx` with 6 passing tests: typing, backspace, escape cancel, enter confirm, prefill+type, label render
- Created `tests/tui/dashboard/ActionMenu.test.tsx` with 9 passing tests: label rendering, cursor indicator, arrow-down, arrow-up, enter-at-cursor (2 positions), escape dismiss, 2 letter shortcuts
- Fixed `bunfig.toml` to move preload to `[test]` section, enabling the Babel/solid plugin to intercept `.tsx` imports during `bun test` (not just `bun run`)
- Full test suite passes: 215 tests, 0 failures

## Task Commits

1. **Task 1: InlineInput component tests** - `212eeb8` (feat) — includes bunfig.toml fix
2. **Task 2: ActionMenu component tests** - `9a94eec` (feat)

## Files Created/Modified

- `tests/tui/dashboard/InlineInput.test.tsx` - 6 tests for typing, backspace, escape, enter, prefill+type, label
- `tests/tui/dashboard/ActionMenu.test.tsx` - 9 tests for labels, cursor, arrow nav, enter select, escape, letter shortcuts
- `bunfig.toml` - Added `[test]` section with `preload = ["@opentui/solid/preload"]`

## Decisions Made

- **bunfig.toml [test] section for preload**: The original `preload = [...]` at top level in `bunfig.toml` only applies to `bun run`, not `bun test`. The Babel solid-transform plugin must be in `[test] preload = [...]` to intercept `.tsx` imports (like `InlineInput.tsx`) during `bun test`. Without this fix, the plugin's `onLoad` handler never fires for imports.
- **50ms timeout for pressEscape**: OpenTUI's key event parser holds the `\x1B` byte briefly to check if more bytes follow (escape sequences like arrow keys start with `\x1B`). `pressEscape()` sends only `\x1B` and resolves immediately. A 50ms wait lets the parser emit the escape event. This is a required pattern for all escape-key tests.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] bunfig.toml preload not intercepting tsx imports in bun test**
- **Found during:** Task 1 (InlineInput tests)
- **Issue:** The `preload = ["@opentui/solid/preload"]` at top level in `bunfig.toml` only registers the Babel plugin for `bun run` context. In `bun test`, the Bun plugin's `onLoad` handler was not being called for any `.tsx` files (neither the test file nor `InlineInput.tsx`). This meant: (1) Bun's native JSX ran instead of babel-preset-solid, (2) solid-js server.js was loaded instead of solid.js, (3) `onMount` was a no-op, so `useKeyboard` never registered its event handlers.
- **Fix:** Added `[test]` section to `bunfig.toml` with `preload = ["@opentui/solid/preload"]`. Both top-level (for `bun run`) and `[test]` (for `bun test`) preload entries are now present.
- **Files modified:** `bunfig.toml`
- **Verification:** After fix, `bun test tests/tui/dashboard/InlineInput.test.tsx` shows `PLUGIN_ONLOAD` firing for both the test file and `InlineInput.tsx`. 5/6 tests immediately passed.
- **Committed in:** `212eeb8` (Task 1 commit)

**2. [Rule 1 - Bug] pressEscape() timing — escape key needs 50ms parser delay**
- **Found during:** Task 1 (escape calls onCancel test)
- **Issue:** `mockInput.pressEscape()` emits `\x1B` to stdin. OpenTUI's escape-sequence parser holds this byte for a brief period (checking if more bytes arrive to form a complete escape sequence). `pressEscape()` returns synchronously, before the parser emits the key event. A single `await renderOnce()` is not sufficient — the event hasn't fired yet.
- **Fix:** Added `await new Promise((r) => setTimeout(r, 50))` between `pressEscape()` and `await renderOnce()` in both InlineInput and ActionMenu tests. Same pattern applied to both test files.
- **Files modified:** `tests/tui/dashboard/InlineInput.test.tsx`, `tests/tui/dashboard/ActionMenu.test.tsx`
- **Verification:** With the 50ms delay, escape tests pass. Without it, `cancelled` remains `false`.
- **Committed in:** `212eeb8` and `9a94eec`

---

**Total deviations:** 2 auto-fixed (1 Rule 3 - blocking, 1 Rule 1 - bug)
**Impact on plan:** Both fixes were necessary to make tests pass. The bunfig.toml fix is the critical infrastructure change that makes all future TUI component tests possible. The escape timing fix is a required pattern for any test that presses Escape.

## Issues Encountered

The Bun plugin system's `onLoad` behavior in `bun test` differs from `bun run`. The plugin registered via preload does work in `bun test`, but ONLY when preload is specified under the `[test]` section of `bunfig.toml` (not the top-level). This is an undocumented distinction in Bun's configuration.

Additionally, the escape key timing issue (parser disambiguation delay) is inherent to how OpenTUI parses escape sequences. Any test using `pressEscape()` must include a ~50ms delay.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- Phase 11 (InlineInput cursor movement, P-01) can now be authored: both existing test files are in place and passing
- Future TUI component tests follow the established pattern: `.tsx` test file + `testRender` + `mockInput` + escape timeout when needed
- The `[test] preload` bunfig.toml fix is in place and applies to all future test files in `tests/tui/dashboard/`

## Self-Check: PASSED

- FOUND: tests/tui/dashboard/InlineInput.test.tsx
- FOUND: tests/tui/dashboard/ActionMenu.test.tsx
- FOUND: bunfig.toml (with [test] preload section)
- FOUND: 212eeb8 (feat: InlineInput tests + bunfig fix)
- FOUND: 9a94eec (feat: ActionMenu tests)
- VERIFIED: bun test tests/tui/dashboard/ → 15 pass, 0 fail
- VERIFIED: bun test tests/ → 215 pass, 0 fail
