---
phase: 20
slug: niri-integration
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-22
---

# Phase 20 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | bun:test (Jest-compatible API) |
| **Config file** | bunfig.toml |
| **Quick run command** | `bun test tests/lib/integrations/niri.test.ts` |
| **Full suite command** | `bun test tests/ && bun run typecheck` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `bun test tests/lib/integrations/niri.test.ts`
- **After every plan wave:** Run `bun test tests/ && bun run typecheck`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 20-01-01 | 01 | 1 | NIRI-01, NIRI-02, NIRI-04, NIRI-08, NIRI-09, TEST-04 | unit | `bun test tests/lib/integrations/niri.test.ts` | ❌ W0 | ⬜ pending |
| 20-01-02 | 01 | 1 | NIRI-03 | unit + typecheck | `bun test tests/ && bun run typecheck` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/lib/integrations/niri.test.ts` — test stubs for niri integration (created as part of plan execution)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Windows actually move to niri workspace | NIRI-02 | Requires running niri compositor | Open workspace, verify windows on named workspace |
| Idempotency on re-open | NIRI-04 | Requires running niri compositor | Open same workspace twice, verify no duplicates |
| Commands array executes | NIRI-09 | Requires configured commands | Set commands in config, open workspace, verify execution |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
