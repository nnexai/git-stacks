---
phase: 13
slug: wizard-create-workspace
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-03-21
---

# Phase 13 — Validation Strategy

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
| 13-01-01 | 01 | 1 | C-01 | unit | `bun test tests/` | W0 (13-01-02) | ⬜ pending |
| 13-01-02 | 01 | 1 | C-02 | unit | `bun test tests/tui/dashboard/WizardView.test.tsx tests/tui/dashboard/CreateProgressView.test.tsx` | creates | ⬜ pending |
| 13-02-01 | 02 | 2 | C-01 | integration | `bun run typecheck && bun test tests/tui/dashboard/` | 13-01-02 | ⬜ pending |
| 13-02-02 | 02 | 2 | C-03 | integration | `bun run typecheck && bun test tests/tui/dashboard/` | 13-01-02 | ⬜ pending |
| 13-03-01 | 03 | 2 | C-01, C-02, C-03 | integration | `bun run typecheck && bun test tests/tui/dashboard/` | 13-01-02 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `tests/tui/dashboard/WizardView.test.tsx` — created by plan 01 Task 2, covers C-01 (step navigation) and C-02 (back-navigation)
- [x] `tests/tui/dashboard/CreateProgressView.test.tsx` — created by plan 01 Task 2, covers C-01 (progress display) and C-03 (done state)
- [x] Existing test infrastructure covers framework needs

*Plan 01 Task 2 creates both test files as part of Wave 1, satisfying the Wave 0 requirement before Wave 2 plans execute.*

*Existing bun:test infrastructure is in place.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Multi-step wizard visual flow | C-01 | TUI rendering requires visual inspection | Run `bun run dev manage`, press `n`, walk through steps |
| Back-navigation (Escape) | C-02 | Keyboard interaction in terminal | Press Escape at each step, verify return to previous |
| Cursor placement on new entry | C-03 | Visual cursor position in TUI | Create workspace, verify cursor highlights new row |
| No @clack/prompts in wizard | C-03 | grep check | `grep -r "from.*@clack/prompts" src/tui/dashboard/ \| grep -v node_modules` |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 5s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** ready
