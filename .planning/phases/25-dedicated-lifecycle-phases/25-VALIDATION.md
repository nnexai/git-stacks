---
phase: 25
slug: dedicated-lifecycle-phases
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-22
---

# Phase 25 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | bun:test (built-in) |
| **Config file** | none — Bun auto-discovers `*.test.ts` |
| **Quick run command** | `bun test tests/lib/workspace-ops.test.ts` |
| **Full suite command** | `bun test tests/` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `bun test tests/lib/workspace-ops.test.ts`
- **After every plan wave:** Run `bun test tests/`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 25-01-01 | 01 | 1 | Schema: new hook fields in TemplateSchema/WorkspaceSchema | unit | `bun test tests/lib/config.test.ts` | ✅ | ⬜ pending |
| 25-01-02 | 01 | 1 | Schema: per-repo pre_clean in WorkspaceRepoHooksSchema | unit | `bun test tests/lib/config.test.ts` | ✅ | ⬜ pending |
| 25-02-01 | 02 | 1 | closeWorkspace fires pre_close then post_close | integration | `bun test tests/lib/workspace-ops.test.ts` | ✅ | ⬜ pending |
| 25-02-02 | 02 | 1 | closeWorkspace injects WS_TRIGGERED_BY | integration | `bun test tests/lib/workspace-ops.test.ts` | ✅ | ⬜ pending |
| 25-02-03 | 02 | 1 | cleanWorkspace calls closeWorkspace first (cascade) | integration | `bun test tests/lib/workspace-ops.test.ts` | ✅ | ⬜ pending |
| 25-02-04 | 02 | 1 | cleanWorkspace fires pre_clean/post_clean around worktree removal | integration | `bun test tests/lib/workspace-ops.test.ts` | ✅ | ⬜ pending |
| 25-02-05 | 02 | 1 | removeWorkspace calls cleanWorkspace then YAML delete | integration | `bun test tests/lib/workspace-ops.test.ts` | ✅ | ⬜ pending |
| 25-02-06 | 02 | 1 | removeWorkspace fires pre_remove/post_remove around YAML delete | integration | `bun test tests/lib/workspace-ops.test.ts` | ✅ | ⬜ pending |
| 25-03-01 | 03 | 2 | mergeWorkspace fires full D-10 lifecycle order | integration | `bun test tests/lib/workspace-ops.test.ts` | ✅ | ⬜ pending |
| 25-03-02 | 03 | 2 | mergeWorkspace fires pre_merge before git merge | integration | `bun test tests/lib/workspace-ops.test.ts` | ✅ | ⬜ pending |
| 25-04-01 | 04 | 2 | hook failure mid-cascade aborts entire operation (D-03) | integration | `bun test tests/lib/workspace-ops.test.ts` | ✅ | ⬜ pending |
| 25-04-02 | 04 | 2 | per-repo pre_clean fires before that repo's worktree removal | integration | `bun test tests/lib/workspace-ops.test.ts` | ✅ | ⬜ pending |
| 25-04-03 | 04 | 2 | WS_TRIGGERED_BY propagated through cascade | integration | `bun test tests/lib/workspace-ops.test.ts` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements. `workspace-ops.test.ts` already has describe blocks for each lifecycle function. New tests extend existing describe blocks rather than creating new files.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| TUI captured flag propagation | D-04 + TUI | Requires running OpenTUI dashboard | Run `git-stacks manage`, trigger clean/remove from TUI, verify no screen corruption |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
