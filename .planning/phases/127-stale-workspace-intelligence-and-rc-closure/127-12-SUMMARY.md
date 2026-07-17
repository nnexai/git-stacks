---
phase: 127-stale-workspace-intelligence-and-rc-closure
plan: "12"
subsystem: release-candidate-evidence
status: complete
tags: [release-candidate, exact-sha, evidence-ledger, validation, nyquist, release-safety]

requires:
  - phase: 127-11
    provides: post-documentation 0.22.0-rc.1 candidate boundary plus green npm test and first no-tag release check
provides:
  - replacement immutable exact candidate SHA 233d294913bd4cd37602f6ef72f53cb960fb12d7, superseding f7bdca75f2545664251e88b233693b67fd37ee5c
  - repeated exact-candidate npm run release:check PASS receipt with unchanged tag refs
  - canonical marker-delimited JSON ledger with 23 immutable row/subcase records
  - reconciled awaiting-human-evidence validation state with Nyquist false and approval pending
  - preserved hosted/authenticated and physical/manual checkpoint classes for Plans 127-13 and 127-14
affects: [127-13, 127-14, release-candidate, hosted-validation, human-verification, release-authorization]

tech-stack:
  added: []
  patterns:
    - exact candidate identity is frozen before evidence-ledger commits and remains an ancestor of all receipt metadata
    - deterministic PASS never promotes hosted, authenticated, live, physical, visual, interactive, human, or release-authority rows
    - marker-delimited JSON is the sole row/subcase authority and Markdown tables are derived views

key-files:
  created:
    - .planning/phases/127-stale-workspace-intelligence-and-rc-closure/127-RECEIPTS.md
    - .planning/phases/127-stale-workspace-intelligence-and-rc-closure/127-12-SUMMARY.md
  modified:
    - .planning/phases/127-stale-workspace-intelligence-and-rc-closure/127-VALIDATION.md
    - .planning/STATE.md
    - .planning/ROADMAP.md

key-decisions:
  - "The replacement immutable release-candidate commit is 233d294913bd4cd37602f6ef72f53cb960fb12d7, captured clean after the catalog, TUI lifecycle, and service-authentication repairs and before the ledger was rebound."
  - "The repeated local RC gate is PASS only for the deterministic local class; all 22 hosted/authenticated/live/physical/visual/interactive/human rows remain PENDING with null evidence."
  - "Every receipt row owns a nonempty immutable required_subcases array; Plan 127-13 must return row-keyed exact-SHA approvals and Plan 127-14 alone may reconcile them."
  - "Self-hosted GitHub/GitLab remains NOT_CLAIMED, Gitea and provider mutation/search/inference/checkout/polling remain reasoned OPT_OUT dispositions, and release authority remains NOT_AUTHORIZED."

patterns-established:
  - "Candidate freeze: clean HEAD -> capture full SHA/branch/time/tag snapshot -> run no-tag RC validation -> commit only receipt metadata descendants."
  - "Evidence truthfulness: command output and exact SHA are required for local PASS; unavailable external/manual proof stays PENDING rather than becoming a waiver."

requirements-completed: [STALE-01, STALE-02, STALE-03, STALE-04, STALE-05]
requirements-advanced: [REL-01, REL-02]

coverage:
  - id: D1
    description: "One immutable post-documentation candidate SHA anchors the repeated validation-only RC gate, tag integrity, and planning-preservation receipt."
    requirement: REL-01
    verification:
      - kind: integration
        ref: "npm run release:check — exit 0 without --tag for 233d294913bd4cd37602f6ef72f53cb960fb12d7"
        status: pass
      - kind: other
        ref: "41 tag refs byte-identical before/after; intended tag absent"
        status: pass
    human_judgment: false
  - id: D2
    description: "The canonical ledger enumerates every ROADMAP criterion-4 and Phase 126 handoff class as an exact-SHA row with immutable required subcases."
    requirement: REL-01
    verification: []
    human_judgment: true
    rationale: "All 22 external/manual rows require separately supplied exact-candidate hosted or human evidence in Plan 127-13."
  - id: D3
    description: "Validation is awaiting human evidence with Wave 0 green, Nyquist false, approval pending, and release authority absent."
    requirement: REL-02
    verification:
      - kind: other
        ref: "127-12 validation assertions for awaiting-human-evidence, wave_0_complete=true, nyquist_compliant=false, and approval=pending"
        status: pass
    human_judgment: false

