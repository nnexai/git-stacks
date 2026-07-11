---
phase: 104
slug: workspace-service-and-event-contract
status: draft
nyquist_compliant: true
wave_0_complete: false
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

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 104-01 | TBD | 0 | SVC-01 | protocol trust boundary | Strict version/capability envelopes | contract | `bun test tests/lib/service/contract.test.ts tests/service/discovery.test.ts` | ❌ W0 | ⬜ pending |
| 104-02 | TBD | 0 | SVC-02, SVC-03 | secret exposure | Stable IDs, consistent revisions, redacted launch contexts | unit + integration | `bun test tests/lib/service/identity.test.ts tests/lib/service/snapshot.test.ts tests/lib/service/launch-context.test.ts` | ❌ W0 | ⬜ pending |
| 104-03 | TBD | 0 | SVC-04 | regression | Existing CLI/OpenTUI behavior remains compatible | regression | `bun test tests/commands/command.test.ts tests/commands/workspace-json-contracts.test.ts tests/tui` | partial | ⬜ pending |
| 104-04 | TBD | 0 | SVC-05 | auth and resource exhaustion | Generic unauthenticated rejection and exact admission bounds | unit + integration | `bun test tests/lib/service/credentials.test.ts tests/service/security.test.ts` | ❌ W0 | ⬜ pending |
| 104-05 | TBD | 0 | EVT-01, EVT-02 | duplicate destructive work | Durable reservation and structured lifecycle/cancellation | unit + integration | `bun test tests/lib/service/operations.test.ts tests/lib/service/idempotency.test.ts tests/service/operations.test.ts` | ❌ W0 | ⬜ pending |
| 104-06 | TBD | 0 | EVT-03, EVT-04, EVT-05 | replay and memory exhaustion | Ordered durable replay with explicit gaps and bounded queues | unit + integration | `bun test tests/lib/service/event-journal.test.ts tests/lib/service/event-broker.test.ts tests/service/events.test.ts` | ❌ W0 | ⬜ pending |

## Wave 0 Requirements

- [ ] Contract golden fixtures for Phase 105 cross-language clients.
- [ ] Injectable clock, random-ID source, persistence root, limits, and operation executor fixtures.
- [ ] Loopback server harness using port `0`, isolated `GIT_STACKS_CONFIG_DIR`, and cleanup proving no process remains.
- [ ] Crash/restart journal and idempotency fixtures, corrupt-tail recovery, concurrent ordering, replay/live handoff race, and exact size-boundary cases.

## Manual-Only Verifications

None. All phase behaviors must have automated contract, unit, integration, security-boundary, or regression coverage.

## Validation Sign-Off

- [x] All planned behaviors have an automated target or Wave 0 dependency
- [x] Sampling continuity forbids three consecutive tasks without automated verification
- [x] Wave 0 covers all missing test references
- [x] No watch-mode flags
- [x] Feedback is bounded to one task
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved for planning 2026-07-11; Wave 0 remains required before implementation claims
