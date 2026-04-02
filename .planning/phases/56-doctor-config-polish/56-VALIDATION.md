---
phase: 56
slug: doctor-config-polish
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-04-02
---

# Phase 56 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | bun:test (via scripts/test-runner.ts) |
| **Config file** | bunfig.toml |
| **Quick run command** | `bun run typecheck` |
| **Full suite command** | `bun run test` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `bun run typecheck`
- **After every plan wave:** Run `bun run test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 56-01-01 | 01 | 1 | DOC-01 | typecheck + manual | `bun run typecheck` | N/A | pending |
| 56-01-02 | 01 | 1 | CFG-01 | typecheck + manual | `bun run typecheck` | N/A | pending |

*Status: pending*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements. No new test files needed — both changes are:
1. DOC-01: Conditional logic change in doctor.ts (verified by typecheck + manual `git-stacks doctor` run)
2. CFG-01: Static string change in tmux.ts (verified by typecheck + manual `git-stacks integration tmux config example`)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Doctor skips forge CLI check when integration not configured | DOC-01 | CLI output behavior depends on system state and user config | Run `git-stacks doctor` with no forge integrations configured; verify no gh/glab/tea/jira warnings appear |
| Doctor warns about missing forge CLI when integration IS configured | DOC-01 | Requires forge integration enabled in config | Enable a forge integration in config, ensure binary is not on PATH, run `git-stacks doctor`; verify warning appears |
| Tmux configExample shows panes array | CFG-01 | Static string output | Run `git-stacks integration tmux config example`; verify output contains `panes:`, `direction:`, `surfaces:`, `command:` |

---

## Validation Sign-Off

- [x] All tasks have automated verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 15s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
