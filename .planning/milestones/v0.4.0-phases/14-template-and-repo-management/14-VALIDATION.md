---
phase: 14
slug: template-and-repo-management
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-21
---

# Phase 14 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | bun:test (Jest-compatible) + `testRender` from `@opentui/solid` |
| **Config file** | `bunfig.toml` — `[test]` preload applies Babel solid transform |
| **Quick run command** | `bun test tests/tui/dashboard/` |
| **Full suite command** | `bun test tests/` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `bun test tests/tui/dashboard/`
- **After every plan wave:** Run `bun test tests/`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 14-01-01 | 01 | 1 | R-01 | unit | `bun test tests/tui/dashboard/RepoActionMenu.test.tsx` | ❌ W0 | ⬜ pending |
| 14-01-02 | 01 | 1 | R-01 | unit | `bun test tests/tui/dashboard/RepoActionMenu.test.tsx` | ❌ W0 | ⬜ pending |
| 14-01-03 | 01 | 1 | R-01 | unit | `bun test tests/tui/dashboard/RepoActionMenu.test.tsx` | ❌ W0 | ⬜ pending |
| 14-02-01 | 02 | 1 | R-04 | unit | `bun test tests/tui/dashboard/RemoveBlockedView.test.tsx` | ❌ W0 | ⬜ pending |
| 14-03-01 | 03 | 1 | C-04 | unit | `bun test tests/tui/dashboard/WizardView.test.tsx` | ✅ extend | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/tui/dashboard/RepoActionMenu.test.tsx` — covers R-01 (render, keyboard shortcuts, selection-aware labels, Escape cancel)
- [ ] `tests/tui/dashboard/RemoveBlockedView.test.tsx` — covers R-04 blocked path (renders references, Escape calls onBack)
- Note: `WizardView.test.tsx` already exists — extend for template-create-specific validation if warranted

*Existing infrastructure covers framework and config; only new test files needed.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| `renderer.suspend()` for repo scan | R-03 | Requires real terminal/PTY | Run `git-stacks manage`, go to Repos tab, press Enter → Scan, verify terminal suspends and resumes |
| InlineInput path existence indicator | R-02 | Visual verification of indicator rendering | Add a repo path, verify green/red indicator matches `fs.existsSync()` |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
