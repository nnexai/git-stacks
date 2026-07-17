---
phase: 127-stale-workspace-intelligence-and-rc-closure
plan: "01"
subsystem: testing-contracts
status: complete
tags: [vitest, zod, stale-workspaces, forge-status, remote-branch, cache, revision, no-mutation, red-contract]

requires:
  - phase: 126-web-workflow-and-forge-source-parity
    provides: authoritative catalog/activity projections, bounded forge command mechanics, canonical lifecycle authority, and the Phase 127 verification handoff
provides:
  - deterministic standalone stale-workspace fixtures, clocks, deferred probes, concurrency counters, disclosure canaries, and hostile mutation sentinels
  - guarded runtime Zod RED matrix for strict bounded browser stale request/response contracts
  - guarded read-only GitHub/GitLab forge-status and abortable remote-branch RED matrices
  - guarded pure policy, ranking, network-cache, revision, bounded-fan-out, and no-mutation RED matrix
  - explicit evidence that existing lifecycle authority remains green while Phase 127 production contracts remain absent
  - no production placeholders, release metadata, or outward release actions
affects: [127-02, 127-03, 127-04, 127-05, 127-09, stale-intelligence, security-verification]

tech-stack:
  added: []
  patterns: [guarded lifecycle dynamic imports, named intentional-RED assertions, standalone structural fixtures, hostile capability sentinels, deterministic deferred-race tests]

key-files:
  created:
    - tests/helpers/phase127-stale-fixtures.ts
    - tests/service/web-stale-workspaces-schema.test.ts
    - tests/lib/core/forge-change-status.test.ts
    - tests/lib/core/remote-branch-status.test.ts
    - tests/lib/service/stale-workspaces.test.ts
  modified: []

key-decisions:
  - "Wave 0 loads net-new source files through guarded file-URL dynamic imports and asserts missing contracts inside named Vitest cases rather than failing test discovery."
  - "The service contract separates pure classifyStaleWorkspaces/rankStaleWorkspaceCandidates behavior from a dependency-injected createStaleWorkspaceEvaluator cache and concurrency boundary."
  - "Provider acquisition is frozen behind lookupForgeChangeStatus and complete persisted provenance; remote acquisition is frozen behind observeRemoteBranchStatus with one fixed argv-only ls-remote command."
  - "A nonzero focused test exit is accepted only when every failure is a named missing Phase 127 export/module assertion and fixture, transform, discovery, and existing-authority checks remain healthy."

patterns-established:
  - "Intentional RED tests catch module-load failure in beforeAll, then repeat a named contract assertion from each discovered case so the entire matrix remains visible before implementation."
  - "Fixtures contain only structural data and injected behavior; they never read real workspace YAML, Git configuration, provider credentials, processes, or filesystem state."
  - "Evaluator tests pass only read-only clock/provider/remote dependencies while hostile lifecycle, terminal, worktree, YAML, provider-mutation, and second-local-scan functions must remain untouched."

requirements-completed: [STALE-01, STALE-02, STALE-03, STALE-05]

coverage:
  - id: D1
    description: "Strict bounded stale browser DTO behavior is frozen in an executable guarded runtime Zod RED matrix with reusable deterministic fixtures."
    requirement: STALE-02
    verification:
      - kind: unit
        ref: "tests/helpers/phase127-stale-fixtures.ts import gate"
        status: pass
      - kind: unit
        ref: "tests/service/web-stale-workspaces-schema.test.ts — 3 fixture cases pass and 13 named missing-schema assertions intentionally remain RED"
        status: pass
    human_judgment: false
  - id: D2
    description: "GitHub/GitLab status and repository-scoped remote-branch acquisition are specified as bounded, abortable, argv-only, sanitized, read-only contracts."
    requirement: STALE-05
    verification:
      - kind: unit
        ref: "tests/lib/core/forge-change-status.test.ts and remote-branch-status.test.ts — 58 discovered cases intentionally fail only on the two absent modules"
        status: pass
    human_judgment: false
  - id: D3
    description: "Qualification, timestamps, unknown separation, cautions, deduplication, stable ranking, captured local facts, five-minute network cache, singleflight, forced generations, revision rejection, and bounded atomic fan-out are frozen before implementation."
    requirement: STALE-01
    verification:
      - kind: unit
        ref: "tests/lib/service/stale-workspaces.test.ts — 49 discovered cases intentionally fail only on the absent policy/evaluator modules"
        status: pass
    human_judgment: false
  - id: D4
    description: "Suggestion-only stale evaluation cannot acquire Archive, Remove, terminal, worktree, YAML, provider-mutation, raw-output, path, or safety-score authority, while the existing lifecycle authority suite remains green."
    requirement: STALE-03
    verification:
      - kind: integration
        ref: "tests/lib/service/workspace-action-authority.test.ts — 8/8 pass"
        status: pass
      - kind: unit
        ref: "tests/lib/service/stale-workspaces.test.ts hostile no-mutation and disclosure cases"
        status: pass
    human_judgment: false

