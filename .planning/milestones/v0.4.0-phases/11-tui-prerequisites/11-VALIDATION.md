---
phase: 11
slug: tui-prerequisites
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-21
---

# Phase 11 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | bun:test (Bun 1.3.10 built-in) |
| **Config file** | bunfig.toml — `[test]` section `preload = ["@opentui/solid/preload"]` |
| **Quick run command** | `bun test tests/tui/dashboard/InlineInput.test.tsx` |
| **Full suite command** | `bun test tests/` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `bun test tests/tui/dashboard/InlineInput.test.tsx` (P-01) or `bun test tests/lib/lifecycle.test.ts` (P-02)
- **After every plan wave:** Run `bun test tests/`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 11-01-01 | 01 | 1 | P-01 | unit | `bun test tests/tui/dashboard/InlineInput.test.tsx` | ✅ (update needed) | ⬜ pending |
| 11-01-02 | 01 | 1 | P-01 (cursor) | unit | `bun test tests/tui/dashboard/InlineInput.test.tsx` | ❌ W0 (new test) | ⬜ pending |
| 11-02-01 | 02 | 1 | P-02 | unit | `bun test tests/lib/lifecycle.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/lib/lifecycle.test.ts` — stubs for P-02 (runHooksCaptured stdout, stderr, failure behavior, empty commands)
- [ ] New test case in `tests/tui/dashboard/InlineInput.test.tsx` — covers cursor movement (left-arrow + mid-string insert)

*Existing `tests/tui/dashboard/InlineInput.test.tsx` has 6 tests; file exists but needs 1 new test and updates to all 6 for the new `<input>`-based component.*

---

## Manual-Only Verifications

*All phase behaviors have automated verification.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
