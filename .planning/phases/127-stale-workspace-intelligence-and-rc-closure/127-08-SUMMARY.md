---
phase: 127-stale-workspace-intelligence-and-rc-closure
plan: "08"
subsystem: tui-ui
tags: [stale-workspaces, opentui, solidjs, lifecycle, operation-tracking, responsive]

requires:
  - phase: 127-02
    provides: committed RED OpenTUI stale-workspace contracts and disclosure canaries
  - phase: 127-05
    provides: authoritative stale evaluation and canonical lifecycle service authority
  - phase: 127-06
    provides: shared presentation, generation gates, shortcut metadata, action registries, and official TUI bridge
provides:
  - dedicated keyboard-first stale-workspace UIView with exact responsive terminal tiers
  - revision-safe retained evidence loading with one-conflict authoritative retry
  - canonical Open, Archive, Remove, and guarded Force Remove flows with exact return context
  - normal-state plus stale-state reconciliation after lifecycle terminal outcomes without mutation replay
affects: [127-09, 127-10, 127-11, 127-12, cross-client-verification, release-candidate]

tech-stack:
  added: []
  patterns:
    - volatile stale evidence reused only while its revision matches authoritative core state
    - stable-ID return contexts carried through canonical action and lifecycle targets
    - durable Open observation recovers accepted operations by identity and fails closed on ambiguous submission

key-files:
  created:
    - packages/tui/src/StaleWorkspacesView.tsx
  modified:
    - packages/tui/src/App.tsx
    - packages/tui/src/types.ts
    - packages/tui/src/WorkspaceRemovalDialog.tsx
    - tests/tui/dashboard/integ-workspace-archive-remove.test.tsx

key-decisions:
  - "Keep the dedicated stale UIView as the sole owner of its navigation and action keys, with the App guard preceding every dashboard shortcut."
  - "Reuse volatile evidence only at an exact authoritative revision; explicit Refresh always requests a forced service evaluation."
  - "Observe canonical Open through the shared durable operation tracker and recover only by accepted operation identity, never by replaying an ambiguous submit."
  - "Show only canonical Archive and Remove descriptors in stale Workspace actions; reveal Force Remove only after typed dirty authority and a fresh exact-revision inventory."
  - "After each lifecycle terminal result, refresh authoritative workspace state and then stale evidence once before restoring presentation."

patterns-established:
  - "Exact stale return: origin tab/cursor/workspace ID plus stale section/index/detail offset travel through action and lifecycle targets."
  - "Fail-closed operation recovery: transient observation errors reconnect by operation ID; submission ambiguity remains locked unless inventory exposes a pending identity."

requirements-completed: [STALE-01, STALE-02, STALE-04, STALE-05]

coverage:
  - id: D1
    description: "Dedicated OpenTUI stale-workspace view renders all evidence states and exact 80+/56-79/<56/<40-or-12 responsive tiers without nested text."
    requirement: STALE-01
    verification:
      - kind: integration
        ref: "tests/tui/dashboard/StaleWorkspaces.test.tsx (18 tests)"
        status: pass
      - kind: automated_ui
        ref: "Real built OpenTUI session at 90x28, 70x20, 50x18, and 39x11"
        status: pass
    human_judgment: false
  - id: D2
    description: "Canonical s entry, exact Escape restoration, retained forced refresh, generation rejection, and stale-first key ownership are revision safe."
    requirement: STALE-02
    verification:
      - kind: integration
        ref: "tests/tui/dashboard/StaleWorkspaces.test.tsx#width tiers, navigation, owned keys, and generation"
        status: pass
      - kind: automated_ui
        ref: "Real OpenTUI repeated-r probe plus Escape-only fallback key isolation"
        status: pass
    human_judgment: false
  - id: D3
    description: "Open and candidate lifecycle actions use fresh canonical descriptors, one-shot operation tracking, typed Force gating, and non-replaying reconciliation."
    requirement: STALE-04
    verification:
      - kind: integration
        ref: "tests/tui/dashboard/integ-workspace-archive-remove.test.tsx (9 tests)"
        status: pass
      - kind: integration
        ref: "tests/lib/service/workspace-action-authority.test.ts (8 tests)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Long safe text, exact UTC evidence, unknown/caution separation, bounded scrolling, and disclosure canaries remain readable at narrow and short terminal sizes."
    requirement: STALE-05
    verification:
      - kind: integration
        ref: "tests/tui/dashboard/StaleWorkspaces.test.tsx#long text, disclosure, and nested-text contracts"
        status: pass
      - kind: automated_ui
        ref: "Real OpenTUI narrow and too-small pane captures"
        status: pass
    human_judgment: false

duration: 50min
completed: 2026-07-17
status: complete
---

# Phase 127 Plan 08: Stale Workspace Intelligence and RC Closure Summary

**Keyboard-first OpenTUI stale-workspace intelligence with revision-safe retained evidence, durable canonical Open, guarded lifecycle authority, and exact responsive restoration**

## Performance

- **Duration:** 50 min
- **Started:** 2026-07-17T12:27:07Z
- **Completed:** 2026-07-17T13:17:23Z
- **Tasks:** 3
- **Files modified:** 5

