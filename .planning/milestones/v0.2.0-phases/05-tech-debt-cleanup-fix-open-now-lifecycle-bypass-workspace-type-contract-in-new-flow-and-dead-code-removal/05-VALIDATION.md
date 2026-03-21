---
phase: 5
slug: tech-debt-cleanup-fix-open-now-lifecycle-bypass-workspace-type-contract-in-new-flow-and-dead-code-removal
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-18
---

# Phase 5 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | bun:test (Jest-compatible API) |
| **Config file** | package.json (bun test) |
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
| 5-01-01 | 01 | 1 | lifecycle-bypass | unit | `bun test tests/lib/workspace-ops.test.ts` | ✅ | ⬜ pending |
| 5-01-02 | 01 | 1 | lifecycle-bypass | integration | `bun test tests/` | ✅ | ⬜ pending |
| 5-02-01 | 02 | 1 | type-contract | unit | `bun test tests/` | ✅ | ⬜ pending |
| 5-03-01 | 03 | 1 | dead-code | static | `grep -r "STACKS_DIR" src/ \| wc -l` | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

*Existing infrastructure covers all phase requirements.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| `open now?` prompt triggers full lifecycle | lifecycle-bypass | Interactive TUI flow | Run `bun run dev new`, answer prompts, verify hooks fire |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
