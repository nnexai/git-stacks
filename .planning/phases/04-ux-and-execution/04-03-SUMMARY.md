---
phase: 04-ux-and-execution
plan: 03
subsystem: cli
tags: [doctor, json, fix, automation, clack-prompts]

# Dependency graph
requires:
  - phase: 04-ux-and-execution
    provides: formatError helper and consistent --force pattern from Phase 2
provides:
  - doctor --json flag emitting { healthy, issues } JSON to stdout
  - doctor --fix flag auto-executing repair commands with confirmation
  - doctor --force flag skipping confirmation when combined with --fix
  - doctor --json --fix flag emitting fix results in JSON
affects: [agents, scripts, CI integration using doctor for health checks]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Collect all issues into allIssues array before any output — enables JSON and fix paths to use same data
    - JSON output guard placed before human output — pure stdout for scripting
    - Fix execution continues past individual failures — reports N fixed / M failed at end
    - Unfixable issues annotated with "(no auto-fix — manual action needed)"

key-files:
  created: []
  modified:
    - src/commands/doctor.ts

key-decisions:
  - "doctor --json path handles both fix and non-fix cases in one block before human output — ensures JSON is always pure (no human lines leaked to stdout)"
  - "formatError used in fix error catch path — consistent error formatting across CLI"
  - "Binary issues (install URLs) treated as fixable in allIssues — annotated as 'Install: URL' in fix field; users can choose to act or skip"

patterns-established:
  - "Issue collection pattern: gather all issues first, then branch on --json vs human vs --fix output"
  - "--fix --force consistent with Phase 2 destructive command pattern"

requirements-completed: [UX-02, UX-03]

# Metrics
duration: 2min
completed: 2026-03-18
---

# Phase 4 Plan 03: Doctor --json and --fix Flags Summary

**Doctor command extended with --json for machine-readable output and --fix for automated repair with confirmation and partial-failure tolerance**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-18T20:51:27Z
- **Completed:** 2026-03-18T20:53:00Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments
- Added --json flag: emits `{ healthy: boolean, issues: Issue[] }` to stdout, parseable by `jq`
- Added --fix flag: lists fixable issues, prompts confirmation, executes via `Bun.spawn(["sh", "-c", ...])`, reports N fixed / M failed
- Added --force flag: skips confirmation when combined with --fix (consistent with Phase 2 pattern)
- Combined --json --fix path: executes fixes silently, emits `{ healthy, issues, fixes }` JSON with per-fix success/exit_code
- Unfixable issues annotated with "(no auto-fix — manual action needed)"
- Fix execution continues past individual failures — no abort on first failure

## Task Commits

Each task was committed atomically:

1. **Tasks 1+2: Add --json, --fix, --force to doctor command** - `bf334df` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified
- `/home/nnex/dev/prj/git-stacks/src/commands/doctor.ts` - Added --json, --fix, --force flags; restructured to collect all issues before output; added clack/prompts import for confirmation; added formatError import for error display

## Decisions Made
- JSON output block placed before human output block — guarantees no human-readable lines are emitted when --json is active (pure stdout for `jq .`)
- allIssues flat array collects from all check functions — single source of truth for both JSON and fix paths
- formatError used in fix catch path for consistent error formatting

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Doctor is now scriptable (--json) and self-healing (--fix) — ready for agent integration
- All 146 tests pass

---
*Phase: 04-ux-and-execution*
*Completed: 2026-03-18*
