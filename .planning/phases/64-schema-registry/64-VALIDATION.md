---
phase: 64
slug: schema-registry
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-04
---

# Phase 64 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | bun:test (via custom runner scripts/test-runner.ts) |
| **Config file** | bunfig.toml |
| **Quick run command** | `bun test tests/lib/config.test.ts tests/lib/detect.test.ts` |
| **Full suite command** | `bun run test` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `bun test tests/lib/config.test.ts tests/lib/detect.test.ts`
- **After every plan wave:** Run `bun run test`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 64-01-01 | 01 | 1 | SCHM-01 | — | N/A | unit | `bun test tests/lib/config.test.ts` | ✅ | ⬜ pending |
| 64-01-02 | 01 | 1 | SCHM-02 | — | N/A | unit | `bun test tests/lib/config.test.ts` | ✅ | ⬜ pending |
| 64-02-01 | 02 | 1 | REG-01 | — | N/A | unit | `bun test tests/lib/detect.test.ts` | ✅ | ⬜ pending |
| 64-02-02 | 02 | 1 | REG-02 | — | N/A | unit | `bun test tests/lib/detect.test.ts` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements. `tests/lib/config.test.ts` and `tests/lib/detect.test.ts` already exist with the isolation patterns needed.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| repo add accepts non-git path | REG-01 | CLI integration | Run `git-stacks repo add /tmp/test-dir` and verify registry entry |
| repo scan shows plain dirs | REG-02 | Interactive TUI | Run `git-stacks repo scan` in a directory with plain dirs |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
