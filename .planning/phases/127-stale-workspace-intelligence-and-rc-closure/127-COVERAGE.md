# Phase 127 Coverage and Capability Audit

**Phase:** 127 — Stale Workspace Intelligence and RC Closure  
**Goal:** Explain which workspaces may need cleanup without acting automatically, then close the supported v0.22 release-candidate evidence.  
**Audit status:** Complete for planning; no source item is unplanned.

## Provider capability matrix

Full coverage is the default. Every non-integrated capability has an explicit OPT-OUT or NOT_CLAIMED disposition with a reason. This is the sole markdown table in this file so the API coverage gate can parse it deterministically.

| capability | decision | reason |
|---|---|---|
| GitHub.com pull-request read-only merged closed open status | INTEGRATE | |
| GitLab.com merge-request read-only merged closed open status | INTEGRATE | |
| Authenticated GitHub.com exact-SHA status receipt | INTEGRATE | |
| Authenticated GitLab.com exact-SHA status receipt | INTEGRATE | |
| Gitea change-status lookup | OPT-OUT | D-14 explicitly excludes Gitea status parity and requires a sanitized unsupported-provider outcome |
| Self-hosted GitHub or GitLab status claim | NOT_CLAIMED | No explicit supported-host list was supplied; exact-SHA evidence is required for every named host if a list is later provided |
| Provider mutation such as close merge comment edit label or delete | OPT-OUT | Stale intelligence is advisory and read-only and cannot mutate provider state |
| Provider search or discovery to infer change identity | OPT-OUT | D-11 and D-12 require validated persisted provenance and forbid branch or remote inference |
| Provider checkout ref creation or repository mutation | OPT-OUT | Status evaluation must not create refs check out branches or mutate repositories |
| Background polling or base-snapshot provider work | OPT-OUT | D-05 requires one lazy revision-bound route with explicit view refresh |

Implementation boundary:

- GitHub uses bounded argv-only `gh api graphql --hostname github.com` with validated owner, repository, and pull-request number.
- GitLab uses bounded argv-only `glab api --hostname gitlab.com` with encoded project path and merge-request IID.
- Missing CLI, authentication, rate limit, timeout, abort, malformed or oversized JSON, provider outage, and unsupported input become fixed sanitized unknown outcomes.
- All mutation, search, inference, checkout, polling, and unclaimed-host rows make zero process calls.

## Planned execution map

1. **127-01, Wave 0:** Runtime Zod schema, provider, abortable remote-branch, service-policy, cache, revision, and no-mutation RED fixtures/tests using guarded imports rather than discovery failures.
2. **127-02, Wave 0:** Web, TUI, cross-client, and architecture RED fixtures/tests plus an isolated named hermetic green pre-metadata no-outward-release-action/planning-preservation suite that excludes the historical temp-tag fixture and records no `git tag` request.
3. **127-03, Wave 1:** Strict stale DTOs that turn the runtime schema matrix green, plus read-only GitHub/GitLab status probes.
4. **127-04, Wave 2:** Service qualification/ranking over one captured authoritative read model, bounded abortable remote/provider fan-out, and race-safe network cache.
5. **127-05, Wave 3:** Revision-first secure route, exact captured-read-model handoff, browser allowlist projection, service lifetime, and strict trusted client.
6. **127-06, Wave 4:** Shared labels/generations/retry, atomic persisted/global stale entry across protocol/core/client plus distinct canonical scoped refresh metadata, and trusted TUI adapter seams.
7. **127-07, Wave 5:** Singleton responsive web stale-workspace overlay and canonical follow-up actions.
8. **127-08, Wave 5:** Dedicated width-tiered OpenTUI stale-workspace `UIView` and key ownership.
9. **127-09, Wave 6:** Deterministic cross-client, architecture, ASVS, package, build, pre-metadata Node regression, and coverage closure without aggregate `npm test`.
10. **127-10, Wave 7:** Immediate manifest/lock RED assertions, then root plus seven package manifests, exact internal ranges, and lockfile at `0.22.0-rc.1`; no Plan 127-11 dependency.
11. **127-11, Wave 8:** Immediate changelog/docs RED assertions, complete stale/migration/shortcut/shell/release docs, then the first post-manifest/post-doc `npm test` and validation-only `release:check`.
12. **127-12, Wave 9:** Immutable candidate SHA and canonical `127-RECEIPTS.md` with a strict marker-delimited JSON row/subcase source of truth; every ROADMAP success-criterion-4 and Phase 126 handoff class starts exact-SHA PENDING.
13. **127-13, Wave 10:** Blocking hosted/runtime/shell/SSH/provider/forge and complete archived/stale/navigation/Phase126/lifecycle/physical/visual/TUI/parity checkpoints returning exact row/subcase approvals.
14. **127-14, Wave 11:** Sanitized exact-SHA reconciliation preserving the committed row/subcase matrix, strict candidate ancestry/status validation, and final validation while release remains unauthorized.

