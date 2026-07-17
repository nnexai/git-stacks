---
phase: 127-stale-workspace-intelligence-and-rc-closure
plan: "11"
subsystem: release-documentation-validation
tags: [stale-workspaces, release-candidate, documentation, npm, vitest, node-test, opentui, release-safety]

requires:
  - phase: 127-09
    provides: green deterministic stale-workspace, cross-client, authority, disclosure, build, and coverage boundary
  - phase: 127-10
    provides: exact 0.22.0-rc.1 root/workspace manifest graph, internal ranges, lockfile, and default-package isolation
provides:
  - authoritative stale-workspace policy, shortcut, provider, lifecycle, shell, migration, privacy, and deferral guide
  - discoverable README entry and exact dated 0.22.0-rc.1 changelog identity
  - validation-only release procedure with exact-SHA evidence separation and explicit outward-action stop
  - green complete npm test and no-tag release:check receipts
  - byte-identical tag refs and phase-planning artifact tree across release validation
  - explicit separation of local deterministic results from hosted, authenticated, live, physical, screenshot, interactive, human, and release-authority evidence

affects: [127-12, 127-13, 127-14, release-candidate, exact-sha-receipts, hosted-validation, human-verification]

tech-stack:
  added: []
  patterns:
    - release-facing documentation assertions enter as a focused RED gate only after package metadata is green
    - stale evidence documentation mirrors service-owned policy and never creates client or lifecycle authority
    - release preparation records local deterministic evidence separately from every external and human class
    - verification-only tasks use an empty normal-hook commit as the command receipt

key-files:
  created:
    - docs/stale-workspaces.md
    - .planning/phases/127-stale-workspace-intelligence-and-rc-closure/127-11-SUMMARY.md
  modified:
    - tests/commands/release-rc.test.ts
    - tests/architecture/release-publish.test.mjs
    - README.md
    - CHANGELOG.md
    - docs/releasing.md
    - .planning/STATE.md
    - .planning/ROADMAP.md

key-decisions:
  - "The stale guide treats the strict 30-day cutoff, confirmed reasons, unknown evidence, cautions, ranking, and repository scope as explainable advisory facts with no confidence or safety score."
  - "Canonical Open remains the first inspection path; Archive, Remove, and Force Remove retain service-owned descriptors, confirmations, terminal gates, dirty-worktree result, and fresh-revision inventory."
  - "Only GitHub.com PR and GitLab.com MR status from validated persisted provenance is documented as supported; Gitea status, self-hosted claims, inference, search, mutation, polling, and durable cache remain deferred or not claimed."
  - "The exact candidate SHA is intentionally left for Plan 127-12 to freeze after this plan's metadata commit; local success does not promote any external/manual evidence class."
  - "Release preparation runs npm run release:check without --tag and requires separate explicit authorization for tag, push, publish, GitHub Release, and release-only workflow actions."

patterns-established:
  - "Documentation RED: focused native and Vitest tests fail on one missing release-documentation contract while manifest, side-effect, package, and planning-preservation checks stay green."
  - "Release receipt: snapshot all tag refs and hash every phase-planning artifact before validation, then require byte-identical snapshots afterward."

requirements-completed: [STALE-01, STALE-02, STALE-03, STALE-04, STALE-05]
requirements-advanced: [REL-01, REL-02]

