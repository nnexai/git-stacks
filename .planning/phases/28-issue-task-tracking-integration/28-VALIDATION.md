---
phase: 28
slug: issue-task-tracking-integration
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-22
---

# Phase 28 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | bun:test (Jest-compatible API) |
| **Config file** | none — Bun's built-in test runner |
| **Quick run command** | `bun test tests/lib/integrations/` |
| **Full suite command** | `bun test tests/` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `bun test tests/lib/integrations/`
- **After every plan wave:** Run `bun test tests/`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 28-01-01 | 01 | 1 | issue-utils shared module | unit | `bun test tests/lib/integrations/issue-utils.test.ts` | ❌ W0 | ⬜ pending |
| 28-02-01 | 02 | 2 | github issue commands | unit | `bun test tests/lib/integrations/github.test.ts` | ❌ W0 | ⬜ pending |
| 28-02-02 | 02 | 2 | gitlab issue commands | unit | `bun test tests/lib/integrations/gitlab.test.ts` | ❌ W0 | ⬜ pending |
| 28-02-03 | 02 | 2 | gitea issue commands | unit | `bun test tests/lib/integrations/gitea.test.ts` | ❌ W0 | ⬜ pending |
| 28-03-01 | 03 | 2 | jira integration | unit | `bun test tests/lib/integrations/jira.test.ts` | ❌ W0 | ⬜ pending |
| 28-04-01 | 04 | 3 | doctor checks | unit | `bun test tests/lib/integrations/` | ✅ existing | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/lib/integrations/issue-utils.test.ts` — stubs for resolveIssueRef, linkIssue, unlinkIssue
- [ ] `tests/lib/integrations/jira.test.ts` — stubs for Jira integration commands

*Existing test infrastructure covers framework setup. Test files for github/gitlab/gitea may already exist from Phase 27.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| `gh issue view <id> --web` opens browser | issue open github | Requires browser + GitHub auth | Run `git-stacks integration github issue open <ws>` with linked issue |
| `glab issue view <id> --web` opens browser | issue open gitlab | Requires browser + GitLab auth | Run `git-stacks integration gitlab issue open <ws>` with linked issue |
| `jira open <key>` opens browser | issue open jira | Requires browser + Jira auth | Run `git-stacks integration jira issue open <ws>` with linked issue |
| tea JSON URL extraction | issue open gitea | Requires live Gitea instance | Run `git-stacks integration gitea issue open <ws>` with linked issue |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
