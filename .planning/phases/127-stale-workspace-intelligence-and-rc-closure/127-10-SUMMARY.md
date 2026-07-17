---
phase: 127-stale-workspace-intelligence-and-rc-closure
plan: "10"
subsystem: release-metadata
tags: [npm, release-candidate, package-lock, workspaces, architecture, release-safety]

requires:
  - phase: 127-02
    provides: hermetic repeated no-tag release fence, default-package exclusion checks, and planning-tree preservation sentinels
  - phase: 127-09
    provides: green deterministic package/build/architecture boundary before RC metadata changes
provides:
  - root facade and all seven workspace manifests at exact version 0.22.0-rc.1
  - exact 0.22.0-rc.1 ranges for every internal @git-stacks dependency
  - npm-generated package-lock.json matching the final root and workspace manifest graph
  - focused current-RC tests separated from explicitly historical v0.21 release evidence
  - green default-install and repeated no-outward-release-action package gates
affects: [127-11, 127-12, 127-13, 127-14, release-candidate, package-publication]

tech-stack:
  added: []
  patterns:
    - release metadata tests enumerate the root plus all seven workspaces and inspect every dependency category for exact internal ranges
    - package-lock regeneration happens only after every manifest is final and uses package-lock-only with scripts, audit, and funding disabled
    - current RC identity assertions remain independent of future changelog and documentation outputs

key-files:
  created:
    - .planning/phases/127-stale-workspace-intelligence-and-rc-closure/127-10-SUMMARY.md
  modified:
    - tests/commands/release-rc.test.ts
    - tests/architecture/release-publish.test.mjs
    - package.json
    - packages/protocol/package.json
    - packages/client/package.json
    - packages/core/package.json
    - packages/cli/package.json
    - packages/service/package.json
    - packages/web/package.json
    - packages/tui/package.json
    - package-lock.json
    - .planning/STATE.md
    - .planning/ROADMAP.md

key-decisions:
  - "Current release assertions target 0.22.0-rc.1 while retained v0.21 changelog and workflow checks are labeled explicitly historical."
  - "Every internal @git-stacks range is the literal 0.22.0-rc.1 value across dependency, devDependency, optionalDependency, and peerDependency sections."
  - "The lockfile was regenerated only after all eight manifests were final; a structural diff admitted only 24 expected RC version/range changes and rejected unrelated churn."
  - "v0.22.0-rc.1 and the next npm channel remain test/documentation expectations only; no Git tag or outward release action was performed."

patterns-established:
  - "RC RED gate: focused tests must fail only on stale manifest and lock values before metadata implementation."
  - "Default graph traversal starts at the root facade and proves @git-stacks/tui, Bun, and OpenTUI are unreachable from production dependencies."

requirements-completed: []
requirements-advanced: [REL-01, REL-02]

coverage:
  - id: D1
    description: "Root facade, seven workspace manifests, every internal range, and npm lock records form one exact 0.22.0-rc.1 candidate graph."
    requirement: REL-01
    verification:
      - kind: integration
        ref: "tests/commands/release-rc.test.ts#root and seven workspace manifests use the exact Phase 127 RC graph; npm lockfile mirrors the exact root and workspace RC graph"
        status: pass
      - kind: unit
        ref: "tests/architecture/release-publish.test.mjs#Phase 127 RC metadata is one exact root and seven-workspace graph"
        status: pass
    human_judgment: false
  - id: D2
    description: "The root production dependency traversal and package dry-runs continue to exclude optional TUI, Bun, and OpenTUI authority."
    requirement: REL-01
    verification:
      - kind: unit
        ref: "tests/architecture/release-publish.test.mjs#default installation excludes optional TUI, Bun, and OpenTUI authority"
        status: pass
      - kind: other
        ref: "npm run check:packages — 8 dry-run tarballs; default graph excludes TUI"
        status: pass
    human_judgment: false
  - id: D3
    description: "Repeated local RC validation remains verification-only and preserves every planning phase directory without tag, push, publish, release, or workflow-dispatch calls."
    requirement: REL-02
    verification:
      - kind: integration
        ref: "tests/commands/release-rc.test.ts#repeated default validation records only local checks and preserves every planning phase directory"
        status: pass
      - kind: unit
        ref: "tests/architecture/release-publish.test.mjs#release candidate validation keeps tag creation behind the explicit --tag guard; release preparation preserves every existing planning phase directory"
        status: pass
    human_judgment: false

# Metrics
duration: 8min
completed: 2026-07-17
status: complete
---

# Phase 127 Plan 10: RC Candidate Package Graph Summary

**The root facade and all seven workspaces now form an exact `0.22.0-rc.1` npm candidate graph with RC-only lockfile changes, optional TUI isolation, and no outward release action.**

## Performance

