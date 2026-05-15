---
phase: 86
slug: workspace-command-workflow-edge-coverage
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-05-15
---

# Phase 86 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | `bun:test` plus repo-local `scripts/test-runner.ts` |
| **Config file** | `bunfig.toml`, `scripts/test-runner.ts`, `scripts/verify-gates.ts` |
| **Quick run command** | `bun test <new Phase 86 test file>` |
| **Full suite command** | `bun run verify` |
| **Estimated runtime** | ~10-60 seconds for targeted command tests; full verify depends on coverage runtime |

---

## Sampling Rate

- **After every task commit:** Run the narrowest relevant `bun test tests/commands/<file>.test.ts` command.
- **After every plan wave:** Run `bun run test:integ`.
- **After inventory mapping changes:** Run `bun run verify:gates`.
- **Before `$gsd-verify-work`:** `bun run coverage && bun run verify:gates && bun run verify`.
- **Max feedback latency:** 60 seconds for targeted command tests; full verify may be longer because it refreshes coverage.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 86-01-01 | 01 | 1 | CMD-01, GATE-03 | T-86-01 / T-86-02 | Missing-template and workspace-without-template errors do not mutate workspace YAML; non-force recreate is automation-safe. | command E2E | `bun test tests/commands/workspace-recreate.test.ts` | W0 | pending |
| 86-01-02 | 01 | 1 | CMD-01, GATE-03 | T-86-03 | Forced recreate applies only template-backed repo/hook/env/file/integration drift and preserves stable workspace identity. | command E2E | `bun test tests/commands/workspace-recreate.test.ts && bun run test:integ` | W0 | pending |
| 86-02-01 | 02 | 1 | CMD-02, CMD-03, GATE-03 | T-86-04 / T-86-05 | Gone-branch cleanup uses local bare remotes, refuses dirty worktrees, and honors dry-run/force boundaries. | command E2E | `bun test tests/commands/workspace-clean-gone.test.ts` | W0 | pending |
| 86-02-02 | 02 | 1 | CMD-03, GATE-03 | T-86-06 | Destructive commands refuse unsafe non-force paths, report missing entities, and only mutate on explicit force where applicable. | command E2E | `bun test tests/commands/workspace-destructive-safety.test.ts && bun run test:integ` | W0 | pending |
| 86-03-01 | 03 | 2 | CMD-04, GATE-03 | T-86-07 / T-86-08 | Wrapper commands preserve JSON/cwd/no-op/error contracts without relying on brittle prose. | command E2E | `bun test tests/commands/workspace-wrapper-edges.test.ts` | W0 | pending |
| 86-03-02 | 03 | 2 | CMD-01, CMD-02, CMD-03, CMD-04, GATE-03 | T-86-09 | Inventory/local gates recognize all new Phase 86 surfaces and canonical local verification remains green. | gate | `bun test tests/commands/workspace-wrapper-edges.test.ts && bun run verify:gates && bun run verify` | W0 | pending |

---

## Wave 0 Requirements

- [ ] `tests/commands/workspace-recreate.test.ts` created before CMD-01 assertions run.
- [ ] `tests/commands/workspace-clean-gone.test.ts` created before CMD-02 assertions run.
- [ ] `tests/commands/workspace-destructive-safety.test.ts` created before CMD-03 assertions run.
- [ ] `tests/commands/workspace-wrapper-edges.test.ts` created before CMD-04 assertions run.
- [ ] `tests/e2e-inventory.ts` updated in Plan 03 after the new command test files exist.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| None | - | - | - |

All planned Phase 86 behaviors should have automated verification.

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s for targeted checks
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
