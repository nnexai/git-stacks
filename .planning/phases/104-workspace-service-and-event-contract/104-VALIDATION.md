---
phase: 104
slug: workspace-service-and-event-contract
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-07-11
---

# Phase 104 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | `bun:test` 1.3.14 with the repository's isolated runner |
| **Config file** | `scripts/test-runner.ts`, `bunfig.toml` |
| **Quick run command** | `bun test tests/lib/service/<file>.test.ts` |
| **Full suite command** | `bun run test && bun run typecheck && bun run test:deps && bun run verify:gates` |
| **Estimated runtime** | Measure during Wave 0; focused tests must remain task-scale |

## Sampling Rate

- **After every task commit:** Run focused `bun test <changed test files>` plus `bun run typecheck`
- **After every plan wave:** Run the relevant integration set plus `bun run test:unit && bun run test:deps`
- **Before `$gsd-verify-work`:** Run `bun run test && bun run typecheck && bun run test:deps && bun run verify:gates`
- **Max feedback latency:** One task; no three consecutive tasks may lack automated verification

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | Test Creation Owner | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|---------------------|--------|
| 104-01-01 | 104-01 | 1 | SVC-01, SVC-04 | T-104-02 | Strict version/capability envelopes and secret-free wire fixtures | contract TDD | `bun test tests/lib/service/contract.test.ts && bun run typecheck` | This task writes `contract.test.ts` and golden fixtures before production schemas (RED first) | ⬜ pending |
| 104-01-02 | 104-01 | 1 | SVC-02, SVC-04 | T-104-01, T-104-03 | Stable IDs migrate atomically and survive rename | unit TDD | `bun test tests/lib/service/identity.test.ts tests/lib/config.test.ts && bun run typecheck` | This task writes `identity.test.ts` before identity/config implementation | ⬜ pending |
| 104-02-01 | 104-02 | 2 | SVC-02, SVC-04 | T-104-04, T-104-06 | Aggregate consistency and monotonic revisions under races | unit TDD | `bun test tests/lib/service/snapshot.test.ts && bun run typecheck` | This task writes race/restart cases in `snapshot.test.ts` before implementation | ⬜ pending |
| 104-02-02 | 104-02 | 2 | SVC-03, SVC-04 | T-104-05 | Launch context omits resolved secrets by default | unit TDD | `bun test tests/lib/service/launch-context.test.ts tests/lib/workspace-command.test.ts tests/lib/workspace-env.test.ts && bun run typecheck` | This task writes `launch-context.test.ts` before projection changes | ⬜ pending |
| 104-03-01 | 104-03 | 1 | SVC-05 | T-104-07, T-104-09 | Per-client protected credentials and revocation | unit TDD | `bun test tests/lib/service/credentials.test.ts && bun run typecheck` | This task writes `credentials.test.ts` before credential implementation | ⬜ pending |
| 104-03-02 | 104-03 | 1 | SVC-05 | T-104-08 | One generic authenticate-first rejection | integration TDD | `bun test tests/service/security.test.ts tests/lib/service/credentials.test.ts && bun run typecheck` | This task writes the admission cases in `security.test.ts` before the helper | ⬜ pending |
| 104-05-01 | 104-05 | 2 | EVT-03, EVT-04 | T-104-13 | Operation publisher durably appends before live callback; replay gaps are explicit | unit TDD | `bun test tests/lib/service/event-journal.test.ts && bun run typecheck` | This task writes append-order, failure, restart, gap, and compaction tests before the journal | ⬜ pending |
| 104-05-02 | 104-05 | 2 | EVT-03, EVT-05, SVC-04 | T-104-14, T-104-15 | Replay/live handoff is gap-free and queues are dual-bounded | unit TDD | `bun test tests/lib/service/event-broker.test.ts tests/lib/messages.test.ts && bun run typecheck` | This task writes `event-broker.test.ts` and message adapter cases before broker wiring | ⬜ pending |
| 104-04-01 | 104-04 | 3 | EVT-01, EVT-03 | T-104-11 | Every lifecycle/progress transition uses append-first shared publication | unit TDD | `bun test tests/lib/service/operations.test.ts tests/lib/service/event-journal.test.ts && bun run typecheck` | This task writes lifecycle, cancellation, append-order, and append-failure cases before operation wiring | ⬜ pending |
| 104-04-02 | 104-04 | 3 | EVT-02 | T-104-10, T-104-12 | Durable reservation prevents duplicate destructive work | unit TDD | `bun test tests/lib/service/idempotency.test.ts tests/lib/service/operations.test.ts && bun run typecheck` | This task writes `idempotency.test.ts` before reservation/adapters | ⬜ pending |
| 104-06-01 | 104-06 | 4 | SVC-01, SVC-02, SVC-03, SVC-05, EVT-01, EVT-02, EVT-03, EVT-04, EVT-05 | T-104-16, T-104-17, T-104-19 | Authenticated bounded routes deliver replayable operation and attention SSE | integration TDD | `bun test tests/service/discovery.test.ts tests/service/security.test.ts tests/service/operations.test.ts tests/service/events.test.ts && bun run typecheck` | This task creates/extends all four loopback integration files before server composition | ⬜ pending |
| 104-06-02 | 104-06 | 4 | SVC-04, SVC-05 | T-104-18, T-104-19 | Descriptor is protected/secret-free and idle exit respects clients/operations | integration TDD | `bun test tests/service/discovery.test.ts tests/service/operations.test.ts tests/commands/command.test.ts tests/commands/workspace-json-contracts.test.ts tests/tui && bun run typecheck` | This task adds lifecycle/descriptor cases before main/command wiring; existing regression suites remain the compatibility oracle | ⬜ pending |

## Test-Creation Ownership (No Separate Wave 0)

All twelve implementation tasks are marked `tdd="true"`. Each task owns the missing test files/cases named in its `<files>` and `<behavior>` blocks and must execute RED before production implementation, then GREEN and refactor. Therefore no standalone Wave 0 plan is required and `wave_0_complete: true` records that test scaffolding is fully assigned rather than pre-existing. Cross-language fixtures belong to 104-01-01; deterministic seams belong to their corresponding unit tasks; the loopback harness belongs to 104-06-01; crash/restart, corrupt-tail, concurrent ordering, replay/live race, and exact-boundary fixtures belong to 104-05-01, 104-05-02, and 104-04-02.

## Manual-Only Verifications

None. All phase behaviors must have automated contract, unit, integration, security-boundary, or regression coverage.

## Validation Sign-Off

- [x] All twelve planned tasks have an automated target and explicit test-creation owner
- [x] Sampling continuity forbids three consecutive tasks without automated verification
- [x] RED-first TDD ownership covers all missing test references; no separate Wave 0 is needed
- [x] No watch-mode flags
- [x] Feedback is bounded to one task
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved for planning 2026-07-11; every task must create and run its assigned failing test before production implementation