## Edge-probe coverage

All 12 covered fallback edges are lifted into plan `must_haves.truths`:

1. **E-01, STALE-01 adjacency, Plans 01 and 04:** Activity exactly at `checked_at - 30 days` does not qualify; only a strictly earlier timestamp qualifies.
2. **E-02, STALE-01 empty, Plan 01:** Zero workspaces returns atomic empty candidate/incomplete arrays; one is evaluated normally; null or malformed requests are rejected.
3. **E-03, STALE-01 ordering, Plans 01 and 04:** Stable order uses reason count, strongest reason, inactivity-only flag, oldest valid activity, unknown activity, normalized name, and stable ID.
4. **E-04, STALE-01 concurrency, Plans 01, 04, and 06:** Probe fan-out is bounded and AbortSignal-aware, aborted/superseded work cannot commit cache state, responses are atomic, and service/client generations prevent older overwrites.
5. **E-05, STALE-02 adjacency, Plans 01 and 04:** Same reason/repository evidence is deduplicated while distinct reason types and timestamps remain visible.
6. **E-06, STALE-02 empty, Plans 02, 07, and 08:** UI distinguishes all-clear empty, incomplete-only, one-candidate, and many-candidate states without local rows or scores.
7. **E-07, STALE-02 ordering, Plans 02 and 07 through 09:** Both clients preserve service order; terminal reasons precede inactivity and every reason/unknown/caution/timestamp remains visible.
8. **E-08, STALE-04 idempotency, Plans 02 and 06 through 09:** Open and lifecycle intent submit once; pending repeats do not resubmit; reconnect observes only a returned operation ID.
9. **E-09, STALE-04 concurrency, Plans 02 and 07 through 09:** Concurrent actions remain revision/lease bound and terminal completion reconciles normal/stale state without replay.
10. **E-10, STALE-05 concurrency, Plans 01 and 04 through 09:** Failed or superseded probes become scoped unknown evidence and cannot qualify, fail the response, or overwrite newer evidence.
11. **E-11, REL-02 idempotency, Plans 02 and 10 through 12:** A hermetic no-tag harness proves repeated command planning requests no outward release action; real post-doc checks may write ordinary local build/coverage/package outputs but leave tag refs unchanged and never push, publish, create a GitHub Release, or dispatch release-only workflows.
12. **E-12, REL-02 concurrency, Plans 02 and 10 through 14:** Parallel work may run only local/read-only gates and has no authority to tag, push, publish, release, or dispatch release-only workflows.

Flagged unresolved edge assumptions:

- **A-EDGE-STALE-03:** The probe category is unclassified. Plans 01, 02, 04, and 09 treat a read-only capability graph plus hostile no-mutation tests as the intended closure. Status remains unresolved and flagged until those proofs are green.
- **A-EDGE-REL-01:** The probe category is unclassified. Plans 10 through 14 use an immutable candidate SHA, explicit receipt classes, human checkpoints, and mechanical reconciliation. Status remains unresolved and flagged until operator review accepts or supplies every required receipt.

## UI consideration coverage

