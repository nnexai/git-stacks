---
phase: 71
slug: observability
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-05
---

# Phase 71 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | `bun:test` |
| **Config file** | none; project runner is `scripts/test-runner.ts` |
| **Quick run command** | `bun test tests/lib/observability.test.ts tests/commands/debug-output.test.ts tests/commands/status-json.test.ts` |
| **Full suite command** | `bun run test` |
| **Estimated runtime** | ~45 seconds |

---

## Sampling Rate

- **After every task commit:** Run `bun test tests/lib/observability.test.ts tests/commands/debug-output.test.ts tests/commands/status-json.test.ts`
- **After every plan wave:** Run `bun run test && bun run typecheck`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 71-01-01 | 01 | 1 | OBSV-01, OBSV-04 | T-71-01 | Disabled path stays silent and enabled path routes to stderr-only sink | unit | `bun test tests/lib/observability.test.ts` | ❌ W0 | ⬜ pending |
| 71-01-02 | 01 | 1 | OBSV-01, OBSV-05 | T-71-02 | Bootstrap config runs before command parsing and `manage` re-silences logging | contract | `bun run typecheck` | ✅ | ⬜ pending |
| 71-02-01 | 02 | 2 | OBSV-02, OBSV-03 | T-71-03 | Domain modules use logical labels and timed operation wrappers | contract | `rg -n "workspace-(env|status|git|yaml|lifecycle)" src/lib/workspace-*.ts` | ✅ | ⬜ pending |
| 71-02-02 | 02 | 2 | OBSV-01, OBSV-04 | T-71-04 | `status` debug lines appear on stderr only; stdout remains unchanged when debug is off | integration | `bun test tests/commands/debug-output.test.ts` | ❌ W0 | ⬜ pending |
| 71-02-03 | 02 | 2 | OBSV-01, OBSV-03, OBSV-04 | T-71-04 | `status --json` stays parseable while debug lines remain on stderr | integration | `bun test tests/commands/status-json.test.ts tests/commands/debug-output.test.ts` | ⚠ extend existing | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/lib/observability.test.ts` — helper-level coverage for enabled/disabled timing/logging paths
- [ ] `tests/commands/debug-output.test.ts` — end-to-end stderr-only debug behavior
- [ ] `tests/commands/status-json.test.ts` — debug-enabled JSON purity case

*Existing infrastructure covers the framework and runner; only phase-specific tests are missing.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| `git-stacks manage` starts cleanly with debug enabled | OBSV-05 | Alternate-screen rendering is not reliably asserted by the current automated suite | Run `GIT_STACKS_DEBUG=1 bun run src/index.ts manage`, confirm no debug preamble appears before or during the TUI screen, then exit with `Ctrl+C` |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
