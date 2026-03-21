---
phase: 3
slug: design-and-conditional-implementation
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-18
---

# Phase 3 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | bun:test (Jest-compatible) |
| **Config file** | package.json (`"test"` script) |
| **Quick run command** | `bun test tests/` |
| **Full suite command** | `bun test tests/` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `bun test tests/`
- **After every plan wave:** Run `bun test tests/`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 3-01-01 | 01 | 0 | DESIGN-01 | unit | `bun test tests/lib/registry.test.ts` | ❌ W0 | ⬜ pending |
| 3-01-02 | 01 | 0 | DESIGN-02 | unit | `bun test tests/lib/registry.test.ts` | ❌ W0 | ⬜ pending |
| 3-02-01 | 02 | 1 | REPO-01 | unit | `bun test tests/lib/registry.test.ts` | ❌ W0 | ⬜ pending |
| 3-02-02 | 02 | 1 | REPO-02 | unit | `bun test tests/lib/registry.test.ts` | ❌ W0 | ⬜ pending |
| 3-02-03 | 02 | 1 | REPO-03 | unit | `bun test tests/lib/registry.test.ts` | ❌ W0 | ⬜ pending |
| 3-02-04 | 02 | 1 | REPO-04 | unit | `bun test tests/lib/registry.test.ts` | ❌ W0 | ⬜ pending |
| 3-03-01 | 03 | 2 | TMPL-01 | unit | `bun test tests/lib/template.test.ts` | ❌ W0 | ⬜ pending |
| 3-03-02 | 03 | 2 | TMPL-02 | unit | `bun test tests/lib/template.test.ts` | ❌ W0 | ⬜ pending |
| 3-03-03 | 03 | 2 | TMPL-03 | unit | `bun test tests/lib/template.test.ts` | ❌ W0 | ⬜ pending |
| 3-03-04 | 03 | 2 | TMPL-04 | unit | `bun test tests/lib/template.test.ts` | ❌ W0 | ⬜ pending |
| 3-03-05 | 03 | 2 | TMPL-05 | integration | `bun test tests/lib/template.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/lib/registry.test.ts` — stubs for REPO-01, REPO-02, REPO-03, REPO-04
- [ ] `tests/lib/template.test.ts` — stubs for TMPL-01, TMPL-02, TMPL-03, TMPL-04, TMPL-05
- [ ] `tests/lib/config.test.ts` — update existing fixtures to use `repo` field instead of `stack`

*Existing bun:test infrastructure detected — no framework install needed.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Design decision document quality | DESIGN-01 | Subjective evaluation of rationale depth across 3 workflows | Read `.planning/phases/03-design-and-conditional-implementation/DECISION.md`; verify 3 workflow comparisons present |
| TUI searchable repo picker UX | REPO-01 | Interactive terminal UI cannot be automated in bun:test | Run `git-stacks repo add`, verify filter+select flow works end-to-end |
| Workspace creation with template | TMPL-02 | Requires live filesystem state | Run `git-stacks new --template <name>`, verify worktrees created at correct paths |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
