---
phase: 91
slug: files-sync-integration-and-machine-output
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-05-16
---

# Phase 91 - Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Bun test |
| **Config file** | `bunfig.toml`, `tsconfig.json` |
| **Quick run command** | `bun test tests/lib/files.test.ts tests/commands/files.test.ts` |
| **Full suite command** | `bun run typecheck && bun run verify:gates` |
| **Estimated runtime** | ~180 seconds |

---

## Sampling Rate

- **After every task commit:** Run the plan-specific focused `bun test ...` command.
- **After every plan wave:** Run `bun test tests/lib/files.test.ts tests/lib/workspace-lifecycle-create.test.ts tests/lib/workspace-ops.test.ts tests/commands/files.test.ts`.
- **Before `$gsd-verify-work`:** `bun run typecheck && bun run verify:gates` must be green or exact unrelated failure output must be recorded.
- **Max feedback latency:** 240 seconds for focused checks.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 91-01-01 | 01 | 1 | FSYNC-09 | T-91-01 | Creation sync refuses unsafe/conflicting targets before declaring workspace ready | lifecycle integration | `bun test tests/lib/workspace-lifecycle-create.test.ts` | yes | pending |
| 91-01-02 | 01 | 1 | FSYNC-09 | T-91-02 | Normal open does not refresh existing sync targets | lifecycle integration | `bun test tests/lib/workspace-ops.test.ts` | yes | pending |
| 91-01-03 | 01 | 1 | FSYNC-09 | T-91-03 | Missing-worktree recreation materializes only missing sync targets | lifecycle integration | `bun test tests/lib/workspace-ops.test.ts` | yes | pending |
| 91-02-01 | 02 | 2 | FSYNC-09 | T-91-04 | JSON mode emits parseable status objects with capped details | command contract | `bun test tests/commands/files.test.ts` | yes | pending |
| 91-02-02 | 02 | 2 | FSYNC-09 | T-91-05 | JSON pull/push reports dryRun/force/results and exits nonzero on refusals | command contract | `bun test tests/commands/files.test.ts` | yes | pending |
| 91-03-01 | 03 | 2 | FSYNC-09, DOCS-01 | T-91-06 | Help/completion exposes command flags without adding TUI scope | command contract | `bun test tests/lib/completion-generator.test.ts tests/commands/files.test.ts` | yes | pending |
| 91-03-02 | 03 | 2 | DOCS-01 | T-91-07 | README documents conservative manual sync and destructive force warning | docs review | `bun test tests/commands/files.test.ts && bun run typecheck` | yes | pending |
| 91-04-01 | 04 | 3 | FSYNC-09, DOCS-01 | T-91-08 | Final focused gates and project gates are recorded | phase gate | `bun test tests/lib/files.test.ts tests/lib/workspace-lifecycle-create.test.ts tests/lib/workspace-ops.test.ts tests/commands/files.test.ts tests/lib/completion-generator.test.ts && bun run typecheck && bun run verify:gates` | yes | pending |

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements:

- `tests/lib/files.test.ts`
- `tests/lib/workspace-lifecycle-create.test.ts`
- `tests/lib/workspace-ops.test.ts`
- `tests/commands/files.test.ts` from Phase 90
- `tests/lib/completion-generator.test.ts`
- `tests/helpers.ts`

---

## Manual-Only Verifications

All phase behaviors have automated verification. README content is source-assertable and reviewed through plan acceptance criteria.

---

## Validation Sign-Off

- [x] All tasks have automated verify commands.
- [x] Sampling continuity: no 3 consecutive tasks without automated verify.
- [x] Wave 0 covers all missing references.
- [x] No watch-mode flags.
- [x] Feedback latency target is under 240 seconds for focused checks.
- [x] `nyquist_compliant: true` set in frontmatter.

**Approval:** pending execution

