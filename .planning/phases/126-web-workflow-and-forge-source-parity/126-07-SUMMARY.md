---
phase: 126-web-workflow-and-forge-source-parity
plan: "07"
subsystem: web-ui
tags: [workspace-actions, durable-operations, notes, file-status, forge-review, responsive]

requires:
  - phase: 126-04
    provides: strict browser-safe routes, reviewed-source admission, and bounded operation projections
  - phase: 126-05
    provides: canonical action registry, durable operation tracker, and forge review coordinator
provides:
  - canonical descriptor-driven web workspace controls and grouped roving menus
  - persistent durable operation cards with non-replay reconnect, cancellation, and refresh gates
  - authoritative append-only notes and path-free grouped file-status overlays
  - singleton GitHub PR and GitLab MR Resolve to Review to explicit Create workflow
affects: [126-08, 127, web, cross-client-conformance, milestone-uat]

tech-stack:
  added: []
  patterns: [imperative DOM over pure client coordinators, singleton contained workflows, textContent-only safe DTO rendering]

key-files:
  created:
    - tests/service/web-workspace-actions.test.ts
    - tests/service/web-forge-review.test.ts
  modified:
    - packages/web/src/navigation.ts
    - packages/web/src/overlay-controller.ts
    - packages/web/src/app.ts
    - packages/web/src/app.css
    - tests/service/web-keyboard-overlays.test.ts

key-decisions:
  - "Every active-workspace row, scope-menu, direct pin, and optional invoker resolves a shared descriptor callback; unavailable menu rows remain focusable and announce the authoritative reason without transport."
  - "Legacy bounded WebOperation projections are adapted with the matching descriptor identity and refreshed action inventory before the shared tracker renders cancellability; no mutation intent is retained for replay."
  - "Notes and file detail stay inside the singleton overlay and render only strict service DTO fields through textContent and safe native attributes."
  - "Reviewed forge creation remains in one contained overlay; Enter resolves only, immutable provider identity remains anchored, and accepted creation closes only after authoritative snapshot reconciliation."

patterns-established:
  - "Web action surfaces consume workspaceActionMenuRows instead of constructing transport callbacks per placement."
  - "Mutation UI acquires a synchronous client latch, observes only the returned operation ID, and refreshes authoritative state before unlocking."
  - "Responsive review forms use sticky step/footer regions, min-width zero, wrapping, and explicit 375px/320px stacking rules."

requirements-completed: [PARITY-01, PARITY-02, PARITY-03, PARITY-04, PARITY-05, SOURCE-01, SOURCE-03, SOURCE-04]

coverage:
  - id: D1
    description: "Web workspace controls, row/scope menus, disabled reasons, confirmations, and operation cards consume canonical action and tracker coordination."
    requirement: PARITY-04
    verification:
      - kind: automated_ui
        ref: "tests/service/web-workspace-actions.test.ts#web canonical workspace action surface"
        status: pass
      - kind: automated_ui
        ref: "tests/service/web-keyboard-navigation.test.ts and web-keyboard-overlays.test.ts"
        status: pass
    human_judgment: false
  - id: D2
    description: "Workspace notes are authoritative append-only List/Add/Clear and file status is lazy, grouped, retryable, and path-free."
    requirement: PARITY-02
    verification:
      - kind: automated_ui
        ref: "tests/service/web-workspace-actions.test.ts#web authoritative notes and path-free file details"
        status: pass
      - kind: integration
        ref: "tests/service/web-presentation.test.ts"
        status: pass
    human_judgment: false
  - id: D3
    description: "GitHub PR and GitLab MR creation visibly separates Resolve URL, editable Review workspace, and explicit one-shot Create."
    requirement: SOURCE-03
    verification:
      - kind: automated_ui
        ref: "tests/service/web-forge-review.test.ts"
        status: pass
      - kind: other
        ref: "npm run web:build and npm run typecheck --workspace @git-stacks/web"
        status: pass
    human_judgment: false
  - id: D4
    description: "Live xterm focus, pointer interaction, visual light/dark behavior, and desktop/375px/320px layout require milestone-end browser approval."
    verification: []
    human_judgment: true
    rationale: "Phase 127 intentionally owns physical keyboard, real xterm, screenshot, reconnect, and hosted forge approval before tagging."