duration: 14min
completed: 2026-07-17
---

# Phase 127 Plan 12: Exact-Candidate Evidence Ledger Summary

**The repaired `0.22.0-rc.1` candidate is frozen at `233d294913bd4cd37602f6ef72f53cb960fb12d7`, superseding `f7bdca75f2545664251e88b233693b67fd37ee5c`, with a green cold web launch and complete no-tag RC gate while every unavailable external/manual class remains honestly pending.**

## Performance

- **Duration:** 14 min
- **Started:** 2026-07-17T14:50:01Z
- **Completed:** 2026-07-17T15:03:55Z
- **Tasks:** 2
- **Files modified:** 5 planning artifacts including this summary and final STATE/ROADMAP metadata

### Corrective refreeze

- **Reason:** Three runtime fixes landed after the original candidate freeze.
- **Replacement captured:** 2026-07-17T19:05:06Z
- **Cold web launch:** PASS from a stopped-service state
- **Complete regression:** `npm test`, `npm run typecheck`, `npm run coverage`, and `npm run release:check` PASS

## Accomplishments

- Captured the clean repaired HEAD after commits `42d92518`, `e5a59502`, `9d319c32`, and the consumed-handoff commit `233d2949`; the old candidate is explicitly superseded and contributes no approval.
- Reproduced the normal one-command web launch from a stopped-service state after a fresh package build; it started the managed service and opened the secure packaged client without `LocalEnvironmentPreparationError`.
- Repeated `npm run release:check` exactly without `--tag`; the command exited zero, produced local output, retained all 41 tag refs byte-for-byte, left `v0.22.0-rc.1` absent, and left the worktree clean.
- Created `127-RECEIPTS.md` with exactly one marker-delimited valid JSON object, 23 exact row IDs, immutable row-specific subcase arrays, deterministic receipts, provider dispositions, edge outcomes, and release-stop status.
- Reconciled `127-VALIDATION.md` to `awaiting-human-evidence`, `wave_0_complete: true`, `nyquist_compliant: false`, and `approval: pending` while keeping all 22 external/manual rows PENDING with null evidence.
- Preserved both planned Plan 127-13 checkpoint classes and the complete Phase 126 handoff without dispatching hosted workflows, authenticating tools, running live UAT, or fabricating provider/manual receipts.

## Task Commits

The original Plan 127-12 evidence commits (`a2b22ce8`, `c4e62f6e`, and `24a2ebfe`) remain historical ancestors only. Their candidate identity is superseded. The corrective source boundary is:

1. **Preserve larger authoritative workspace catalogs** — `42d92518`
2. **Harden TUI preload and renderer lifecycle** — `e5a59502`
3. **Close superseded service authentication** — `9d319c32`
4. **Consume the structured handoff and freeze the repaired clean boundary** — `233d2949`

## Candidate Identity

| Field | Value |
|---|---|
| Candidate SHA | `233d294913bd4cd37602f6ef72f53cb960fb12d7` |
| Branch at freeze | `planning/phase-127-revision-1` |
| Captured UTC | `2026-07-17T19:05:06Z` |
| Version | `0.22.0-rc.1` |
| Intended tag | `v0.22.0-rc.1` |
| npm channel | `next` |
| Candidate worktree/index | clean |
| Ledger existed at capture | no |
| Release authority | `NOT_AUTHORIZED` |

The replacement candidate commit remains unchanged and is the required ancestor of the replacement ledger and validation commits. The superseded ledger still existed in the candidate snapshot, but no replacement identity or receipt had yet been written; the first descendant evidence commit rebinds every row to this SHA.

## Files Created/Modified

- `.planning/phases/127-stale-workspace-intelligence-and-rc-closure/127-RECEIPTS.md` — Human-readable exact-SHA evidence index plus the canonical marker-delimited JSON receipt, capability, assumption, row, and immutable subcase source of truth.
- `.planning/phases/127-stale-workspace-intelligence-and-rc-closure/127-VALIDATION.md` — Reconciled local-green/external-pending validation state with the full ROADMAP and Phase 126 handoff mapping.
- `.planning/phases/127-stale-workspace-intelligence-and-rc-closure/127-12-SUMMARY.md` — Execution, exact-SHA, local validation, evidence-boundary, and next-checkpoint receipt.
- `.planning/STATE.md` — Advanced execution to Plan 127-13 and recorded Plan 127-12 metrics and decisions.
- `.planning/ROADMAP.md` — Updated Phase 127 execution progress to 12/14 plans.

