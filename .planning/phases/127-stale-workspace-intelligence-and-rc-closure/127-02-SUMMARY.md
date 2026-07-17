---
phase: 127-stale-workspace-intelligence-and-rc-closure
plan: "02"
subsystem: testing-contracts
status: complete
tags: [vitest, bun, opentui, web-overlay, cross-client, stale-workspaces, release-authority, red-contract]

requires:
  - phase: 126-web-workflow-and-forge-source-parity
    provides: canonical action inventory, one-shot lifecycle submission, durable operation reconciliation, browser overlay, and OpenTUI interaction patterns
  - phase: 127-stale-workspace-intelligence-and-rc-closure
    plan: "01"
    provides: deterministic stale response/evidence fixtures, disclosure canaries, and named guarded-import RED conventions
provides:
  - renderer-neutral stale client states, copy, lifecycle inventories, long-text data, and disclosure canaries
  - guarded web overlay and isolated OpenTUI RED matrices for every approved stale-workspace UI state and interaction
  - shared-presentation, generation, one-conflict retry, action, and durable-operation cross-client conformance contracts
  - hostile architecture sentinels for renderer authority, disclosure, evaluator mutation, scoped refresh, package direction, and daemonless CLI boundaries
  - green hermetic no-tag release validation proving repeated checks request no tag, push, publish, GitHub Release, workflow dispatch, or real network command
  - executable default-package and planning-tree preservation fences before RC metadata changes
  - no production placeholders, RC metadata changes, or outward release actions
'affects': [127-03, 127-05, 127-06, 127-07, 127-08, 127-09, 127-10, 127-11, 127-12, stale-ui, cross-client-parity, release-closure]

tech-stack:
  added: []
  patterns: [guarded renderer imports, renderer-neutral fixture vocabulary, isolated OpenTUI test files, hostile static authority scanners, PATH-only release command shims, planning-tree mirror sentinels]

key-files:
  created:
    - tests/helpers/phase127-client-fixtures.ts
    - tests/service/web-stale-workspaces.test.ts
    - tests/tui/dashboard/StaleWorkspaces.test.tsx
    - tests/service/phase127-cross-client-conformance.test.ts
    - tests/architecture/phase127-stale-authority.test.mjs
  modified:
    - tests/commands/release-rc.test.ts
    - tests/architecture/release-publish.test.mjs

key-decisions:
  - "One renderer-neutral fixture and copy vocabulary drives web, OpenTUI, and cross-client assertions; renderers may adapt placement but cannot own policy, ordering, labels, or action authority."
  - "Net-new client modules are loaded through guarded test-lifecycle file-URL imports so every approved matrix row is discovered and fails through a named Phase 127 assertion rather than transform or discovery failure."
  - "Static renderer authority checks apply broad mutation-command detection only to stale-specific surfaces while integration files remain subject to stale policy/probe checks, preventing unrelated canonical lifecycle code from becoming a false positive."
  - "Pre-metadata release validation runs twice with PATH restricted to recording npm, git, gh, curl, and wget shims; success requires zero Git/provider/network calls and exact preservation of a mirror of every existing planning phase directory."
  - "Intentional RED remains valid only when every nonzero result is an absent Phase 127 production contract and all hostile, fixture, discovery, unrelated-suite, release-fence, and diff-hygiene checks remain healthy."

patterns-established:
  - "Renderer contracts expose controller/view adapters through guarded imports and repeat the same named availability assertion from every discovered state or interaction case."
  - "Cross-client parity feeds one service-ordered response through shared presentation and real renderer adapters; clients cannot copy labels, re-sort rows, infer evidence, or replay mutations."
  - "Release side-effect tests execute the real validation script from a temporary metadata fixture while all command authority is replaced by recording shims and the planning tree is represented by per-directory sentinels."

requirements-completed: [STALE-02, STALE-03, STALE-04, STALE-05, REL-01, REL-02]

