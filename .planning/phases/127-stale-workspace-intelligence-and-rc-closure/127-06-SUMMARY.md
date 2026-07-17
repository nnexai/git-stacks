---
phase: 127-stale-workspace-intelligence-and-rc-closure
plan: "06"
subsystem: cross-client-stale-coordination
status: complete
tags: [stale-workspaces, browser-safe-client, generation-gate, revision-retry, shortcuts, opentui, secure-service-client]

requires:
  - phase: 127-02
    provides: strict browser-safe stale request/response schemas and finite evidence vocabularies
  - phase: 127-05
    provides: revision-first workspace.stale.evaluate route and strict trusted service-client fetch seam
provides:
  - browser-safe shared stale presentation with fixed evidence copy, exact UTC plus relative time, and preserved service row order
  - monotonic generation and exact-revision newest-write-wins response gating
  - exactly one authoritative conflict reload and retry with superseded-response rejection
  - persisted global workspace.stale shortcut defaults plus a distinct non-persisted stale-view refresh registry
  - trusted TUI stale fetch bridge and shared-semantics request gate/coordinator
  - hidden service-client retry suppression so stale conflicts remain owned by the shared coordinator

affects: [127-07, 127-08, 127-09, stale-workspace-web, stale-workspace-tui, shortcut-settings, trusted-service-client]

tech-stack:
  added: []
  patterns:
    - exhaustive protocol-code presentation records in the browser-safe client
    - monotonic generation plus exact expected-revision response acceptance
    - one typed conflict reload and one retry without mutation replay
    - separate persisted-global and active-view-scoped shortcut vocabularies
    - TUI service access isolated through an official adapter over @git-stacks/service/client

key-files:
  created:
    - packages/client/src/stale-workspaces.ts
    - tests/service/stale-official-client.test.ts
    - tests/tui/dashboard/official-stale-service.test.ts
  modified:
    - packages/protocol/src/web.ts
    - packages/client/src/shortcuts.ts
    - packages/core/src/config.ts
    - packages/core/src/web-shortcuts.ts
    - packages/service/src/policy/client.ts
    - packages/tui/src/official-service.ts
    - packages/tui/src/workspace-action-inventory.ts
    - packages/web/src/overlay-controller.ts

key-decisions:
  - "Shared stale presentation preserves service candidate/incomplete order and sorts only confirmed reasons within a row by the locked finite reason order; no client rank or score exists."
  - "A stale response is accepted only when its request generation is newest and its response revision exactly equals the token's expected revision."
  - "workspace.stale.refresh is a protocol/client scoped action for stale-view ownership only; it never enters persisted settings, core defaults, collision ownership, or browser-global dispatch."
  - "The TUI delegates stale generation and one-conflict recovery to @git-stacks/client and reaches the service only through packages/tui/src/official-service.ts."
  - "fetchStaleWorkspaceEvaluation disables transport-level retry so the only conflict recovery is the explicit authoritative reload plus one shared retry."

requirements-completed: [STALE-02, STALE-04, STALE-05]

