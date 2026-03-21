---
phase: 13
slug: wizard-create-workspace
status: draft
nyquist_compliant: false
wave_0_complete: false
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
| 13-01-01 | 01 | 1 | C-01 | unit | `bun test tests/` | ❌ W0 | ⬜ pending |
| 13-01-02 | 01 | 1 | C-02 | unit | `bun test tests/` | ❌ W0 | ⬜ pending |
| 13-02-01 | 02 | 2 | C-01 | integration | `bun test tests/` | ❌ W0 | ⬜ pending |
| 13-02-02 | 02 | 2 | C-03 | integration | `bun test tests/` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/tui/wizard-create.test.ts` — stubs for C-01, C-02, C-03
- [ ] Existing test infrastructure covers framework needs

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

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
