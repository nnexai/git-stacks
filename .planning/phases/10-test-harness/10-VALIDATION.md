---
phase: 10
slug: test-harness
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-21
---

# Phase 10 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | bun:test (Jest-compatible API) |
| **Config file** | `bunfig.toml` (existing) |
| **Quick run command** | `bun test tests/tui/dashboard/` |
| **Full suite command** | `bun test tests/` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `bun test tests/tui/dashboard/`
- **After every plan wave:** Run `bun test tests/`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 10-01-01 | 01 | 1 | T-01 | integration | `bun test tests/tui/dashboard/` | ❌ W0 | ⬜ pending |
| 10-01-02 | 01 | 1 | T-06 | unit | `bun test tests/lib/paths.test.ts` | ❌ W0 | ⬜ pending |
| 10-02-01 | 02 | 2 | T-02, T-03 | component | `bun test tests/tui/dashboard/inline-input.test.tsx` | ❌ W0 | ⬜ pending |
| 10-02-02 | 02 | 2 | T-02, T-04 | component | `bun test tests/tui/dashboard/action-menu.test.tsx` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/tui/dashboard/` — directory for TUI component tests
- [ ] Test helper utilities for `testRender` + `mockInput` wrapper
- [ ] Existing bun:test infrastructure covers framework needs — no new install required

*Existing infrastructure covers framework requirements. Wave 0 creates test directory and helper utilities only.*

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
