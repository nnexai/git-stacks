---
phase: 4
slug: ux-and-execution
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-18
---

# Phase 4 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | bun:test (bun 1.3.10) |
| **Config file** | none — `bun test tests/` |
| **Quick run command** | `bun test tests/lib/workspace-ops.test.ts` |
| **Full suite command** | `bun test tests/` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run the specific new test file for that task (e.g., `bun test tests/lib/errors.test.ts`)
- **After every plan wave:** Run `bun test tests/`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** ~10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 4-W0-00 | 04-01 | W0 | all | stub | `bun test tests/commands/` | Plan 04-01 Task 0 creates | pending |
| 4-UX01-01 | 04-01 | W1 | UX-01 | unit | `bun test tests/lib/errors.test.ts` | Plan 04-01 Task 1 creates | pending |
| 4-UX01-02 | 04-01 | W1 | UX-01 | unit | `bun test tests/lib/errors.test.ts` | Plan 04-01 Task 1 creates | pending |
| 4-UX02-01 | 04-02 | W2 | UX-02 | integration | `bun test tests/commands/status-json.test.ts` | stub from W0 | pending |
| 4-UX02-02 | 04-03 | W2 | UX-02 | unit | `bun test tests/commands/doctor-json.test.ts` | stub from W0 | pending |
| 4-UX02-03 | 04-04 | W3 | UX-02 | integration | `bun test tests/commands/sync-json.test.ts` | stub from W0 | pending |
| 4-UX03-01 | 04-03 | W2 | UX-03 | integration | `bun test tests/commands/doctor-fix.test.ts` | stub from W0 | pending |
| 4-UX03-02 | 04-03 | W2 | UX-03 | integration | `bun test tests/commands/doctor-fix.test.ts` | stub from W0 | pending |
| 4-UX03-03 | 04-03 | W2 | UX-03 | unit | `bun test tests/commands/doctor-fix.test.ts` | stub from W0 | pending |
| 4-UX04-01 | 04-02 | W2 | UX-04 | unit | `bun test tests/lib/config.test.ts` | extend existing | pending |
| 4-UX04-02 | 04-02 | W2 | UX-04 | unit | `bun test tests/lib/workspace-ops.test.ts` | extend existing | pending |
| 4-UX04-03 | 04-02 | W2 | UX-04 | integration | `bun test tests/commands/list-columns.test.ts` | stub from W0 | pending |
| 4-RUN01-01 | 04-04 | W3 | RUN-01 | integration | `bun test tests/commands/run-parallel.test.ts` | stub from W0 | pending |
| 4-RUN01-02 | 04-04 | W3 | RUN-01 | integration | `bun test tests/commands/run-parallel.test.ts` | stub from W0 | pending |
| 4-RUN01-03 | 04-04 | W3 | RUN-01 | integration | `bun test tests/commands/run-parallel.test.ts` | stub from W0 | pending |

*Status: pending / green / red / flaky*

---

## Wave 0 Requirements

Wave 0 is handled by **Plan 04-01, Task 0** which creates all stub test files before any implementation begins.

- [x] `tests/commands/` — created by Plan 04-01 Task 0
- [x] `tests/commands/status-json.test.ts` — stub with `test.todo()` entries (UX-02)
- [x] `tests/commands/doctor-json.test.ts` — stub with `test.todo()` entries (UX-02)
- [x] `tests/commands/doctor-fix.test.ts` — stub with `test.todo()` entries (UX-03)
- [x] `tests/commands/sync-json.test.ts` — stub with `test.todo()` entries (UX-02)
- [x] `tests/commands/list-columns.test.ts` — stub with `test.todo()` entries (UX-04)
- [x] `tests/commands/run-parallel.test.ts` — stub with `test.todo()` entries (RUN-01)

> Note: Checkboxes above are marked as planned (will be created by Task 0). Set `wave_0_complete: true` in frontmatter after Plan 04-01 Task 0 executes successfully.

Existing files to extend (not Wave 0 stubs, but additions by Plan 04-02):
- `tests/lib/config.test.ts` — add schema backward-compat test for `last_opened?: string`
- `tests/lib/workspace-ops.test.ts` — add `repoCount` field test in `getWorkspaceListInfo`

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| p.spinner() single-stream behavior during parallel run | RUN-01 | Terminal output is visual/interactive | Run `git-stacks run <ws> echo hello --parallel` and verify one spinner + per-repo output lines |
| Error message context in terminal | UX-01 | Prose formatting requires visual inspection | Trigger a known error and verify repo name, operation, and hint appear |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Wave 0 stubs created by Plan 04-01 Task 0 (first task in first plan)
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending — set `wave_0_complete: true` after Plan 04-01 Task 0 runs