coverage:
  - id: D1
    description: "The user guide defines the fixed strict 30-day cutoff, all confirmed reasons, timestamps, deduplication, repository scope, cautions, candidate/incomplete separation, and transparent score-free ranking."
    requirement: STALE-01
    verification:
      - kind: integration
        ref: "tests/commands/release-rc.test.ts#current RC changelog and stale guide describe the exact advisory product boundary"
        status: pass
      - kind: unit
        ref: "tests/architecture/release-publish.test.mjs#Phase 127 documentation keeps stale evidence advisory and release authority separate"
        status: pass
    human_judgment: false
  - id: D2
    description: "README and guide document web/TUI entry, refresh, navigation, responsive tiers, evidence detail, and canonical Open-before-cleanup behavior."
    requirement: STALE-02
    verification:
      - kind: integration
        ref: "documentation content smoke check plus focused Vitest release suite — 12/12 passed"
        status: pass
      - kind: integration
        ref: "npm test — Vitest 2266 passed with one conditional skip; native Node 121/121; isolated TUI 242/242"
        status: pass
    human_judgment: false
  - id: D3
    description: "The guide states that evaluation and refresh are advisory, read-only, and unable to archive, remove, close terminals, discard worktrees, write YAML, or mutate providers."
    requirement: STALE-03
    verification:
      - kind: unit
        ref: "tests/architecture/release-publish.test.mjs#Phase 127 documentation keeps stale evidence advisory and release authority separate"
        status: pass
      - kind: integration
        ref: "npm run release:check — stale authority and deterministic-evidence-spoofing architecture checks passed"
        status: pass
    human_judgment: false
  - id: D4
    description: "Archive and Remove remain canonical follow-up actions, while Force Remove requires the fresh typed dirty-worktree, terminal-stop, force-allowed, and exact-revision inventory sequence."
    requirement: STALE-04
    verification:
      - kind: integration
        ref: "tests/commands/release-rc.test.ts#current RC changelog and stale guide describe the exact advisory product boundary"
        status: pass
      - kind: unit
        ref: "tests/architecture/release-publish.test.mjs#Phase 127 documentation keeps stale evidence advisory and release authority separate"
        status: pass
    human_judgment: false
  - id: D5
    description: "Unknown provider, remote, worktree, and activity outcomes remain visible and separate from confirmed evidence; browser projection and trusted-TUI boundaries are explicit."
    requirement: STALE-05
    verification:
      - kind: integration
        ref: "npm test and npm run release:check — stale schema/provider/authority/disclosure suites passed"
        status: pass
      - kind: unit
        ref: "tests/architecture/release-publish.test.mjs#Phase 127 documentation keeps stale evidence advisory and release authority separate"
        status: pass
    human_judgment: false
  - id: D6
    description: "README, changelog, stale guide, and release procedure describe exact 0.22.0-rc.1 package/tag/channel/date metadata, configured shells, migration boundary, shortcuts, and supported hosts."
    requirement: REL-01
    verification:
      - kind: integration
        ref: "tests/commands/release-rc.test.ts — 12/12 passed"
        status: pass
      - kind: unit
        ref: "tests/architecture/release-publish.test.mjs — 10/10 passed"
        status: pass
    human_judgment: false
  - id: D7
    description: "Complete local RC validation passes without a tag argument, with unchanged tag refs, an unchanged phase-planning tree, and no tag, push, publish, GitHub Release, or release-workflow action."
    requirement: REL-02
    verification:
      - kind: integration
        ref: "npm test — exit 0"
        status: pass
      - kind: integration
        ref: "npm run release:check — RC verification passed for 0.22.0-rc.1 without --tag"
        status: pass
      - kind: other
        ref: "41 tag refs and 125 planning entries were byte-identical before/after validation"
        status: pass
    human_judgment: false

duration: 25min
completed: 2026-07-17
status: complete
---

# Phase 127 Plan 11: Stale Workspace and RC Documentation Summary

**A complete advisory stale-workspace contract and exact `0.22.0-rc.1` release guide now sit behind green full-project and validation-only RC gates with unchanged tags and planning artifacts.**

## Performance

- **Duration:** 25 min
- **Started:** 2026-07-17T14:19:07Z
- **Completed:** 2026-07-17T14:43:35Z
- **Tasks:** 3
- **Files modified:** 6 product/test documentation files plus this summary and planning metadata

## Accomplishments

