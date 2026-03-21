---
phase: 17
slug: integration-runner
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-21
---

# Phase 17 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | bun:test (Jest-compatible API) |
| **Config file** | bunfig.toml |
| **Quick run command** | `bun test tests/` |
| **Full suite command** | `bun test tests/ && bun run typecheck` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `bun test tests/`
- **After every plan wave:** Run `bun test tests/ && bun run typecheck`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 17-01-01 | 01 | 1 | ORCH-03, ORCH-04, ORCH-05, ORCH-06, ORCH-07 | typecheck + unit | `bun run typecheck && bun test tests/` | ✅ | ⬜ pending |
| 17-01-02 | 01 | 1 | TEST-02 | unit | `bun test tests/lib/runner.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

*Existing infrastructure covers all phase requirements. Runner test file created as part of plan execution.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| --no-ide flag skips IDE integrations | ORCH-07 | CLI flag parsing + runtime behavior | `git-stacks open <ws> --no-ide` and verify IDE not launched |
| --no-cmux flag skips cmux | ORCH-07 | CLI flag parsing + runtime behavior | `git-stacks open <ws> --no-cmux` and verify cmux not launched |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
