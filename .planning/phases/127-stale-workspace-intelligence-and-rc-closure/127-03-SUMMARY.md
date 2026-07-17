---
phase: 127-stale-workspace-intelligence-and-rc-closure
plan: "03"
subsystem: protocol-core-integrations
status: complete
tags: [zod, stale-workspaces, github, gitlab, bounded-subprocess, browser-safety]

requires:
  - phase: 127-01
    provides: guarded runtime schema and forge-status RED contracts with deterministic disclosure and process fixtures
provides:
  - strict bounded browser-safe stale request, response, candidate, incomplete, reason, unknown, and caution schemas
  - read-only GitHub.com pull-request and GitLab.com merge-request status acquisition with closed sanitized outcomes
  - public core export for later service-owned stale evaluation
  - zero-call fail-closed handling for invalid provenance, unsupported hosts, and Gitea
  - no CLI, service classification, UI, polling, persistence, or mutation authority

affects: [127-04, 127-05, stale-workspace-evaluator, browser-projection, provider-evidence]

tech-stack:
  added: []
  patterns:
    - strict variant-specific Zod evidence unions with repository-scope invariants
    - canonical persisted-provenance validation before external process execution
    - bounded argv-only provider runners mapped to sanitized closed unions

key-files:
  created:
    - packages/core/src/integrations/forge-change-status.ts
  modified:
    - packages/protocol/src/web.ts
    - packages/core/src/index.ts

key-decisions:
  - "Stale transport variants encode scope structurally: provider evidence requires provider plus repository identity, repository-local evidence forbids provider identity, and activity/global evidence forbids repository identity."
  - "Forge status accepts only canonical credential-free GitHub.com PR or GitLab.com MR persisted provenance; Gitea, self-hosted claims, mismatches, and malformed identities stop before the runner."
  - "Provider timeout and output overrides are accepted only as positive bounded integers, and all process/provider failures collapse to finite reason codes with no raw output or execution context."

patterns-established:
  - "Browser evidence remains strict, bounded, path-free, duplicate-free, and free of lifecycle mutation descriptors."
  - "Provider execution receives fixed executables and flags plus separately encoded identity variables; branch, remote, search, checkout, and mutation inputs are never consulted."

requirements-completed: [STALE-01, STALE-02, STALE-05]

coverage:
  - id: D1
    description: "A strict bounded path-free stale-workspace transport vocabulary covers revision-bound requests and atomic candidate/incomplete responses."
    requirement: STALE-02
    verification:
      - kind: unit
        ref: "tests/service/web-stale-workspaces-schema.test.ts — 16/16 pass"
        status: pass
      - kind: integration
        ref: "public @git-stacks/protocol package boundary — valid response accepted; extra keys, paths, oversized identities, and duplicate workspaces rejected"
        status: pass
    human_judgment: false
  - id: D2
    description: "GitHub.com and GitLab.com change status is acquired through bounded read-only argv-only commands and mapped to merged, closed, open, or sanitized unknown outcomes."
    requirement: STALE-05
    verification:
      - kind: unit
        ref: "tests/lib/core/forge-change-status.test.ts — 43/43 pass"
        status: pass
      - kind: integration
        ref: "public @git-stacks/core package boundary — exact GitHub/GitLab argv observed; invalid provenance and Gitea made zero runner calls; authentication secret was not projected"
        status: pass
    human_judgment: false
  - id: D3
    description: "Protocol remains browser-safe and provider execution remains in core without service policy, UI, polling, persistence, CLI, or mutation expansion."
    requirement: STALE-01
    verification:
      - kind: integration
        ref: "npm run test:architecture — Package architecture: OK"
        status: pass
      - kind: other
        ref: "@git-stacks/protocol and @git-stacks/core workspace typechecks"
        status: pass
    human_judgment: false

duration: 10min
completed: 2026-07-17
---

# Phase 127 Plan 03: Strict Stale Transport and Forge Status Summary

**Strict path-free stale evidence schemas and bounded read-only GitHub/GitLab status probes now turn the 59-case Wave 0 transport/provider matrix green without adding classification or mutation authority.**

## Performance

- **Duration:** 10 min
- **Started:** 2026-07-17T10:02:15Z
- **Completed:** 2026-07-17T10:12:31Z
- **Tasks:** 2
- **Production files modified:** 3

## Accomplishments

- Added strict runtime-validated stale request/response schemas with literal 30-day policy metadata, bounded candidate and incomplete collections, finite reason/unknown/caution vocabularies, UTF-8 identity limits, repository-scope invariants, and duplicate/cross-section identity rejection.
- Added a separate `lookupForgeChangeStatus` core integration that validates complete canonical persisted provenance before issuing one fixed read-only GitHub or GitLab command.
- Preserved unknown evidence honestly: invalid provenance, Gitea, unsupported hosts, missing tooling, authentication, rate limiting, timeout, abort, output limits, malformed payloads, and runner/provider failures return finite sanitized reasons rather than false status.
- Kept provider execution bounded and argv-only with no shell, search, checkout, ref creation, mutation, branch inference, raw output, path, credential, environment, or command projection.
- Exported the new core seam for Plan 127-04 while leaving service classification, cache policy, routes, UI, shortcut IDs, polling, persistence, and stale CLI scope untouched.

## Task Commits

Each task was committed atomically with normal Git hooks:

1. **Task 1: Add bounded stale transport schemas and turn the runtime matrix green** — `461a570e` (`feat`)
2. **Task 2: Implement bounded read-only GitHub and GitLab change status** — `c7032f2d` (`feat`)

