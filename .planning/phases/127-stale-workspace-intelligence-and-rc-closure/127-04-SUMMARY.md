---
phase: 127-stale-workspace-intelligence-and-rc-closure
plan: "04"
subsystem: service-policy-core-observation
status: complete
tags: [stale-workspaces, evidence-policy, volatile-cache, singleflight, git-ls-remote, race-safety]

requires:
  - phase: 127-01
    provides: committed RED contracts for stale qualification, ranking, cache races, revision gates, remote observation, and no-mutation behavior
  - phase: 127-03
    provides: strict stale transport schemas and bounded read-only forge change-status acquisition
provides:
  - one service-owned stale-workspace evidence algebra with strict qualification and deterministic transparent ordering
  - revision-first evaluator over one immutable read model with an exact five-minute service-memory network cache
  - ordinary singleflight, forced generation bypass, newest-write-wins, cancellation-safe commits, and bounded atomic fan-out
  - repository-scoped argv-only remote-branch observation with fixed sanitized present, missing, or unknown outcomes
  - suggestion-only evaluation with no score, persistence, polling, lifecycle, provider mutation, or browser state

affects: [127-05, 127-09, stale-workspace-route, stale-workspace-clients, capability-verification]

tech-stack:
  added: []
  patterns:
    - closed confirmed/unknown/non-evidence/caution algebra with authoritative timestamps
    - revision-first evaluation from one immutable captured read model
    - volatile per-key generation cache with ordinary singleflight and request-scoped forced deduplication
    - bounded argv-only Git observation collapsed to sanitized closed outcomes

key-files:
  created:
    - packages/service/src/policy/stale-workspaces.ts
    - packages/service/src/policy/stale-workspace-evaluator.ts
    - packages/core/src/integrations/remote-branch-status.ts
  modified:
    - packages/core/src/index.ts

key-decisions:
  - "A workspace qualifies only with at least one confirmed reason; unknown-only rows remain incomplete, cautions never qualify or suppress, and ordering uses a stable lexicographic tuple rather than a score."
  - "Only forge and remote-branch outcomes enter an exact 300000 ms service-lifetime cache; local activity, worktree, dirty, ahead, drift, and notes evidence is recomputed from each supplied immutable read model."
  - "Revision mismatch fails before clock, read-model, cache, or network access, while per-key generations, abort-safe writes, and a fan-out limit of four prevent stale or failed probes from corrupting newer evidence."
  - "Remote branch observation uses one fixed argv-only git ls-remote command and collapses every operational failure to repository-scoped sanitized unknown evidence without projecting paths, argv, output, or exceptions."

patterns-established:
  - "Stale policy is advisory by construction: evaluator dependencies expose observation only and cannot archive, remove, stop terminals, discard worktrees, write YAML, or mutate providers."
  - "Cached network evidence retains its original observation timestamp; a later cache hit changes only the evaluation checked_at and freshly derived local evidence."

requirements-completed: [STALE-01, STALE-02, STALE-03, STALE-05]

coverage:
  - id: D1
    description: "One service policy classifies strict 30-day inactivity and merged, closed, remote-missing, or managed-worktree-missing evidence into explainable, repository-scoped candidates and incomplete rows with deterministic ordering."
    requirement: STALE-01
    verification:
      - kind: unit
        ref: "tests/lib/service/stale-workspaces.test.ts — policy, qualification, ranking, timestamp, deduplication, and evaluator matrix; 49/49 pass"
        status: pass
    human_judgment: false
  - id: D2
    description: "Explicit evaluation refresh uses an exact five-minute network-only cache with fresh local recomputation, ordinary singleflight, forced generations, newest-write-wins, cancellation safety, and bounded atomic fan-out."
    requirement: STALE-02
    verification:
      - kind: unit
        ref: "tests/lib/service/stale-workspaces.test.ts — TTL, cached unknown, singleflight, force race, revision, captured-read-model, abort, fan-out, and atomic response cases; 49/49 pass"
        status: pass
      - kind: other
        ref: "npm run typecheck --workspace @git-stacks/service"
        status: pass
    human_judgment: false
  - id: D3
    description: "Evaluation remains suggestion-only and has no lifecycle, persistence, polling, YAML, terminal, worktree, provider-mutation, or browser-state capability."
    requirement: STALE-03
    verification:
      - kind: integration
        ref: "npm run test:architecture — Package architecture: OK"
        status: pass
      - kind: unit
        ref: "tests/lib/service/stale-workspaces.test.ts — hostile mutation sentinels remain zero; 49/49 pass"
        status: pass
    human_judgment: false
  - id: D4
    description: "Repository-scoped remote branch checks use bounded read-only argv and convert timeout, abort, output, runner, and exit failures into fixed unknown evidence rather than absence or staleness proof."
    requirement: STALE-05
    verification:
      - kind: unit
        ref: "tests/lib/core/remote-branch-status.test.ts — 15/15 pass"
        status: pass
      - kind: integration
        ref: "public @git-stacks/core package boundary — present, missing, and operational failure returned fixed sanitized outcomes with exact bounded argv"
        status: pass
    human_judgment: false

