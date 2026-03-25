---
phase: 33
slug: name-based-identity
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-24
---

# Phase 33 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | bun:test (Jest-compatible) |
| **Config file** | bunfig.toml |
| **Quick run command** | `bun test tests/lib/config.test.ts` |
| **Full suite command** | `bun test tests/` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `bun test tests/lib/config.test.ts`
- **After every plan wave:** Run `bun test tests/`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 33-01-01 | 01 | 1 | IDEN-01 | unit | `bun test tests/lib/config.test.ts` | ✅ | ⬜ pending |
| 33-01-02 | 01 | 1 | IDEN-01 | unit | `bun test tests/lib/config.test.ts` | ✅ | ⬜ pending |
| 33-02-01 | 02 | 1 | IDEN-02 | unit | `bun test tests/lib/config.test.ts` | ✅ | ⬜ pending |
| 33-02-02 | 02 | 1 | IDEN-02 | unit | `bun test tests/lib/config.test.ts` | ✅ | ⬜ pending |
| 33-03-01 | 03 | 2 | IDEN-03 | unit | `bun test tests/lib/workspace-ops.test.ts` | ✅ | ⬜ pending |
| 33-03-02 | 03 | 2 | IDEN-03 | unit | `bun test tests/` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements.

- `tests/lib/config.test.ts` — existing; add scan-based lookup tests
- `tests/lib/workspace-ops.test.ts` — existing; add rename validation tests (if exists, otherwise use config.test.ts)

*No new test files or framework installs required.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Doctor drift report output | IDEN-01, IDEN-02 | Requires a real config dir with drifted YAML | Create workspace YAML with name field that differs from filename; run `git-stacks doctor`; verify drift warning is printed |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
