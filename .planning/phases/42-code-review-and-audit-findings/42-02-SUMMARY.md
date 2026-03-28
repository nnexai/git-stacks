---
phase: 42-code-review-and-audit-findings
plan: "02"
subsystem: cli
tags: [doctor, security, shell-injection, path-quoting, tmux, niri]

# Dependency graph
requires: []
provides:
  - "Structured FixOperation type replacing shell string execution in doctor --fix"
  - "executeFix() with direct Bun APIs (rmSync, spawnSync) for all fix actions"
  - "formatFix() for human-readable display of structured fix operations"
  - "shellQuote() helper in tmux.ts and niri.ts integration plugins"
  - "All interpolated cwd paths in tmux pane layout and niri window spawn are single-quote escaped"
affects: [doctor, tmux-integration, niri-integration]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "FixOperation discriminated union: structured fix objects replace shell string execution"
    - "shellQuote: POSIX single-quote escaping for paths interpolated into shell commands"

key-files:
  created: []
  modified:
    - src/commands/doctor.ts
    - src/lib/integrations/tmux.ts
    - src/lib/integrations/niri.ts
    - tests/commands/doctor-fix.test.ts
    - tests/commands/doctor-json.test.ts

key-decisions:
  - "info action type for display-only hints (install URLs, repo show commands) keeps them visible without making them executable"
  - "executeFix takes silent:bool option — JSON mode uses pipe stdio to prevent subprocess output corrupting JSON"
  - "shellQuote defined inline in each integration file (not shared module) — two files, minimal coupling needed"
  - "unfixableIssues includes info-fix issues so they appear in manual action list"

patterns-established:
  - "FixOperation discriminated union: extensible by adding new action variants without touching executeFix dispatch"
  - "shellQuote(s): POSIX standard single-quote wrapping pattern for all path interpolation into shell commands"

requirements-completed: [CR-02, CR-05]

# Metrics
duration: 8min
completed: 2026-03-28
---

# Phase 42 Plan 02: Doctor Structured Fixes and Shell Path Quoting Summary

**doctor --fix uses FixOperation discriminated union with direct Bun API execution (rmSync/spawnSync); tmux and niri quote all interpolated cwd paths with POSIX shellQuote**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-03-28T11:18:00Z
- **Completed:** 2026-03-28T11:26:23Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Eliminated shell injection surface: `Bun.spawn(["sh", "-c", issue.fix!])` replaced with typed `executeFix()` dispatching to `rmSync`/`spawnSync` with explicit argument arrays
- Added `FixOperation` discriminated union with 6 action types; `formatFix()` produces human-readable display without re-running shell
- Added POSIX `shellQuote()` to tmux and niri integrations, preventing path-with-spaces breakage in `cd` commands sent to tmux panes and niri shell spawns
- TDD: new tests assert fix field is a structured object with `action` property; updated doctor-json.test.ts to match new structured fix shape

## Task Commits

Each task was committed atomically:

1. **Task 1: Replace doctor --fix shell strings with structured fix operations** - `d3fa0c0` (feat)
2. **Task 2: Add shell quoting to tmux and niri path interpolation** - `983e723` (feat)

## Files Created/Modified
- `/home/nnex/dev/prj/git-stacks/src/commands/doctor.ts` - Added FixOperation type, executeFix(), formatFix(); replaced both sh -c execution sites; updated all diagnostic functions to return structured fixes
- `/home/nnex/dev/prj/git-stacks/src/lib/integrations/tmux.ts` - Added shellQuote(); replaced `cd ${cwd}` with `cd ${shellQuote(cwd)}`
- `/home/nnex/dev/prj/git-stacks/src/lib/integrations/niri.ts` - Added shellQuote(); replaced `cd ${resolvedCwd}` with `cd ${shellQuote(resolvedCwd)}`
- `/home/nnex/dev/prj/git-stacks/tests/commands/doctor-fix.test.ts` - Added 5 new tests asserting structured fix shape and rmSync behavior; updated existing assertions for new behavior
- `/home/nnex/dev/prj/git-stacks/tests/commands/doctor-json.test.ts` - Updated fix field assertion from `typeof === "string"` to `typeof === "object"` with action property check

## Decisions Made
- `info` action type for display-only hints (install URLs, `repo show` suggestions): keeps them visible in output without making them executable via `executeFix`
- `executeFix` accepts `{ silent?: boolean }` option — JSON mode passes `silent: true` to use pipe stdio and prevent subprocess stdout from corrupting JSON output
- `shellQuote` defined inline in each integration file rather than in a shared utility — only two call sites, minimal value in a shared module
- `unfixableIssues` filter includes `info`-fix issues so they appear in the "manual action needed" list when `fixableIssues.length === 0`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] JSON mode corrupted by executeFix subprocess stdout**
- **Found during:** Task 1 (GREEN phase verification)
- **Issue:** `executeFix` for `open-workspace` used `stdio: ["inherit", "inherit", "inherit"]` which caused subprocess output ("Recreating...") to appear before the JSON output in test stdout, making JSON.parse fail
- **Fix:** Added `opts: { silent?: boolean }` parameter to `executeFix`; JSON code path passes `{ silent: true }` to use pipe stdio
- **Files modified:** src/commands/doctor.ts
- **Verification:** `bun test tests/commands/doctor-fix.test.ts` — all 10 tests pass
- **Committed in:** d3fa0c0 (Task 1 commit)

**2. [Rule 1 - Bug] Test assertion for plural "fixes" didn't match singular "fix" prompt**
- **Found during:** Task 1 (GREEN phase verification)
- **Issue:** With `info` fixes excluded from fixableIssues, only 1 fix was executable for `addBrokenWorkspace()`. The confirmation prompt emits "1 fix available" (singular) but the test expected `"fixes available"` (plural)
- **Fix:** Updated test regex to `\d+ fix(es)? available\. Execute all\?` to match both singular and plural
- **Files modified:** tests/commands/doctor-fix.test.ts
- **Verification:** All tests pass
- **Committed in:** d3fa0c0 (Task 1 commit)

**3. [Rule 1 - Bug] "issues without fix" test assertion missed new behavior**
- **Found during:** Task 1 (GREEN phase verification)
- **Issue:** Test expected `"no auto-fix"` annotation but `info` fix issues caused early return path ("No auto-fixable issues found.") without showing per-issue annotations
- **Fix:** Updated `unfixableIssues` filter to include `info`-fix issues; updated early-return block to list per-issue annotations; updated the human-readable display path to show hint text for `info` fixes
- **Files modified:** src/commands/doctor.ts, tests/commands/doctor-fix.test.ts
- **Verification:** All tests pass
- **Committed in:** d3fa0c0 (Task 1 commit)

---

**Total deviations:** 3 auto-fixed (all Rule 1 bugs discovered during GREEN phase)
**Impact on plan:** All auto-fixes necessary for correctness. The `silent` option and unfixable-issues display improvements make the feature more correct and user-friendly. No scope creep.

## Issues Encountered
None beyond the three bugs documented in deviations above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Doctor structured fixes ready; tmux and niri path quoting complete
- No blockers for Phase 42 Plan 03

---
*Phase: 42-code-review-and-audit-findings*
*Completed: 2026-03-28*
