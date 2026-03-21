---
phase: 15
slug: integration-tests-and-screen-polish
status: draft
nyquist_compliant: true
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
| 15-01-00 | 01 | 1 | T-05 | stub | `bun test tests/tui/dashboard/integ-tab-switching.test.tsx tests/tui/dashboard/integ-action-menu.test.tsx tests/tui/dashboard/integ-wizard.test.tsx tests/tui/dashboard/integ-sync-progress.test.tsx` | Wave 0 task | pending |
| 15-01-01 | 01 | 1 | UI-01 | unit | `bun run typecheck && bun test tests/tui/dashboard/` | yes (existing) | pending |
| 15-01-02 | 01 | 1 | UI-02, UI-03 | unit | `bun run typecheck && bun test tests/tui/dashboard/` | yes (existing) | pending |
| 15-02-01 | 02 | 2 | T-05, UI-01, UI-02 | integration | `bun test tests/tui/dashboard/integ-tab-switching.test.tsx` | Wave 0 stub | pending |
| 15-02-02 | 02 | 2 | T-05 | integration | `bun test tests/tui/dashboard/integ-action-menu.test.tsx` | Wave 0 stub | pending |
| 15-03-01 | 03 | 2 | T-05 | integration | `bun test tests/tui/dashboard/integ-wizard.test.tsx` | Wave 0 stub | pending |
| 15-03-02 | 03 | 2 | T-05 | integration | `bun test tests/tui/dashboard/integ-sync-progress.test.tsx` | Wave 0 stub | pending |

*Status: pending / green / red / flaky*

---

## Wave 0 Requirements

Wave 0 is handled by Plan 15-01 Task 0 (first task in Wave 1). It creates empty-but-passing `describe()` + `test.todo()` stubs for all four integration test files:

- [x] `tests/tui/dashboard/integ-tab-switching.test.tsx` — stub for T-05 (tab switching), UI-01 (help bar), UI-02 (age display)
- [x] `tests/tui/dashboard/integ-action-menu.test.tsx` — stub for T-05 (action menu dispatch + Remove side-effect)
- [x] `tests/tui/dashboard/integ-wizard.test.tsx` — stub for T-05 (wizard entry/exit)
- [x] `tests/tui/dashboard/integ-sync-progress.test.tsx` — stub for T-05 (sync progress flow)

*Existing test infrastructure (testRender, mockInput, captureCharFrame) covers framework needs.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Visual appearance at 80 columns | UI-01 | Visual inspection of rendered output | Run `git-stacks manage` in 80-col terminal, verify no wrapping |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references (Plan 15-01 Task 0 creates all four stubs)
- [x] No watch-mode flags
- [x] Feedback latency < 5s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** ready
