---
phase: 38
slug: multi-repo-pull
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-26
---

# Phase 38 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | bun:test (Jest-compatible API) |
| **Config file** | `bunfig.toml` |
| **Quick run command** | `bun test tests/lib/pull.test.ts` |
| **Full suite command** | `bun test tests/` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `bun test tests/lib/pull.test.ts`
- **After every plan wave:** Run `bun test tests/`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 38-01-01 | 01 | 1 | PULL-01 | unit | `bun test tests/lib/pull.test.ts` | ❌ W0 | ⬜ pending |
| 38-01-02 | 01 | 1 | PULL-02 | unit | `bun test tests/lib/pull.test.ts` | ❌ W0 | ⬜ pending |
| 38-01-03 | 01 | 1 | PULL-03 | unit | `bun test tests/lib/pull.test.ts` | ❌ W0 | ⬜ pending |
| 38-01-04 | 01 | 1 | PULL-04 | unit | `bun test tests/lib/pull.test.ts` | ❌ W0 | ⬜ pending |
| 38-01-05 | 01 | 1 | PULL-05 | unit | `bun test tests/lib/pull.test.ts` | ❌ W0 | ⬜ pending |
| 38-01-06 | 01 | 1 | PULL-06 | integration | `bun test tests/lib/pull.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/lib/pull.test.ts` — stubs for PULL-01 through PULL-06
- Existing infrastructure (helpers.ts, makeGitRepo, useIsolatedConfig) covers fixture setup

*Existing test infrastructure covers all fixture requirements. Only the test file itself needs creation.*

---

## Manual-Only Verifications

*All phase behaviors have automated verification.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