## Accomplishments

- Added a dedicated `stale-workspaces` `UIView` and responsive renderer with wide split, medium stacked, narrow selected-detail, and Escape-only too-small layouts.
- Integrated lazy exact-revision evaluation, retained refresh/error data, monotonic generation acceptance, one authoritative conflict reload/retry, stable-ID selection, and exact origin restoration.
- Routed Open through fresh canonical inventory and durable operation identity; routed candidate actions through canonical Archive/Remove descriptors while retaining existing confirmation, dirty blocker, terminal shutdown, exact-name Force, and recovery behavior.
- Reconciled normal workspace state and stale evidence exactly once after lifecycle terminal results, preserving unrelated selection when its stable ID remains and never replaying the mutation.

## Task Commits

Each task was committed atomically:

1. **Task 1: Build the pure width-tiered StaleWorkspacesView** - `eed10fd1` (feat)
2. **Task 2: Add dedicated UIView state, lazy fetch, generations, and owned navigation keys** - `75624b34` (feat)
3. **Task 3: Wire canonical Open and lifecycle actions with authoritative reconciliation** - `560ccf13` (feat)

The RED contracts were committed earlier in Plan 127-02; these three commits are the corresponding GREEN implementation sequence.

## Files Created/Modified

- `packages/tui/src/StaleWorkspacesView.tsx` - Pure responsive stale evidence renderer, owned keyboard intents, bounded list/detail scrolling, one-shot local intent latches, and disclosure-safe text structure.
- `packages/tui/src/App.tsx` - Dedicated view state, official stale coordinator, exact origin restoration, canonical Open/action inventory, durable operation observation, lifecycle return context, and dual reconciliation.
- `packages/tui/src/types.ts` - Stale selection, origin, return context, and discriminated `UIView`/target typing.
- `packages/tui/src/WorkspaceRemovalDialog.tsx` - Noun-bearing safe/destructive lifecycle copy and deferred exact-name input focus after fresh Force authorization.
- `tests/tui/dashboard/integ-workspace-archive-remove.test.tsx` - Real App integration coverage for one-shot stale Open and exactly-once stale Archive reconciliation, alongside existing lifecycle safeguards.

## Decisions Made

- Kept stale evidence volatile and reused it only when its revision exactly matches current authoritative core state; explicit Refresh always bypasses service cache.
- Stored both the originating dashboard row and the selected stale row as stable identities so Escape, action cancellation, lifecycle failure, and post-operation refresh can restore valid context without client-side reordering.
- Used the shared operation tracker for Open so accepted operations reconnect by ID. An ambiguous submit is never replayed; recovery proceeds only if fresh inventory exposes the accepted pending operation identity.
- Limited stale `Workspace actions` presentation to service-provided Archive and Remove descriptors, including authoritative disabled reasons. Force is excluded until Remove returns the typed dirty result and a fresh inventory authorizes exact-name review.
- Preserved existing lifecycle mutation authority while adding one normal refresh followed by one forced stale evaluation after every terminal result.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Adapted OpenTUI testRender named-key streams without changing real terminal handling**
- **Found during:** Task 1
- **Issue:** The OpenTUI test helper emitted `home`, `end`, `pageup`, and `pagedown` as individual character events, causing action-key leakage and preventing the committed navigation contracts from exercising named-key behavior.
- **Fix:** Added a narrowly scoped synthetic-key accumulator after the real named-key branches; real terminals continue to use native key names first.
- **Files modified:** `packages/tui/src/StaleWorkspacesView.tsx`
- **Verification:** All 18 isolated stale view contracts and the full TUI suite pass.
- **Committed in:** `eed10fd1`

**2. [Rule 1 - Bug] Reserved wrapped status/footer geometry and removed narrow-pane text interruptions**
- **Found during:** Task 1
- **Issue:** OpenTUI wrapping did not reserve header/status heights automatically, footer rows overlapped, and border/scrollbar glyphs interrupted long safe identities in narrow captures.
- **Fix:** Added explicit wrapped heights, fixed footer rows, hidden scrollbar glyphs, and a borderless narrow detail pane while retaining wide/medium pane borders.
- **Files modified:** `packages/tui/src/StaleWorkspacesView.tsx`
- **Verification:** Exact width/height boundaries, long-text continuity, and overflow contracts pass.
- **Committed in:** `eed10fd1`

**3. [Rule 2 - Missing Critical] Carried stale return authority through lifecycle targets and updated locked confirmation copy**
- **Found during:** Task 3
- **Issue:** App-only wiring could not safely restore stale context through canonical confirmations, dirty review, Force review, Undo, or terminal failure; existing generic `Cancel` copy also did not meet the locked noun-bearing UI specification.
- **Fix:** Added typed stale return context to action/lifecycle targets, restored the exact row after every cancellation/failure path, and updated Remove/Force safe hints without weakening existing lifecycle authority.
- **Files modified:** `packages/tui/src/types.ts`, `packages/tui/src/App.tsx`, `packages/tui/src/WorkspaceRemovalDialog.tsx`, `tests/tui/dashboard/integ-workspace-archive-remove.test.tsx`
- **Verification:** Nine lifecycle integration tests, full TUI suite, and live Escape restoration pass.
- **Committed in:** `560ccf13`