coverage:
  - id: D1
    description: "Web and OpenTUI stale-workspace state, focus, layout, keyboard, refresh, Open, lifecycle, overflow, and disclosure behavior is frozen in complete guarded RED matrices."
    requirement: STALE-02
    verification:
      - kind: automated_ui
        ref: "tests/service/web-stale-workspaces.test.ts — 18 cases discovered; 1 fixture contract passes and 17 named missing-web-module assertions intentionally remain RED"
        status: pass
      - kind: automated_ui
        ref: "npm run test:tui — StaleWorkspaces.test.tsx reports 18 named Phase 127 failures and zero unrelated failures; all pre-existing isolated TUI files pass"
        status: pass
    human_judgment: false
  - id: D2
    description: "Shared presentation, service order, labels, timestamps, evidence separation, generation rejection, one-conflict recovery, and durable-operation behavior is identical across web and TUI contracts."
    requirement: STALE-04
    verification:
      - kind: integration
        ref: "tests/service/phase127-cross-client-conformance.test.ts — 11 cases discovered and intentionally RED only on the missing shared client module"
        status: pass
    human_judgment: false
  - id: D3
    description: "Hostile architecture checks deny renderer-owned probes, Git/provider/process authority, stale inference, evaluator mutation, browser disclosure, global refresh routing, and deterministic evidence spoofing."
    requirement: STALE-03
    verification:
      - kind: unit
        ref: "tests/architecture/phase127-stale-authority.test.mjs — 40 hostile/current-boundary checks pass and exactly 4 named production absences remain RED"
        status: pass
    human_judgment: false
  - id: D4
    description: "Repeated pre-metadata RC validation remains local-only, keeps TUI/Bun/OpenTUI out of the default package graph, and preserves every planning phase directory without requiring future RC metadata."
    requirement: REL-02
    verification:
      - kind: integration
        ref: "tests/commands/release-rc.test.ts -t 'Phase 127 pre-metadata release authority' — 1/1 selected test passes after two hermetic no-tag runs"
        status: pass
      - kind: unit
        ref: "tests/architecture/release-publish.test.mjs — 8/8 pass"
        status: pass
    human_judgment: false

duration: 35min
completed: 2026-07-17
---

# Phase 127 Plan 02: Stale Client and Release Authority RED Contracts Summary

**Renderer-neutral web/OpenTUI stale-workspace contracts, shared cross-client authority sentinels, and a repeatable hermetic no-tag RC fence now define the complete client and release boundary without adding product placeholders or changing release metadata.**

## Performance

- **Duration:** 35 min
- **Started:** 2026-07-17T09:20:00Z
- **Completed:** 2026-07-17T09:54:37Z
- **Tasks:** 3
- **Files created:** 5
- **Files modified:** 2
- **Production files modified:** 0

## Accomplishments

- Added one renderer-neutral client fixture vocabulary covering exact approved copy, service ordering, empty/incomplete/populated/refreshed responses, all UI transition phases, canonical action inventories, dirty-only Force Remove reauthorization, durable lifecycle outcomes, long bounded identities, and disclosure/safety-claim canaries.
- Added complete guarded web and isolated OpenTUI matrices for empty, loading, error, populated, partial, overflow, zero/one/many, and long-text behavior, including singleton focus restoration, context-only refresh, exact responsive tiers, one-shot Open/actions, late generations, and no nested OpenTUI text.
- Added shared cross-client presentation and authority contracts for exact UTC plus relative timestamps, fixed labels, reason/unknown/caution separation, canonical action order, disabled explanations, one revision retry, synchronous latching, and operation-ID-only reconnect.
- Added 44 hostile/current-tree architecture checks denying browser/TUI probe, provider, Git, filesystem, process, local ranking, evaluator mutation, disclosure, stale CLI, global refresh, package-direction, and deterministic-evidence violations.
- Added a green, uniquely filtered pre-metadata release suite that runs the real RC check twice with fake command authority, proves zero outward release calls, and verifies every mirrored planning phase directory remains intact.

## Task Commits

Each task was committed atomically with normal Git hooks:

1. **Task 1: Write RED web and TUI state-machine contracts for all approved UI considerations** — `dad5cb30`
2. **Task 2: Write RED cross-client parity and hostile authority architecture contracts** — `f69e6b16`
3. **Task 3: Lock the pre-metadata release side-effect and planning-preservation boundary** — `b8237d64`

