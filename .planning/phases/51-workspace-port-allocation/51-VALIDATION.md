---
phase: 51
slug: workspace-port-allocation
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-04-01
---

# Phase 51 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | bun:test (Jest-compatible API) |
| **Config file** | `scripts/test-runner.ts` (isolated runner) |
| **Quick run command** | `bun test tests/lib/ports.test.ts` |
| **Full suite command** | `bun run test` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `bun test tests/lib/ports.test.ts`
- **After every plan wave:** Run `bun run test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 51-01-01 | 01 | 1 | PORT-WRITE-01 | unit | `bun test tests/lib/config.test.ts` | yes (added in Plan 01 Task 1) | pending |
| 51-01-02 | 01 | 1 | PORT-SCHEMA-01 | unit | `bun test tests/lib/config.test.ts` | yes (added in Plan 01 Task 1) | pending |
| 51-01-03 | 01 | 1 | PORT-SCHEMA-02 | unit | `bun test tests/lib/config.test.ts` | yes (added in Plan 01 Task 1) | pending |
| 51-02-01 | 02 | 2 | PORT-ALLOC-01 | unit | `bun test tests/lib/ports.test.ts` | created in Plan 02 Task 1 | pending |
| 51-02-02 | 02 | 2 | PORT-ALLOC-02 | unit | `bun test tests/lib/ports.test.ts` | created in Plan 02 Task 1 | pending |
| 51-03-01 | 03 | 3 | PORT-INJECT-01 | unit | `bun test tests/lib/workspace-ops.test.ts` | yes (added in Plan 03 Task 1) | pending |
| 51-03-02 | 03 | 3 | PORT-INJECT-02 | unit | `bun test tests/lib/ports.test.ts` | created in Plan 02 Task 1 | pending |
| 51-04-01 | 04 | 3 | PORT-WIZARD-01 | unit | `bun run typecheck` | N/A (TUI prompt, manual verify) | pending |
| 51-04-02 | 04 | 3 | PORT-TEMPLATE-01 | unit | `bun test tests/lib/composition.test.ts` | yes (existing) | pending |
| 51-04-03 | 04 | 3 | PORT-FREE-01 | review | N/A (confirmed by code review in Plan 03) | N/A | pending |

*Status: pending / green / red / flaky*

---

## Wave 0 Requirements

All Wave 0 gaps are addressed within the plans that need them:

- [x] `tests/lib/config.test.ts` — PORT-WRITE-01 fsync test and PORT-SCHEMA-01/02 schema tests created in Plan 01 Task 1
- [x] `tests/lib/ports.test.ts` — PORT-ALLOC-01, PORT-ALLOC-02, PORT-INJECT-02 tests created in Plan 02 Task 1 (TDD: tests written before implementation)
- [x] `tests/lib/workspace-ops.test.ts` — PORT-INJECT-01 mergeEnv port injection tests created in Plan 03 Task 1

*No separate Wave 0 plan needed — test creation is folded into each plan's implementation task.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Concurrent open race safety | PORT-ALLOC-02 | Requires two parallel `git-stacks open` invocations | Open two terminals, run `git-stacks open ws1` and `git-stacks open ws2` simultaneously; verify no overlapping ports |
| Wizard port prompt UX | PORT-WIZARD-01 | Interactive TUI prompt | Run `git-stacks new`, verify port name prompt appears and accepts comma-separated input |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 15s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending execution
