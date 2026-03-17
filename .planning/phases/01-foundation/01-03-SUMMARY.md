---
phase: 01-foundation
plan: "03"
subsystem: cli
tags: [git, bun, shell, integrations, doctor, binary-checks]

# Dependency graph
requires: []
provides:
  - Startup git version check (>= 2.24) in src/index.ts that fails fast with clear install message
  - Binary guards in vscode and intellij integrations that skip silently when binary absent
  - Doctor command runtime dependency section reporting git, code, code-insiders, idea, tmux, cmux with install URLs
affects: [02-safety, 03-core-design, integrations]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "which <cmd> pattern for binary presence checking in integration open() methods"
    - "Startup prerequisite guard with process.exit(1) before program.parse() in CLI entrypoint"
    - "completion subcommand bypass for prerequisite checks (shell completions must work without dependencies)"

key-files:
  created: []
  modified:
    - src/index.ts
    - src/lib/integrations/vscode.ts
    - src/lib/integrations/intellij.ts
    - src/commands/doctor.ts

key-decisions:
  - "completion subcommand bypasses git version check so shell completions work even without git installed"
  - "Integration binary guards use which <cmd> and return early (silent, debug-level) rather than showing an error -- degraded-gracefully is correct behavior"
  - "cmux.ts and tmux.ts already satisfied PREREQ-02 via try/catch (spinner.stop pattern) -- no change needed"
  - "doctor binaryIssues uses warn icon for optional tools (code, idea, tmux, cmux) and fail icon only for required git"

patterns-established:
  - "Binary guard pattern: const check = await $`which <cmd>`.quiet().nothrow(); if (check.exitCode !== 0) return"
  - "Prerequisite check pattern: run before program.parse(), guard specific subcommands that must bypass"
  - "Doctor section pattern: collect issues into typed array, print section header only when issues exist"

requirements-completed: [PREREQ-01, PREREQ-02, PREREQ-03]

# Metrics
duration: 2min
completed: 2026-03-17
---

# Phase 01 Plan 03: Prerequisite Checks and Binary Guards Summary

**Startup git version gate (>= 2.24), per-integration binary guards via `which`, and doctor runtime dependency reporting for 6 tools**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-17T21:26:03Z
- **Completed:** 2026-03-17T21:28:02Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- git-stacks now exits with a clear install instruction if git is absent or below 2.24 at startup
- VSCode and IntelliJ integrations skip silently (no error) when their binary is absent, using `which` checks
- `git-stacks doctor` now reports a "Runtime dependencies" section listing missing tools (git, code, code-insiders, idea, tmux, cmux) with install URLs
- All 71 existing tests continue to pass (zero regressions)

## Task Commits

Each task was committed atomically:

1. **Task 1: Add startup git version check to index.ts** - `639f8ee` (feat)
2. **Task 2: Add binary guards to integrations and doctor binary checks** - `b37c28b` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified
- `src/index.ts` - Added `checkGitVersion()` function and pre-parse guard with completion bypass
- `src/lib/integrations/vscode.ts` - Added `which ${cmd}` check in `open()` before launching editor
- `src/lib/integrations/intellij.ts` - Added `which idea` check in `open()` before launching IDE
- `src/commands/doctor.ts` - Added `checkBinary()` helper and Runtime dependencies section with 6 tools and install URLs

## Decisions Made
- completion subcommand bypasses the git version check — shell tab completions must work in environments where git is not yet installed
- Binary guards in integrations use silent early-return (not error/warn) — missing optional tools is normal operation, not a problem
- cmux.ts and tmux.ts already used try/catch spinner pattern that satisfies PREREQ-02; left unchanged
- Doctor uses `warn` icon for optional tools and `fail` icon only for required git — reflects actual severity

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- PREREQ-01, PREREQ-02, PREREQ-03 all satisfied
- Foundation prerequisite checks complete; Phase 01 ready to proceed to safety work (Phase 02)
- No blockers introduced

## Self-Check: PASSED

All 5 key files verified present. Both task commits (639f8ee, b37c28b) confirmed in git history.

---
*Phase: 01-foundation*
*Completed: 2026-03-17*
