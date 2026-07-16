---
phase: 123-archived-workspaces-and-safe-removal
verified: 2026-07-16T09:36:13Z
status: passed
score: 12/12 must-haves verified
behavior_unverified: 0
overrides_applied: 0
requirements:
  satisfied: 11
  total: 11
manual_handoff:
  owner: Phase 127
  status: pending
  blocking_phase_123: false
  boundary: after Phase 127 automated and hosted gates and before tag, push, publish, or release
---

# Phase 123: Archived Workspaces and Safe Removal Verification Report

**Phase Goal:** Make active-workspace cleanup reversible by default and destructive removal explicit, terminal-aware, and consistent across clients.
**Verified:** 2026-07-16T09:36:13Z
**Status:** passed
**Re-verification:** No - initial goal-backward verification after Plans 01-08 and three code-review repair iterations.

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|---|---|---|
| 1 | Archive persistence is backward compatible, paired, idempotent, and lossless for non-terminal workspace state. | VERIFIED | `WorkspaceSchema` requires the `archived: true` / offset-aware `archived_at` pair; `archiveWorkspace` preserves the first timestamp and `unarchiveWorkspace` removes only the pair. Archive and pin-preservation tests pass. |
| 2 | Every Archive request stops and confirms all service-owned workspace terminals before archive mutation, including already-archived convergence; failure leaves archive state unchanged. | VERIFIED | The coordinator closes terminals before `archiveWorkspace`; `closeWorkspace` requires observed PTY exit after TERM/KILL. Deterministic tests cover ordinary failure, already-archived success/failure, cross-principal sessions, and real PTY exit. |
| 3 | Terminal creation cannot cross the lifecycle barrier, stalled launch resolution is bounded, failed cleanup is retryable, and queued pre-boundary cancellation performs no mutation. | VERIFIED | Per-workspace admission covers resolution through PTY registration; 10-second abortable resolution and cancellation-aware FIFO admission are wired. Tests cover in-flight launch ordering, timeout/late settlement, failed-close retry, and cancelled queued removal. |
| 4 | Archived workspaces are absent from all normal active projections and appear only in the minimal newest-first archived catalog with relevant activity time. | VERIFIED | Snapshot partitioning occurs before active projection. Strict archived rows contain only `id`, `name`, and `activity_at`; aggregate revision includes all-archived/archive-only changes. Web and rendered TUI archive-list tests pass. |
| 5 | Both clients choose successors through one pin, priority, activity, name, then stable-ID comparator and settle to an active empty state when no successor exists. | VERIFIED | `workspaceSuccessorOrder` is imported by web and TUI. Independent tie-tier tests pass in client presentation and rendered TUI coverage. |
| 6 | Normal Remove is explicit and default-cancel; it closes terminals before dirty inspection and reports all blockers without deleting state. | VERIFIED | Web/TUI confirmations inventory terminals, managed worktrees, directory, and YAML. Coordinator/core tests prove terminal-first ordering, all blocker names, and zero destructive calls on dirty or cleanup failure. |
| 7 | Force Remove is reachable only after a fresh typed dirty boundary, requires the exact current workspace name, and cannot bypass stale, terminal, parse, hook, not-found, clean, or generic failures. | VERIFIED | Strict mutation schema reserves `confirmation_name` for force. The coordinator independently re-inspects and validates current name; web and TUI exact-name flows consume only typed dirty details. Core/coordinator/rendered TUI tests pass. |
| 8 | Stable workspace identity, exact definition path, and content fingerprint survive to the destructive boundary so replacement, rename, or edit drift fails before mutation. | VERIFIED | Core captures `{id,name,path,fingerprint}`, revalidates under the definition mutation lease, holds it across removal, and deletes the validated path directly. Same-name replacement, same-ID edit, rename, and definition-conflict tests pass. |
| 9 | Successful Remove deletes only the intended managed worktrees, workspace directory, and YAML definition; unrelated state remains intact. | VERIFIED | Core removal uses non-force Git for normal removal and explicit force only for dirty-authorized removal. Command integration covers drifted YAML deletion and unrelated-definition preservation; the packaged fixture record corroborates target-only deletion. |
| 10 | Web and TUI use the same scoped, strict, revision-bound durable operation contract with no automatic destructive replay. | VERIFIED | Router requires `operation.write`, strict lifecycle parsing, stable ID/revision, and caller idempotency; trusted client submits with `retry: false`. Web captures the confirmation revision; stale paths refresh and require a new invocation. TUI multi-selection cannot collapse to one target. |
| 11 | Lifecycle progress and post-operation replacement state are authoritative across catalog, selection, terminal tabs, signals, counts, and navigation. | VERIFIED | Five phases are emitted at actual terminal/core/reconciliation boundaries. Web reloads snapshot, terminal full set, and signals; TUI reloads core/signals before settling selection. Projection and rendered integration tests cover active-only signals, dead-terminal disposal, successor/empty states, and no replay. |
| 12 | Automated/package boundaries are green, real fixture evidence is durably recorded, and Phase 123 performed no release side effect or false human-approval claim. | VERIFIED | Independent rerun: 12 focused Vitest files / 106 tests, rendered TUI 7 tests / 52 assertions, all workspace typechecks, package architecture, and `verify:gates` passed. No Phase 123 package metadata or tag was created. `123-08-SUMMARY.md` records guarded packaged-service fixture commands/results and cleanup; STATE preserves the pending Phase 127 manual gate. |