coverage:
  - id: D1
    description: "Web and TUI can consume one browser-safe stale presentation vocabulary with fixed reason/unknown/caution copy, exact UTC plus relative time, service order, and no score."
    requirement: STALE-02
    verification:
      - kind: unit
        ref: "tests/service/phase127-cross-client-conformance.test.ts — shared presentation, timestamp, order, sanitization, and count contracts"
        status: pass
      - kind: other
        ref: "built @git-stacks/client public package observation — preserved service order, fixed labels, exact UTC, and relative time"
        status: pass
    human_judgment: false
  - id: D2
    description: "Concurrent stale loads use monotonic generations and exact revisions; one typed conflict reloads authoritative state and retries once, while later conflicts and superseded work stop."
    requirement: STALE-02
    verification:
      - kind: unit
        ref: "tests/service/phase127-cross-client-conformance.test.ts — 6 shared generation, conflict, action-latch, and reconciliation tests pass"
        status: pass
      - kind: unit
        ref: "tests/service/stale-official-client.test.ts — service client issues one RPC attempt per shared coordinator attempt"
        status: pass
    human_judgment: false
  - id: D3
    description: "The canonical global stale entry is rebindable/unbindable with exact macOS/Linux KeyS defaults, while refresh remains active-view-only KeyR/R and TUI r metadata."
    requirement: STALE-04
    verification:
      - kind: integration
        ref: "web shortcut contract/config/client/navigation/overlay suites — 72/72 tests pass"
        status: pass
      - kind: other
        ref: "built protocol/client/core package observation — nine global IDs, one scoped ID, exact S chords, inactive/repeat guards, and no global R match"
        status: pass
    human_judgment: false
  - id: D4
    description: "The TUI has one strict official stale fetch seam and composes shared response gating/retry without importing service implementation, core, Git, provider, process, or filesystem authority."
    requirement: STALE-05
    verification:
      - kind: integration
        ref: "tests/tui/dashboard/official-stale-service.test.ts — strict request/signal forwarding, one-conflict composition, and import isolation; 3/3 pass"
        status: pass
      - kind: integration
        ref: "focused StaleWorkspaces generation gate plus WorkspaceParity inventory/notes gates — 17/17 pass"
        status: pass
      - kind: other
        ref: "npm run test:architecture — Package architecture: OK"
        status: pass
    human_judgment: false

duration: 29min 57sec
completed: 2026-07-17
---

# Phase 127 Plan 06: Shared Stale Client Coordination, Shortcuts, and Trusted TUI Adapter Summary

**Browser-safe stale presentation and newest-write-wins coordination now pair with canonical global/scoped shortcuts and a trusted TUI service bridge whose conflict recovery is exactly one authoritative reload and retry.**

## Performance

- **Duration:** 29 min 57 sec
- **Started:** 2026-07-17T11:20:24Z
- **Completed:** 2026-07-17T11:50:21Z
- **Tasks:** 3
- **Production files modified:** 11
- **Total files changed:** 20

## Accomplishments

- Added one browser-safe stale presentation module that strict-parses the protocol response, preserves candidate and incomplete row order, applies only the approved within-row reason order, and exposes fixed neutral reason/unknown/caution labels with exact UTC plus relative timestamps.
- Added monotonic request tokens and exact expected-revision acceptance. Concurrent older work, wrong revisions, post-exit responses, aborts, and ordinary failures are deterministic; a typed conflict performs one authoritative reload and one retry without a loop.
- Kept Open/Archive/Remove/Force execution on the existing synchronous-latch workspace action registry and corrected canonical Force Remove presentation without creating renderer-local labels or descriptors.
- Added `workspace.stale` atomically to protocol, core config/default authority, client metadata, and generated help/settings rows with Ctrl+Command+S on macOS, Ctrl+Alt+Shift+S on Linux, and TUI key `s`.
- Added a separate exhaustive `workspace.stale.refresh` scoped registry with stale-view ownership, physical `KeyR`, web label `R`, TUI key `r`, accessibility copy, composition/Process/Dead/AltGraph/repeat guards, and no persisted/global binding.
- Exposed the strict stale fetcher through the official TUI bridge, composed TUI request gates/coordinators from shared client primitives, and disabled the service client's hidden same-revision retry.

## Task Commits

Each task was committed atomically with normal Git hooks:

1. **Task 1: Add shared stale presentation, generations, and one-conflict coordination** — `730eee37` (`feat`)
2. **Task 2 RED: Define canonical global/scoped shortcut contracts** — `de77a1a9` (`test`)
3. **Task 2 GREEN: Register stale entry and scoped refresh shortcuts** — `425a60d2` (`feat`)
4. **Task 3 RED: Define trusted TUI stale adapter and retry boundary** — `f4220c6d` (`test`)
5. **Task 3 GREEN: Expose trusted TUI stale fetch and shared request coordination** — `74d280b6` (`feat`)

**Plan metadata:** committed separately with this summary and shared tracking updates.

## TDD Gate Compliance