All eight approved `127-UI-SPEC.md` considerations appear in `127-02-PLAN.md` `must_haves.truths` and are implemented or closed by Plans 07 through 09:

1. **UI-01 empty:** All-clear and incomplete-only states are distinct and retain approved Refresh/Open affordances.
2. **UI-02 loading:** Initial, retained refresh, Open, inventory, and revision-recovery loading have stable geometry, named copy, one-shot controls, and no fabricated evidence.
3. **UI-03 error:** First-load Retry, retained-data refresh failure, Open row retention, fail-closed inventory, and one revision retry remain distinct.
4. **UI-04 populated:** Service order, every reason/timestamp, unknown/caution split, direct Open, and canonical lifecycle actions remain visible.
5. **UI-05 partial:** Confirmed-plus-unknown remains a candidate; unknown-only remains incomplete; missing values are not inferred.
6. **UI-06 overflow:** Web uses bounded vertical/no horizontal overflow; TUI uses split, stacked, single-column, detail-scroll, and too-small tiers.
7. **UI-07 zero-one-many:** Zero, one, and many candidate/incomplete/reason collections have explicit stable behavior without pagination or client reordering.
8. **UI-08 long-text:** Full accessible identities remain available while detail/reason/error/recovery text wraps or scrolls without path or secret disclosure.

## Milestone UAT and Phase 126 handoff coverage

Plans 127-12 through 127-14 own the complete ROADMAP success-criterion-4 and Phase 126 handoff boundary, not only the new stale surface. `127-RECEIPTS.md` is canonical. Every required external/manual row below starts `PENDING` and remains `PENDING` until safe evidence for the immutable candidate SHA exists; deterministic tests never promote it. Self-hosted hosts remain `NOT_CLAIMED` unless an explicit supported-host list is supplied.

