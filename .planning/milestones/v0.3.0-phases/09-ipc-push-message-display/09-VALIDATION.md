---
phase: 9
slug: ipc-push-message-display
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-20
---

# Phase 9 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | bun:test (Jest-compatible) |
| **Config file** | none — `bun test tests/` |
| **Quick run command** | `bun test tests/lib/messages.test.ts tests/tui/` |
| **Full suite command** | `bun test tests/` |
| **Estimated runtime** | ~3 seconds |

---

## Sampling Rate

- **After every task commit:** Run `bun test tests/lib/messages.test.ts tests/tui/`
- **After every plan wave:** Run `bun test tests/`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 09-01-01 | 01 | 0 | MSG-11, MSG-12 | unit | `bun test tests/tui/messageUtils.test.ts` | ❌ W0 | ⬜ pending |
| 09-01-02 | 01 | 0 | MSG-12 | unit | `bun test tests/tui/useMessages.test.ts` | ❌ W0 | ⬜ pending |
| 09-02-01 | 02 | 1 | MSG-11 | unit | `bun test tests/tui/messageUtils.test.ts` | ❌ W0 | ⬜ pending |
| 09-02-02 | 02 | 1 | MSG-12 | unit | `bun test tests/tui/messageUtils.test.ts` | ❌ W0 | ⬜ pending |
| 09-03-01 | 03 | 2 | MSG-12 | manual | — | Manual | ⬜ pending |
| 09-03-02 | 03 | 2 | MSG-09 | manual | — | Manual | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/tui/` directory — does not exist; create it
- [ ] `tests/tui/messageUtils.test.ts` — covers `formatAge`, `isStale`, `groupBySender`, truncation math (MSG-11, MSG-12)
- [ ] `tests/tui/useMessages.test.ts` — covers load-from-JSONL, IPC push, clearSender refresh (MSG-12)

*Note: `tests/lib/messages.test.ts` already covers the underlying JSONL store — no gaps there.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| IPC push updates reactive state within 1s | MSG-09 | Requires live TUI + socket | 1. Start dashboard. 2. Run `git-stacks message send "test" --workspace ws` in another terminal. 3. Verify message appears in list within 1 second. |
| `c` key in overlay clears focused sender group | MSG-12 | TUI keyboard interaction | 1. Open dashboard with messages. 2. Press `m`. 3. Navigate to sender group. 4. Press `c`. 5. Verify group removed, others remain. |
| `m` key opens message overlay from Workspaces tab | MSG-12 | TUI keyboard interaction | 1. Open dashboard. 2. Select workspace with messages. 3. Press `m`. 4. Verify full-screen overlay shows grouped messages. |
| `Esc` closes message overlay and returns to list | MSG-12 | TUI keyboard interaction | 1. Open message overlay. 2. Press `Esc`. 3. Verify return to workspace list view. |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
