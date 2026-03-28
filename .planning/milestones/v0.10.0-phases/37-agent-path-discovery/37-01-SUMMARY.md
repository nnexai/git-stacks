---
phase: 37-agent-path-discovery
plan: 01
subsystem: cli
tags: [paths, agent, worktree, workspace, cli-injection]

requires:
  - phase: 31-workspace-cwd-auto-detection
    provides: detectWorkspaceFromCwd() for CWD-based workspace resolution
provides:
  - getWorkspacePaths() helper function for programmatic path queries
  - `git-stacks paths [workspace]` CLI command with --prefix and --filter options
  - Shell completion auto-discovery for the new command
affects: [38-multi-repo-pull, 41-release-prep]

tech-stack:
  added: []
  patterns: [scriptable stdout output for CLI composition]

key-files:
  created:
    - tests/lib/paths-command.test.ts
  modified:
    - src/commands/workspace.ts

key-decisions:
  - "getWorkspacePaths returns a result object (ok/error pattern) rather than throwing, consistent with other workspace-ops functions"
  - "Skipped repos (missing path on disk) are tracked in a separate `skipped` array rather than failing the entire command"

patterns-established:
  - "Path discovery: worktree repos emit task_path, trunk repos emit main_path"
  - "CLI composition: --prefix flag prepends each output line for agent CLI injection"

requirements-completed: [PATH-01, PATH-02, PATH-03, PATH-04]

duration: 5min
completed: 2026-03-26
---

# Phase 37: Agent Path Discovery Summary

**`git-stacks paths` command with --prefix/--filter flags for agent CLI path injection (e.g., `claude --add-dir $(git-stacks paths myws --prefix "--add-dir")`)**

## Performance

- **Duration:** 5 min
- **Tasks:** 3
- **Files modified:** 2

## Accomplishments
- Implemented `getWorkspacePaths()` helper that resolves workspace repo paths (task_path for worktree, main_path for trunk)
- Registered `paths` subcommand with `--prefix` (flag prepend) and `--filter` (worktree/trunk mode restriction) options
- CWD auto-detection via `detectWorkspaceFromCwd()` when no workspace argument given
- Missing-path repos are skipped with stderr warning; exit code 1 when no paths emitted
- 7 unit tests covering all option combinations and edge cases

## Task Commits

Each task was committed atomically:

1. **Task 1: RED -- Write failing tests** - `244f8fe` (test)
2. **Task 2: GREEN -- Implement getWorkspacePaths and paths command** - `8d32d7e` (feat)
3. **Task 3: Integration verification** - `994e7e1` (test)

## Files Created/Modified
- `tests/lib/paths-command.test.ts` - 7 unit tests for getWorkspacePaths helper
- `src/commands/workspace.ts` - getWorkspacePaths function, PathsResult type, paths subcommand registration

## Decisions Made
- Used ok/error result pattern consistent with existing workspace-ops functions
- Skipped repos tracked separately in `skipped` array rather than failing entire command
- Warnings for skipped repos go to stderr, paths go to stdout (clean piping)

## Deviations from Plan
None - plan executed exactly as written

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Path discovery foundation complete for Phase 38 (multi-repo pull) to build upon
- Shell completions auto-discover the new command across bash/zsh/fish

---
*Phase: 37-agent-path-discovery*
*Completed: 2026-03-26*