**Plan metadata:** committed separately with this summary and shared tracking updates.

## TDD Gate Compliance

- Task 1 used the committed Plan 127-01 RED contract `ff69dc5b`, then became GREEN in `461a570e`.
- Task 2 used the committed Plan 127-01 provider RED contract `c5d5c290`, then became GREEN in `c7032f2d`.
- No production placeholder was added to bypass the RED lifecycle.

## Files Created/Modified

- `packages/protocol/src/web.ts` — Strict stale request, response, row, confirmed-reason, unknown-evidence, caution, bounds, scope, and uniqueness schemas plus inferred types.
- `packages/core/src/integrations/forge-change-status.ts` — Canonical persisted-provenance validation, fixed GitHub/GitLab argv builders, bounded invocation, strict status parsing, and sanitized outcomes.
- `packages/core/src/index.ts` — Public export for `lookupForgeChangeStatus` and its closed types/constants.

## Decisions Made

- Evidence scope is represented by schema shape rather than optional-field convention: provider reasons require provider/repository identity, repository observations forbid provider identity, and activity/global evidence forbids repository identity.
- Both persisted review URL fields must agree with the claimed provider, repository path, change type, and number before any runner call; only GitHub.com and GitLab.com are claimed.
- GitLab project identity is encoded into one API path argument, while GitHub owner, repository, and number are passed as separate GraphQL variables.
- Caller-supplied timeout/output settings remain injectable for tests and composition but are clamped to fixed internal ceilings so the seam cannot become unbounded.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Removed literal NUL bytes introduced by the edit payload**
- **Found during:** Task 1 byte-integrity verification
- **Issue:** The initial source edit encoded two separator/control checks as literal NUL bytes even though runtime schema tests and TypeScript parsing succeeded.
- **Fix:** Replaced source-level control bytes with explicit code-point checks and a runtime `String.fromCharCode(0)` separator.
- **Files modified:** `packages/protocol/src/web.ts`
- **Verification:** Byte scan reports zero NUL bytes; the 16-case schema suite and protocol typecheck remain green.
- **Committed in:** `461a570e`

**2. [Rule 1 - State Tracking] Corrected malformed SDK decision labels and stale activity text**
- **Found during:** Plan closeout state updates
- **Issue:** `state.add-decision` inserted the new entries as `[Phase ?]`, while `state.advance-plan` left the last-activity description on Plan 127-02 and recorded the metric without the established duration spacing.
- **Fix:** Relabeled the decisions to Phase 127, updated both activity fields to Plan 127-03, and normalized the metric while preserving Plan 4 position and 31/42 progress.
- **Files modified:** `.planning/STATE.md`
- **Verification:** State reports Phase 127 Plan 4 of 14, 31 completed plans, 74%, and the correct Plan 127-03 completion activity.
- **Committed in:** Final plan metadata commit

**Total deviations:** 2 auto-fixed bugs.
**Impact on plan:** Both corrections preserve source integrity and accurate sequential execution metadata without changing product scope.

## Issues Encountered

- The first ad hoc public-core package verification snippet had a syntax error and never exercised product code. It was replaced with a temporary package-boundary script; the rerun observed the expected GitHub/GitLab argv and sanitized outcomes, then the script was removed.
- The requirements SDK could not match this repository's legacy bold-colon checkbox format for `STALE-01`, `STALE-02`, or `STALE-05`, so it made no `REQUIREMENTS.md` change. Those phase-level requirements remain truthfully pending for the later policy, route, and client plans rather than being forced complete manually.
- No dependency installation, authentication gate, provider network access, release action, or external mutation was needed.

## Verification

- `npx vitest run tests/service/web-stale-workspaces-schema.test.ts tests/lib/core/forge-change-status.test.ts` — 2 files, 59/59 tests pass.
- `npm run typecheck --workspace @git-stacks/protocol` — pass.
- `npm run typecheck --workspace @git-stacks/core` — pass.
- `npm run test:architecture` — `Package architecture: OK`.
- Public `@git-stacks/protocol` package observation accepted one valid atomic response and rejected extra request keys, host-path identities, oversized UTF-8 identities, and duplicate workspace IDs.
- Public `@git-stacks/core` package observation returned GitHub `merged` and GitLab `closed`, forwarded exact fixed argv/env/bounds, made zero runner calls for invalid provenance and Gitea, and projected no authentication secret.
- `git diff --check` and source byte scans pass; the working tree was clean before metadata closeout.

## Known Stubs

None. All new production exports are wired to runtime validation or provider acquisition, and no empty/mock/placeholder data path was introduced.

## User Setup Required

None. Deterministic verification uses injected runners; authenticated live GitHub/GitLab receipts remain intentionally owned by the later Phase 127 evidence checkpoint plans.

## Next Phase Readiness

- Plan 127-04 can consume `lookupForgeChangeStatus` and the strict protocol vocabulary to implement service-owned qualification, ranking, remote observation, and volatile cache policy.
- High-severity injection, disclosure, identity, timestamp, timeout, and output-bound threats assigned to this plan are covered by the green provider/runtime matrix.
- No blocker, outward release action, Gitea expansion, self-hosted provider claim, CLI command, or mutation authority was introduced.

## Self-Check: PASSED

- The summary and all three planned production artifacts exist at their required paths.
- Task commits `461a570e` and `c7032f2d` exist, along with inherited RED commits `ff69dc5b` and `c5d5c290`.
- No tracked file was deleted, no generated verification script remains, and the pre-closeout working tree contains only this summary.

---
*Phase: 127-stale-workspace-intelligence-and-rc-closure*
*Completed: 2026-07-17*