- Task 1 began from the guarded Phase 127 stale presentation/generation contracts and produced the browser-safe implementation plus persistent focused coverage in `730eee37`; the initial RED run failed on the missing shared module as expected.
- Task 2 has an explicit RED commit (`de77a1a9`) followed by GREEN (`425a60d2`). The RED suite reported 11 failures for the absent ninth global action, scoped registry, active-scope matcher, repeat suppression, and generated UI row; the final suite passes 72/72.
- Task 3 has an explicit RED commit (`f4220c6d`) followed by GREEN (`74d280b6`). RED observed two same-revision service RPC attempts and an absent TUI bridge export; GREEN proves one service attempt per shared coordinator attempt and exact request/signal forwarding.
- The plan frontmatter is `type: execute`, so no plan-level RED/GREEN sequence warning applies. No future renderer module or assertion was weakened to obtain green results.

## Files Created/Modified

- `packages/client/src/stale-workspaces.ts` — Fixed finite presentation maps, exact/relative timestamps, service-order preservation, generation gate, one-conflict load coordinator, and canonical action-registry delegation.
- `packages/client/src/index.ts` — Browser-safe stale helper exports.
- `packages/client/src/workspace-actions.ts` — Canonical approved `Force Remove` label while retaining the existing one-shot descriptor coordinator.
- `packages/protocol/src/web.ts` — Ninth persisted/global `workspace.stale` ID and distinct `WEB_SCOPED_SHORTCUT_ACTION_IDS` vocabulary for refresh.
- `packages/client/src/shortcuts.ts` — Exhaustive global stale metadata, TUI `s`, scoped refresh metadata, and active-scope physical-key matcher.
- `packages/core/src/config.ts` — Strict global-config override support for `workspace.stale` only.
- `packages/core/src/web-shortcuts.ts` — Exact KeyS platform defaults, collision ownership, revisioned rebind/unbind authority, and no scoped refresh persistence.
- `packages/web/src/overlay-controller.ts` — Generated keyboard help/settings grouping now includes the canonical global stale entry without copying its label or binding.
- `packages/service/src/policy/client.ts` — Strict stale request/response parsing with transport retry disabled so conflict recovery remains single-owner.
- `packages/tui/src/official-service.ts` — The only TUI stale fetch import from `@git-stacks/service/client`.
- `packages/tui/src/workspace-action-inventory.ts` — TUI aliases over shared stale response gating and one-conflict load coordination, beside unchanged action/notes gates.
- `tests/helpers/phase127-client-fixtures.ts` — Disclosure canary correction that retains the full argv canary without banning benign words such as `status`.
- `tests/service/phase127-cross-client-conformance.test.ts` — Shared presentation, generation, conflict, one-shot action, and reconciliation contracts.
- `tests/service/web-shortcut-contract.test.ts` — Exact protocol/core/client global parity and explicit scoped refresh exclusion.
- `tests/lib/client-shortcuts.test.ts` — Platform defaults, active-scope refresh matching, and input guard coverage.
- `tests/lib/web-shortcut-config.test.ts` — Nine defaults plus stale-specific rebind/unbind coverage.
- `tests/service/web-keyboard-navigation.test.ts` — Ninth registry entry and repeat suppression at document/xterm boundaries.
- `tests/service/web-keyboard-overlays.test.ts` — Ninth generated help/settings row using canonical stale copy.
- `tests/service/stale-official-client.test.ts` — Exact one-RPC-per-attempt service-client retry contract.
- `tests/tui/dashboard/official-stale-service.test.ts` — Trusted bridge forwarding, shared coordinator composition, and import isolation.
- `.planning/phases/127-stale-workspace-intelligence-and-rc-closure/deferred-items.md` — Future renderer RED boundary and pre-existing TUI listener warning.

## Decisions Made

