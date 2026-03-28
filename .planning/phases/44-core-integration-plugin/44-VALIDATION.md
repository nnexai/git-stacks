---
phase: 44
slug: core-integration-plugin
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-03-28
---

# Phase 44 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | bun:test (Bun built-in test runner) |
| **Config file** | bunfig.toml |
| **Quick run command** | `bun test tests/lib/integrations/aerospace.test.ts` |
| **Full suite command** | `bun run test` |
| **Estimated runtime** | ~8 seconds |

---

## Sampling Rate

- **After every task commit:** Run `bun test tests/lib/integrations/aerospace.test.ts`
- **After every plan wave:** Run `bun run test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 44-01-01 | 01 | 1 | DETECT-01, DETECT-02, DETECT-03, DETECT-04, DETECT-05 | unit | `bun test tests/lib/integrations/aerospace.test.ts` | ❌ W0 | ⬜ pending |
| 44-01-02 | 01 | 1 | DETECT-01, DETECT-02, DETECT-03, DETECT-04, DETECT-05 | unit | `bun test tests/lib/integrations/aerospace.test.ts` | ❌ W0 | ⬜ pending |
| 44-02-01 | 02 | 1 | (registration) | integration | `bun test tests/lib/integrations/aerospace.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/lib/integrations/aerospace.test.ts` — test file for all DETECT-01 through DETECT-05
- [ ] Mock setup for `src/lib/aerospace.ts` shell wrappers via `mock.module`

*Existing test infrastructure (bun:test, test runner, helpers) covers framework needs.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| AeroSpace window movement on macOS | DETECT-02 | Requires running AeroSpace compositor on macOS hardware | Open workspace with aerospace enabled, verify windows move to target workspace |

*All other behaviors have automated verification via mocked shell wrappers.*

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 10s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