- **HST-RUNTIME — Plans 12/13/14:** Node 24 Ubuntu 24.04 x64/ARM, macOS 15 Intel/Apple Silicon, package/policy, optional Bun TUI, and safe artifact/checksum receipts.
- **HST-SHELL and HST-SSH — Plans 12/13/14:** Configured Bash/zsh/fish commands, hooks, and PTYs; profile-only runtime/function/alias behavior; overlay precedence and diagnostics; PATH/SSH_AUTH_SOCK refresh, `ssh-add`, and socket rotation.
- **AUTH-GH-STATUS and AUTH-GL-STATUS — Plans 12/13/14:** Authenticated merged/closed/open plus sanitized auth, rate-limit, unavailable, malformed, and recovery behavior.
- **FORGE-GH-SAME, FORGE-GH-FORK, FORGE-GL-SAME, FORGE-GL-FORK — Plans 12/13/14:** Full URL Resolve → editable Review → explicit one-shot Create, immutable source anchors, reviewed real head SHA, same-repository/project and fork topology, and no provider checkout.
- **FORGE-RECOVERY — Plans 12/13/14:** Missing CLI/auth; unsupported/unconfigured host; malformed/inaccessible/closed/missing change; rate limiting/provider outage; no/ambiguous repository match; template mismatch/non-worktree mode; unreachable fork/source; source movement; stale revision; expired token; branch conflict; cancellation; timeout; creation failure; and rollback with no unintended YAML, worktree, private ref, browser draft, or replayable intent.
- **LIVE-ARCHIVE — Plans 12/13/14:** Archive terminal stop, ordering, Undo, unarchive without terminal recreation, archived-list semantics, final active-empty state, and archived empty state across web/TUI.
- **LIVE-REMOVE-FORCE — Plans 12/13/14:** Clean removal, terminal failure, dirty blockers, exact-name Force, stale confirmation, inventory/progress, and unrelated-state preservation.
- **LIVE-STALE — Plans 12/13/14:** Every approved stale state, all reasons/timestamps/unknowns/cautions, Refresh/Open, canonical lifecycle follow-ups, revision recovery, no automatic mutation, and authoritative reconciliation.
- **LIVE-ATTENTION-FUZZY — Plans 12/13/14:** Top partial-match Enter, archived exclusion, singleton/refocus, exact focus restoration, xterm-safe input, next-attention skip/wrap, and no-attention result.
- **LIVE-P126-ACTIONS — Plans 12/13/14:** Archive/unarchive/remove/rename/open/close/pin/unpin/sync/pull/push/merge from visible, context-menu, and shortcut surfaces with canonical availability, confirmation, progress, cancellation, error, and refresh semantics.
- **LIVE-P126-NOTES and LIVE-P126-FILE-STATUS — Plans 12/13/14:** Notes zero/one/many/add/clear/failure retention and file groups/states/counts/severity/reasons/loading/error/retry with no browser-local authority or path disclosure.
- **LIVE-LIFECYCLE — Plans 12/13/14:** Reconnect by durable operation ID, cancel once/too late, terminal-result refresh-failed lock/retry, simultaneous clients, no stale-confirmation or mutation replay, and authoritative selection/count/signal/terminal convergence.
- **PHYS-BROWSER-XTERM — Plans 12/13/14:** Pointer, physical keys, xterm-focused app shortcuts, unmatched/AltGraph/IME/dead/non-US input, repeats/holds, menu/form safe focus, and exact nested focus restoration.
- **VIS-RESPONSIVE — Plans 12/13/14:** Light/dark desktop, 375px, and 320px screenshots for all stale states plus Phase 126 action/confirmation/operation/notes/file/forge Resolve/Review/recovery states, with no overflow, clipping, hover-only action, contrast, or disclosure failure.
- **INT-TUI — Plans 12/13/14:** Wide, below-80, below-56, short-height, and too-small layouts covering archived, actions, operations, notes, file status, forge review/create, stale view, key ownership, no leakage, and origin restoration.
- **HUMAN-PARITY — Plans 12/13/14:** Side-by-side comparison of the same authoritative fixtures for labels, disabled reasons, confirmations, operation stages/cancellation/failures/results, notes, file status, provider terminology and Resolve/Review/Create transitions, stale evidence/order, selection, counts, signals, terminal state, and reconciliation.
- **RELEASE-AUTHORIZATION — Plans 12/13/14:** Remains `NOT_AUTHORIZED`; completion proves the stop before tag, push, publish, GitHub Release, or release-only workflow dispatch.

## Adversarial prohibition recall

The recall question was applied to STALE-01 through STALE-05 and REL-01 through REL-02. Routine engineering items were dropped. Generic injection, disclosure, revision, race, exhaustion, and confused-deputy controls live in each plan's ASVS threat model instead of being minted as bespoke product prohibitions.

Retained descriptor-less prohibitions are repeated under relevant `must_haves.prohibitions` with `status: unverified` and `flagged: true`. None has fabricated `check_kind`, `check_target`, `check_rule`, violation fixture, or clean fixture fields.

- **P-01 for STALE-01 and STALE-02:** Stale guidance must not state or imply deletion safety, assign a confidence/safety score, or pressure cleanup.
- **P-02 for STALE-01 and STALE-05:** Unknown, unavailable, or failed evidence must not be hidden or converted into confirmed absence, presence, or proof of staleness.
- **P-03 for STALE-01 and STALE-02:** Repository-scoped branch/worktree evidence must not become a workspace-wide safety claim.
- **P-04 for STALE-03 and STALE-04:** Evaluation or refresh must not acquire lifecycle authority or perform automatic archive, remove, terminal, worktree, or YAML mutation.
- **P-05 for STALE-01 and STALE-05:** Provider status must not be inferred from branches/remotes or presented as authenticated fact without validated persisted provenance.
- **P-06 for REL-01 and REL-02:** Deterministic/local evidence must not be represented as hosted, authenticated, physical, screenshot, interactive, human approval, or release authorization.
- **P-07 for REL-02:** RC preparation must not imply authorization to tag, push, publish, create a GitHub Release, or dispatch release-only workflows.

## Assumption-delta and persistence audit