- **Duration:** 8 min
- **Started:** 2026-07-17T14:07:19Z
- **Completed:** 2026-07-17T14:14:48Z
- **Tasks:** 3
- **Files modified:** 11 implementation/test metadata files plus this summary

## Accomplishments

- Added an immediate RED contract that enumerates the root facade and all seven workspace manifests, checks every internal dependency category for exact RC ranges, validates root/workspace lock records, and derives the candidate tag expectation without requiring Plan 127-11 documentation.
- Advanced all eight package versions and every internal `@git-stacks/*` range from `0.21.0-rc.6` to exact `0.22.0-rc.1` while preserving scripts, exports, publication settings, dependency categories, and the root-to-CLI/default-install boundary.
- Regenerated `package-lock.json` from the final manifests using `npm install --package-lock-only --ignore-scripts --no-audit --no-fund`; structural comparison found 24 expected RC-only value changes and no unrelated dependency churn.
- Passed the focused native release architecture suite, focused Vitest release suite, and all eight package dry-runs while preserving the optional Bun/OpenTUI package boundary.

## Task Commits

Each task was committed atomically with normal Git hooks:

1. **Task 1: Introduce manifest and lockfile RED assertions immediately before metadata changes** — `54a0a592` (test)
2. **Task 2: Advance root, protocol, client, core, and CLI manifests in lockstep** — `6bef17a5` (chore)
3. **Task 3: Advance service, web, and optional TUI manifests and regenerate the lockfile** — `ce10f2f0` (chore)

## Files Created/Modified

- `tests/commands/release-rc.test.ts` — Current `0.22.0-rc.1` manifest, internal-range, lockfile, candidate-tag, no-side-effect, and planning-preservation contracts with v0.21 evidence labeled historical.
- `tests/architecture/release-publish.test.mjs` — Native exact-graph and default-production traversal checks plus retained explicit tag guard and planning-tree preservation checks.
- `package.json` — Root facade version `0.22.0-rc.1` with exact `@git-stacks/cli` dependency.
- `packages/protocol/package.json` — Protocol package version `0.22.0-rc.1`.
- `packages/client/package.json` — Client package version and exact protocol range `0.22.0-rc.1`.
- `packages/core/package.json` — Core package version `0.22.0-rc.1` with unchanged external dependency semantics.
- `packages/cli/package.json` — CLI package version and exact core/protocol/service/web ranges `0.22.0-rc.1`.
- `packages/service/package.json` — Service package version and exact client/core/protocol ranges `0.22.0-rc.1`.
- `packages/web/package.json` — Web package version and exact browser-safe client/protocol ranges `0.22.0-rc.1`.
- `packages/tui/package.json` — Optional TUI package version and exact internal ranges `0.22.0-rc.1`, still outside the root default graph.
- `package-lock.json` — npm-generated root/workspace package records and internal ranges synchronized to `0.22.0-rc.1`.
- `.planning/phases/127-stale-workspace-intelligence-and-rc-closure/127-10-SUMMARY.md` — Canonical execution, verification, and release-authority receipt.
- `.planning/STATE.md` — Advanced execution to Plan 127-11, recorded metrics/decisions, and reconciled Plan 127-10 activity and progress.
- `.planning/ROADMAP.md` — Marked Plan 127-10 complete and updated Phase 127 to 10/14 plans executed.

## Decisions Made

- Separated current `0.22.0-rc.1` identity assertions from explicitly historical v0.21 changelog and workflow evidence rather than deleting still-relevant regression coverage.
- Kept Plan 127-10 independent from changelog, README, migration, shortcut, shell, and releasing-guide outputs owned by Plan 127-11.
- Required exact internal ranges in every dependency category rather than validating only ordinary dependencies.
- Treated the tag string `v0.22.0-rc.1` and npm channel `next` strictly as metadata expectations. No tag creation, push, publication, GitHub Release, or release-workflow dispatch was authorized or attempted.
- Advanced REL-01 and REL-02 evidence without marking either global requirement complete; Plan 127-11 documentation and Plans 127-12 through 127-14 exact-SHA hosted/manual closure remain outstanding.

## Verification Receipts

### Intentional RED before metadata implementation

- `node --test tests/architecture/release-publish.test.mjs`
  - 7 tests passed and exactly 2 current-RC tests failed.
  - Both failures reported root version `0.21.0-rc.6` where `0.22.0-rc.1` was required.
  - Tag guards, planning preservation, publication architecture, registry checks, and historical assertions stayed green.
- `npx vitest run tests/commands/release-rc.test.ts`
  - 9 tests passed and exactly 2 current-RC tests failed.
  - Failures enumerated only the eight stale manifest versions, stale internal ranges, and stale root/workspace lock records.
  - No Plan 127-11 documentation expectation or unrelated failure appeared.

### Final focused gates

- `node --test tests/architecture/release-publish.test.mjs`
  - 9/9 tests passed.
- `npx vitest run tests/commands/release-rc.test.ts`
  - 11/11 tests passed.
