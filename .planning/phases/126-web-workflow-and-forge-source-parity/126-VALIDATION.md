---
phase: 126
slug: web-workflow-and-forge-source-parity
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-07-16
---

# Phase 126 — Validation Strategy

> Adversarial validation contract for canonical action parity, honest durable operations, path-free notes/file projections, and reviewed GitHub/GitLab source creation.

## Test Infrastructure

| Property | Value |
|---|---|
| **Framework** | Vitest 4.1.10 for TypeScript packages, Node test runner for architecture/runtime checks, OpenTUI render/key harnesses, production web/TUI builds |
| **Protocol/core command** | `./node_modules/.bin/vitest run tests/service/web-workflow-contract.test.ts tests/lib/forge-source-resolver.test.ts` |
| **Service/security command** | `GIT_STACKS_KEY_STORE=file ./node_modules/.bin/vitest run tests/lib/service/workspace-action-authority.test.ts tests/service/web-workflow-authority.test.ts tests/service/forge-source-review.test.ts tests/service/web-safe-detail.test.ts` |
| **Client command** | `./node_modules/.bin/vitest run tests/lib/client-workspace-actions.test.ts tests/lib/client-operation-tracker.test.ts tests/lib/client-forge-review.test.ts` |
| **Surface command** | `GIT_STACKS_KEY_STORE=file ./node_modules/.bin/vitest run tests/tui/dashboard/WorkspaceParity.test.tsx tests/tui/dashboard/ForgeSourceReview.test.tsx tests/service/web-workspace-actions.test.ts tests/service/web-forge-review.test.ts` |
| **Full gate** | `npm test && npm run coverage && npm run typecheck && npm run test:deps && npm run web:build && npm run tui:build && npm run verify:gates` |
| **Watch mode** | Forbidden in automated verification |

## Sampling Rate

- After each task commit, run the task's focused suite and affected package typecheck.
- After each wave, run every Phase 126 focused suite whose dependencies have landed plus `npm run test:deps`.
- After service/router work, always run redaction, token/principal/revision/SHA race, cancellation-boundary, and one-shot/reconnect cases together.
- After either UI plan, run its render/key/DOM harness and production package build.
- Before phase verification, the full gate must be green; authenticated hosts, physical keyboard/xterm, screenshots, and live reconnect remain Phase 127 pre-tag evidence.

## Requirement-to-Test Map

| Requirement | Required observable behavior | Primary automated evidence | RED condition |
|---|---|---|---|
| **PARITY-01** | Web routes archive/unarchive/remove/rename/open/close/pin/sync/pull/push/merge through canonical service actions. | workflow contract, action authority, web actions | A browser variant runs local policy, omits a required action, or differs in confirmation/result. |
| **PARITY-02** | Web/TUI list/add/clear authoritative newest-first notes with confirmed clear and no local persistence. | action authority, safe detail, both surface suites | A mutation bypasses core, malformed storage mutates, or local/client state becomes durable truth. |
| **PARITY-03** | Both clients lazily render the same service-computed path-free file status and durable operation progress. | safe detail, client operation tracker, both surface suites | A client imports rich core status, recomputes policy, or a canary path appears. |
| **PARITY-04** | Availability, reasons, confirmations, one-shot progress, cancellation outcomes, errors, and refresh agree. | action authority, operation tracker, both surface suites | Duplicate submit/cancel, false rollback claim, reconnect resubmit, or stale selection survives reconciliation. |
| **PARITY-05** | Pointer/menu/key invokers resolve the same descriptor and callback. | client actions, web actions, TUI parity | Any invoker owns a second implementation or bypasses descriptor availability/confirmation. |
| **SOURCE-01** | Full GitHub PR and GitLab MR URLs resolve in both clients before creation. | resolver, review authority, both source-review suites | Resolve Enter creates, unsupported kinds pass, or a client calls provider tooling. |
| **SOURCE-02** | Service/core resolve real host/repo/head/base/fork metadata and safe suggested name. | core resolver, review authority | Synthetic ref/origin assumption, missing head SHA, or browser fetch coordinate. |
| **SOURCE-03** | Editable reviewed draft submits explicitly with token/revision and complete authoritative revalidation. | client review, review authority, both source-review suites | Unresolved/ambiguous/expired/invalid draft creates or immutable identity becomes editable authority. |
| **SOURCE-04** | Typed safe failures are non-destructive and actionable across URL/tool/auth/change/match/fork/branch races. | resolver and token/TOCTOU fixtures | Raw stderr/path/clone URL leaks or YAML/worktree/private ref survives a rejected flow. |

## RED → GREEN Wave Order