- Assumption-delta detection returned `detected:false`; no identity-model migration is planned.
- The fixed 30-day threshold introduces no YAML migration, settings field, settings UI, database, schema-push task, ORM, or durable cache.
- Stale network outcomes are service-lifetime memory only. Each request's authoritative build recomputes local activity/worktree/caution facts once; the evaluator consumes that captured revision model without a second status/YAML/Git scan.
- Durable user choices remain in existing YAML and browser storage remains unused.
- No new package is introduced, so no package-legitimacy checkpoint is applicable.

## Multi-source coverage audit

### GOAL

- **Covered by Plans 01 through 14:** Explain cleanup candidates without automatic action and close the supported v0.22 RC evidence. Product authority, renderer behavior, deterministic validation, metadata/docs, exact-SHA indexing, human checkpoints, and reconciliation remain separate.

### REQ

- **STALE-01, covered by Plans 01, 03 through 05, 07 through 09, 13, and 14:** Explainable merged/closed, deleted-branch, inactivity, and missing-worktree candidates.
- **STALE-02, covered by Plans 01 through 09, 13, and 14:** Every reason/timestamp, Refresh, and canonical Open before action.
- **STALE-03, covered by Plans 01 through 05, 09, 13, and 14:** Suggestion-only behavior with no automatic mutation; flagged edge assumption retained until proof.
- **STALE-04, covered by Plans 02, 06 through 09, 13, and 14:** Archive/Remove reuse canonical confirmation, terminal, dirty, Force, cancellation, and failure semantics.
- **STALE-05, covered by Plans 01 through 09, 13, and 14:** Failure/unavailable activity remains unknown and never proves stale.
- **REL-01, covered by Plans 02 and 09 through 14:** Exact RC metadata/docs/packages plus the complete criterion-4 and Phase 126 handoff evidence set: hosted runtimes, configured shells/SSH agent, authenticated status, full same/fork forge creation/recovery, archived/stale/navigation, broader actions/notes/file status, lifecycle, physical browser, responsive screenshots, interactive TUI, exact-SHA receipts, and human parity.
- **REL-02, covered by Plans 10 through 14:** No tag, push, publication, release, or release-only workflow absent separate authorization.

### CONTEXT

- **D-01, Plans 01, 03, 04, and 11:** Fixed strict 30-day threshold and no configuration/migration.
- **D-02, Plans 01, 04, and 09:** At least one confirmed positive reason qualifies.
- **D-03, Plans 01, 04, and 07 through 09:** Transparent tuple and no score.
- **D-04, Plans 01, 04, and 07 through 09:** Repository scope and caution-only semantics.
- **D-05, Plans 04, 05, and 09:** Lazy revision-bound route with no base network/polling.
- **D-06, Plans 04, 07, and 08:** View Refresh is primary. Planner discretion omits per-row retry to preserve one code path.
- **D-07, Plans 01, 04, 05, and 09:** Exactly 300,000 ms volatile network cache with force bypass.
- **D-08, Plans 01, 04, and 07 through 09:** Confirmed reason required; unknown-only appears in incomplete.
- **D-09, Plans 01, 04, and 07 through 09:** Authoritative activity, provider event, and observation timestamps.
- **D-10, Plans 01, 02, and 05 through 09:** Revision mismatch fails closed before probes and clients reload/retry once.
- **D-11, Plans 01, 03, 04, and 09:** Complete persisted provenance required for provider status.
- **D-12, Plans 01, 03, 04, and 09:** No PR/MR inference; local evidence remains available.
- **D-13, Plans 01, 03, 04, and 07 through 09:** Distinct merged/closed codes and provider times.
- **D-14, Plans 01, 03, 04, 09, and 12 through 14:** GitHub/GitLab baseline, sanitized failures, explicit Gitea opt-out.
- **D-15, Plans 03 and 07 through 09:** Web/TUI only with no stale CLI command.
- **D-16, Plans 02, 07, and 09:** Singleton scrollable web overlay with complete state model.
- **D-17, Plans 02, 08, and 09:** Dedicated keyboard-first TUI `UIView`.
- **D-18, Plans 02 and 06 through 09:** Canonical Open and post-success navigation.
- **D-19, Plans 02 and 06 through 09:** Direct Refresh/Open, canonical Archive/Remove, and fresh-inventory Force sequence.
- **D-20, Plans 02 and 06 through 09:** Authoritative stale/normal reconciliation, rebindable persisted/global stale entry, and distinct active-view-only canonical refresh metadata with no browser-global R binding.
- **D-21, Plans 10 through 14:** Exact package, tag, docs, package, and complete supported-host/milestone evidence preparation.
- **D-22, Plans 09 and 12 through 14:** Deterministic evidence does not replace any hosted/runtime/shell/SSH/provider/forge/live/physical/visual/interactive/human row; every required external/manual class remains PENDING until exact-SHA proof exists.
- **D-23, Plans 10 through 14:** No release side effect without separate explicit authorization.

