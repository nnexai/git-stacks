---
phase: 80
slug: e2e-cli-harness-and-living-inventory
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-04-10
---

# Phase 80 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | `bun:test` on Bun 1.3.10 |
| **Config file** | `bunfig.toml` + custom runner (`scripts/test-runner.ts`) |
| **Quick run command** | `bun test tests/lib/e2e-inventory.test.ts -x && bun test tests/commands/e2e-harness.test.ts -x` |
| **Full suite command** | `bun run test && bun run typecheck` |
| **Estimated runtime** | ~25 seconds |

---

## Sampling Rate

- **After every task commit:** Run `bun test tests/lib/e2e-inventory.test.ts -x && bun test tests/commands/e2e-harness.test.ts -x`
- **After every plan wave:** Run `bun run test:integ && bun run typecheck`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 25 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 80-01-01 | 01 | 1 | E2E-04, E2E-05, E2E-06, E2E-07 | T-80-01 / V5-ISOLATION | Shared CLI harness forces isolated config and git-home env, returns decoded stdout/stderr and exit code, and emits only redacted failure diagnostics with artifact paths. | integration | `bun test tests/commands/e2e-harness.test.ts -x` | ❌ W0 | ⬜ pending |
| 80-01-02 | 01 | 1 | E2E-01, E2E-02, E2E-03 | T-80-02 / V5-SCOPE | Canonical inventory data is typed, machine-parseable, includes explicit exclusions and rationales, and exposes detection of unmapped in-scope flows. | unit | `bun test tests/lib/e2e-inventory.test.ts -x` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/e2e-inventory.ts` — canonical typed inventory module with stable IDs, scope status, mapped tests, and rationale
- [ ] `tests/lib/e2e-inventory.test.ts` — unique-ID, exclusion, and unmapped-selector coverage
- [ ] `tests/commands/e2e-harness.test.ts` — real-process harness proof and failure-diagnostics coverage
- [ ] `tests/helpers.ts` — shared `runCli` and reusable config/template/workspace fixture builders

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
- [ ] Feedback latency < 25s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
