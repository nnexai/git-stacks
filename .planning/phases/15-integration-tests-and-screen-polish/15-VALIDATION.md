---
phase: 15
slug: integration-tests-and-screen-polish
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-21
---

# Phase 15 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | bun:test (built-in) |
| **Config file** | `bunfig.toml` (module resolution) + inline test config |
| **Quick run command** | `bun test tests/tui/` |
| **Full suite command** | `bun test tests/` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `bun test tests/tui/`
- **After every plan wave:** Run `bun test tests/`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 15-01-01 | 01 | 1 | T-05 | integration | `bun test tests/tui/integration.test.tsx` | ❌ W0 | ⬜ pending |
| 15-02-01 | 02 | 1 | UI-01 | unit | `bun test tests/tui/help-bar.test.tsx` | ❌ W0 | ⬜ pending |
| 15-02-02 | 02 | 1 | UI-02 | unit | `bun test tests/tui/format-age.test.ts` | ❌ W0 | ⬜ pending |
| 15-02-03 | 02 | 1 | UI-03 | unit | `bun test tests/tui/responsive-columns.test.tsx` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/tui/integration.test.tsx` — stubs for T-05 (end-to-end tab/action/wizard flow)
- [ ] `tests/tui/help-bar.test.tsx` — stubs for UI-01 (80-column help bar fit)
- [ ] `tests/tui/format-age.test.ts` — stubs for UI-02 (relative age formatting)
- [ ] `tests/tui/responsive-columns.test.tsx` — stubs for UI-03 (dynamic column widths)

*Existing test infrastructure (testRender, mockInput, captureCharFrame) covers framework needs.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Visual appearance at 80 columns | UI-01 | Visual inspection of rendered output | Run `git-stacks manage` in 80-col terminal, verify no wrapping |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
