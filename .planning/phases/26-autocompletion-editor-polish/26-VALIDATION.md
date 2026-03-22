---
phase: 26
slug: autocompletion-editor-polish
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-22
---

# Phase 26 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | bun:test (Jest-compatible API) |
| **Config file** | bunfig.toml |
| **Quick run command** | `bun test tests/` |
| **Full suite command** | `bun test tests/` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `bun test tests/`
- **After every plan wave:** Run `bun test tests/`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 26-01-01 | 01 | 1 | completion | unit | `bun test tests/lib/completion-generator.test.ts` | ✅ | ⬜ pending |
| 26-02-01 | 02 | 1 | editor | unit | `bun test tests/lib/workspace-ops.test.ts` | ✅ | ⬜ pending |
| 26-03-01 | 03 | 2 | lifecycle | unit | `bun test tests/lib/workspace-ops.test.ts` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

*Existing infrastructure covers all phase requirements.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Shell completion output correct for bash/zsh/fish | completion | Generated scripts are shell-specific | Run `bun run src/index.ts completion bash` and verify `--from` produces template names |
| $EDITOR opens correct file | editor | Requires interactive terminal | Run `git-stacks edit <name> --yaml` and verify correct file opens |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