## Files Created/Modified

- `tests/helpers/phase127-client-fixtures.ts` — Shared copy, client response/state, action inventory, lifecycle outcome, long-text, ordering, and disclosure fixtures.
- `tests/service/web-stale-workspaces.test.ts` — Guarded web controller/DOM adapter matrix for states, focus, shortcuts, actions, reconciliation, responsiveness, and disclosure.
- `tests/tui/dashboard/StaleWorkspaces.test.tsx` — Isolated Bun/OpenTUI view matrix for width tiers, navigation, input ownership, refresh generations, Open/actions, restoration, text shape, and disclosure.
- `tests/service/phase127-cross-client-conformance.test.ts` — Same-response shared/web/TUI presentation, generation, retry, action-latch, and operation-reconciliation conformance matrix.
- `tests/architecture/phase127-stale-authority.test.mjs` — Hostile authority/disclosure/evidence fixtures plus current-tree package, CLI, evaluator, schema, and scoped-refresh sentinels.
- `tests/commands/release-rc.test.ts` — Uniquely named hermetic repeat-run no-tag suite with PATH-only command recorders and mirrored planning-tree sentinels.
- `tests/architecture/release-publish.test.mjs` — Explicit tag guard, no outward command, default-package exclusion, and planning-tree preservation assertions.

## Decisions Made

- Web and TUI tests share response, copy, action, and lifecycle fixtures; renderer-specific tests describe interaction and layout only, never policy or a duplicate expected-label table.
- Missing future production modules are deliberate Wave 0 RED boundaries. They are caught in guarded setup and reasserted by every named test so the entire matrix remains visible before implementation.
- Client authority is fail-closed: stale renderers cannot import trusted machine authority, classify or sort locally, execute provider/Git commands, manufacture evidence, or expose paths, credentials, process output, environment values, scores, or cleanup-safety claims.
- Release validation authority is tested independently from future `0.22.0-rc.1` metadata. The current RC version and a temporary matching changelog are sufficient to exercise the real no-tag control flow twice without real npm, Git, provider, or network work.
- Local build, coverage, audit, and package commands remain legitimate future validation activity; the prohibited boundary is outward tag, push, publish, GitHub Release, and release-only workflow authority.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Scoped broad mutation scanning to stale renderer modules**
- **Found during:** Task 2 (hostile authority architecture contracts)
- **Issue:** The initial scanner applied stale mutation-command rejection to all of `packages/web/src/app.ts`, falsely flagging existing canonical lifecycle functions such as `archiveWorkspace`.
- **Fix:** Kept broad mutation scanning on stale-specific renderer modules and limited integration files to stale policy/probe symbols.
- **Files modified:** `tests/architecture/phase127-stale-authority.test.mjs`
- **Verification:** The architecture suite retained every hostile rejection while the current web/TUI tree passed its unrelated-authority scan.
- **Committed in:** `f69e6b16`

**2. [Rule 1 - Bug] Corrected directory handling in the disclosure scanner**
- **Found during:** Task 2 (hostile authority architecture contracts)
- **Issue:** The first implementation passed `packages/web/src` to a helper that reads a single file, producing an unrelated `EISDIR` failure.
- **Fix:** Directory roots now enumerate source files, while optional single-file roots continue through guarded reads.
- **Files modified:** `tests/architecture/phase127-stale-authority.test.mjs`
- **Verification:** The architecture suite finishes with 40 passing checks and exactly four named Phase 127 production absences.
- **Committed in:** `f69e6b16`

**3. [Rule 1 - State Tracking] Corrected malformed GSD decision labels and stale activity copy**
- **Found during:** Plan closeout state updates
- **Issue:** `state.add-decision` inserted the four Plan 02 entries as `[Phase ?]`, and plan advancement retained Plan 01 in both activity descriptions even though position and progress advanced correctly.
- **Fix:** Relabeled the decisions to `[Phase 127]` and updated machine-readable and prose activity descriptions to Plan 02 while preserving Plan 3 of 14, 30/42 completed plans, 71% progress, metrics, and session data.
- **Files modified:** `.planning/STATE.md`
- **Verification:** State reports Phase 127 Plan 3 of 14, the Plan 02 completion activity, four correctly labeled decisions, 30 completed plans, 71%, and the Plan 02 metric/session row.
- **Committed in:** Final plan metadata commit

