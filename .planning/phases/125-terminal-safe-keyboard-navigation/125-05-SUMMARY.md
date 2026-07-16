---
phase: 125-terminal-safe-keyboard-navigation
plan: "05"
subsystem: web-keyboard-overlays
tags: [keyboard, xterm, fuzzy-search, accessibility, shortcuts, authoritative-config]

requires:
  - phase: 125-terminal-safe-keyboard-navigation
    plan: "02"
    provides: Revisioned authoritative shortcut settings service
  - phase: 125-terminal-safe-keyboard-navigation
    plan: "03"
    provides: Shared fuzzy ranking, shortcut conflict validation, and attention selection
  - phase: 125-terminal-safe-keyboard-navigation
    plan: "04"
    provides: Canonical eight-action registry and xterm-safe dispatcher
provides:
  - One focus-contained singleton controller shared by fuzzy overlays, help/settings, capture, confirmations, and editors
  - Active-only workspace/repository and selected-scope command fuzzy overlays with top-partial Enter
  - Authoritative grouped shortcut help and revisioned primary, alias, reset, and unbind customization
  - Visible responsive Next attention and Keyboard shortcuts controls
  - Executable DOM harness coverage for overlay, focus, authority, capture, and responsive contracts
affects: [125-verification, 126-web-parity, 127-release-uat]

tech-stack:
  added: []
  patterns: [singleton overlay controller, active-descendant fuzzy lists, response-only authority replacement, revisioned shortcut mutation]

key-files:
  created:
    - packages/web/src/overlay-controller.ts
    - tests/service/web-keyboard-overlays.test.ts
  modified:
    - packages/web/src/app.ts
    - packages/web/src/app.css

key-decisions:
  - "One document-level controller owns backdrop replacement, focus containment, and the original terminal return target for every app dialog."
  - "Shortcut settings clear browser authority while loading and replace effective bindings only from complete validated service responses."
  - "Pointer controls invoke the same canonical action callbacks and availability entries as keyboard dispatch."
  - "Escape is intercepted by capture mode before the singleton controller may close shortcut settings."

patterns-established:
  - "Fuzzy overlays retain input focus and project one aria-activedescendant result while containing navigation keys."
  - "Shortcut mutations retain prior caps on conflict or failure and carry the latest authoritative revision for every intent."

requirements-completed: [KEY-01, KEY-06, KEY-07, KEY-08, KEY-09, KEY-10, ATTN-03]

coverage:
  - id: D1
    description: "Singleton active-workspace and scoped-command fuzzy overlays with contained keys and focus restoration"
    requirement: KEY-06
    verification:
      - kind: automated_ui
        ref: "tests/service/web-keyboard-overlays.test.ts#web singleton keyboard overlays"
        status: pass
    human_judgment: false
  - id: D2
    description: "Authoritative keyboard help, primary and alias capture, reset, unbind, conflict, failure, and retry states"
    requirement: KEY-08
    verification:
      - kind: automated_ui
        ref: "tests/service/web-keyboard-overlays.test.ts#web authoritative shortcut overlays"
        status: pass
      - kind: integration
        ref: "tests/service/web-shortcut-authority.test.ts"
        status: pass
    human_judgment: false
  - id: D3
    description: "Responsive visible Next attention and Keyboard shortcuts controls with approved UI-SPEC styling"
    requirement: ATTN-03
    verification:
      - kind: automated_ui
        ref: "tests/service/web-keyboard-overlays.test.ts#wires the executable overlay implementation"
        status: pass
    human_judgment: true
    rationale: "Phase 127 retains live browser screenshot, physical keyboard, xterm focus, and narrow-width visual approval before tagging."

duration: 15min
completed: 2026-07-16
status: complete
---

# Phase 125 Plan 05: Keyboard Overlay and Shortcut UI Summary

**The web client now provides one terminal-safe overlay system with shared fuzzy navigation, authoritative shortcut customization, and visible responsive attention/help controls.**

## Performance

- **Duration:** 15 min
- **Started:** 2026-07-16T15:35:00Z
- **Completed:** 2026-07-16T15:50:00Z
- **Tasks:** 3
- **Files modified:** 4

## Accomplishments

- Replaced the prior per-modal key handlers with one named singleton controller that refocuses repeated surfaces, replaces compatible overlays in place, blocks unrelated actions during exclusive dialogs, traps Tab, and restores the original terminal or a safe fallback.
- Added active-only workspace/repository and selected-pair configured-command overlays using the shared fuzzy scorer, deterministic empty ordering, one active result, wrapped arrows, Home/End, top-partial Enter, pointer synchronization, exact empty copy, and combobox/listbox semantics.
- Added grouped help for all eight effective actions plus authoritative settings loading, primary/alias capture, alias removal, reset, unbind, revisioned service writes, complete-response validation, inline conflict/error/retry states, and no browser persistence.
- Added visible `Next attention` and `Keyboard shortcuts` toolbar controls, routed action controls through the canonical registry callbacks, and retained labelled 32px controls at narrow widths.
- Added an executable native-DOM harness covering singleton/refocus/replacement, exclusivity, key containment, active results, zero/one/many and long text, authoritative loading/mutations, conflicts, capture rejection, failures, retries, and responsive discoverability.

## Task Commits