- Introduced a narrow documentation RED boundary after the exact manifest graph was green; each focused runner failed on exactly one missing changelog/guide assertion while existing release side-effect and planning-preservation contracts stayed green.
- Published `docs/stale-workspaces.md` as the complete advisory policy and operator contract, covering strict qualification, unknowns, ranking, cache/refresh, web/TUI shortcuts and layouts, canonical lifecycle gates, provider limits, configured shells and SSH-agent rotation, migration, privacy, and deferrals.
- Added the discoverable README entry, exact dated changelog heading and package/tag/channel sentence, and a release procedure that separates local preparation, exact-SHA evidence, external/manual pending classes, and outward release authorization.
- Passed the complete `npm test` suite and `npm run release:check` without `--tag`; all 41 tag refs and all 125 phase-planning entries were byte-identical before and after release validation.

## Task Commits

Each task was committed atomically with normal Git hooks:

1. **Task 1: Introduce changelog and documentation RED assertions immediately before writing docs** — `edaf3c57` (test)
2. **Task 2: Publish the stale-workspace, migration, shortcut, shell, provider, changelog, and release guides** — `d3601a37` (docs)
3. **Task 3: Run the complete post-documentation local test and release-candidate gate** — `d4f6234e` (empty test receipt)

## Files Created/Modified

- `tests/commands/release-rc.test.ts` — Vitest assertions for exact changelog identity and stale policy, shortcut, shell, migration, provider, README, and releasing-guide boundaries.
- `tests/architecture/release-publish.test.mjs` — Native documentation, evidence-separation, planning-preservation, and release-authorization checks with missing-file-safe RED loading.
- `docs/stale-workspaces.md` — Authoritative user/operator contract for advisory stale evidence and all supported UI, provider, lifecycle, shell, migration, and privacy behavior.
- `README.md` — Discoverable stale-workspace feature summary plus links to the stale and release guides.
- `CHANGELOG.md` — Exact `0.22.0-rc.1` dated release-candidate entry, prior parity summary, lockstep package identity, shell/migration notes, and local-only evidence boundary.
- `docs/releasing.md` — Validation-only local procedure, exact candidate SHA rule, per-class evidence ledger states, planning retention, trusted publishing context, and explicit release stop.
- `.planning/phases/127-stale-workspace-intelligence-and-rc-closure/127-11-SUMMARY.md` — Canonical execution and local validation receipt.
- `.planning/STATE.md` — Advanced execution to Plan 127-12 and recorded Plan 127-11 metrics and decisions.
- `.planning/ROADMAP.md` — Updated Phase 127 execution progress to 11/14 plans.

## Decisions Made

- Used the service policy's five reason codes while documenting provider-specific GitHub PR and GitLab MR labels separately, preserving the distinction between reason semantics and UI wording.
- Made unknown-only evaluation a separate **Evaluation incomplete** section and stated explicitly that failed evidence is neither absence, presence, nor proof of staleness.
- Kept every cleanup action behind existing canonical authority. Stale evidence can prioritize review but can never expose initial Force Remove or weaken revision, terminal, inventory, dirty-worktree, or confirmation gates.
- Documented only GitHub.com and GitLab.com read-only status from validated persisted provenance. Gitea status is deferred, self-hosted status is not claimed, and search/inference/mutation remain out of scope.
- Bound release preparation to local validation and artifact preservation. The exact candidate SHA will be the clean committed HEAD after this plan's metadata commit and will be frozen by Plan 127-12, not inferred from the Task 3 receipt commit.
- Kept STALE implementation complete and advanced REL-01/REL-02 documentation and local evidence without marking global release closure complete; hosted, authenticated, live-service, physical, screenshot, interactive, human, and release-authorization evidence remains pending for Plans 127-12 through 127-14.

## Verification Receipts

### Intentional documentation RED

- `node --test tests/architecture/release-publish.test.mjs`
  - 10 tests discovered; 9 passed and exactly 1 failed.
  - The failure was the missing exact `## [0.22.0-rc.1] - 2026-07-17` changelog heading.
  - Manifest graph, default package, tag guard, publication, registry, and planning-preservation checks stayed green.
- `npx vitest run tests/commands/release-rc.test.ts`
  - 12 tests discovered; 11 passed and exactly 1 failed.
  - The failure was the missing current-RC changelog entry.
  - Manifest/lock, historical release, smoke, no-side-effect, and planning-preservation checks stayed green.