duration: 34min
completed: 2026-07-17
---

# Phase 127 Plan 01: Stale Intelligence RED Contracts Summary

**Guarded runtime RED contracts now freeze strict stale DTOs, read-only provider and remote observation, deterministic qualification/ranking, five-minute cache races, revision gates, and suggestion-only authority without adding product placeholders.**

## Performance

- **Duration:** 34 min
- **Started:** 2026-07-17T08:43:13Z
- **Completed:** 2026-07-17T09:17:17Z
- **Tasks:** 3
- **Files created:** 5
- **Production files modified:** 0

## Accomplishments

- Added standalone deterministic fixtures for every Phase 127 evidence category, strict-cutoff edge, unknown/caution split, stable-name tie, fake clock, deferred generation, concurrency count, process response, disclosure canary, and forbidden mutation capability.
- Added a strict runtime Zod matrix covering request/response bounds, every nested extra-key boundary, finite vocabularies, revisions/timestamps, duplicate identities/evidence, and forbidden path/process/credential/environment/mutation fields.
- Added 58 provider/remote cases freezing complete persisted provenance, GitHub/GitLab state and event-time parsing, explicit Gitea/self-hosted opt-outs, exact read-only argv, timeout/output/AbortSignal forwarding, exit semantics, sanitization, and zero-call invalid-input behavior.
- Added 49 policy/evaluator cases freezing all five confirmed reasons, unknown/incomplete behavior, caution neutrality, canonical timestamps, deduplication, the complete ranking tuple, zero/one/many responses, exactly 300,000 ms network TTL, cached unknowns, ordinary singleflight, force generations, newest-write wins, abort safety, cache reset, global limit four, revision-first failure, captured local facts, and no mutation authority.
- Verified the existing workspace lifecycle authority suite remains fully green and that only test files changed.

## Task Commits

Each task was committed atomically with normal Git hooks:

1. **Task 1: Create deterministic fixtures and the runtime Zod schema RED matrix** — `ff69dc5b`
2. **Task 2: Write RED bounded network-observation contracts** — `c5d5c290`
3. **Task 3: Write the RED stale policy, cache, revision, and no-mutation contract** — `69eae6eb`

## Files Created/Modified

- `tests/helpers/phase127-stale-fixtures.ts` — Standalone structural builders, fixed identities/times, fake clock, deferred probes, concurrency counter, process runner, disclosure canaries, and hostile mutation sentinels.
- `tests/service/web-stale-workspaces-schema.test.ts` — Runtime namespace-export and strict nested Zod RED matrix for browser-safe stale transport.
- `tests/lib/core/forge-change-status.test.ts` — Complete provenance, GitHub/GitLab state, argv, failure classification, sanitization, unsupported-provider, and no-inference RED contract.
- `tests/lib/core/remote-branch-status.test.ts` — Exact abortable `git ls-remote` argv, exit 0/2/error, output/timeout/abort, scoping, sanitization, and no-mutation RED contract.
- `tests/lib/service/stale-workspaces.test.ts` — Pure policy/ranking plus captured-read-model evaluator, TTL, singleflight, force generation, abort, concurrency, revision, disclosure, and no-mutation RED contract.

## Decisions Made

- Net-new module absence is caught during guarded test lifecycle setup and re-expressed as named assertions inside every discovered test; no source placeholder or skipped case is permitted.
- The future policy API is split into pure `classifyStaleWorkspaces` and `rankStaleWorkspaceCandidates` exports, while stateful caching and probe orchestration belong to `createStaleWorkspaceEvaluator`.
- The future core acquisition APIs are `lookupForgeChangeStatus` and `observeRemoteBranchStatus`; tests require complete persisted provenance, fixed argv-only commands, bounded execution, sanitized closed unions, and no inference or mutation.
- Intentional RED is valid only as a meta-verification result: fixture loading, test transformation/discovery, named matrix collection, the unrelated lifecycle regression, and diff hygiene must all pass.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Corrected persisted forge-source fixture semantics**
- **Found during:** Task 2 (bounded network-observation contracts)
- **Issue:** The shared source fixture represented `repo` as the provider path and `url` as a clone URL, but persisted workspace source metadata stores the local registry repository name in `repo` and the reviewed PR/MR URL in `url`.
- **Fix:** Changed the default fixture to `repo: "app"` and `url: "https://github.com/acme/app/pull/42"`; aligned GitLab and invalid-provenance test inputs with the real persisted contract.
- **Files modified:** `tests/helpers/phase127-stale-fixtures.ts`, `tests/lib/core/forge-change-status.test.ts`
- **Verification:** The Node fixture import gate passes; all 58 network cases are discovered and remain RED only on the two absent Phase 127 modules.
- **Committed in:** `c5d5c290`

