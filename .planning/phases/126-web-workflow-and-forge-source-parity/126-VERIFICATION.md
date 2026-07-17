---
phase: 126-web-workflow-and-forge-source-parity
verified: 2026-07-17
status: passed
score: 9/9 requirements verified
behavior_unverified: 0
overrides_applied: 0
deferred:
  - truth: "Authenticated GitHub/GitLab and supported self-hosted receipts, live service reconnect/cancellation, physical keyboard/pointer/xterm behavior, browser screenshots, interactive OpenTUI layouts, hosted supported-runner receipts, and cross-client human approval are complete before tagging."
    addressed_in: "Phase 127"
    evidence: "126-PHASE127-HANDOFF.md preserves the exact pre-tag checklist and explicitly prohibits tag, push, publish, release, and RC approval claims before manual approval."
---

# Phase 126: Web Workflow and Forge-Source Parity Verification Report

**Phase goal:** Make the browser a complete high-frequency workspace control surface and shorten external code-review setup to a reviewed creation form.
**Verified:** 2026-07-17
**Status:** passed
**Verified implementation revision:** `8b3840bb6825dd82f96408028365737682d0ff54`
**Verification handoff revision:** `7d48a491`

## Goal Achievement

Phase 126 achieves its implementation and deterministic local-verification goal. Web and OpenTUI consume canonical service-owned workspace actions, durable operation identity, authoritative notes, path-free file status, and one reviewed GitHub/GitLab Resolve → Review → explicit Create coordinator. Core/service remain the mutation and provider authority; browser projections stay strict and path-minimising; reconnect and cancellation retain honest operation state without replay.

The phase deliberately does not claim authenticated-provider, hosted-runner, live-service, physical-input, screenshot, or human approval. Those are preserved as Phase 127's consolidated pre-tag gate rather than treated as Phase 126 gaps.

## Requirements Coverage

| Requirement | Status | Evidence |
|---|---|---|
| PARITY-01 | VERIFIED | The protocol action inventory, service action authority, secure routes, shared client registry, web menu/scope/direct controls, and TUI action menu cover archive/unarchive, remove/force, rename, open/close, pin/unpin, sync/pull/push/merge, notes, file status, and cancellation through shared descriptors and service operations. `phase126-cross-client-conformance.test.ts` imports the real web/TUI adapters. |
| PARITY-02 | VERIFIED | Strict revisioned notes requests/responses, core append-only storage, service projection/routes, and web/TUI list/add/confirmed-clear surfaces preserve authoritative newest-first notes with no browser persistence. Cross-client notes ordering/count/revision tests and both UI harnesses pass. |
| PARITY-03 | VERIFIED | File status is computed by core/service and projected through strict logical target/state/severity/reason/count DTOs. Both clients load it lazily. Protocol and architecture canaries reject roots, absolute paths, raw errors, credentials, and client recomputation authority. |
| PARITY-04 | VERIFIED | Availability, disabled reasons, confirmation, synchronous one-shot latches, durable progress, cancellation availability/outcomes, terminal refresh, refresh-failed locking, and authoritative selection reconciliation are shared and executable across client/service/web/TUI suites. |
| PARITY-05 | VERIFIED | Pointer, menu, keyboard, and TUI placements resolve the same registry entry and callback identity. The TUI now derives labels from the shared client registry and owns only key/group presentation. Missing or invalid inventories fail closed. |
| SOURCE-01 | VERIFIED | Full credential-free GitHub PR and GitLab MR URLs are strict protocol inputs and resolve through shared provider integrations before either client can reach Review/Create. Enter at Resolve is tested to issue resolution only. |
| SOURCE-02 | VERIFIED | Core provider-backed resolution returns canonical host/repository/change/head/base/source/fork metadata and a real head SHA, with no synthetic ref/origin fallback. Hostile architecture fixtures reject provider checkout, provider URL CLI calls, and client-side synthetic/fetched refs. |
| SOURCE-03 | VERIFIED | Web and TUI render immutable source anchors plus editable name/template/repository/branch drafts. Explicit Create submits token, expected revision, and the complete draft once; service admission revalidates candidates, provider state, revision, source SHA, and idempotency before normal creation machinery. |
| SOURCE-04 | VERIFIED | Typed URL/provider/tool/auth/change/match/fork/revision/source/branch/cancellation/timeout failures preserve safe recovery and clean rollback without exposing provider output, clone coordinates, paths, credentials, or partial YAML/worktrees/private refs. Generic terminal failures return to editable Review through explicit recovery. |

**Score:** 9/9 requirements verified.

## Required Artifacts and Key Links

