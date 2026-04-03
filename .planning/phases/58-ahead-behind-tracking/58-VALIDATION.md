---
phase: 58
slug: ahead-behind-tracking
status: complete
nyquist_compliant: true
wave_0_complete: true
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
| 58-01-01 | 01 | 1 | AB-01 | unit | `bun test tests/lib/git.test.ts` | Exists | passed |
| 58-01-02 | 01 | 1 | AB-07 | unit | `bun test tests/lib/git.test.ts` | Exists | passed |
| 58-02-01 | 02 | 1 | AB-02 | unit | `bun test tests/lib/workspace-ops.test.ts` | Exists | passed |
| 58-02-02 | 02 | 1 | AB-04 | unit | `bun test tests/lib/workspace-ops.test.ts` | Exists | passed |
| 58-03-01 | 03 | 2 | AB-03 | behavioral | temp-config `bun run src/index.ts list --sort name` | N/A | passed |
| 58-03-02 | 03 | 2 | AB-04 | behavioral | temp-config `bun run src/index.ts status ab-check` | N/A | passed |
| 58-04-01 | 04 | 2 | AB-05 | render | `bun test tests/tui/dashboard/snapshots/WorkspaceRow.snap.test.tsx` | Exists | passed |
| 58-04-02 | 04 | 2 | AB-06 | render | `bun test tests/tui/dashboard/WorkspaceDetail.test.tsx` | Exists | passed |

*Status: pending · green · red · flaky*

---

## Wave 0 Requirements

*Existing infrastructure covers all phase requirements.* Test files `tests/lib/git.test.ts` and `tests/lib/workspace-ops.test.ts` already exist — new test cases are appended.

---

## Manual-Only Verifications

None remaining. CLI output was spot-checked against a temporary real workspace, and both TUI surfaces now have OpenTUI render coverage for stale-aware ahead/behind output.

---

## Validation Sign-Off

- [x] All tasks have automated verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 15s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved
