---
phase: 58
slug: ahead-behind-tracking
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-03
---

# Phase 58 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | bun:test (Jest-compatible API) |
| **Config file** | bunfig.toml |
| **Quick run command** | `bun test tests/lib/git.test.ts` |
| **Full suite command** | `bun run test` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `bun test tests/lib/git.test.ts` (new primitives) or relevant test file
- **After every plan wave:** Run `bun run test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 58-01-01 | 01 | 1 | AB-01 | unit | `bun test tests/lib/git.test.ts` | Exists | pending |
| 58-01-02 | 01 | 1 | AB-07 | unit | `bun test tests/lib/git.test.ts` | Exists | pending |
| 58-02-01 | 02 | 1 | AB-02 | unit | `bun test tests/lib/workspace-ops.test.ts` | Exists | pending |
| 58-02-02 | 02 | 1 | AB-04 | unit | `bun test tests/lib/workspace-ops.test.ts` | Exists | pending |
| 58-03-01 | 03 | 2 | AB-03 | manual | Run `bun run src/index.ts list` and verify columns | N/A | pending |
| 58-03-02 | 03 | 2 | AB-04 | manual | Run `bun run src/index.ts status <ws>` and verify output | N/A | pending |
| 58-04-01 | 04 | 2 | AB-05 | manual | Run `bun run src/index.ts manage` and verify WorkspaceRow | N/A | pending |
| 58-04-02 | 04 | 2 | AB-06 | manual | Run `bun run src/index.ts manage` and verify WorkspaceDetail | N/A | pending |

*Status: pending · green · red · flaky*

---

## Wave 0 Requirements

*Existing infrastructure covers all phase requirements.* Test files `tests/lib/git.test.ts` and `tests/lib/workspace-ops.test.ts` already exist — new test cases are appended.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| CLI list column format | AB-03 | Visual formatting verification | Run `bun run src/index.ts list` on a workspace with commits ahead/behind; verify `↑N ↓N` columns appear |
| CLI status per-repo format | AB-04 | Visual formatting verification | Run `bun run src/index.ts status <ws>` and verify per-repo `↑N ↓N` |
| TUI WorkspaceRow indicators | AB-05 | TUI rendering | Run `bun run src/index.ts manage`; verify `↑N` green, `↓N` yellow after branch name |
| TUI WorkspaceDetail per-repo | AB-06 | TUI rendering | Navigate to workspace detail; verify per-repo ahead/behind in repo table |
| Stale indicator visual | AB-07 | Visual formatting | Test with stale FETCH_HEAD (>15min old); verify `?` suffix and dim styling |

---

## Validation Sign-Off

- [ ] All tasks have automated verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
