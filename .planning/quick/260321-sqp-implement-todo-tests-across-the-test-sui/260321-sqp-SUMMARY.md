---
phase: quick-260321-sqp
plan: "01"
subsystem: tests
tags: [tests, cli, doctor, workspace, subprocess-isolation]
dependency_graph:
  requires: []
  provides: [test-coverage-doctor-json, test-coverage-doctor-fix, test-coverage-status-json, test-coverage-sync-json, test-coverage-list-columns, test-coverage-run-parallel]
  affects: [tests/commands/]
tech_stack:
  added: []
  patterns: [subprocess-spawning-with-GIT_STACKS_CONFIG_DIR, real-git-repos-in-tmp]
key_files:
  created: []
  modified:
    - tests/commands/doctor-json.test.ts
    - tests/commands/doctor-fix.test.ts
    - tests/commands/status-json.test.ts
    - tests/commands/sync-json.test.ts
    - tests/commands/list-columns.test.ts
    - tests/commands/run-parallel.test.ts
decisions:
  - Subprocess spawning with GIT_STACKS_CONFIG_DIR used for all tests — avoids Bun module cache sharing across test files
  - Real git repos created in temp dirs for commands that call isRepoDirty/isRepoDirty (status, list, run-parallel)
  - run --parallel flags must precede positional <name> arg due to passThroughOptions() — "--parallel my-ws --" not "my-ws --parallel --"
  - Doctor fix tests verify prompt rendered (not "Cancelled.") since clack prompts don't respond to piped stdin in non-TTY mode
  - run --parallel flush test uses a real script file instead of sh -c compound commands to avoid double-shell interpretation issues
metrics:
  duration: "~7 minutes"
  completed: "2026-03-21"
  tasks_completed: 3
  files_modified: 6
---

# Phase quick-260321-sqp Plan 01: Implement TODO Tests Summary

**One-liner:** Replaced all 28 `test.todo` stubs across 6 test files with real subprocess-based CLI integration tests using GIT_STACKS_CONFIG_DIR isolation.

## What Was Built

All 28 TODO tests (plus 2 extra variant tests = 30 total) implemented across 6 test files:

| File | Tests | What It Covers |
|------|-------|----------------|
| `doctor-json.test.ts` | 5 | JSON shape `{healthy, issues}`, healthy flag, Issue interface compliance, no human text contamination |
| `doctor-fix.test.ts` | 6 | Confirmation prompt, `--force` bypass, failure continuation, N/M summary, `no auto-fix` annotation, JSON+fix output |
| `status-json.test.ts` | 4 | JSON array shape, per-repo detail, `task_path` field, no human text contamination |
| `sync-json.test.ts` | 4 | Per-repo fields, result enum values (`up-to-date/rebased/merged/failed`), `--all` array output |
| `list-columns.test.ts` | 5 | Branch column, repo count column, last-opened age, dirty indicator `~`, `--status` backward compat |
| `run-parallel.test.ts` | 6 | Simultaneous execution, checkmark/cross display, failed output flushing, exit codes 0/1, JSON array shape, per-entry fields |

## Implementation Strategy

All tests use subprocess spawning via `Bun.spawnSync` with `GIT_STACKS_CONFIG_DIR` env var pointing at a temp config directory. This approach:
- Avoids Bun module cache sharing issues between test files in the same test run
- Tests the actual CLI binary end-to-end (not mocked internals)
- Provides clean isolation with temp dirs created in `beforeEach` and cleaned up in `afterEach`

Commands that call `isRepoDirty` (status, list, run-parallel) require real git repos at the `task_path` — created via `makeGitRepo` using `git init` + initial commit.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Doctor fix test: "Cancelled." not emitted to piped stdout**
- **Found during:** Task 1 (doctor-fix tests)
- **Issue:** `@clack/prompts` confirmation prompt doesn't respond to piped stdin in non-TTY mode — "Cancelled." never printed
- **Fix:** Changed assertion to verify the confirmation prompt was rendered (`"fixes available. Execute all?"`) instead of post-cancellation text
- **Files modified:** `tests/commands/doctor-fix.test.ts`

**2. [Rule 1 - Bug] run --parallel flags before positional arg required**
- **Found during:** Task 3 (run-parallel tests)
- **Issue:** `passThroughOptions()` on the `run` command causes commander to treat `--parallel` as the optional `[repo]` argument when placed after `<name>` (e.g., `run my-ws --parallel` → "Repo '--parallel' not found")
- **Fix:** Reordered CLI args to `["run", "--parallel", ...extraArgs, wsName, "--", ...cmd]`
- **Files modified:** `tests/commands/run-parallel.test.ts`

**3. [Rule 1 - Bug] sh -c double-shell interpretation in flush test**
- **Found during:** Task 3 (run-parallel flush test)
- **Issue:** Passing `["sh", "-c", "echo errout; exit 1"]` after `--` creates `shellCmd = "sh -c echo errout; exit 1"` which then runs as `sh -c "sh -c echo errout; exit 1"`. The nested invocation doesn't behave as expected.
- **Fix:** Write a temporary shell script file at a known path and pass the script path as the command arg
- **Files modified:** `tests/commands/run-parallel.test.ts`

**4. [Rule 2 - Missing] status --json requires real git repos**
- **Found during:** Task 2 (status-json tests)
- **Issue:** `getWorkspaceListInfo`/`getWorkspaceStatus` call `isRepoDirty` which runs `git -C <path> status --porcelain` — requires a valid git repo at `task_path`
- **Fix:** Added `makeGitRepo()` helper to all affected test setups (status, list, run-parallel)
- **Files modified:** `tests/commands/status-json.test.ts`, `tests/commands/list-columns.test.ts`, `tests/commands/run-parallel.test.ts`

## Known Stubs

None — all tests make real CLI invocations and verify actual outputs.

## Self-Check

Files created/modified verified:
- `tests/commands/doctor-json.test.ts` — exists, 5 passing tests
- `tests/commands/doctor-fix.test.ts` — exists, 6 passing tests
- `tests/commands/status-json.test.ts` — exists, 4 passing tests
- `tests/commands/sync-json.test.ts` — exists, 4 passing tests
- `tests/commands/list-columns.test.ts` — exists, 5 passing tests
- `tests/commands/run-parallel.test.ts` — exists, 6 passing tests

All 341 tests pass (bun test tests/), 0 regressions.

## Self-Check: PASSED