**4. [Rule 1 - Bug] Prevented a failed post-lifecycle stale refresh from issuing a second evaluation**
- **Found during:** Task 3 code review
- **Issue:** Returning to the stale view after a failed lifecycle reconciliation could interpret the missing compatible response as a normal reopen and start another evaluation, violating the exactly-once terminal reconciliation contract.
- **Fix:** Preserved first-load/retained error state on lifecycle return and required the user-owned view-level Retry path for any subsequent request.
- **Files modified:** `packages/tui/src/App.tsx`
- **Verification:** The stale Archive integration asserts exactly one initial request and one post-terminal forced request.
- **Committed in:** `560ccf13`

**5. [Rule 1 - Bug] Restored deferred Force input focus after asynchronous fresh authorization**
- **Found during:** Full `npm run test:tui` verification
- **Issue:** Fresh Force inventory authorization made the dialog mount asynchronously; timer-based focus then occurred after the integration harness began typing, leaving exact-name input inert.
- **Fix:** Deferred focus with a post-mount microtask, still isolating the activation key while making asynchronously authorized dialogs ready deterministically.
- **Files modified:** `packages/tui/src/WorkspaceRemovalDialog.tsx`, `tests/tui/dashboard/integ-workspace-archive-remove.test.tsx`
- **Verification:** The focused lifecycle file passes 9/9 and the full isolated TUI suite passes.
- **Committed in:** `560ccf13`

---

**Total deviations:** 5 auto-fixed (4 Rule 1 bugs, 1 Rule 2 missing critical requirement)
**Impact on plan:** All fixes were required for the locked responsive, lifecycle, focus, and non-replay contract. No new transport, persistence, provider policy, or release scope was added.

## Issues Encountered

- Context7 was unavailable in the executor environment (`ctx7` was not installed). No package was installed or substituted; implementation followed repository-pinned OpenTUI 0.4.3 declarations and established local patterns.
- The full TUI suite initially exposed stale lifecycle copy expectations and asynchronous Force-input focus timing; production copy, focus sequencing, and integration expectations were corrected together.
- Runtime verification used an isolated real OpenTUI process with an empty temporary config. Safety policy blocked recursive deletion outside the repository, so `/tmp/git-stacks-12708-runtime-UeZgNg` and small `/tmp` pointer/log files may remain; the tmux session and service were stopped.
- The GSD requirements handler did not recognize this repository's colon-inside-bold requirement form (`**STALE-01:**`), and the legacy progress updater found no body-level progress field. The exact Plan 08 checkboxes and structured 36/42 (86%) state were reconciled directly after both handlers reported their unsupported surfaces; the roadmap handler completed normally.

## Verification

- `bun test --preload @opentui/solid/preload tests/tui/dashboard/StaleWorkspaces.test.tsx` - 18 tests passed.
- `bun test --preload @opentui/solid/preload tests/tui/dashboard/integ-workspace-archive-remove.test.tsx` - 9 tests passed, including one-shot stale Open and exactly-once stale Archive reconciliation.
- `npm run test:tui` - complete isolated OpenTUI suite passed; each file ran in its own Bun process.
- `npm run typecheck --workspace @git-stacks/tui` - passed.
- `npm run tui:build` - passed.
- `npx vitest run tests/lib/service/workspace-action-authority.test.ts` - 8 tests passed.
- `npm run test:architecture` - package architecture passed.
- `git diff --check` - passed.
- Real built OpenTUI session - opened Stale Workspaces at 90x28, resized through 70x20 and 50x18, confirmed the 39x11 Escape-only fallback, sent inert Open/Refresh/Actions/navigation keys in fallback, and restored the originating dashboard with Escape. Repeated `r` remained stable and no editor, terminal handoff, lifecycle mutation, or outward release action was invoked.

## Known Stubs

None. Empty signals and arrays in modified files are controlled input/state initializers, not mock product data or unwired stale-workspace presentation.

## Threat Review

No unplanned threat surface was introduced. The TUI uses the existing official secure service adapter and strict protocol DTOs, adds no endpoint, schema, filesystem read, provider command, credential projection, raw environment display, or local stale classification. Open and lifecycle mutations remain service-authorized, generation/revision mismatches fail closed, ambiguous operation submission is never replayed, and Force remains inaccessible until fresh typed authority.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- The complete OpenTUI stale-workspace surface is ready for cross-client conformance, populated live evidence, and Phase 127 RC closure checks.
- Live runtime verification intentionally covered only non-destructive empty-state navigation, refresh, resizing, fallback isolation, and restoration. Populated Open/lifecycle authority is covered deterministically by the isolated integration suites and remains available for the broader Phase 127 live evidence plan.

## Self-Check: PASSED

- Confirmed the summary and all five implementation/test files exist.
- Confirmed task commits `eed10fd1`, `75624b34`, and `560ccf13` exist in repository history.

---
*Phase: 127-stale-workspace-intelligence-and-rc-closure*
*Completed: 2026-07-17*
