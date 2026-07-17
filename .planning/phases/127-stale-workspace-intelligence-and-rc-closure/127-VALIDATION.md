---
phase: 127
slug: stale-workspace-intelligence-and-rc-closure
status: awaiting-human-evidence
nyquist_compliant: false
approval: pending
wave_0_complete: true
candidate_sha: 233d294913bd4cd37602f6ef72f53cb960fb12d7
created: 2026-07-17
updated: 2026-07-17
---

# Phase 127 — Validation Strategy and Evidence State

> Exact-candidate validation for explainable stale-workspace behavior and `0.22.0-rc.1` preparation. Local deterministic evidence is green; hosted, authenticated, live, physical, visual, interactive, and human evidence remains explicitly PENDING.

## Candidate Identity

| Field | Value |
|---|---|
| Candidate SHA | 233d294913bd4cd37602f6ef72f53cb960fb12d7 |
| Superseded candidate | f7bdca75f2545664251e88b233693b67fd37ee5c |
| Candidate branch at freeze | planning/phase-127-revision-1 |
| Captured UTC | 2026-07-17T19:05:06Z |
| Version | 0.22.0-rc.1 |
| Intended tag | v0.22.0-rc.1 |
| npm channel | next |
| Ledger commit | 224fb0957d310f7d8115e778ee0532214ab34923 |
| Validation status | awaiting-human-evidence |
| Nyquist | false |
| Approval | pending |
| Release authority | NOT_AUTHORIZED |

The replacement candidate is the clean committed HEAD captured after all three post-freeze runtime repairs and before the receipt ledger was rebound. It supersedes `f7bdca75f2545664251e88b233693b67fd37ee5c`; none of that older candidate's deterministic or human approval is reused. The replacement ledger commit is a descendant of the candidate and does not replace the candidate SHA.

## Deterministic Evidence

| Validation class | Result | Command or proof | Scope |
|---|---|---|---|
| Cold managed-service web auto-launch | PASS | fresh `npm run build:packages`; stop service; `node packages/cli/dist/index.js web` | Local one-command launch started the service and opened the secure packaged client without `LocalEnvironmentPreparationError`; does not satisfy hosted/manual rows |
| Wave 0 focused fixture/test inventory | PASS | 11/11 required files exist | Plans 127-01 and 127-02; later exact-candidate release gate is green |
| Stale schema, provider, remote, policy, web, and cross-client matrix | PASS | npm run release:check | Exact-candidate command output exists; detailed counts remain in 127-09-SUMMARY.md and 127-11-SUMMARY.md |
| OpenTUI isolated renderer and interaction suites | PASS | npm run release:check | Deterministic Bun/OpenTUI tests only; INT-TUI remains PENDING |
| Architecture, ASVS, package boundaries, builds, and type checks | PASS | npm run release:check | Exact-candidate local deterministic evidence |
| Manifest, lockfile, changelog, guide, migration, shortcut, shell, and release metadata | PASS | npm run release:check | Exact 0.22.0-rc.1 / v0.22.0-rc.1 / next identity |
| Repeated validation-only RC gate | PASS | npm run release:check | Exit 0 at 2026-07-17T19:03:46Z; no tag flag |
| Tag-ref integrity | PASS | before/after tag-ref snapshot comparison | 41 refs; byte-identical; intended tag absent |
| Planning-directory preservation | PASS | before/after phase-directory inventory plus clean-tree check | 5 directories; identical; no validation output remained |
| A-EDGE-STALE-03 no-mutation edge | PASS | runtime mutation sentinels plus hostile capability tests | CLOSED_DETERMINISTIC; does not claim live/human evidence |

The repeated exact-candidate command output exists and is represented by SHA-256 `aad0b0d2f37d0988f47230fea01f4bbb932f46a6d1bab1f672ff50ff69cbfb69` in the canonical receipt JSON. Raw command output is intentionally not copied into planning artifacts. Local Node/npm metadata is informational only and does not satisfy HST-RUNTIME.

