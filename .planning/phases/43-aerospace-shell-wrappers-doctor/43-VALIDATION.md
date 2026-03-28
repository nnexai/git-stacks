---
phase: 43
slug: aerospace-shell-wrappers-doctor
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-28
---

# Phase 43 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | bun:test (Jest-compatible API) |
| **Config file** | `bunfig.toml` (existing) |
| **Quick run command** | `bun test tests/lib/aerospace.test.ts` |
| **Full suite command** | `bun run test` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `bun test tests/lib/aerospace.test.ts`
- **After every plan wave:** Run `bun run test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 43-01-01 | 01 | 1 | WRAP-01 | unit | `bun test tests/lib/aerospace.test.ts` | N/A W0 | pending |
| 43-01-02 | 01 | 1 | WRAP-01 | unit | `bun test tests/lib/aerospace.test.ts` | N/A W0 | pending |
| 43-01-03 | 01 | 1 | WRAP-02 | unit | `bun test tests/lib/aerospace.test.ts` | N/A W0 | pending |
| 43-01-04 | 01 | 1 | WRAP-01 | unit | `bun test tests/lib/aerospace.test.ts` | N/A W0 | pending |
| 43-02-01 | 02 | 1 | WRAP-03 | unit | `bun run typecheck` | existing | pending |
| 43-02-02 | 02 | 1 | WRAP-03 | grep | `grep aerospace src/commands/doctor.ts` | existing | pending |

*Status: pending / green / red / flaky*

---

## Wave 0 Requirements

- [ ] `tests/lib/aerospace.test.ts` — stubs for WRAP-01, WRAP-02
- [ ] Test follows niri.test.ts isolation pattern (local `_exec`, `mock.module` re-apply)

*Existing test infrastructure (bun:test, test-runner.ts) covers framework needs.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Doctor output on macOS | WRAP-03 | Requires macOS platform | Run `git-stacks doctor` on macOS, verify `aerospace` entry appears |

*All other behaviors have automated verification via `_exec` injection and platform mocking.*

---

## Validation Sign-Off

- [ ] All tasks have automated verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