duration: 19min
completed: 2026-07-17
---

# Phase 127 Plan 04: Stale Workspace Policy and Volatile Evaluation Summary

**A single service-owned stale policy now combines strict explainable evidence with a revision-first, generation-safe five-minute network cache and bounded repository-scoped remote observation, without gaining cleanup authority.**

## Performance

- **Duration:** 19 min 21 sec
- **Started:** 2026-07-17T10:18:03Z
- **Completed:** 2026-07-17T10:37:24Z
- **Tasks:** 2
- **Production files modified:** 4

## Accomplishments

- Implemented the closed stale evidence algebra: strict `activity_at < checked_at - 30 days`, all five confirmed reasons, unknown-only incomplete rows, non-qualifying cautions, canonical deduplication, authoritative timestamps, and stable transparent ordering with no score.
- Added a dependency-injected evaluator that rejects revision mismatches before observable work, derives all local facts from one immutable read model, probes network evidence with a combined limit of four, and assembles one atomic response.
- Added an exact `300_000` ms service-lifetime network cache with fresh local recomputation, ordinary singleflight, force-read bypass, request-scoped forced deduplication, monotonic per-key generations, newest-write-wins, and abort-safe commits.
- Added a public core remote observer that executes only fixed bounded `git ls-remote --exit-code --heads origin <branch>` argv and returns present, missing, or fixed sanitized unknown without raw operational detail.
- Kept unknown and failed observations honest and repository-scoped while preserving suggestion-only authority: no persistence, timers, polling, YAML writes, lifecycle calls, provider mutation, browser state, or automatic cleanup was introduced.

## Task Commits

Each task was committed atomically with normal Git hooks:

1. **Task 1: Implement pure qualification, evidence normalization, and stable ranking** — `9a5b9ec7` (`feat`)
2. **Task 2: Implement bounded evaluation and the generation-safe network-only cache** — `6ee0b4e7` (`feat`)

**Plan metadata:** committed separately with this summary and shared tracking updates.

## TDD Gate Compliance

- Task 1 used the committed Plan 127-01 stale policy/evaluator RED contract `69eae6eb`, then became GREEN in `9a5b9ec7`.
- Task 2 used the committed Plan 127-01 remote-observation RED contract `c5d5c290` and evaluator RED contract `69eae6eb`, then became GREEN in `6ee0b4e7`.
- No production placeholder or weakened assertion was added to bypass the RED lifecycle.

## Files Created/Modified

- `packages/service/src/policy/stale-workspaces.ts` — Pure qualification, evidence normalization, timestamp assignment, deduplication, caution handling, candidate/incomplete separation, protocol validation, and stable ranking.
- `packages/service/src/policy/stale-workspace-evaluator.ts` — Revision-first evaluation, immutable read-model consumption, bounded probe orchestration, volatile forge/remote caches, singleflight, force generations, cancellation, and atomic assembly.
- `packages/core/src/integrations/remote-branch-status.ts` — Abortable bounded argv-only remote branch observation with fixed sanitized outcomes.
- `packages/core/src/index.ts` — Public package-root export for the read-only remote observer.

## Decisions Made

- Qualification is proof-positive: merged, closed, repository branch missing, managed worktree missing, or strict inactivity can qualify; unknown evidence cannot qualify or suppress, and dirty/ahead/drift/notes remain cautions only.
- Candidate ranking is a stable lexicographic tuple: reason count, strongest reason, inactivity-only placement, oldest valid activity, unknown activity, normalized name, then stable ID. No score, confidence, percentage, or safety claim exists.
- The cache owns network observations only. Local activity, managed-worktree state, dirty/ahead/drift, and notes are recomputed from every supplied immutable revisioned read model, including on cache hits.
- Forced refresh bypasses older reads and in-flight work through a new per-key generation, while duplicate same-key probes within that forced request share one request-scoped flight; only the newest non-aborted generation can commit.
- Cached missing and unknown network evidence preserves the original probe timestamp instead of fabricating a fresh observation time on later evaluations.
- Remote operational detail stops at the trusted runner boundary; every non-present/non-missing outcome becomes one finite unknown reason and never proves absence or staleness.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - State Tracking] Corrected malformed SDK decision labels and stale activity metadata**
- **Found during:** Plan closeout state updates
- **Issue:** `state.add-decision` inserted all three Plan 127-04 decisions as `[Phase ?]`, `state.advance-plan` retained the Plan 127-03 activity description, and the metric duration lacked the established spacing.
- **Fix:** Relabeled the decisions to Phase 127, updated both activity fields to the Plan 127-04 result, and normalized the metric while preserving Plan 5 position and 32/42 progress.
- **Files modified:** `.planning/STATE.md`
- **Verification:** State reports Phase 127 Plan 5 of 14, 32 completed plans, 76%, the correct Plan 127-04 completion activity, and properly scoped decisions.
- **Committed in:** Final plan metadata commit