duration: 22min
completed: 2026-07-17
status: complete
---

# Phase 126 Plan 07: Complete Web Workflow and Forge Review Summary

**The browser now drives canonical service-owned workspace actions, authoritative details, durable operation recovery, and explicit reviewed forge creation through one terminal-safe responsive shell.**

## Performance

- **Duration:** 22 min
- **Started:** 2026-07-16T19:03:00Z
- **Completed:** 2026-07-16T19:24:59Z
- **Tasks:** 3
- **Files modified:** 7

## Accomplishments

- Replaced duplicated row/scope/direct workspace action callbacks with grouped canonical descriptor rows, focusable disabled reasons, shared confirmations, synchronous one-shot submission, and persistent operation cards.
- Added append-only newest-first notes with byte validation and safe-default clear, plus lazy path-free file status with attention-open groups, local retry, safe wrapping, and no host reconstruction.
- Added a singleton responsive forge overlay whose first-stage Enter resolves only and whose immutable source anchor, editable review fields, explicit Create, typed recovery, and reconciliation follow the shared coordinator.

## Task Commits

Each task followed RED then GREEN TDD:

1. **Task 1: Canonical action surface and durable operations** — `895e4958` (RED), `5b04ca5e` (GREEN)
2. **Task 2: Notes and path-free file status** — `221cbd86` (RED), `0cc9557f` (GREEN)
3. **Task 3: Responsive reviewed forge creation** — `3bd863d3` (RED), `fff82210` (GREEN)
4. **Final interaction hardening** — `89ff9067` (Rule 1 fixes)

## Files Created/Modified

- `packages/web/src/navigation.ts` — Canonical workspace action grouping/menu adapter, coordinated overlay focus restoration, and UTF-8 note validation.
- `packages/web/src/overlay-controller.ts` — Preserves coordinated return callbacks through singleton overlay replacement and close.
- `packages/web/src/app.ts` — Descriptor dispatch, production scope/context/Create focus wiring, durable cards, authoritative note/file overlays, and reviewed forge UI.
- `packages/web/src/app.css` — Operation/detail/review hierarchy, safe wrapping, sticky regions, and narrow viewport behavior.
- `tests/service/web-workspace-actions.test.ts` — Action identity, production coordinator wiring, disabled-reason, operation, notes, and redacted file-detail sentinels.
- `tests/service/web-keyboard-overlays.test.ts` — Integration DOM/controller coverage for scope-menu restoration, unusable targets, terminal fallback, confirmations, and stale invoker expiry.
- `tests/service/web-forge-review.test.ts` — Resolve/review/create separation, immutable anchor, and responsive source assertions.

## Decisions Made

- Existing Phase 123 lifecycle submission remains the archive/remove/force authority; the descriptor registry invokes that exact path rather than introducing a browser lifecycle variant.
- Durable cards derive cancellability only from a refreshed service action inventory that names the matching operation; a legacy operation record alone cannot enable Cancel.
- File targets are rendered only from the strict logical `entry.target` DTO field. No browser code reads or reconstructs path/root/source/target/error fields.
- Forge review tokens, revisions, and immutable source identity stay inside the shared coordinator; the renderer edits only the complete reviewed draft.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Refreshed authoritative cancellability before rendering Cancel**
- **Found during:** Task 3 final acceptance review
- **Issue:** The first running-operation projection could retain the pre-operation action inventory and incorrectly hide a service-advertised Cancel action.
- **Fix:** Re-fetch the selected workspace action inventory by operation ID before adapting and observing each running operation update.
- **Files modified:** `packages/web/src/app.ts`
- **Verification:** Focused action/operation/keyboard suites and web typecheck pass.
- **Committed in:** `89ff9067`