**2. [Rule 1 - State Tracking] Corrected malformed GSD decision phase labels**
- **Found during:** Plan closeout state updates
- **Issue:** `state.add-decision` inserted the four new entries as `[Phase ?]`, and the activity description still reported only phase startup after Plan 01 advanced.
- **Fix:** Relabeled the entries to `[Phase 127]` and updated both machine-readable and prose activity descriptions while retaining the SDK-advanced Plan 2 position, 29/42 progress, metrics, and session data.
- **Files modified:** `.planning/STATE.md`
- **Verification:** State now reports Phase 127, Plan 2 of 14, Ready to execute, 29 completed plans, 69%, and the correct Plan 01 completion activity.
- **Committed in:** Final plan metadata commit

**Total deviations:** 2 auto-fixed bugs.
**Impact on plan:** Both corrections preserve existing persisted contracts and accurate sequential execution metadata. No product or release scope was added.

## Issues Encountered

- The new helper directory did not exist and was created as part of the planned Task 1 artifacts.
- Focused RED commands return nonzero by design. Their output was separately classified to reject syntax, transform, import-discovery, fixture, or unrelated regression failures.
- The requirements SDK could not match this repository's legacy colon-inside-bold checkbox format (`**STALE-01:**`) and made no `REQUIREMENTS.md` change. Because Wave 0 specifies contracts rather than shipping the production behavior, the product requirement checkboxes remain truthfully pending for Plans 127-03 through 127-09 instead of being forced manually.
- No authentication gate, dependency installation, package change, or external service access occurred.

## Verification

- Fixture import gate: exit `0` under `node --experimental-strip-types`.
- Runtime Zod matrix: 1 file collected; 3 fixture tests pass and 13 tests intentionally fail on named missing protocol schema exports.
- Network observation matrix: 2 files and 58 tests collected; all intentionally fail on named missing `forge-change-status.ts` or `remote-branch-status.ts` module contracts.
- Service policy/evaluator matrix: 1 file and 49 tests collected; all intentionally fail on named missing `stale-workspaces.ts` or `stale-workspace-evaluator.ts` module contracts.
- Existing lifecycle authority regression: 1 file / 8 tests pass.
- No `SyntaxError`, transform failure, unresolved static import, discovery failure, `ReferenceError`, or `TypeError` appears in any RED output.
- `git diff --check` passes.
- Plan commits contain only the five test/fixture files; no production source, manifest, lockfile, changelog, release metadata, tag, push, publish, release, or workflow dispatch was introduced.

## Known Stubs

None. The absent Phase 127 production schemas/modules are the deliberate Wave 0 RED boundary, not placeholders; no product source stub was created.

## User Setup Required

None. Every contract is hermetic and uses structural fixtures plus injected clocks, probes, runners, and capability sentinels.

## Next Phase Readiness

- Plan 127-03 can implement strict protocol schemas and `lookupForgeChangeStatus` against the executable runtime/provider contracts.
- Plan 127-04 can implement `observeRemoteBranchStatus`, pure classification/ranking, and the generation-safe evaluator/cache against the executable service contracts.
- Plan 127-02 remains the other Wave 0 dependency and must land before Wave 1 execution proceeds.
- No blocker or outward release action was introduced.

## Self-Check: PASSED

- All five planned test/fixture artifacts and this summary exist at their required paths.
- Task commits `ff69dc5b`, `c5d5c290`, and `69eae6eb` exist on `planning/phase-127-revision-1`.
- No tracked file was deleted by any task commit.
- The only pre-closeout working-tree change outside this summary is the preserved orchestrator-owned `.planning/STATE.md` phase-start update.

---
*Phase: 127-stale-workspace-intelligence-and-rc-closure*
*Completed: 2026-07-17*