**Total deviations:** 3 auto-fixed bugs.
**Impact on plan:** The scanner fixes preserve precise intentional RED classification, and the state correction preserves accurate sequential execution metadata. No production, metadata, package, or release scope was added.

## Issues Encountered

- Focused web, TUI, cross-client, and stale-authority commands return nonzero by design. Their output was classified separately: every failure is a named missing Phase 127 module/export/schema/routing contract, with no syntax, transform, discovery, fixture-loading, `ReferenceError`, `TypeError`, or unrelated product failure.
- Existing OpenTUI suites emitted pre-existing `Possible EventTarget memory leak detected` warnings while still passing. The new stale file produced 18 named Phase 127 failures and zero unrelated failures.
- The requirements document uses the repository's legacy bold-colon checkbox format. As in Plan 127-01, product requirement checkboxes must remain pending until implementation plans ship behavior even though this summary records the plan-owned contract IDs.
- No authentication gate, dependency installation, external application launch, hosted evidence claim, tag, push, publish, GitHub Release, workflow dispatch, or other outward release action occurred.

## Verification

- Web stale suite: 18 cases discovered; 1 fixture contract passes and 17 cases intentionally fail only on `packages/web/src/stale-workspaces.ts` being absent.
- OpenTUI suite: repository-isolated `npm run test:tui`; the new file reports 18 Phase 127 failures, zero unrelated failures, and names the absent view and request-gate contracts; every pre-existing file passes.
- Cross-client suite: 11 cases discovered; all intentionally fail only on the absent `packages/client/src/stale-workspaces.ts` shared adapter.
- Stale authority suite: 44 cases; 40 pass and exactly 4 intentionally fail on missing client/web/TUI modules, evaluator, browser schemas, and scoped refresh routing.
- Release architecture suite: 8/8 pass.
- Uniquely filtered pre-metadata release suite: 1/1 selected test passes, 8 historical tests skipped by the exact filter, and both no-tag script runs record only the expected fake local validation commands.
- `git diff --check 987b40ab..HEAD` passes.
- All three task commits contain only the seven planned test/fixture files; no production source, manifest, lockfile, changelog, documentation, tag, push, publish, release, or workflow dispatch changed.

## Known Stubs

None. No TODO, FIXME, placeholder, coming-soon, or unavailable-data stub marker exists in the seven plan files. Empty fixture collections model approved zero-cardinality states. The absent Phase 127 production modules are the deliberate Wave 0 RED boundary, not source placeholders.

## Authentication Gates

None.

## User Setup Required

None. All added contracts use deterministic fixtures, guarded imports, fake DOM/OpenTUI renderers, static source scans, or temporary command shims.

## Next Phase Readiness

- Plans 127-03 through 127-06 can implement strict schemas, evaluator/service authority, shared presentation, generation/retry coordination, and scoped refresh against complete named contracts.
- Plans 127-07 and 127-08 can implement the web overlay and dedicated OpenTUI view without inventing copy, ordering, focus, key, responsive, or lifecycle behavior.
- Plans 127-10 and 127-11 retain the immediate manifest/lockfile and changelog/documentation RED boundaries; Wave 0 deliberately does not require future `0.22.0-rc.1` outputs.
- A-EDGE-REL-01 remains unresolved until exact-candidate hosted/manual evidence is collected and approved. Release authority remains explicitly not granted.

## Self-Check: PASSED

- All seven planned test/fixture artifacts and this summary exist at their required paths.
- Task commits `dad5cb30`, `f69e6b16`, and `b8237d64` exist on `planning/phase-127-revision-1`.
- No tracked file was deleted by any task commit, and the working tree contained only this uncommitted summary before planning-state updates.
- Verification classifications match the summary: intentional RED is limited to named Phase 127 production gaps, while both release-boundary suites are green.

---
*Phase: 127-stale-workspace-intelligence-and-rc-closure*
*Completed: 2026-07-17*