- Presentation is a strict transform, not policy: service row order is immutable, no score/rank/safety claim exists, and only confirmed reasons inside one row receive the approved finite display order.
- The shared gate owns newest-write-wins through both generation equality and exact revision equality. A response that satisfies only one condition is ignored.
- Conflict recovery belongs at the shared client coordinator. The trusted service client performs one RPC attempt, allowing exactly one authoritative reload and retry rather than two nested retry layers.
- The global stale entry is persisted and collision-owned; refresh is a separate scoped protocol/client action with unmodified `R` accepted only after stale-view ownership is explicit.
- TUI code consumes the official service bridge and shared browser-safe coordination primitives. It does not recreate response gates, retry loops, lifecycle labels, or action descriptors.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Contract Bug] Reconciled canonical action copy and disclosure canaries**
- **Found during:** Task 1 shared presentation verification
- **Issue:** One cross-client assertion expected the obsolete local label `Open`, the canonical registry's Force label did not match the approved `Force Remove` copy, and spreading argv tokens made benign words such as `status` fail disclosure checks.
- **Fix:** Kept `Open workspace` and `Force Remove` in the shared action-label authority, updated the assertion, and retained argv as one joined command canary instead of banning each generic token.
- **Files modified:** `packages/client/src/workspace-actions.ts`, `tests/service/phase127-cross-client-conformance.test.ts`, `tests/helpers/phase127-client-fixtures.ts`
- **Verification:** Phase 126 action conformance 11/11 and focused Phase 127 shared contracts pass.
- **Committed in:** `730eee37`

**2. [Rule 2 - Missing Critical Functionality] Added the global stale entry to generated help/settings grouping**
- **Found during:** Task 2 shortcut UI verification
- **Issue:** Global metadata alone did not add the ninth action to the web help/settings surface because existing rows use a manual category grouping. Leaving it unchanged would make the binding technically configurable but undiscoverable in the required UI.
- **Fix:** Added `workspace.stale` to the existing Workspace group while continuing to source its label and effective binding from shared metadata/settings.
- **Files modified:** `packages/web/src/overlay-controller.ts`, `tests/service/web-keyboard-overlays.test.ts`
- **Verification:** Overlay and navigation shortcut suites pass with nine rows and canonical copy.
- **Committed in:** `425a60d2`

**3. [Rule 1 - Retry Bug] Disabled hidden service-client retry for stale conflicts**
- **Found during:** Task 3 trusted adapter implementation
- **Issue:** `secureRequest` defaults to two attempts, so one revision conflict could replay the same stale request internally before the shared coordinator performed its authoritative reload/retry. That violated the exact-one-retry contract.
- **Fix:** Passed `retry: false` for `workspace.stale.evaluate`; the shared coordinator remains the sole conflict-recovery owner.
- **Files modified:** `packages/service/src/policy/client.ts`, `tests/service/stale-official-client.test.ts`
- **Verification:** The RED test observed two RPCs; GREEN observes exactly one RPC for the attempt, while the TUI coordinator test observes exactly two fetches around one authoritative reload.
- **Committed in:** `74d280b6`

**4. [Rule 1 - State Tracking] Corrected malformed SDK decision labels and stale activity metadata**
- **Found during:** Plan closeout state updates
- **Issue:** `state.add-decision` inserted all three Plan 127-06 decisions as `[Phase ?]`, and `state.advance-plan` retained the Plan 127-05 activity description. The legacy progress updater also reported no matching prose field even though frontmatter counters advanced to 34/42.
- **Fix:** Relabeled the decisions to Phase 127 and updated both activity fields to the Plan 127-06 result while preserving the SDK-owned Plan 7 position, 34 completed plans, and roadmap count.
- **Files modified:** `.planning/STATE.md`
- **Verification:** State frontmatter and Current Position agree on Phase 127 Plan 7; ROADMAP reports 6/14 plans executed.
- **Committed in:** Final plan metadata commit

**Total deviations:** 4 auto-fixed (3 Rule 1 bugs/tracking corrections, 1 Rule 2 missing critical integration).
**Impact on plan:** All fixes were required to preserve canonical copy, discoverability, disclosure correctness, exact-one-retry behavior, and accurate planning state. No renderer implementation or new authority was pulled forward.

## Authentication Gates

None. No credentials, provider login, remote target, package install, or external service access was required.

## Issues Encountered

