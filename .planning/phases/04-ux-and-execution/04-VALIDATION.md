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
| 4-UX01-01 | error-formatting | W0 | UX-01 | unit | `bun test tests/lib/errors.test.ts` | ❌ Wave 0 | ⬜ pending |
| 4-UX01-02 | error-formatting | W0 | UX-01 | unit | `bun test tests/lib/errors.test.ts` | ❌ Wave 0 | ⬜ pending |
| 4-UX02-01 | json-output | W1 | UX-02 | integration | `bun test tests/commands/status-json.test.ts` | ❌ Wave 0 | ⬜ pending |
| 4-UX02-02 | json-output | W1 | UX-02 | unit | `bun test tests/commands/doctor-json.test.ts` | ❌ Wave 0 | ⬜ pending |
| 4-UX02-03 | json-output | W1 | UX-02 | integration | `bun test tests/commands/sync-json.test.ts` | ❌ Wave 0 | ⬜ pending |
| 4-UX03-01 | doctor-fix | W1 | UX-03 | integration | `bun test tests/commands/doctor-fix.test.ts` | ❌ Wave 0 | ⬜ pending |
| 4-UX03-02 | doctor-fix | W1 | UX-03 | integration | `bun test tests/commands/doctor-fix.test.ts` | ❌ Wave 0 | ⬜ pending |
| 4-UX03-03 | doctor-fix | W1 | UX-03 | unit | `bun test tests/commands/doctor-fix.test.ts` | ❌ Wave 0 | ⬜ pending |
| 4-UX04-01 | list-columns | W1 | UX-04 | unit | `bun test tests/lib/config.test.ts` | ✅ extend | ⬜ pending |
| 4-UX04-02 | list-columns | W1 | UX-04 | unit | `bun test tests/lib/workspace-ops.test.ts` | ✅ extend | ⬜ pending |
| 4-UX04-03 | list-columns | W1 | UX-04 | integration | `bun test tests/commands/list-columns.test.ts` | ❌ Wave 0 | ⬜ pending |
| 4-RUN01-01 | run-parallel | W2 | RUN-01 | integration | `bun test tests/commands/run-parallel.test.ts` | ❌ Wave 0 | ⬜ pending |
| 4-RUN01-02 | run-parallel | W2 | RUN-01 | integration | `bun test tests/commands/run-parallel.test.ts` | ❌ Wave 0 | ⬜ pending |
| 4-RUN01-03 | run-parallel | W2 | RUN-01 | integration | `bun test tests/commands/run-parallel.test.ts` | ❌ Wave 0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/commands/` — create directory (`mkdirSync`)
- [ ] `tests/lib/errors.test.ts` — unit tests for `formatError` (UX-01)
- [ ] `tests/commands/doctor-json.test.ts` — doctor --json and --fix tests (UX-02, UX-03)
- [ ] `tests/commands/status-json.test.ts` — status --json integration test (UX-02)
- [ ] `tests/commands/sync-json.test.ts` — sync --json integration test (UX-02)
- [ ] `tests/commands/list-columns.test.ts` — list default columns test (UX-04)
- [ ] `tests/commands/run-parallel.test.ts` — run --parallel integration tests (RUN-01)

Existing files to extend (not Wave 0 stubs, but additions):
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

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