- `npm run check:packages`
  - Built protocol, client, core, CLI, service, and web packages.
  - Built the optional TUI through its isolated Bun command.
  - Validated 8 dry-run tarballs.
  - Reported `Package artifacts: OK (8 dry-run tarballs; default graph excludes TUI)`.
- Final structural scan
  - Root plus seven workspace versions equal `0.22.0-rc.1`.
  - Every internal manifest and lockfile range equals `0.22.0-rc.1`.
  - Root production traversal reaches CLI/service/web/client/core/protocol but not TUI, Bun, or OpenTUI.
  - No task commit has a Git tag; no tracked file was deleted; the task working tree was clean.

## ASVS L1 Threat Closure

| Threat | Result | Deterministic proof |
|---|---|---|
| T-127-10-01 manifest/internal graph tampering | PASS | Both focused suites enumerate all eight manifests and every internal dependency category at exact `0.22.0-rc.1`. |
| T-127-10-02 default-package privilege elevation | PASS | Native graph traversal and eight package dry-runs exclude `@git-stacks/tui`, Bun, and OpenTUI from the root production graph. |
| T-127-10-03 lockfile tampering | PASS | Package-lock-only regeneration followed final manifests; structural comparison admitted 24 RC-only changes and zero unrelated changes. |
| T-127-10-04 release-tool side effects | PASS | Repeated hermetic validation records only local npm checks; Git/provider/network logs remain empty and explicit tag gating remains intact. |
| T-127-10-05 planning artifact deletion | PASS | Native planning-tree checks and the mirrored sentinel harness preserve every existing phase directory; commit-range deletion scan is empty. |

No high-severity threat remains open for this metadata-only plan boundary.

## Release Actions Not Performed

The following actions were not run and remain unauthorized:

- Git tag creation, including `v0.22.0-rc.1`.
- Git push or force-push.
- `npm publish` or any package publication.
- GitHub Release creation.
- Release-only workflow dispatch, repository dispatch, or workflow dispatch.
- `npm run release:check` or any release workflow execution.

Ordinary local builds, lockfile-only npm resolution, focused tests, and package dry-runs were the only release-preparation operations performed.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Reconciled unsupported planning-state updates**
- **Found during:** Plan metadata closeout after Task 3.
- **Issue:** `state.update-progress` could not find this repository's structured progress field, `state.add-decision` emitted `[Phase ?]` labels, and plan advancement retained Plan 127-09 activity copy.
- **Fix:** Preserved successful SDK advancement/metrics/session updates, then corrected progress to 38/42 plans (90%), relabeled the four decisions to Phase 127, and updated activity text to Plan 127-10. REL-01 and REL-02 remain pending by design.
- **Files modified:** `.planning/STATE.md`
- **Verification:** STATE reports Plan 11 of 14, 38/42 completed plans, 90% progress, Plan 127-10 activity, and correctly labeled Phase 127 decisions; ROADMAP reports 10/14 plans executed.
- **Committed in:** Plan metadata commit.

---

**Total deviations:** 1 auto-fixed (1 Rule 3 blocking tooling issue)
**Impact on plan:** Tracking metadata now matches the completed RC graph without advancing global release requirements or release authority.

## Issues Encountered

- npm reported the lockfile was up to date after the prescribed package-lock-only regeneration, and the structural drift check confirmed that only expected RC metadata values changed.
- The GSD state handlers required the documented direct reconciliation above; no product, package, lockfile, or release behavior was affected.

## Known Stubs

None. The modified files contain no TODO, FIXME, placeholder, coming-soon, unavailable-data, or UI mock-data stub.

## Authentication Gates

None.

## User Setup Required

None — no external service configuration or credentials were needed.

## Next Phase Readiness

- Plan 127-11 can now add the `0.22.0-rc.1` changelog, migration, shortcut, configured-shell, package, and release documentation against a coherent package graph.
- The first complete `npm test` and validation-only `npm run release:check` remain Plan 127-11 work after those documentation outputs exist.
- Plans 127-12 through 127-14 still own immutable candidate-SHA indexing plus hosted, authenticated, physical, visual, interactive, and human evidence.
- No tag, push, publish, release, or release-workflow authorization has been granted.

## Self-Check: PASSED

- All 11 planned test/manifest/lockfile artifacts and this summary exist at their required paths.
- Task commits `54a0a592`, `6bef17a5`, and `ce10f2f0` exist in repository history.
- Focused native and Vitest release gates are green; package dry-runs report eight valid tarballs with the default graph excluding TUI.
- Root plus seven workspace manifests, exact internal ranges, and lockfile records all equal `0.22.0-rc.1`.
- No task commit is tagged, no tracked file was deleted, and the task working tree was clean before metadata closeout.

---
*Phase: 127-stale-workspace-intelligence-and-rc-closure*
*Completed: 2026-07-17*
