---
phase: 12
slug: workspace-sync
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-21
---

# Phase 12 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | bun:test (Jest-compatible) + testRender from @opentui/solid |
| **Config file** | bunfig.toml with [test] preload for Babel solid transform |
| **Quick run command** | `bun test tests/tui/dashboard/` |
| **Full suite command** | `bun test tests/` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `bun test tests/tui/dashboard/ActionMenu.test.tsx tests/tui/dashboard/SyncProgressView.test.tsx`
- **After every plan wave:** Run `bun test tests/`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 12-01-01 | 01 | 1 | WS-04 | unit | `bun test tests/lib/git.test.ts` | ✅ (extend) | ⬜ pending |
| 12-01-02 | 01 | 1 | WS-04 | unit | `bun test tests/lib/workspace-ops.test.ts` | ✅ (extend) | ⬜ pending |
| 12-02-01 | 02 | 1 | WS-01 | unit | `bun test tests/tui/dashboard/ActionMenu.test.tsx` | ✅ (extend) | ⬜ pending |
| 12-02-02 | 02 | 1 | WS-02 | unit | `bun test tests/tui/dashboard/SyncProgressView.test.tsx` | ❌ W0 | ⬜ pending |
| 12-02-03 | 02 | 1 | WS-03 | unit | `bun test tests/tui/dashboard/SyncProgressView.test.tsx` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/tui/dashboard/SyncProgressView.test.tsx` — stubs for WS-02 (per-repo rows) and WS-03 (summary display)
- [ ] Extend `tests/tui/dashboard/ActionMenu.test.tsx` — add test for `s` key dispatching `"sync"` action (WS-01)
- [ ] Extend `tests/lib/git.test.ts` — verify `fetchOrigin` accepts optional timeout param (WS-04)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| TUI does not hang on unreachable remote | WS-04 | Requires actual network timeout | 1. Disconnect network or use nonexistent remote 2. Run sync 3. Verify error appears within 30s |
| All key bindings blocked during sync | WS-01 | Keyboard guard verified structurally but full UX flow needs manual check | 1. Start sync 2. Press various keys (o, r, tab) 3. Verify no action dispatched |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
