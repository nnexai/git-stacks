---
phase: 87
slug: integration-contract-and-source-module-coverage
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-05-15
---

# Phase 87 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Bun built-in test runner plus repo custom runner |
| **Config file** | `bunfig.toml`, `scripts/test-runner.ts` |
| **Quick run command** | `bun test <focused integration test files>` |
| **Full suite command** | `bun run test:unit && bun run typecheck` |
| **Estimated runtime** | Focused commands under 60 seconds; full unit/typecheck gate varies by machine |

## Sampling Rate

- **After every task commit:** Run the focused command listed in the plan task.
- **After every plan wave:** Run `bun run test:unit && bun run typecheck`.
- **Before `$gsd-verify-work`:** Run `bun run coverage:unit && bun run verify:gates`.
- **Max feedback latency:** Keep focused checks under one minute when possible.

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 87-01-01 | 01 | 1 | INTG-02, GATE-03 | T-87-01-01 | Real source utilities execute with mocked external boundaries only | unit | `bun test tests/lib/integrations/issue-utils.test.ts tests/lib/integrations/forge-utils.test.ts` | yes | pending |
| 87-01-02 | 01 | 1 | INTG-02, GATE-03 | T-87-01-02 | Detection executors are injected and no real forge tools run | unit | `bun run test:unit` | yes | pending |
| 87-02-01 | 02 | 1 | INTG-03, GATE-03 | T-87-02-01 | Forge command tests assert executor args and safe exits without real CLIs | unit | `bun test tests/lib/integrations/github.test.ts tests/lib/integrations/gitlab.test.ts tests/lib/integrations/gitea.test.ts tests/lib/integrations/jira.test.ts` | yes | pending |
| 87-02-02 | 02 | 1 | INTG-03, GATE-03 | T-87-02-02 | Browser-open paths use injected `_exec.openUrl` or CLI web flags only | unit | `bun run test:unit` | yes | pending |
| 87-03-01 | 03 | 1 | INTG-04, GATE-03 | T-87-03-01 | Session/IDE tests use fake detectors and injected executors | unit | `bun test tests/lib/integrations/tmux.test.ts tests/lib/integrations/cmux.test.ts tests/lib/integrations/niri.test.ts tests/lib/integrations/aerospace.test.ts tests/lib/integrations/vscode.test.ts tests/lib/integrations/intellij.test.ts` | partial | pending |
| 87-04-01 | 04 | 2 | INTG-02, INTG-03, INTG-04, GATE-03 | T-87-04-01 | Audit rejects source-bypassing utility inlines and verifies source hit deltas | gate | `bun run coverage:unit && bun run verify:gates` | yes | pending |

## Wave 0 Requirements

Existing infrastructure covers all phase requirements. No Wave 0 scaffolding is required.

## Manual-Only Verifications

All phase behaviors have automated verification.

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency target recorded
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-05-15