### RESEARCH

- **R-01, Plans 01, 03, and 06:** Wave 0 runtime Zod matrix, strict bounded stale schemas, finite enums, array limits, persisted/global stale entry parity across protocol/core/client, and a distinct exhaustive scoped-refresh registry.
- **R-02, Plans 01 and 03:** Separate read-only GitHub/GitLab status module using bounded argv mechanics.
- **R-03, Plans 01, 03, and 04:** Closed evidence algebra across provider, remote, worktree, and activity.
- **R-04, Plans 01 and 04:** Service-owned classification, timestamps, cautions, and ranking.
- **R-05, Plans 01 and 04:** Network-only TTL, singleflight, force generations, and newest-write wins.
- **R-06, Plans 01 and 04:** Bounded fan-out, dedicated timeout/output/AbortSignal-aware remote observation, cancellation-safe cache commits, and atomic response.
- **R-07, Plans 01 and 05:** Revision-before-cache/probe route under `snapshot.read`.
- **R-08, Plan 05:** One service-lifetime evaluator, strict trusted client, and explicit browser projection.
- **R-09, Plans 02 and 06:** Shared labels, relative time, response generations, and canonical shortcuts.
- **R-10, Plans 02, 07, and 09:** Singleton web retained-data state machine and responsive accessibility.
- **R-11, Plans 02, 08, and 09:** Dedicated TUI tiers, owned keys, safe fallback, and no nested text.
- **R-12, Plans 02 and 06 through 09:** Canonical lifecycle descriptors, dirty-only Force, and no replay.
- **R-13, Plans 02 and 09:** Hostile architecture and real-adapter cross-client conformance.
- **R-14, Plans 02, 10, and 11:** Hermetic pre-metadata release-authority fence, staged current-RC manifest/docs assertions, lockstep manifests/ranges/lockfile, and post-doc validation-only release tooling.
- **R-15, Plans 12 through 14:** Canonical `127-RECEIPTS.md` with strict immutable JSON row/subcase requirements, exact-SHA hosted runtime, configured-shell/SSH-agent, authenticated status, full GitHub/GitLab same/fork forge creation/recovery, archived/stale/attention/fuzzy, broader Phase 126 action/notes/file-status, lifecycle/reconnect, physical browser/xterm, responsive visual, interactive TUI, human parity, self-hosted NOT_CLAIMED, candidate ancestry, and release-stop classes.

## Audit result

Every GOAL, REQ, non-deferred RESEARCH item, locked CONTEXT decision, ROADMAP success-criterion-4 workflow, and outstanding Phase 126 handoff class has a plan owner. Plans 127-12 through 127-14 enumerate each external/manual class as a named receipt row that stays PENDING until exact-candidate-SHA evidence exists; self-hosted hosts remain NOT_CLAIMED without an explicit list. Deferred CLI, Gitea parity, change-identity inference, configurable threshold, polling, and persisted-cache ideas are excluded by explicit user decision rather than omission. No phase split is required for source coverage. Plan 127-14 exists solely because checkpoint and post-checkpoint ledger mutation must remain separate execution units.