**2. [Rule 1 - Bug] Preserved forge typing focus and Resolve enablement**
- **Found during:** Task 3 final acceptance review
- **Issue:** Re-rendering on every workspace-name keystroke could detach the focused field, while an initially empty URL left Resolve disabled after typing.
- **Fix:** Update URL button state and name validation in place; render only on state transitions.
- **Files modified:** `packages/web/src/app.ts`
- **Verification:** Forge DOM/source suite, keyboard overlay suite, web build, and typecheck pass.
- **Committed in:** `89ff9067`

**3. [Rule 1 - Bug] Prevented durable cards and transient toasts from overlapping**
- **Found during:** Task 3 final acceptance review
- **Issue:** Two independent fixed bottom-right regions occupied the same coordinates.
- **Fix:** Stack both regions inside one bounded feedback container without changing their live-region ownership.
- **Files modified:** `packages/web/src/app.ts`, `packages/web/src/app.css`
- **Verification:** Production web build and 320px source assertions pass.
- **Committed in:** `89ff9067`

---

**Total deviations:** 3 auto-fixed bugs.
**Impact on plan:** All fixes enforce the intended non-replay, focus, and responsive contracts without adding authority or dependencies.

## Issues Encountered

- Post-plan review found that the browser operation carrier and rename transport were still relying on client-reconstructed context and a legacy mutation seam. Both were repaired before milestone UAT: browser submit/get now return one strict path-free `WebOperationSummary`, operation context is persisted server-side for ID-only hydration, and rename uses stable workspace ID/revision authority.

## Known Stubs

None. Initial empty arrays/strings are runtime state before authoritative loads, not rendered mock data.

## Verification

- Five focused web files passed: 52 tests covering action, navigation, singleton overlay, presentation, notes/files, forge review, and responsive sentinels.
- `npm run web:build` — passed.
- `npm run typecheck --workspace @git-stacks/web` — passed.
- `npm run test:deps` — package architecture passed.
- `git diff --check 9ffa4b07..HEAD` — passed.

## Post-plan Review Resolution

The review repair followed an additional adversarial RED/GREEN cycle: `75bea09a` locked all six regressions and `bacb6adc` repaired them.

- Workspace action registries are cached by workspace ID, authoritative inventory key, and inventory generation. Row, direct, and menu placements share one callback/latch instance until selection, revision, or inventory changes invalidate it.
- Browser operation submit/get now use one strict path-free summary. The service persists bounded action context, `hydrate(operationId)` and reconnect perform ID-only reads, duplicate pending IDs coalesce, and neither path can replay submission.
- Generic failed/cancelled reviewed-source operations enter an explicit terminal error state with Back to review, Change URL, and Close recovery instead of leaving the overlay trapped in accepted state.
- Rename now submits stable workspace ID, expected revision, and new name; the service resolves current workspace authority before invoking the trusted adapter.
- Overlay/context-menu return focus keeps the actual invoking element, while validation and recovery focus the real invalid input after render.
- Dirty force-removal is reachable only through the canonical exact-name descriptor confirmation. The legacy browser removal/force bypass functions were removed.

Review verification passed 16 focused files / 188 tests, `npm run web:build`, `npm run test:deps`, package typechecks, and `git diff --check`. In the isolated worktree, service/web were additionally typechecked through temporary local-path configs because its shared `node_modules` link resolved workspace packages from the parent checkout; those temporary configs and the link were removed before commit. Standard workspace typechecks should be rerun after integration.

## Production-Wired Focus Lifecycle Repair

The earlier residual repairs (`c368a1ec`, `17ec414b`) fixed placement and transient-slot expiry but did not cover the production lifecycle. Scope actions hid the menu before overlay capture, row context menus captured a row detached by selection rerender, terminal focus reported success before xterm's nested animation frame ran, and queued restore frames could outlive their overlay. Helper-only tests therefore did not justify the earlier focus-restoration claim.

