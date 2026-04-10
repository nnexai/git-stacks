---
phase: 82
slug: template-repo-label-and-message-e2e-coverage
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-04-10
---

# Phase 82 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | `bun:test` on Bun 1.3.10 |
| **Config file** | `bunfig.toml` + custom runner (`scripts/test-runner.ts`) |
| **Quick run command** | `bun test tests/commands/<touched-file>.test.ts -x` |
| **Full suite command** | `bun run test && bun run typecheck` |
| **Estimated runtime** | ~25 seconds |

---

## Sampling Rate

- **After every task commit:** Run `bun test tests/commands/<touched-file>.test.ts -x`
- **After every plan wave:** Run `bun run test:integ && bun run typecheck`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 25 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 82-01-01 | 01 | 1 | E2E-09 | T-82-01 / V5-SCOPE | Template command coverage preserves current user-facing contracts for list/show/clone/rename/remove and template-label behavior without relying on wizard flows. | integration | `bun test tests/commands/template-commands.test.ts -x` | ❌ W0 | ⬜ pending |
| 82-01-02 | 01 | 1 | E2E-09 | T-82-01 / V5-SCOPE | Template consumption coverage proves `new --non-interactive --from` and repeatable `--template` propagation/composition with workspace snapshot assertions. | integration | `bun test tests/commands/template-consumption.test.ts -x` | ❌ W0 | ⬜ pending |
| 82-01-03 | 01 | 1 | E2E-10 | T-82-02 / V5-FORGE | Repo coverage stays on no-prompt success paths, splits git vs dir scenarios, and proves forge persistence through stdout plus `registry.yml`. | integration | `bun test tests/commands/repo.test.ts -x` | ❌ W0 | ⬜ pending |
| 82-01-04 | 01 | 1 | E2E-11 | T-82-03 / V5-SCOPE | Workspace label coverage extends the existing subprocess suite to close add/remove/list/clear and output-contract gaps. | integration | `bun test tests/commands/label.test.ts -x` | ✅ (extend) | ⬜ pending |
| 82-01-05 | 01 | 1 | E2E-11 | T-82-04 / V5-IPC | Message coverage proves `send`/`list`/`clear`, workspace resolution, sender metadata, newest-first ordering, and durable JSONL persistence while disabling socket push via an explicit automation-safe seam. | integration | `bun test tests/commands/message.test.ts -x` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] Verify prerequisite surfaces from Phases 80, 81.1, and 81.1.1 are present on the execution branch before Phase 82 implementation proceeds
- [ ] `tests/commands/template-commands.test.ts` — template list/show/clone/rename/remove and template-label mapping coverage
- [ ] `tests/commands/template-consumption.test.ts` — `new --non-interactive --from` and repeatable `--template` propagation/composition coverage
- [ ] `tests/commands/repo.test.ts` — git-repo and dir-repo registry scenarios with `registry.yml` assertions
- [ ] Extend `tests/commands/label.test.ts` for remaining output-contract and clear-path coverage
- [ ] `tests/commands/message.test.ts` — message CLI contract coverage with socket opt-out and JSONL assertions
- [ ] Update the Phase 80 inventory source with new mappings and exclusions once the prerequisite inventory file is present on the implementation branch

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| None | — | — | — |

*All phase behaviors should have automated verification.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
