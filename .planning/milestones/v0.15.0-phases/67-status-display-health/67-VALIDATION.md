---
phase: 67
slug: status-display-health
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-04
---

# Phase 67 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | bun:test (custom runner for mock isolation) |
| **Config file** | `scripts/test-runner.ts` |
| **Quick run command** | `bun run test` |
| **Full suite command** | `bun run test` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `bun run test`
- **After every plan wave:** Run `bun run test`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 67-01-01 | 01 | 1 | DISP-01 | — | N/A | unit | `bun run test` | ❌ W0 | ⬜ pending |
| 67-01-02 | 01 | 1 | DISP-02 | — | N/A | unit | `bun run test` | ❌ W0 | ⬜ pending |
| 67-01-03 | 01 | 1 | DISP-03 | — | N/A | unit | `bun run test` | ❌ W0 | ⬜ pending |
| 67-02-01 | 02 | 1 | HLTH-01 | — | N/A | unit | `bun run test` | ❌ W0 | ⬜ pending |
| 67-02-02 | 02 | 1 | HLTH-02 | — | N/A | unit | `bun run test` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/lib/workspace-ops.test.ts` — extend existing status tests for dir repo display
- [ ] `tests/lib/doctor.test.ts` — stubs for dir repo health checks (HLTH-01, HLTH-02)

*Existing infrastructure covers test framework requirements.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| TUI dashboard shows "dir" indicator | DISP-03 | Requires visual TUI rendering | Run `git-stacks manage`, open workspace with dir repo, verify "dir" badge visible |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