- A temporary `tsx -e` package-boundary probe selected CommonJS output and rejected top-level await, then hit an exported-path mismatch. Running the same observation from an ESM `.mts` boundary resolved the harness issue; no product code changed for it.
- The plan's full cross-client conformance command still selects seven web/TUI renderer assertions for `packages/web/src/stale-workspaces.ts` and `packages/tui/src/StaleWorkspacesView.tsx`, assigned to Plans 127-07 and 127-08. The command produced 29 passing shared/shortcut tests and seven expected future-renderer failures; focused Plan 127-06 contracts are green and no placeholder modules were added.
- The exact Task 3 selector produced five passing generation/action tests plus the same future renderer availability failure. Dedicated official-adapter and service-client tests cover the Task 3 seam directly.
- The Phase 127 static architecture regex initially treated a scoped literal located near the global protocol import as global metadata. Keying the scoped record directly from `WEB_SCOPED_SHORTCUT_ACTION_IDS[0]` removed duplicate literal vocabulary and made the boundary probe report zero violations.
- `WorkspaceParity.test.tsx` passes all 16 tests but emits pre-existing `TerminalConsoleCache` EventTarget listener warnings. The warning is recorded in `deferred-items.md`; this plan did not change that cache or listener lifecycle.
- `requirements.mark-complete STALE-02 STALE-04 STALE-05` returned `not_found` because the root requirements file's bold full-phase checkbox format is not recognized by the current handler. Consistent with earlier Phase 127 plans, the incomplete full web/TUI requirements were not manually checked early.
- No dependency install, authentication gate, tag, push, publish, release creation, release workflow dispatch, or outward-facing action occurred.

## Verification

- Shared Phase 127 presentation/generation/action conformance selector — 6/6 pass, 7 future-renderer tests skipped.
- Shortcut and trusted-adapter Vitest suites — 7 files, 84/84 tests pass.
- `tests/tui/dashboard/official-stale-service.test.ts` — 3/3 pass in an isolated Bun process.
- Focused TUI stale generation gate — 1/1 pass with 17 future view tests filtered out.
- `tests/tui/dashboard/WorkspaceParity.test.tsx` — 16/16 pass; warnings documented separately.
- `npm run typecheck` — all protocol, client, core, CLI, service, web, and TUI workspaces pass.
- `npm run build:packages` — protocol, client, core, CLI, service, and web packages build successfully after the final source changes.
- `npm run build --workspace @git-stacks/client` and `npm run tui:build` — pass.
- `npm run test:architecture` — `Package architecture: OK`.
- Built public package observation confirmed exact global/scoped vocabularies, macOS/Linux KeyS defaults, TUI `s`/`r`, active stale-view acceptance, repeat/composition rejection, and no browser-global unmodified `R` match.
- `git diff --check` — pass. All task commits used normal hooks and no tracked file was deleted.

## Known Stubs

None. Empty arrays and strings found by the scan are existing bounded accumulators, test harness state, or legitimate option defaults. No TODO, FIXME, placeholder copy, hardcoded production response, mock production data source, or unwired component was introduced. The web and TUI renderer modules remain intentionally absent for Plans 127-07 and 127-08 rather than being represented by stubs.

## User Setup Required

None. The new shared/client/TUI seams use existing protocol, configuration, and managed-service infrastructure.

## Next Phase Readiness

- Plan 127-07 can register the global `workspace.stale` action in the web singleton overlay and consume `WEB_SCOPED_SHORTCUT_ACTION_METADATA`, `presentStaleWorkspaceResponse`, and the shared load coordinator without local copy, sorting, or retry logic.
- Plan 127-08 can call `officialService.fetchStaleWorkspaceEvaluation`, use `createStaleWorkspaceRequestGate` or `createStaleWorkspaceRequestCoordinator`, and preserve existing action/notes gate behavior.
- Plan 127-09 retains the deterministic future-renderer, hostile-authority, and full conformance closure boundary recorded in `deferred-items.md`.

## Self-Check: PASSED

- All required production, test, deferred-item, and summary files exist at their expected paths.
- Task commits `730eee37`, `de77a1a9`, `425a60d2`, `f4220c6d`, and `74d280b6` exist in Git history.
- The Plan 127-06 commit range contains no tracked file deletion.
- Verification completed before state advancement and the final metadata commit.

---
*Phase: 127-stale-workspace-intelligence-and-rc-closure*
*Completed: 2026-07-17*