### Documentation green gate

- Documentation content smoke command — passed.
- `node --test tests/architecture/release-publish.test.mjs` — 10/10 passed.
- `npx vitest run tests/commands/release-rc.test.ts` — 12/12 passed.
- `git diff --check` — passed.

### Complete aggregate test gate

- `npm test` — passed.
  - Built protocol, client, core, CLI, service, and web packages.
  - Vitest: 168/168 files passed; 2266 tests passed and 1 conditional test skipped.
  - Native Node architecture/conformance/core/CLI/service: 121/121 passed.
  - Isolated Bun/OpenTUI: 39/39 files and 242/242 tests passed.

### Validation-only release gate

- Ran `npm run release:check` exactly without `--tag` — passed.
- Built all Node packages and the optional TUI; type-checked every workspace.
- Package architecture and dependency-cycle checks passed.
- Vitest: 168/168 files passed; 2266 tests passed and 1 conditional test skipped.
- Native Node: 121/121 passed.
- Isolated Bun/OpenTUI: 39/39 files and 242/242 tests passed.
- V8 coverage: 56.24% statements, 51.54% branches, 54.44% functions, 59.61% lines.
- Verification inventory/gate alignment passed.
- Production license audit passed for 246 package records.
- Default Node production audit reported 0 vulnerabilities.
- Package validation passed for 8 dry-run tarballs; the default graph excludes TUI.
- Final tool receipt: `RC verification passed for 0.22.0-rc.1.`

### Side-effect and preservation receipts

- Tag refs: 41 entries before and after; byte-identical.
  - Before SHA-256: `e40ec092d8b7158398327c98156f853b6a32ac8b6843dd291739cc75c2526b86`
  - After SHA-256: `e40ec092d8b7158398327c98156f853b6a32ac8b6843dd291739cc75c2526b86`
- Phase-planning tree: 125 entries before and after (5 directories, 120 files, 0 symlinks); byte-identical including file sizes and SHA-256 digests.
  - Before SHA-256: `dca5f153295d862eb7fdcdc658789a66dc32dec46d21390aab5611dda30bd62a`
  - After SHA-256: `dca5f153295d862eb7fdcdc658789a66dc32dec46d21390aab5611dda30bd62a`
- No tracked or untracked output remained after either complete gate.

## External and Manual Evidence Status

The local receipts above prove only the deterministic behavior available in this checkout. They do not prove these classes, which remain **PENDING** for Plans 127-12 and 127-13:

| Evidence class | Status |
|---|---|
| Hosted Linux/macOS and x64/arm64 runtime receipts | PENDING |
| Authenticated GitHub.com/GitLab.com status and forge-flow receipts | PENDING |
| Live-service lifecycle, reconnect, stale, attention, and Phase 126 workflow receipts | PENDING |
| Physical browser/xterm keyboard and input behavior | PENDING |
| Responsive light/dark screenshots at required widths | PENDING |
| Interactive OpenTUI behavior at every width tier | PENDING |
| Human cross-client parity approval | PENDING |
| Release authorization | PENDING |

Self-hosted GitHub/GitLab stale-status support remains **NOT_CLAIMED** without an explicit supported-host list and exact-SHA receipts. Gitea stale change-status, provider mutation, and provider search/inference remain deliberate opt-outs.

## Release Actions Not Performed

The following actions remain unauthorized and were not performed:

- Git tag creation, including `v0.22.0-rc.1`.
- Git push or force-push.
- `npm publish` or package publication.
- GitHub Release creation or publication.
- Release-only workflow dispatch, hosted dispatch, or repository dispatch.
- Any claim that local validation grants release authorization.

## ASVS L1 Threat Closure