**Total deviations:** 1 auto-fixed state-tracking bug.
**Impact on plan:** The correction preserves accurate sequential execution metadata without changing product scope.

## Issues Encountered

- The expected RED baseline initially failed because the planned policy, evaluator, and remote-observer modules did not yet exist. The inherited Plan 127-01 contracts became fully green after the two task implementations.
- The first public-package verification attempt imported the installed core directory path directly and Node rejected the directory import with `ERR_UNSUPPORTED_DIR_IMPORT`. Re-running through the intended bare `@git-stacks/core` export exercised the public package boundary successfully; no product change was required.
- The service evaluator intentionally has no end-user route until Plan 127-05. Runtime verification therefore exercised the public core library surface only; the evaluator's current contract is covered by its focused Node suite, typecheck, build, and architecture verification rather than an invented application surface.
- `state.update-progress` reported that no legacy prose progress field existed, but `state.advance-plan` correctly recalculated the canonical frontmatter to 32/42 plans and 76%; no duplicate progress field was invented.
- The requirements SDK could not match this repository's legacy bold-colon checkbox format for `STALE-01`, `STALE-02`, `STALE-03`, or `STALE-05`, so it made no `REQUIREMENTS.md` change. The phase-level view, refresh/open workflow, and final suggestion-only conformance remain correctly pending for later plans rather than being forced complete manually.
- No dependency installation, authentication gate, live provider access, release action, or external mutation was needed.

## Verification

- `npx vitest run tests/lib/core/remote-branch-status.test.ts` — 1 file, 15/15 tests pass.
- `GIT_STACKS_KEY_STORE=file npx vitest run tests/lib/service/stale-workspaces.test.ts` — 1 file, 49/49 tests pass.
- `npm run typecheck --workspace @git-stacks/core` — pass.
- `npm run typecheck --workspace @git-stacks/service` — pass.
- `npm run build --workspace @git-stacks/core` — pass.
- `npm run build --workspace @git-stacks/service` — pass.
- `npm run test:architecture` — `Package architecture: OK`.
- Public `@git-stacks/core` package observation returned `{ status: "present" }`, `{ status: "missing" }`, and `{ status: "unknown", reason: "remote_check_failed" }`; the injected runner received the exact fixed argv plus bounded timeout, output cap, and signal, while no path, branch, argv, output, exception, credential, environment, token, or bearer material appeared in returned outcomes.
- Forbidden-authority/scoring scan found no cleanup lifecycle calls, provider mutation, polling timer, persistence, score, confidence, percentage, or `safe_to_delete` behavior in the new policy/evaluator surface.
- `git diff --check` passed, both task commits used normal hooks, no tracked file was deleted, and the product working tree was clean before metadata closeout.

## Known Stubs

None. Empty arrays and default option objects in the new files are local accumulators/configuration defaults, not UI-rendered placeholders or unwired mock data; no TODO, FIXME, placeholder copy, or missing production data source was introduced.

## User Setup Required

None. All verification is deterministic through captured read models and injected bounded runners; authenticated live provider evidence remains owned by later Phase 127 evidence checkpoints.

## Next Phase Readiness

- Plan 127-05 can compose the revision-first service route and client presentation over this policy/evaluator without duplicating qualification, ranking, refresh, or cache semantics.
- Plan 127-09 retains the explicit `A-EDGE-STALE-03` capability-graph and hostile-mutation verification boundary across the built package.
- All high-severity false-verdict, cache-race, revision, and confused-deputy mitigations assigned to this plan are green, with no blocker or outward release action introduced.

## Self-Check: PASSED

- The summary and all four planned production artifacts exist at their required paths.
- Task commits `9a5b9ec7` and `6ee0b4e7` exist, along with inherited RED commits `69eae6eb` and `c5d5c290`.
- No tracked file was deleted, and the only pre-state-update working-tree change is this summary.

---
*Phase: 127-stale-workspace-intelligence-and-rc-closure*
*Completed: 2026-07-17*