| Artifact / link | Status | Evidence |
|---|---|---|
| Strict action/note/file/operation/forge protocol | VERIFIED | `packages/protocol/src/web.ts` defines complete strict inventories, safe messages, confirmations, cancellation, projection states, URL/draft/terminology/failure schemas, and unknown-field rejection. |
| Core/service action authority | VERIFIED | Workspace action authority and secure routes resolve stable IDs/revisions, execute core operations, produce durable operation summaries, and project only safe client state. |
| Shared action registry | VERIFIED | `packages/client/src/workspace-actions.ts` owns labels, availability narrowing, confirmation dispatch, callback identity, and the synchronous subject/action latch. |
| Durable operation tracker | VERIFIED | `packages/client/src/operation-tracker.ts` submits once, retains operation ID, coalesces reconnect, validates cancellation availability, refreshes terminal state, and locks on refresh failure. |
| Shared forge review coordinator | VERIFIED | `packages/client/src/forge-review.ts` separates Resolve/Review/Create, freezes source anchors, validates edited drafts, submits once, and recovers typed/generic terminal failures. |
| Web action/detail/review surfaces | VERIFIED | Web navigation/app/overlay integration uses shared descriptors/coordinators, contained overlays, path-free text rendering, explicit Create, and production-wired focus restoration. |
| TUI action/detail/review surfaces | VERIFIED | TUI consumes shared descriptors/labels, pure key/group presentation, fail-closed inventories, authoritative details, operation recovery, and explicit one-shot Create. |
| No-client-authority sentinels | VERIFIED | `tests/architecture/phase126-client-authority.test.mjs` has hostile fixtures for forbidden authority, runtime/provider commands, synthetic sources, and browser disclosure; production sources pass. |
| Cross-client conformance | VERIFIED | `tests/service/phase126-cross-client-conformance.test.ts` imports shared reducers and real web/TUI adapters, and cross-references both executable surface suites for every UI consideration category. |
| Phase 127 boundary | VERIFIED | `126-PHASE127-HANDOFF.md` records exact deterministic results and all remaining hosted/live/manual checks with a release stop. |

## Behavioral and Gate Evidence

| Gate | Result |
|---|---|
| Focused architecture/package/secure-bundle matrix | 34/34 Node tests passed; dependency/cycle gate passed |
| Focused cross-client Node-project matrix | 3 files / 24 tests passed |
| Full Vitest | 160 files passed; 2,097 passed and 1 skipped |
| Native Node architecture/runtime | 72/72 passed |
| Isolated OpenTUI | 37 files / 219 tests passed |
| V8 coverage | 54.63% statements; 49.67% branches; 52.68% functions; 57.93% lines |
| Workspace typechecks | All seven passed |
| Package dependency/cycle gate | Passed |
| Package architecture gate | Passed |
| Production web build | Passed; final bundle rechecked by secure sentinels |
| Production TUI build | Passed |
| `verify:gates` | Passed; inventory, mapped tests, and coverage artifacts aligned |
| Diff integrity | `git diff --check` passed before implementation commit |

The OpenTUI runner emitted existing non-failing EventTarget listener warnings. No test or build failure remains.

## Authority, Concurrency, and Failure Disconfirmation

- Browser source cannot import core/service authority; TUI may import only explicit presentation/type modules and `@git-stacks/service/client`, with runtime access confined to named handoff/probe files.
- Client source contains no provider checkout, `glab mr view <url>`, synthetic provider ref, or unconditional origin-fetch implementation.
- Browser schemas and source cannot add machine path/root/environment/provider-token/private-key fields without failing architecture tests.
- Service unavailable actions stay unavailable even if local policy says available; unavailable activation causes zero transport.
- The action latch is acquired before confirmation or async transport, so rapid pointer/key repeats cannot duplicate submission.
- Missing, empty, malformed, and wrong-workspace inventories expose no locally reconstructed action fallback.
- Operation submission retains no replayable original intent after acceptance; reconnect/hydration uses only the operation ID.
- Cancellation is sent once only while service state advertises it; late/unavailable states remain honest and do not claim rollback.
- Terminal outcomes require authoritative refresh; refresh failure remains locked until Retry succeeds.
- Notes are revision- and workspace-bound, capped, newest-first, and never become browser/TUI durable truth.
- File targets are safe relative configured identifiers; path-bearing targets/messages and raw error fields fail schemas.
- Resolve Enter cannot create, stale URLs invalidate prior review state, and explicit Create sends one complete reviewed request.
- Source/revision/token/provider races fail without creating or preserving unintended state.

## Deferred Live Evidence

Phase 127 must execute the checklist in `126-PHASE127-HANDOFF.md`: supported hosted runners; authenticated GitHub/GitLab and configured self-hosted flows; live reconnect/progress/cancel; physical keyboard/pointer/xterm and exact focus restoration; desktop/375px/320px light/dark screenshots; interactive wide/narrow OpenTUI; and side-by-side cross-client human parity.

This is a visible pre-tag milestone gate, not a waived implementation defect. Automated fixtures, DOMs, render buffers, source assertions, and local production builds must not be described as that approval.

## Gaps Summary

No Phase 126 implementation or deterministic local-verification gap remains. Phase 126 is complete. Phase 127 has not been started and retains the full hosted/live/manual verification boundary before any release action.

---

_Verified: 2026-07-17_
_Verifier: primary agent goal-backward verification against the approved Phase 126 plan, UI specification, validation map, executable conformance matrix, and complete local gates_
