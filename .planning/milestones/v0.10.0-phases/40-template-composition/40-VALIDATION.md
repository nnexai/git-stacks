---
phase: 40
slug: template-composition
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-26
---

# Phase 40 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | bun:test (Jest-compatible API) |
| **Config file** | bunfig.toml |
| **Quick run command** | `bun test tests/lib/composition.test.ts` |
| **Full suite command** | `bun test tests/` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `bun test tests/lib/composition.test.ts`
- **After every plan wave:** Run `bun test tests/`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 40-01-01 | 01 | 1 | COMP-01, COMP-07 | unit | `bun test tests/lib/composition.test.ts` | ❌ W0 | ⬜ pending |
| 40-01-02 | 01 | 1 | COMP-03, COMP-04, COMP-05 | unit | `bun test tests/lib/composition.test.ts` | ❌ W0 | ⬜ pending |
| 40-01-03 | 01 | 1 | COMP-06 | unit | `bun test tests/lib/composition.test.ts` | ❌ W0 | ⬜ pending |
| 40-02-01 | 02 | 1 | COMP-02 | unit | `bun test tests/lib/composition.test.ts` | ❌ W0 | ⬜ pending |
| 40-02-02 | 02 | 1 | COMP-01, COMP-02 | integration | `bun test tests/lib/composition.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/lib/composition.test.ts` — test stubs for COMP-01 through COMP-07

*Existing test infrastructure (bun:test, helpers.ts) covers framework requirements.*

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
