---
phase: 100
slug: manager-tui-command-output-containment
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-05-25
---

# Phase 100 - Validation Strategy

Per-phase validation contract for feedback sampling during execution.

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Bun test through custom runner |
| **Config file** | `scripts/test-runner.ts` |
| **Quick run command** | `bun run test:unit` |
| **Full suite command** | `bun run test` |
| **Estimated runtime** | ~60-120 seconds |

## Sampling Rate

- **After every task commit:** Run the focused test file(s) named by the task, or `bun run test:unit` when the task touches shared command/lifecycle behavior.
- **After every plan wave:** Run `bun run test`.
- **Before `$gsd-verify-work`:** `bun run typecheck` and `bun run test` must pass, or any unrelated pre-existing failures must be documented with evidence.
- **Max feedback latency:** 120 seconds for focused checks; full-suite latency accepted at phase boundary.

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 100-01-01 | 01 | 1 | TOUT-01, TOUT-02 | T-100-01 | No raw stdout/stderr inheritance for non-editor TUI command paths | source/unit | `bun run test:unit` | yes | pending |
| 100-01-02 | 01 | 1 | TOUT-02, TOUT-04 | T-100-02 | Manual command output is captured and failures remain explicit | unit | `bun run test:unit` | yes | pending |
| 100-02-01 | 02 | 2 | TOUT-02, TOUT-04 | T-100-03 | Bounded viewer exposes recent output and stderr distinction without unbounded growth | component | `bun run test:unit` | yes | pending |
| 100-02-02 | 02 | 2 | TOUT-01, TOUT-03 | T-100-04 | Running commands block dismissal; finished commands restore dashboard context | TUI integration | `bun run test:integ` | yes | pending |
| 100-03-01 | 03 | 3 | TOUT-01, TOUT-02, TOUT-03, TOUT-04 | T-100-05 | Long/noisy/failing/no-output scenarios stay inside OpenTUI frame | regression | `bun run test` | yes | pending |

## Wave 0 Requirements

Existing infrastructure covers all phase requirements:

- `tests/tui/dashboard/snapshots/ProgressView.snap.test.tsx`
- `tests/tui/dashboard/issue-actions.test.ts`
- `tests/lib/workspace-command.test.ts`
- `tests/tui/dashboard/` integration tests using `testRender`, `mockInput`, `renderOnce`, and `captureCharFrame`

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Visual screen corruption during a real noisy command | TOUT-01, TOUT-03 | Automated character-frame tests are the primary gate; one real local smoke is useful before release because terminal alternate-screen behavior depends on runtime integration | Run `git-stacks manage`, trigger a noisy manual command or `run` action, verify raw bytes do not appear behind the dashboard and closing returns to the same selected item |

## Validation Sign-Off

- [x] All tasks have automated verify commands or existing test infrastructure.
- [x] Sampling continuity: no 3 consecutive tasks without automated verify.
- [x] Wave 0 covers all required test surfaces.
- [x] No watch-mode flags.
- [x] Feedback latency target documented.
- [x] `nyquist_compliant: true` set in frontmatter.

**Approval:** pending