## Decisions Made

- Froze the replacement candidate after the three post-freeze runtime repairs and complete local regression. The ledger and validation commits are evidence descendants, not replacement candidates.
- Treated the second local release check as proof only for the local deterministic class. The local runtime was recorded as informational and explicitly does not satisfy the hosted Node 24 OS/architecture matrix.
- Used one canonical JSON object and made every external/manual row carry its own candidate SHA, PENDING status, null evidence, source artifacts, gate, and comprehensive immutable `required_subcases` array.
- Kept `RELEASE-AUTHORIZATION` distinct from the 22 evidence rows and permanently `NOT_AUTHORIZED` during this plan; neither local success nor later feature UAT implies tag/push/publish/release authority.
- Preserved GitHub.com and GitLab.com read-only INTEGRATE scope while retaining Gitea, mutation, search/inference, checkout/repository mutation, and background polling as explicit reasoned opt-outs. Self-hosted support remains unclaimed without an explicit list.

## Verification Receipts

### Exact-candidate local RC gate

- Command: `npm run release:check`
- Candidate: `233d294913bd4cd37602f6ef72f53cb960fb12d7`
- Started: `2026-07-17T19:02:06Z`
- Completed: `2026-07-17T19:03:46Z`
- Exit: `0`
- Sanitized result: `RC verification passed for 0.22.0-rc.1.`
- Full output SHA-256: `aad0b0d2f37d0988f47230fea01f4bbb932f46a6d1bab1f672ff50ff69cbfb69`
- Tag flag supplied: no

### Cold web auto-launch

- Build: `npm run build:packages`
- Precondition: managed service stopped
- Launch: `node packages/cli/dist/index.js web`
- Result: secure packaged client opened and the managed service started automatically
- `LocalEnvironmentPreparationError`: not reproduced
- Cleanup: managed service stopped

The raw command output existed locally and was not copied into the ledger because raw build/provider-adjacent output can contain machine-specific detail. The digest and sanitized terminal result bind the receipt without embedding that output.

### Tag and planning preservation

- Tag refs before/after: 41 / 41, byte-identical.
- Tag snapshot SHA-256 before/after: `e40ec092d8b7158398327c98156f853b6a32ac8b6843dd291739cc75c2526b86`.
- Intended `v0.22.0-rc.1` tag before/after: absent.
- Existing phase directories before/after: 5 / 5, identical inventory.
- Worktree after validation: clean.
- Candidate-to-evidence diff is restricted to the Phase 127 ledger, validation, summary, and state metadata.

### Canonical ledger assertions

- Exactly one start marker and one end marker.
- JSON parses with `schema_version: 1`.
- Identity equals exact candidate SHA, `0.22.0-rc.1`, `v0.22.0-rc.1`, and `next`.
- Exactly 23 row IDs exist: 22 required external/manual rows plus `RELEASE-AUTHORIZATION`.
- Every external/manual row is PENDING, exact-SHA-bound, has null evidence, and has a nonempty unique `required_subcases` array.
- `RELEASE-AUTHORIZATION` is `NOT_AUTHORIZED`.
- Self-hosted is `NOT_CLAIMED`; every OPT_OUT has a reason.

### Validation assertions

- `status: awaiting-human-evidence`.
- `wave_0_complete: true`; all 11 required Wave 0 fixture/test files exist.
- `nyquist_compliant: false`.
- `approval: pending` and `Approval: pending` are machine- and human-readable.
- A-EDGE-STALE-03 is `CLOSED_DETERMINISTIC` from actual no-mutation proofs.
- A-EDGE-REL-01 remains `UNRESOLVED` and flagged.
- All 22 external/manual rows remain PENDING and link to the exact candidate ledger.

## External and Manual Evidence Status