1. **RED: Executable keyboard overlay harness** - `ccfb96bf` (test)
2. **Task 1: Singleton controller and fuzzy overlays** - `a99fbe4a` (feat)
3. **Task 2: Authoritative shortcut help/settings/capture** - `32044c95` (feat)
4. **Task 3: Responsive discoverability and UI-SPEC styling** - `01666005` (style)
5. **Final boundary repair: Capture and canonical pointer routing** - `ebed7fc0` (fix)

## Files Created/Modified

- `packages/web/src/overlay-controller.ts` - Named singleton controller, shared fuzzy overlay renderer, grouped help, and authoritative settings/capture renderer.
- `packages/web/src/app.ts` - Real app integration, active/scope candidate projection, terminal focus restoration, canonical control callbacks, and service authority wiring.
- `packages/web/src/app.css` - Active listbox, binding/key-cap, capture/error/busy, contained scrolling, long-text, focus, and narrow-toolbar styles.
- `tests/service/web-keyboard-overlays.test.ts` - Executable fake-DOM harness and app/CSS integration assertions.

## Decisions Made

- Used a dedicated DOM module for the named controller and renderers so the real imperative app and executable harness consume the same implementation without adding a UI framework or dependency.
- Exclusive confirmations/editors remain non-replaceable, while workspace, commands, help, and settings may replace one another without restoring terminal focus between surfaces.
- A successful workspace or command selection closes without restoring the old terminal; selection/creation then focuses the newly authoritative terminal or repository fallback.
- Shortcut settings call `shortcuts.get` on every open, clear dispatch authority while loading, and accept only complete validated service responses from load or mutation.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Kept Escape inside shortcut capture**
- **Found during:** Task 3 final boundary review
- **Issue:** The document capture-phase Escape handler could close the entire settings dialog before the capture target cancelled only capture mode.
- **Fix:** The singleton controller defers Escape owned by a marked capture control; capture then consumes it and returns focus within settings.
- **Files modified:** `packages/web/src/overlay-controller.ts`, `tests/service/web-keyboard-overlays.test.ts`
- **Verification:** Focused overlay and navigation tests pass.
- **Committed in:** `ebed7fc0`

**2. [Rule 3 - Blocking] Rebuilt isolated worktree package outputs**
- **Found during:** Task 3 production and repository gates
- **Issue:** Shared `node_modules/@git-stacks/*` links resolved stale main-checkout `dist` outputs, then the isolated worktree lacked local core outputs and coverage artifacts required by `verify:gates`.
- **Fix:** Created a temporary untracked local workspace-link overlay, rebuilt all worktree package outputs, regenerated full coverage, and reran the exact gates. No manifest or dependency changed.
- **Files modified:** None tracked.
- **Verification:** `web:build`, all typechecks, `test:deps`, full coverage, and `verify:gates` pass.
- **Committed in:** Not applicable (environment-only repair).

---

**Total deviations:** 2 auto-fixed (1 Rule 1 bug, 1 Rule 3 blocking environment issue).
**Impact on plan:** Both fixes were required for the specified capture contract and trustworthy isolated verification; no product scope or dependency was added.

## Issues Encountered

- The local link overlay was necessary only because this manual parallel worktree intentionally reused the main checkout's installed dependencies. It remains untracked and is not product output.

## Verification

- `GIT_STACKS_KEY_STORE=file ./node_modules/.bin/vitest run tests/lib/web-shortcut-config.test.ts tests/lib/client-shortcuts.test.ts tests/lib/client-fuzzy.test.ts tests/lib/client-attention.test.ts tests/service/web-shortcut-authority.test.ts tests/service/web-keyboard-navigation.test.ts tests/service/web-keyboard-overlays.test.ts tests/service/web-presentation.test.ts` - 8 files, 60 tests passed.
- `npm run web:build` - production browser bundle passed.
- `npm run typecheck` - all seven workspace typechecks passed.
- `npm run test:deps` - package architecture and cycle checks passed.
- `npm run coverage` - 147 files passed; 1,905 tests passed and 1 explicit skip; fresh coverage artifacts generated.
- `npm run verify:gates` - inventory, mapped tests, and coverage artifacts aligned.
- `git diff --check` - passed.

## Known Stubs

None. Empty arrays and strings found by the stub scan belong only to executable fake-DOM fixture state or established runtime initialization; no placeholder data flows to a shipped overlay.

## Threat Flags

None. This plan adds no network endpoint, authentication path, file access, schema, package, or browser storage surface. Shortcut mutations use the already-planned authenticated `shortcuts.set` operation boundary.

## User Setup Required

None.

## Next Phase Readiness

- Phase 125 is automated-ready for verification and Phase 126 planning/execution.
- Phase 127 still owns live browser/xterm focus, physical non-US keyboard, shell/TUI pass-through, narrow-width screenshot comparison, and human approval before any tag, push, publish, or release.
- This summary does not claim live browser human approval.

## Self-Check: PASSED

- All four declared source/test artifacts exist.
- All five listed task/test/fix commits exist on `codex/phase125-05`.
- Focused tests, production build, seven typechecks, dependency/cycle checks, full coverage, repository gates, and diff checks pass.
- Worktree contains no tracked uncommitted changes and no release side effect was performed.

---
*Phase: 125-terminal-safe-keyboard-navigation*
*Completed: 2026-07-16*
