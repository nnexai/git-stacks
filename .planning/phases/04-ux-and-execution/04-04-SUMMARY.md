---
phase: 04-ux-and-execution
plan: "04"
subsystem: cli
tags: [bun, spawn, parallel, json, concurrent, run, sync]

# Dependency graph
requires:
  - phase: 04-01
    provides: formatError, error handling infrastructure
  - phase: 04-02
    provides: list/status --json patterns, syncWorkspace function
provides:
  - run --parallel concurrent multi-repo execution via Promise.all + Bun.spawn with pipe capture
  - run --parallel --json per-repo JSON array (repo, exit_code, stdout, stderr)
  - sync --json per-repo sync result JSON (workspace, repos with name/strategy/result/commits_behind_before/error)
  - sync --all --json array of per-workspace results
affects: [future CLI consumers, CI/agent workflow integrations]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Bun parallel capture: Bun.spawn with stdio ["inherit","pipe","pipe"] + new Response(proc.stdout).text()
    - Promise.all for concurrent multi-repo operations with aggregated exit code
    - JSON guard at top of action before any human-readable output (guarantees clean JSON)

key-files:
  created: []
  modified:
    - src/commands/workspace.ts

key-decisions:
  - "run --parallel uses single spinner (not per-repo) — @clack/prompts is single-stream only"
  - "run --parallel human mode: passing repo output discarded, only failed repos flushed with --- separator"
  - "sync --json: no onProgress callback passed to syncWorkspace — prevents human lines leaking into JSON"
  - "sync --json result field: up-to-date (0 commits), rebased/merged (>0 commits by strategy), failed (skipped list)"

patterns-established:
  - "JSON guard: --json block at top of action before existing human output logic"
  - "Parallel Bun capture: stdio pipe + new Response(proc.stdout).text() for async stream reading"
  - "Aggregated exit: process.exit(results.some(r => r.exit_code !== 0) ? 1 : 0)"

requirements-completed: [UX-02, RUN-01]

# Metrics
duration: 2min
completed: 2026-03-18
---

# Phase 04 Plan 04: Parallel Run and Sync JSON Summary

**Concurrent multi-repo `run --parallel` via Promise.all + Bun.spawn pipe capture, and machine-readable `sync --json` output matching CONTEXT.md spec**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-18T21:15:51Z
- **Completed:** 2026-03-18T21:17:33Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments
- `run --parallel` executes all worktree repos concurrently using `Promise.all` + `Bun.spawn` with stdout/stderr pipe capture
- `run --parallel` human mode shows single spinner during execution, per-repo checkmark/cross lines, flushes failed output with `--- repo ---` separator after all complete; exits 1 if any repo fails
- `run --parallel --json` emits per-repo JSON array with `repo`, `exit_code`, `stdout`, `stderr`; no human text mixed in
- `sync --json` emits per-workspace JSON with `repos[]` containing `name`, `strategy`, `result`, `commits_behind_before`, `error`; `result` field: `up-to-date`/`rebased`/`merged`/`failed`
- `sync --all --json` emits array of per-workspace objects with same per-repo shape

## Task Commits

Each task was committed atomically:

1. **Task 1: Add --parallel and --json flags to run command** - `9a3f9e7` (feat)
2. **Task 2: Add --json flag to sync command** - `3c31bf9` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified
- `/home/nnex/dev/prj/git-stacks/src/commands/workspace.ts` - Added --parallel + --json to run command, added --json to sync command

## Decisions Made
- Single spinner for --parallel human mode (not per-repo): `@clack/prompts` is single-stream only, per-repo spinners would interleave unpredictably
- Passing repo output is discarded in human mode — exit code + summary lines tell the story; only failed repos get full output flushed
- `sync --json` passes no `onProgress` callback to `syncWorkspace`, preventing any human-readable lines from leaking into JSON output
- `sync --json` `result` field mapping: 0 commits = `up-to-date`, >0 with rebase = `rebased`, >0 with merge = `merged`, skipped list = `failed`

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Machine-readable output story is now complete: `list --json`, `status --json`, `doctor --json`, `run --parallel --json`, `sync --json` all implemented
- Phase 04 UX and execution goals fully met; phase is complete
- No blockers for subsequent phases

---
*Phase: 04-ux-and-execution*
*Completed: 2026-03-18*