This repair replaces the loose slot with a production-wired focus coordinator shared by scope menus, row context menus, Create, the singleton overlay controller, and terminal fallback. Scope restoration reopens the originating menu, restores `aria-expanded="true"`, reacquires the concrete action by stable action ID, revalidates it at application time, and accepts success only when the usable target actually owns `document.activeElement`. Disconnected, disabled, inert, hidden/CSS-hidden/hidden-ancestor, and focus-failing targets close the menu and fall through to a visible scope origin, requested terminal, current terminal, then a visible global invoker. Workspace rows now carry stable workspace/repository plus organization-placement identity, so the context-menu path reacquires the visible post-selection row in the exact originating label/repository group instead of retaining detached `event.currentTarget` or selecting the first duplicate label placement.

Overlay generations and focus-ownership predicates cancel stale primary and terminal restore frames when a newer overlay or deliberate focus owner appears. Every singleton overlay activation, including raw/direct Keyboard Shortcuts, Commands, and workspace-switcher openings, now advances the same coordinator epoch; a queued non-overlay Rename restore therefore cannot escape a newer modal. Terminal focus is an asynchronous completion attempt: the coordinator waits for the nested xterm frame, verifies focus inside the terminal host, and only then suppresses fallback. Scope actions that open no overlay restore a visible toggle/origin, native Rename cancellation cannot contaminate a later Create-button overlay, compatible overlay replacement preserves the original coordinated return target, and Notes Retry reloads inside the existing overlay instead of discarding that target.

Integration DOM/controller coverage executes the same exported production overlay-runtime factory used by `app.ts`, plus the production binder, canonical workspace registry callback, placement-aware row resolver, coordinator, and singleton overlay API. It covers Notes, Files, and safe-cancel confirmation close from both scope and rerendered row origins; replacement item reacquisition; removed item/menu/group/row fallback; duplicate-label placement; unusable and focus-failing targets; requested-to-current terminal fallback; nested terminal cancellation; stale restore ownership; direct-overlay epoch invalidation; non-overlay scope actions; compatible replacement; and Rename-cancel followed by Create.

Final automated evidence: 57 focused tests passed from `/tmp/git-stacks-126-07-review-fix` across `web-workspace-actions`, `web-keyboard-navigation`, and `web-keyboard-overlays`; `npm run web:build` passed; web, client, and protocol workspace typechecks passed; both `npm run test:deps` and `npm run test:architecture` passed; and `git diff --check` passed. The final production-path regressions prove that every compatible coordinated replacement advances focus ownership and cancels a queued stale restore, Notes Retry reloads inside the existing overlay without replacing or losing its scope return target, and duplicate-label rows execute the full invocation → rerender → overlay-close path before restoring the exact organization placement. An isolated file-keystore browser fixture additionally observed scope Notes, Files, and Remove-cancel restoring the exact originating item/menu state, right-click Notes restoring the connected replacement row with the same stable identities, and rapid Notes-close followed by Create retaining the newer modal/input focus. Broader physical-keyboard and real-xterm approval remains the Phase 127 manual verification boundary.

## User Setup Required

None for local implementation. Authenticated provider access and live browser/OpenTUI approval remain Phase 127 pre-tag work.

## Next Phase Readiness

- Plan 08 can run the action inventory/copy/security conformance matrix and repair any operation-carrier or stable-rename drift.
- Phase 127 still owns real xterm focus, physical keyboard/pointer, live reconnect/cancel, desktop/375px/320px light/dark screenshots, and hosted GitHub/GitLab approval.
- No tag, push, publish, or release action was performed.

## Self-Check: PASSED

- Both new test files and all three modified web files exist.
- RED/GREEN/fix commits `895e4958`, `5b04ca5e`, `221cbd86`, `0cc9557f`, `3bd863d3`, `fff82210`, and `89ff9067` exist on `codex/phase126-07`.
- No generated build output, dependency artifact, provider credential, host path, or raw provider response is staged.

---
*Phase: 126-web-workflow-and-forge-source-parity*
*Completed: 2026-07-17*