## Plan and Wave Status

| Plan | Status | Actual validation state |
|---|---|---|
| 127-01 | PASS | Final strict schema/provider/remote/policy/cache/revision/no-mutation files exist and pass the exact-candidate RC gate. |
| 127-02 | PASS | Final web/TUI/conformance/authority and no-outward-action files exist and pass the exact-candidate RC gate. |
| 127-03 | PASS | Strict stale DTOs and bounded read-only GitHub/GitLab status are green. |
| 127-04 | PASS | Qualification, ranking, captured-read-model evaluation, bounds, revision, and cache behavior are green. |
| 127-05 | PASS | Revision-first secure route, browser allowlist, trusted client, and service lifetime are green. |
| 127-06 | PASS | Shared labels, generations, retry, shortcut registries, persistence, and TUI seams are green. |
| 127-07 | PASS | Web singleton stale overlay and responsive deterministic contract are green. |
| 127-08 | PASS | Dedicated width-tiered OpenTUI stale view and canonical lifecycle adapter tests are green. |
| 127-09 | PASS | Focused deterministic, cross-client, architecture, ASVS, build, type, Node, TUI, and coverage gates passed. |
| 127-10 | PASS | All eight manifests, exact internal ranges, lockfile, default graph, and package dry-runs passed. |
| 127-11 | PASS | Changelog/docs, npm test, and first validation-only release check passed. |
| 127-12 | PASS local / awaiting evidence | Candidate freeze, repeated no-tag release check, canonical pending ledger, and this reconciled validation state are complete. |
| 127-13 | PENDING | Two blocking human checkpoint classes have not supplied exact-SHA hosted/authenticated or physical/manual approvals. |
| 127-14 | PENDING | Final reconciliation cannot run until Plan 127-13 supplies complete safe row/subcase approvals. |

Wave 0 is complete because every required focused fixture/test file exists and the final exact-candidate RC gate passes. Plans 127-13 and 127-14 remain pending by design.

## Wave 0 File Inventory

- [x] `tests/helpers/phase127-stale-fixtures.ts`
- [x] `tests/service/web-stale-workspaces-schema.test.ts`
- [x] `tests/lib/core/forge-change-status.test.ts`
- [x] `tests/lib/core/remote-branch-status.test.ts`
- [x] `tests/lib/service/stale-workspaces.test.ts`
- [x] `tests/service/web-stale-workspaces.test.ts`
- [x] `tests/service/phase127-cross-client-conformance.test.ts`
- [x] `tests/tui/dashboard/StaleWorkspaces.test.tsx`
- [x] `tests/architecture/phase127-stale-authority.test.mjs`
- [x] `tests/architecture/release-publish.test.mjs`
- [x] `tests/commands/release-rc.test.ts`

## External and Manual Receipt State

