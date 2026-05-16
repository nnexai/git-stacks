---
phase: 94-v0-18-0-docs-and-release-prep
plan: 01
subsystem: docs
tags: [files-sync, forge-source, cli-help, readme]
requires:
  - phase: 90-files-command-surface-and-conflict-policy
    provides: files status/pull/push safety semantics
  - phase: 91-files-sync-integration-and-machine-output
    provides: lifecycle sync docs and JSON/help surface
  - phase: 92-forge-source-research-and-resolver-design
    provides: forge validation boundaries
provides:
  - README guidance for files.sync real-file materialization and explicit push-back
  - README guidance for git-stacks new --source workspace creation
  - CLI help wording aligned with release-facing safety language
affects: [README.md, src/commands/workspace.ts, src/commands/files.ts, release-smoke]
tech-stack:
  added: []
  patterns: [user-facing safety wording, early-support forge caveats]
key-files:
  created: []
  modified: [README.md, src/commands/workspace.ts, src/commands/files.ts]
key-decisions:
  - "Documented forge-source creation as a workspace creation flow near git-stacks new."
  - "Kept file sync documentation centered on explicit commands and conservative defaults."
patterns-established:
  - "Release docs should state validation limits without implying a live forge matrix."
requirements-completed: [DOCS-01, DOCS-02]
duration: 19 min
completed: 2026-05-17
---

# Phase 94 Plan 01: README And Help Alignment For Files Sync And Forge Sources Summary

**README and CLI help now describe real-file sync, explicit sync-back, and forge-source workspace creation with matching safety boundaries.**

## Performance

- **Duration:** 19 min
- **Started:** 2026-05-16T23:12:00Z
- **Completed:** 2026-05-16T23:31:17Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- Clarified `git-stacks new --source` help so it names full forge URLs, the `--template` requirement, ambiguity override behavior, and dry-run scope.
- Clarified `git-stacks files` help so explicit sync-back and force mirror/delete behavior are visible from the CLI.
- Extended README with forge-source workspace creation guidance, file-sync real-file materialization, repo-level `git_exclude`, conservative defaults, and manual `files push` sync-back.

## Task Commits

1. **Task 1: Align help text with the release-facing safety contract** - `be773a4` (docs)
2. **Task 2: Update README for file sync and forge-source workspace creation** - `ff297b7` (docs)

**Plan metadata:** pending

## Files Created/Modified

- `src/commands/workspace.ts` - Tightened `new --source`, `--repo`, and `--dry-run` help text.
- `src/commands/files.ts` - Tightened `files` description and pull/push force wording.
- `README.md` - Added forge-source creation docs and expanded real-file sync behavior.

## Decisions Made

- Kept forge-source docs near the Workspaces section so the feature reads as a workspace creation path.
- Stated early support caveats for provider auth, self-hosted instances, and fork refs without overstating live validation.
- Documented `git_exclude: true` as repo-level local `.git/info/exclude` behavior, not committed `.gitignore` behavior.

## Deviations from Plan

None - plan executed exactly as written.

**Total deviations:** 0 auto-fixed.
**Impact on plan:** No scope change.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Verification

- `bun test tests/commands/files.test.ts tests/commands/workspace-source.test.ts` - passed, 18 tests.
- `bun run typecheck` - passed.

## Next Phase Readiness

Plan 94-02 can use the README safety wording as the source for user-facing release notes.

---
*Phase: 94-v0-18-0-docs-and-release-prep*
*Completed: 2026-05-17*