**Score:** 12/12 truths verified (0 present-but-behavior-unverified).

### Required Artifacts

All 31 PLAN-declared artifacts exist and passed the automated artifact checks. Substantive/wiring inspection confirmed the key production authorities below.

| Artifact | Expected | Status | Details |
|---|---|---|---|
| `packages/core/src/workspace-archive.ts` | Guarded archive transitions | VERIFIED | Stable-ID guarded, idempotent, lossless transforms. |
| `packages/core/src/workspace-lifecycle.ts` | Staged, dirty-safe, identity-guarded removal | VERIFIED | Fresh dirtiness check, explicit force bit, real phase callbacks, target-only deletion. |
| `packages/service/src/policy/workspace-lifecycle-admission.ts` | Per-target admission and cancellation | VERIFIED | FIFO target lease, terminal-create exclusion, abortable waiter removal. |
| `packages/service/src/web/terminal-manager.ts` | Confirmed terminal shutdown | VERIFIED | Admission covers resolve/spawn/register; TERM/KILL observed-exit barrier; retryable cleanup. |
| `packages/service/src/policy/workspace-lifecycle.ts` | Shared lifecycle coordinator | VERIFIED | Revision, terminal, dirty/force, cancellation, progress, reconciliation, and stable-ID wiring. |
| `packages/protocol/src/service.ts` | Strict lifecycle/catalog contract | VERIFIED | Strict bounded mutations, failures, results, activity, and minimal archive rows. |
| `packages/service/src/policy/snapshot.ts` | Aggregate active/archive catalog | VERIFIED | Partition-before-project, relevant activity ordering, archive-aware revision. |
| `packages/service/src/secure/router.ts` and `packages/service/src/policy/client.ts` | Scoped thin adapters | VERIFIED | One strict operation route; no destructive replay or client-side mutation authority. |
| `packages/service/src/main.ts` | Single runtime composition | VERIFIED | Shared admission, terminal manager, coordinator, operation registry, and snapshot authority. |
| `packages/service/src/web/projection.ts` and `packages/web/src/app.ts` | Bounded browser lifecycle surface | VERIFIED | Strict projection, captured revision, dirty-only force, authoritative replacement refresh. |
| `packages/tui/src/ArchivedWorkspacesDialog.tsx`, `packages/tui/src/WorkspaceRemovalDialog.tsx`, and `packages/tui/src/App.tsx` | TUI lifecycle surface | VERIFIED | Minimal archive view, default-cancel remove, exact-name force, no ambiguous batch removal. |
| Phase 123 focused test files | Behavioral evidence | VERIFIED | 106 Vitest tests plus 7 rendered OpenTUI tests passed independently. |

**Artifacts:** 31/31 declared artifacts verified.

### Key Link Verification

| From | To | Via | Status | Details |
|---|---|---|---|---|
| Core archive/removal | Config persistence | Guarded exact-path read/modify/write and deletion | WIRED | Identity/fingerprint checks precede mutation. |
| Terminal manager | Lifecycle admission | Admission token held through registration | WIRED | Lifecycle waits for admitted create; later creates are rejected. |
| Lifecycle coordinator | Terminal manager then core | Target lease, confirmed close, guarded mutation | WIRED | Tests assert exact call order and zero downstream calls on failure. |
| Router and trusted client | Lifecycle coordinator | Strict `operation.submit` under `operation.write` | WIRED | One mutation schema and durable operation registry. |
| Snapshot/CoreState/web projection | Protocol catalogs | Active/archive strict schemas | WIRED | Real aggregate data flows to both clients; archived details are absent. |
| Web and TUI | Shared comparator/coordinator | Stable ID, expected revision, unique idempotency intent | WIRED | Both consume shared client/service APIs. |
| Lifecycle result | Client replacement state | Reconciled revision plus snapshot/terminal/signal reload | WIRED | Success and terminals-stopped failure paths reload authoritative state. |

**Wiring:** 23/23 PLAN key links verified. The Plan 08 query tool could not parse its three descriptive component labels as file paths; those links were manually traced above through concrete files and tests.

### Data-Flow Trace