| Evidence group | Rows | Status |
|---|---|---|
| Hosted runtime, configured shells, and SSH agent | HST-RUNTIME, HST-SHELL, HST-SSH | PENDING |
| Authenticated GitHub/GitLab status | AUTH-GH-STATUS, AUTH-GL-STATUS | PENDING |
| GitHub/GitLab same/fork creation and recovery | FORGE-GH-SAME, FORGE-GH-FORK, FORGE-GL-SAME, FORGE-GL-FORK, FORGE-RECOVERY | PENDING |
| Archive/remove/stale/navigation/Phase 126/lifecycle live behavior | LIVE-ARCHIVE through LIVE-LIFECYCLE | PENDING |
| Physical browser/xterm | PHYS-BROWSER-XTERM | PENDING |
| Responsive screenshots | VIS-RESPONSIVE | PENDING |
| Interactive OpenTUI | INT-TUI | PENDING |
| Human web/TUI parity | HUMAN-PARITY | PENDING |
| Outward release authority | RELEASE-AUTHORIZATION | NOT_AUTHORIZED |

No hosted URL, workflow run ID, provider result, screenshot, checksum for an unavailable external artifact, interactive observation, or human approval was invented or upgraded.

## Planned Human Checkpoints Preserved

1. **Hosted/authenticated checkpoint:** supported runtime matrix, Bash/zsh/fish, PATH and SSH-agent rotation, authenticated GitHub/GitLab status, all four same/fork Resolve → Review → Create flows, and the complete forge recovery/rollback matrix.
2. **Physical/manual checkpoint:** archive/remove/stale/navigation, broader actions/notes/file status, reconnect/cancel/refresh-failed lifecycle, physical browser/xterm, desktop/375/320 light/dark screenshots, every OpenTUI tier, and side-by-side parity.

Both remain blocking Plan 127-13 evidence gates. One approval cannot collapse row-specific subcases, and neither checkpoint authorizes a release action.

## Release Actions Not Performed

- No Git tag creation.
- No Git push or force-push.
- No package publication.
- No GitHub Release creation or publication.
- No hosted, repository, or release-only workflow dispatch.
- No provider CLI installation or authentication.
- No claim that candidate preparation grants release authorization.

## ASVS L1 Threat Closure

| Threat | Result | Proof |
|---|---|---|
| Candidate SHA spoofing | PASS | Clean-tree capture before ledger creation; candidate remains a commit ancestor and differs from ledger commits. |
| Evidence-class repudiation | PASS | Explicit status legend, command/SHA/time/result, separate rows, null pending evidence, and no inherited external PASS. |
| Receipt information disclosure | PASS | Sanitized summary and digests only; no machine paths, credentials, environment, bearer material, raw provider output, or private payload. |
| Release-authority elevation | PASS | No-tag command, unchanged refs, intended tag absent, no outward command, and explicit NOT_AUTHORIZED row. |
| False Nyquist/approval state | PASS | Nyquist remains false and approval pending while all required external/manual rows are PENDING. |
| Post-freeze scope tampering | PASS | Only the two declared evidence files changed before summary/metadata closeout. |

No new network endpoint, authentication path, file-access boundary, runtime schema, or product trust surface was introduced by this planning-only plan.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added a machine-readable approval field required by the plan validator**
- **Found during:** Overall Task 2 validation.
- **Issue:** The human-readable `**Approval:** pending` line did not satisfy the plan's literal `Approval:\s*pending` assertion because Markdown emphasis sits between the colon and value.
- **Fix:** Added `approval: pending` to validation frontmatter while retaining the human-readable sign-off.
- **Files modified:** `.planning/phases/127-stale-workspace-intelligence-and-rc-closure/127-VALIDATION.md`
- **Verification:** The exact plan assertion and complete fail-fast overall verifier pass.
- **Committed in:** `c4e62f6e`.

**2. [Rule 1 - Bug] Replaced a non-fail-fast aggregate verification invocation**
- **Found during:** Overall plan verification.
- **Issue:** An initial compound shell command continued after one Node assertion failed and printed a misleading trailing PASS line.
- **Fix:** Corrected the missing approval field, reran every overall assertion under `set -euo pipefail`, and required the final command to stop on any failed subprocess.
- **Files modified:** None beyond the Task 2 approval-field correction above.
- **Verification:** Final fail-fast verification passed candidate identity/ancestry, ledger schema/rows/statuses, validation state, file scope, tag integrity, command output, commit existence, diff hygiene, and clean-tree checks.
- **Committed in:** Process correction; no separate file commit required.