| Receipt ID | Evidence class | Status | Required subcases | Candidate SHA | Canonical source |
|---|---|---|---|---|---|
| HST-RUNTIME | hosted-runtime | PENDING | 9 | 233d294913bd4cd37602f6ef72f53cb960fb12d7 | [canonical row](./127-RECEIPTS.md#canonical-machine-readable-record) |
| HST-SHELL | configured-shell | PENDING | 22 | 233d294913bd4cd37602f6ef72f53cb960fb12d7 | [canonical row](./127-RECEIPTS.md#canonical-machine-readable-record) |
| HST-SSH | configured-shell-ssh-agent | PENDING | 8 | 233d294913bd4cd37602f6ef72f53cb960fb12d7 | [canonical row](./127-RECEIPTS.md#canonical-machine-readable-record) |
| AUTH-GH-STATUS | authenticated-provider-status | PENDING | 12 | 233d294913bd4cd37602f6ef72f53cb960fb12d7 | [canonical row](./127-RECEIPTS.md#canonical-machine-readable-record) |
| AUTH-GL-STATUS | authenticated-provider-status | PENDING | 12 | 233d294913bd4cd37602f6ef72f53cb960fb12d7 | [canonical row](./127-RECEIPTS.md#canonical-machine-readable-record) |
| FORGE-GH-SAME | authenticated-forge-create | PENDING | 14 | 233d294913bd4cd37602f6ef72f53cb960fb12d7 | [canonical row](./127-RECEIPTS.md#canonical-machine-readable-record) |
| FORGE-GH-FORK | authenticated-forge-create | PENDING | 14 | 233d294913bd4cd37602f6ef72f53cb960fb12d7 | [canonical row](./127-RECEIPTS.md#canonical-machine-readable-record) |
| FORGE-GL-SAME | authenticated-forge-create | PENDING | 14 | 233d294913bd4cd37602f6ef72f53cb960fb12d7 | [canonical row](./127-RECEIPTS.md#canonical-machine-readable-record) |
| FORGE-GL-FORK | authenticated-forge-create | PENDING | 14 | 233d294913bd4cd37602f6ef72f53cb960fb12d7 | [canonical row](./127-RECEIPTS.md#canonical-machine-readable-record) |
| FORGE-RECOVERY | authenticated-forge-recovery | PENDING | 27 | 233d294913bd4cd37602f6ef72f53cb960fb12d7 | [canonical row](./127-RECEIPTS.md#canonical-machine-readable-record) |
| LIVE-ARCHIVE | live-service-manual | PENDING | 14 | 233d294913bd4cd37602f6ef72f53cb960fb12d7 | [canonical row](./127-RECEIPTS.md#canonical-machine-readable-record) |
| LIVE-REMOVE-FORCE | live-service-manual | PENDING | 15 | 233d294913bd4cd37602f6ef72f53cb960fb12d7 | [canonical row](./127-RECEIPTS.md#canonical-machine-readable-record) |
| LIVE-STALE | live-service-manual | PENDING | 25 | 233d294913bd4cd37602f6ef72f53cb960fb12d7 | [canonical row](./127-RECEIPTS.md#canonical-machine-readable-record) |
| LIVE-ATTENTION-FUZZY | live-service-manual | PENDING | 12 | 233d294913bd4cd37602f6ef72f53cb960fb12d7 | [canonical row](./127-RECEIPTS.md#canonical-machine-readable-record) |
| LIVE-P126-ACTIONS | live-service-manual | PENDING | 23 | 233d294913bd4cd37602f6ef72f53cb960fb12d7 | [canonical row](./127-RECEIPTS.md#canonical-machine-readable-record) |
| LIVE-P126-NOTES | live-service-manual | PENDING | 13 | 233d294913bd4cd37602f6ef72f53cb960fb12d7 | [canonical row](./127-RECEIPTS.md#canonical-machine-readable-record) |
| LIVE-P126-FILE-STATUS | live-service-manual | PENDING | 15 | 233d294913bd4cd37602f6ef72f53cb960fb12d7 | [canonical row](./127-RECEIPTS.md#canonical-machine-readable-record) |
| LIVE-LIFECYCLE | live-service-manual | PENDING | 17 | 233d294913bd4cd37602f6ef72f53cb960fb12d7 | [canonical row](./127-RECEIPTS.md#canonical-machine-readable-record) |
| PHYS-BROWSER-XTERM | physical-browser-manual | PENDING | 20 | 233d294913bd4cd37602f6ef72f53cb960fb12d7 | [canonical row](./127-RECEIPTS.md#canonical-machine-readable-record) |
| VIS-RESPONSIVE | responsive-visual-manual | PENDING | 27 | 233d294913bd4cd37602f6ef72f53cb960fb12d7 | [canonical row](./127-RECEIPTS.md#canonical-machine-readable-record) |
| INT-TUI | interactive-tui-manual | PENDING | 20 | 233d294913bd4cd37602f6ef72f53cb960fb12d7 | [canonical row](./127-RECEIPTS.md#canonical-machine-readable-record) |
| HUMAN-PARITY | human-cross-client-parity | PENDING | 21 | 233d294913bd4cd37602f6ef72f53cb960fb12d7 | [canonical row](./127-RECEIPTS.md#canonical-machine-readable-record) |

All 22 external/manual rows are PENDING with null evidence. Deterministic tests, local builds, local release validation, missing tooling, or unavailable environments do not waive or promote any row.

## ROADMAP Criterion 4 and Phase 126 Handoff Mapping

| Required workflow/evidence class | Receipt rows |
|---|---|
| Hosted supported runtimes and package/policy/TUI | HST-RUNTIME |
| Configured Bash/zsh/fish plus initialized runtime/function/alias behavior | HST-SHELL |
| PATH/SSH_AUTH_SOCK refresh, ssh-add, and socket rotation | HST-SHELL, HST-SSH |
| Authenticated GitHub/GitLab merged/closed/open and recovery | AUTH-GH-STATUS, AUTH-GL-STATUS |
| GitHub/GitLab same-repository/project and fork Resolve → Review → Create | FORGE-GH-SAME, FORGE-GH-FORK, FORGE-GL-SAME, FORGE-GL-FORK |
| Complete forge failure/retry/rollback matrix | FORGE-RECOVERY |
| Archived ordering, Undo, unarchive, active-empty, archive-empty | LIVE-ARCHIVE |
| Clean/dirty removal, exact-name Force, stale confirmation, terminal failure | LIVE-REMOVE-FORCE |
| All stale states/reasons/unknowns/cautions/actions/revision/reconciliation | LIVE-STALE |
| Attention and fuzzy navigation, archived exclusion, xterm-safe focus | LIVE-ATTENTION-FUZZY |
| Broader Phase 126 actions, notes, and file status | LIVE-P126-ACTIONS, LIVE-P126-NOTES, LIVE-P126-FILE-STATUS |
| Reconnect, cancel, refresh-failed lock, simultaneous-client convergence | LIVE-LIFECYCLE |
| Physical browser/xterm pointer, keys, IME/layout, and focus | PHYS-BROWSER-XTERM |
| Desktop/375/320 light/dark screenshot matrix | VIS-RESPONSIVE |
| Interactive OpenTUI width/height and workflow matrix | INT-TUI |
| Side-by-side web/TUI parity on the same authoritative fixtures | HUMAN-PARITY |

The complete ROADMAP success-criterion-4 boundary and the full Phase 126 handoff remain represented. No archived, stale, navigation, shell/SSH, provider/forge, broader action/notes/file, lifecycle, physical, screenshot, interactive TUI, or human-parity class is collapsed into a generic local pass.

## Provider Capability State

| Capability | Disposition | Reason / evidence state |
|---|---|---|
| GitHub.com pull-request read-only status | INTEGRATE | Implemented; authenticated exact-SHA receipt still PENDING |
| GitLab.com merge-request read-only status | INTEGRATE | Implemented; authenticated exact-SHA receipt still PENDING |
| Gitea status | OPT_OUT | D-14 excludes Gitea status parity and requires a sanitized unsupported-provider outcome. |
| Self-hosted GitHub/GitLab | NOT_CLAIMED | No explicit supported-host list or exact-candidate-SHA receipts were supplied. |
| Provider mutation | OPT_OUT | Stale intelligence is advisory and read-only and cannot mutate provider state. |
| Provider search/inference | OPT_OUT | Validated persisted provenance is required; branch and remote inference are forbidden. |
| Provider checkout/repository mutation | OPT_OUT | Status evaluation must not create refs, check out branches, or mutate repositories. |
| Background polling/base-snapshot provider work | OPT_OUT | D-05 requires one lazy revision-bound route with explicit view refresh. |

Self-hosted GitHub/GitLab remains NOT_CLAIMED because no explicit supported-host list or exact-SHA receipts were supplied. Missing `glab`, provider accounts, runners, shell/SSH checks, screenshots, TUI sessions, or human approval remain missing evidence rather than waivers.

## Edge Assumptions

### A-EDGE-STALE-03

- **Actual deterministic result:** CLOSED_DETERMINISTIC / PASS.
- Runtime mutation sentinels and hostile read-only capability tests are green, proving evaluation and refresh have no archive, remove, terminal, worktree, YAML, provider-mutation, or operation-submit authority.
- This result does not claim live browser/TUI or human no-mutation evidence.

### A-EDGE-REL-01

- **Status:** UNRESOLVED and flagged.
- Operator review must accept safe exact-candidate-SHA evidence for every HST/AUTH/FORGE/LIVE/PHYS/VIS/INT/HUMAN row and every immutable required subcase.
- Until then, Nyquist remains false and Approval remains pending.

## Evidence Integrity and Release Stop

- Candidate spoofing mitigation: PASS — full SHA is immutable and mechanically precedes the ledger commit.
- Local receipt integrity: PASS — the exact command exited zero with output present.
- Tag integrity: PASS — 41 refs were byte-identical before/after and `v0.22.0-rc.1` remains absent.
- Planning preservation: PASS — all 5 pre-existing phase directories remained present and the tree was clean after validation.
- Evidence separation: PASS — external/manual rows remain PENDING and null.
- Disclosure control: PASS — the ledger records sanitized summaries, digests, relative artifact references, and no credentials, raw environment, raw provider output, bearer material, private payload, or machine path.
- Validation tampering control: PASS — `nyquist_compliant: false` and Approval pending are retained while required rows are pending.
- Release boundary: PASS — no tag, push, publication, GitHub Release, hosted/release workflow dispatch, or release authorization occurred.

`RELEASE-AUTHORIZATION` remains `NOT_AUTHORIZED` with its immutable stop subcases. It is not converted to PASS by local validation or later human feature approval.

## Planned Blocking Human Checkpoints

1. **Hosted/authenticated:** HST-RUNTIME, HST-SHELL, HST-SSH, AUTH-GH-STATUS, AUTH-GL-STATUS, FORGE-GH-SAME, FORGE-GH-FORK, FORGE-GL-SAME, FORGE-GL-FORK, and FORGE-RECOVERY.
2. **Physical/manual:** LIVE-ARCHIVE, LIVE-REMOVE-FORCE, LIVE-STALE, LIVE-ATTENTION-FUZZY, LIVE-P126-ACTIONS, LIVE-P126-NOTES, LIVE-P126-FILE-STATUS, LIVE-LIFECYCLE, PHYS-BROWSER-XTERM, VIS-RESPONSIVE, INT-TUI, and HUMAN-PARITY.

Both checkpoint classes remain intact for Plan 127-13. One generic approval cannot satisfy multiple rows, and neither checkpoint grants release authority.

## Validation Sign-Off

- [x] Every focused Wave 0 fixture/test exists.
- [x] Deterministic stale, authority, disclosure, package, build, type, test, coverage, and RC commands are green on the recorded candidate.
- [x] A-EDGE-STALE-03 records its actual deterministic no-mutation result.
- [x] The exact candidate SHA, version, intended tag, channel, branch, command, timestamps, output digest, unchanged tags, and planning preservation are recorded.
- [x] Every ROADMAP success-criterion-4 and Phase 126 handoff evidence class has a separate exact-SHA row and immutable subcase list.
- [x] Gitea, self-hosted, mutation, search/inference, checkout, and polling dispositions match 127-COVERAGE.md.
- [x] No release action or release authorization occurred.
- [ ] Hosted/runtime/configured-shell/SSH/authenticated-provider/forge evidence is complete.
- [ ] Live/physical/visual/interactive/human evidence is complete.
- [ ] A-EDGE-REL-01 is resolved by accepted exact-SHA evidence.
- [ ] `nyquist_compliant: true` is justified.

**Approval:** pending

**Next evidence step:** Plan 127-13 must preserve both blocking human checkpoint classes and return row-keyed exact-candidate-SHA outcomes without fabricating or collapsing missing evidence.