| Surface | Source | Data | Status |
|---|---|---|---|
| Archived web/TUI rows | Authoritative YAML -> snapshot catalog -> strict web/CoreState projection | Stable ID, name, relevant activity only | FLOWING |
| Lifecycle operation | Client intent -> secure router -> durable registry -> coordinator -> core | Stable ID, expected revision, force-only exact name | FLOWING |
| Reconciliation | Core mutation -> catalog rebuild -> reconciled revision -> client reload | Active/archive catalog, terminals, signals, selection/counts | FLOWING |

### Behavioral Spot-Checks

| Check | Result | Status |
|---|---|---|
| 12 focused Phase 123 Vitest files | 106 passed, 0 failed | PASS |
| Rendered OpenTUI lifecycle integration | 7 passed, 52 assertions, 0 failed | PASS |
| `npm run typecheck` | All seven workspaces passed | PASS |
| `npm run test:deps` | `Package architecture: OK` | PASS |
| `npm run verify:gates` | Inventory, mapped tests, and coverage aligned | PASS |

No conventional `probe-*.sh` is declared for this phase. The packaged live fixture is a guarded validation procedure recorded in `123-08-SUMMARY.md` and the reproducible Phase 127 checklist, not a retained probe script.

### Requirements Coverage

| Requirement | Status | Evidence |
|---|---|---|
| ARCH-01 | SATISFIED | Paired schema, compatibility, timestamp stability, archive unit tests. |
| ARCH-02 | SATISFIED | Shared coordinator/router/client contract used by web and TUI. |
| ARCH-03 | SATISFIED | Partition-before-projection, active-only pins/signals/lists/counts/navigation. |
| ARCH-04 | SATISFIED | Confirmed terminal barrier plus lossless non-terminal state and pin preservation. |
| ARCH-05 | SATISFIED | Separate minimal web/TUI archived surfaces and unarchive actions. |
| ARCH-06 | SATISFIED | Relevant-time newest-first sorting, timestamp display, empty state, no detail drill-in. |
| REMOVE-01 | SATISFIED | Consistent Remove naming and default-cancel full resource inventory. |
| REMOVE-02 | SATISFIED | Cross-principal confirmed terminal shutdown and fail-closed mutation. |
| REMOVE-03 | SATISFIED | Fresh typed blockers, exact-name dirty-only Force Remove, no other bypass. |
| REMOVE-04 | SATISFIED | Managed worktree/directory/exact-YAML deletion with unrelated-state preservation. |
| REMOVE-05 | SATISFIED | Actual named progress and authoritative catalog/tab/signal/count/navigation reconciliation. |

**Coverage:** 11/11 requirements satisfied; no Phase 123 requirement is orphaned.

### Test Quality Audit

| Evidence set | Active | Skipped | Circular | Assertion strength | Verdict |
|---|---:|---:|---:|---|---|
| Focused Vitest files | 106 | 0 | 0 | Value and multi-step behavioral | PASS |
| Rendered OpenTUI lifecycle file | 7 | 0 | 0 | Rendered frame plus request/order/state assertions | PASS |

No disabled requirement tests, generated baselines, circular expected-value writers, or weak existence-only evidence were found. Static browser-source assertions are not treated as live browser approval; service lifecycle behavior is independently covered at coordinator/router/packaged-fixture boundaries.

### Anti-Patterns Found

No unreferenced `TBD`, `FIXME`, `XXX`, `TODO`, `HACK`, placeholder, or disabled-test marker was found in the 49 Phase 123 production/test files changed since planning.

### Decision Coverage

The automated decision parser reported no trackable XML decision entries, so the CONTEXT decisions were checked manually. All locked decisions are represented in the observable truths above: terminal-stopping archive, one-step Undo, minimal archive view, default-cancel Remove, typed dirty blockers, exact-name Force Remove, stale refresh without replay, per-target shared operations, named progress, and authoritative reconciliation.

## Manual Milestone-End Handoff - Pending by Design

Live browser pointer/keyboard/focus behavior and final OpenTUI interaction/rendering have **not** been human-approved. They remain the explicit non-blocking Phase 127 milestone-end checklist in `.planning/STATE.md`, to run only after Phase 127 automated and hosted gates and before any tag, push, publish, or release.

This pending milestone gate is not a missing Phase 123 behavioral check: Phase 123's automated, service, package, strict-projection, and rendered-TUI contracts are verified above. This report does not claim the later human verdict.

## Gaps Summary

**No Phase 123 gaps found.** All review findings CR-01 through CR-07 and WR-01 through WR-02 are closed in current code and covered by deterministic regression tests. The phase goal is achieved and is ready to advance to Phase 124.

---

_Verified: 2026-07-16T09:36:13Z_
_Verifier: the agent (gsd-verifier)_