| Threat | Local result | Deterministic proof |
|---|---|---|
| T-127-11-01 misleading stale evidence | PASS | Exact policy/reason/unknown/ranking assertions and complete guide retain neutral advisory wording and no score. |
| T-127-11-02 lifecycle authority elevation | PASS | Native docs assertions and complete suites preserve canonical Open/Archive/Remove/Force boundaries. |
| T-127-11-03 RC metadata tampering | PASS | Both focused suites assert exact heading, sentence, package graph, lockfile, tag identity, and npm channel. |
| T-127-11-04 release-command authority elevation | PASS | Documentation requires no-tag validation; architecture tests retain the explicit tag guard and reject push/publish/release/dispatch calls. |
| T-127-11-05 evidence repudiation | PASS for local boundary | Release guide and tests separate local deterministic results from every external/manual class, all still pending. |
| T-127-11-06 planning artifact tampering | PASS | Native preservation tests plus byte-identical 125-entry planning snapshots before/after the full release gate. |

No high-severity threat remains open inside Plan 127-11's documentation and local-validation boundary. Exact-SHA external/manual evidence remains intentionally pending rather than waived.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Reconciled unsupported planning-state handler output**
- **Found during:** Plan metadata closeout after Task 3.
- **Issue:** `state.update-progress` could not locate this repository's structured progress field, `state.add-decision` emitted `[Phase ?]` labels, and the generic requirement handler did not recognize the bold requirement-checkbox format.
- **Fix:** Preserved successful plan advancement, metrics, session, and roadmap updates; corrected progress to 39/42 plans (93%), updated Plan 127-11 activity text, relabelled the four decisions as Phase 127, and retained REL-01/REL-02 as advanced rather than globally complete because exact-SHA external/manual closure remains Plans 127-12 through 127-14 work.
- **Files modified:** `.planning/STATE.md`, this summary.
- **Verification:** STATE reports Plan 12 of 14, 39/42 completed plans, 93% progress, Plan 127-11 activity, and Phase 127 decision labels; ROADMAP reports 11/14 plans executed.
- **Committed in:** Plan metadata commit.

---

**Total deviations:** 1 auto-fixed (1 Rule 3 blocking tooling issue)
**Impact on plan:** Product, documentation, tests, release validation, and the explicit external-evidence boundary are unchanged; planning metadata now reflects the completed plan accurately.

## Issues Encountered

- The isolated OpenTUI suite emitted the pre-existing `TerminalConsoleCache` EventTarget listener warning in several files while all 242 tests passed. The warning predates this documentation-only plan and is already tracked in Phase 127 `deferred-items.md`; no production or test behavior was changed here.

## Known Stubs

None. The six files created or modified by the task contain no UI mock-data, TODO, FIXME, placeholder, coming-soon, or unavailable-data stub. The only scan hit was a historical changelog sentence describing previously completed TODO tests.

## Authentication Gates

None. No provider login or release credential was required or attempted.

## User Setup Required

None — local validation used the repository's existing Node/npm and optional Bun toolchain. External/manual evidence collection remains a later explicit operator workflow, not setup performed by this plan.

## Next Phase Readiness

- Plan 127-12 can freeze the clean committed HEAD after this summary/state metadata commit as the one exact candidate SHA and create the canonical receipt ledger.
- Plan 127-12 must rerun the no-tag release check against that immutable SHA and retain every external/manual row as PENDING unless safe exact-SHA evidence already exists.
- Plan 127-13 still owns hosted/authenticated/live/physical/screenshot/interactive/human checkpoints; Plan 127-14 owns evidence reconciliation.
- No tag, push, publication, GitHub Release, release-only workflow, or release authorization exists.

## Self-Check: PASSED

- All six planned product/test documentation artifacts exist at their required paths.
- Task commits `edaf3c57`, `d3601a37`, and `d4f6234e` exist in repository history.
- Focused documentation tests, `npm test`, and validation-only `npm run release:check` are green.
- Tag refs and the complete pre-summary phase-planning artifact tree were byte-identical across release validation.
- No task commit deleted a tracked file, and the working tree was clean before summary creation.

---
*Phase: 127-stale-workspace-intelligence-and-rc-closure*
*Completed: 2026-07-17*