| Validation wave | RED first | GREEN implementation evidence | Exit gate |
|---:|---|---|---|
| **0 — Strict contract sentinels** | Add schema inventory, unknown-field, path/credential, bounds, cancellation, and review-token cases. | Plan 01 strict schemas. | Protocol suite and typecheck pass. |
| **1A — Resolver** | Add URL/provider/matching/runner/fork/head-SHA fixtures, including no synthetic ref/origin fallback. | Plan 02 provider-backed resolver. | Core suite, typecheck, and dependency gate pass. |
| **1B — Action authority** | Add Pull/notes/availability/cancellation commit-boundary/reconnect fixtures. | Plan 03 core/service authority. | Operation and authority suites pass. |
| **2 — Secure review/routing** | Add path canaries, scoped routes, token principal/revision/reuse/restart, provider recheck, and fetch-SHA races. | Plan 04 secure projections and review authority. | Secure route suite passes with zero leaked canaries. |
| **3 — Shared coordination** | Add descriptor identity, one-shot latch, operation reattach, cancel-once, resolve/review state transitions. | Plan 05 pure client modules. | Client suites pass without DOM/OpenTUI imports. |
| **4 — Parallel surfaces** | Add TUI and web action/detail/review render and key/pointer fixtures. | Plans 06 and 07 parity UIs. | Both package builds and surface suites pass. |
| **5 — Conformance** | Run cross-client inventory/copy/security scans and full gates. | Plan 08 repairs phase-scoped drift. | Full local closure green; Phase 127 handoff intact. |

## Wave 0 Required Files

- [ ] `tests/service/web-workflow-contract.test.ts` — strict action/note/file/operation/source DTOs and hostile extras.
- [ ] `tests/lib/forge-source-resolver.test.ts` — provider URL, argv, metadata, fork, matching, and real-SHA cases.
- [ ] `tests/lib/service/workspace-action-authority.test.ts` — Pull/notes/availability/cancellation/refresh semantics.
- [ ] `tests/service/web-safe-detail.test.ts` — path/credential/raw-output canaries and bounded projections.
- [ ] `tests/service/forge-source-review.test.ts` — token/principal/revision/provider/fetch-SHA TOCTOU and rollback.
- [ ] `tests/lib/client-workspace-actions.test.ts`, `client-operation-tracker.test.ts`, `client-forge-review.test.ts` — pure shared coordination.
- [ ] `tests/tui/dashboard/WorkspaceParity.test.tsx`, `ForgeSourceReview.test.tsx` — OpenTUI parity and narrow layouts.
- [ ] `tests/service/web-workspace-actions.test.ts`, `web-forge-review.test.ts` — DOM/action/overlay/responsive behavior.
- [ ] `tests/architecture/phase126-client-authority.test.mjs` — no client authority, path/provider redaction, and action-inventory conformance.

Existing frameworks cover all tests; Wave 0 adds focused files only.

## Security and Anti-False-Positive Gates

| Gate | Required proof |
|---|---|
| **AF-126-01 Strict safe projection** | Seed roots, main/task paths, raw exceptions, clone URLs, credentials, CLI argv/output, and fetch commands; serialized browser/TUI DTOs, operations, events, DOM text, and snapshots contain none. |
| **AF-126-02 No client authority** | Architecture scan rejects core Git/config/notes/files/forge imports and provider/process/filesystem APIs from web/TUI/client bundles. |
| **AF-126-03 One action** | Every visible/menu/key action ID resolves one shared descriptor/callback and identical confirmation; no duplicated transport submit closure. |
| **AF-126-04 One-shot/reconnect** | Deferred promises prove rapid Enter/click/repeat submits one idempotency key; reconnect only observes an assigned operation ID. |
| **AF-126-05 Honest cancellation** | Before start/during safe step/after commit/after finish/duplicate/non-cancellable races return typed distinct outcomes and never claim rollback. |
| **AF-126-06 No synthetic source** | Tests reject invented `source/<forge>-...`, `refs/heads/...`, unconditional `origin` fetch, and `glab mr view <url>` command shapes. |
| **AF-126-07 Review-token binding** | Wrong principal/source/body/revision/idempotency key, expiry, restart, and reuse fail without mutation; validation-correctable failure retains only safe review state. |
| **AF-126-08 SHA TOCTOU** | Head moves before provider recheck or between recheck/fetch; both fail `source_changed`, remove private refs, and create no YAML/worktree. |
| **AF-126-09 Core leaf** | `npm run test:deps` and import scans prove core does not import protocol/service/client. |
| **AF-126-10 Human evidence honesty** | Automated render/build evidence is labelled deterministic only; Phase 127 retains live hosted/browser/OpenTUI approval before tag. |

## Manual / Hosted Handoff

Phase 127 must exercise authenticated GitHub/GitLab hosts (including supported self-hosted metadata), real provider failure/auth recovery, live service reconnect/cancellation, physical keyboard/xterm, pointer/focus behavior, browser screenshots at desktop/375px/320px in light/dark, and interactive OpenTUI wide/narrow layouts. Phase 126 cannot claim those outcomes from mocks, fixtures, source assertions, or render harnesses.

## Validation Sign-Off

- [ ] Every PARITY-01..05 and SOURCE-01..04 row has behavioral RED evidence before implementation.
- [ ] No three consecutive tasks lack an automated test command.
- [ ] Strict DTO, no-client-authority, path/provider redaction, cancellation, and TOCTOU gates are executable.
- [ ] Web and TUI inventories, copy/reasons, confirmation policy, and operation semantics conform.
- [ ] Full test, coverage, build, type, dependency, and verify gates are green.
- [ ] Phase 127 retains all live/hosted/manual verification before tagging.

**Approval:** validation strategy is plan-ready; implementation evidence remains pending.
