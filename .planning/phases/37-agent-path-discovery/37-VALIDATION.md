---
phase: 37
slug: agent-path-discovery
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-03-26
---

# Phase 37 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | bun:test (built-in) |
| **Config file** | bunfig.toml |
| **Quick run command** | `bun test tests/lib/paths-command.test.ts` |
| **Full suite command** | `bun test tests/` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `bun test tests/lib/paths-command.test.ts`
- **After every plan wave:** Run `bun test tests/`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 37-01-01 | 01 | 1 | PATH-01, PATH-02, PATH-04 | unit | `bun test tests/lib/paths-command.test.ts` | ❌ W0 | ⬜ pending |
| 37-01-02 | 01 | 1 | PATH-03 | unit | `bun test tests/lib/paths-command.test.ts` | ❌ W0 | ⬜ pending |
| 37-01-03 | 01 | 1 | PATH-01 | integration | `bun run typecheck` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/lib/paths-command.test.ts` — test file created by Task 1

*Existing test infrastructure covers framework and helpers. Only the new test file is needed.*

---

## Manual-Only Verifications

*All phase behaviors have automated verification.*

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 5s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-03-26