**3. [Rule 3 - Blocking] Reconciled unsupported planning-state handler output**
- **Found during:** Plan metadata closeout.
- **Issue:** `state.update-progress` could not locate this repository's structured progress field, and `state.add-decision` emitted `[Phase ?]` labels while retaining Plan 127-11 activity copy.
- **Fix:** Preserved the successful plan advance, metric, session, and roadmap updates; corrected progress to 40/42 plans (95%), updated Plan 127-12 activity text, and relabelled the four decisions as Phase 127.
- **Files modified:** `.planning/STATE.md`
- **Verification:** STATE reports Plan 13 of 14, 40/42 completed plans, 95% progress, Plan 127-12 activity, and Phase 127 decision labels; ROADMAP reports 12/14 plans executed.
- **Committed in:** Plan metadata commit.

**4. [Rule 3 - Blocking] Replaced the invalidated exact candidate after runtime fixes**
- **Found during:** Post-freeze live runtime verification.
- **Issue:** The original candidate predated fixes for catalogs larger than 16 workspaces, TUI preload/terminal cleanup, and shutdown racing with authentication.
- **Fix:** Consumed the structured handoff, reproduced cold web auto-launch, ran the complete regression, froze `233d294913bd4cd37602f6ef72f53cb960fb12d7`, and rebound all receipt rows while leaving external/manual evidence PENDING.
- **Verification:** Full tests, typecheck, coverage, no-tag release check, tag-ref integrity, planning-directory integrity, and clean-tree checks passed.
- **Committed in:** Corrective Plan 127-12 evidence commits after the replacement candidate.

---

**Total deviations:** 4 auto-fixed (3 blocking workflow issues, 1 verification-process bug)
**Impact on plan:** All fixes strengthened planned truthfulness and tracking gates. Candidate identity, evidence statuses, command results, external/manual pending state, and release boundary were unchanged.

## Issues Encountered

- The plan's task-one pre-commit validator intentionally compares ledger `candidate_sha` to current HEAD. It was run before the ledger commit while HEAD still equalled the candidate; post-commit verification instead proved the immutable candidate is a distinct ancestor of the ledger commits.
- The replacement candidate snapshot contains the superseded ledger as historical planning state. The replacement evidence commit must therefore prove `replacement_ledger_not_yet_rebound: true` rather than falsely claiming that no ledger path existed.
- `git diff --name-only` does not report an untracked new ledger file. Task-one scope validation therefore used `git status --porcelain` before the first commit, then commit-range diff checks after commit.

## Known Stubs

None. The plan changed only evidence documentation. `PENDING`, `NOT_CLAIMED`, `OPT_OUT`, and unavailable-evidence wording are intentional validation states, not product placeholders or unwired data.

## Authentication Gates

None. No provider login, credential, secret, hosted workflow, or release credential was requested or used.

## User Setup Required

None for this plan. Plan 127-13 requires separately supplied exact-candidate hosted/authenticated evidence and explicit physical/manual review; this plan intentionally did not install, authenticate, dispatch, or run those environments.

## Next Phase Readiness

- Plan 127-13 can read the immutable candidate and canonical row/subcase arrays directly from `127-RECEIPTS.md`.
- Hosted/authenticated and physical/manual checkpoint classes are complete, separate, and still blocking because all required rows remain PENDING.
- Plan 127-14 can mechanically compare approved subcases against the committed Plan 127-12 baseline without allowing row/subcase drift.
- A-EDGE-REL-01, Nyquist approval, REL-01/REL-02 final closure, and all release actions remain pending or unauthorized.

## Self-Check: PASSED

- `127-RECEIPTS.md`, `127-VALIDATION.md`, and this summary exist at the required paths.
- Historical task commits `a2b22ce8` and `c4e62f6e` and all three post-freeze repair commits exist in repository history.
- Candidate `233d294913bd4cd37602f6ef72f53cb960fb12d7` exists, remains immutable, and is the clean replacement boundary for descendant evidence commits.
- The final fail-fast verification passed ledger, validation, tag-integrity, file-scope, diff-hygiene, and clean-tree assertions.

---
*Phase: 127-stale-workspace-intelligence-and-rc-closure*
*Completed: 2026-07-17*
