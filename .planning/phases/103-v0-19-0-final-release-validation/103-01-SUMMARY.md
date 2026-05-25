---
phase: 103-v0-19-0-final-release-validation
plan: 01
subsystem: release-validation
tags: [release, rc, changelog, smoke-tests, publish-dry-run]

requires:
  - phase: 100-manager-tui-command-output-containment
    provides: "Manager command-output containment follow-up fix and focused dashboard coverage"
  - phase: 101-completion-completeness-repair
    provides: "Completion completeness repair and verify-gates coverage"
  - phase: 102-workspace-root-auto-detection
    provides: "Workspace-root auto-detection resolver, subprocess coverage, and README guidance"
provides:
  - "Publishable 0.19.0-rc.2 package metadata"
  - "User-facing RC.2 changelog entry for Phase 100-102 follow-up fixes"
  - "Release smoke coverage for RC.2 artifacts and follow-up coverage surfaces"
  - "Canonical RC.2 gate evidence without creating the tag"
affects: [release, v0.19.0, npm-publish, phase-104]

tech-stack:
  added: []
  patterns:
    - "Release smoke checks stable artifact and focused-test source surfaces instead of only changelog prose"
    - "RC validation uses release-rc-check --skip-tag before operator-controlled tag creation"

key-files:
  created:
    - .planning/phases/103-v0-19-0-final-release-validation/103-01-SUMMARY.md
  modified:
    - package.json
    - CHANGELOG.md
    - tests/commands/release-rc.test.ts

key-decisions:
  - "The validated package version is 0.19.0-rc.2 and the handoff tag target is v0.19.0-rc.2."
  - "Final 0.19.0 tagging and publishing remain separate from this RC.2 validation."
  - "No tag was created during execution because the canonical gate was run with --skip-tag."

patterns-established:
  - "RC smoke tests should assert package/changelog consistency plus the release-relevant focused coverage surfaces."
  - "Grouped focused command failures caused by shared-process Bun mock/cache pollution can be accepted only when isolated surfaces and the canonical release gate pass."

requirements-completed:
  - REL-01
  - REL-02

duration: 40 min
completed: 2026-05-25
---

# Phase 103 Plan 01: v0.19.0 RC.2 Release Validation Summary

**RC.2 package metadata, release notes, smoke coverage, and publish dry-run validated for the v0.19.0 follow-up fixes**

## Performance

- **Duration:** 40 min
- **Started:** 2026-05-25T17:02:49Z
- **Completed:** 2026-05-25T17:09:35Z
- **Tasks:** 3
- **Files modified:** 4

## Accomplishments

- Updated `package.json` to the publishable prerelease version `0.19.0-rc.2`.
- Added a top `CHANGELOG.md` entry for `0.19.0-rc.2` that names manager command-output containment, completion completeness repair, and workspace-root auto-detection as RC follow-up fixes.
- Added release smoke assertions for package/changelog ordering, the `v0.19.0-rc.2` handoff target, deferred dashboard rollback progress visibility, and stable Phase 100-102 coverage surfaces.
- Ran the canonical release gate with `bun run scripts/release-rc-check.ts --skip-tag`; it passed RC smoke, canonical verification, `bun publish --dry-run`, and skipped tag creation.

## Task Commits

1. **Tasks 1-2: Update RC.2 artifacts and strengthen release smoke** - `c0d4576` (test)
2. **Task 3: Record validation evidence and handoff** - committed with this summary

**Plan metadata:** committed with this summary.

## Files Created/Modified

- `package.json` - Sets package version to `0.19.0-rc.2`.
- `CHANGELOG.md` - Adds the user-facing `0.19.0-rc.2` entry and keeps final `0.19.0` separate.
- `tests/commands/release-rc.test.ts` - Adds RC.2 artifact and Phase 100-102 follow-up smoke assertions.
- `.planning/phases/103-v0-19-0-final-release-validation/103-01-SUMMARY.md` - Records validation evidence and operator handoff.

## Decisions Made

- Kept `scripts/release-rc-check.ts` unchanged because it already derives `rcVersion` from `package.json`, derives `rcTag` as `v${rcVersion}`, supports `--skip-tag`, runs the RC smoke, runs the canonical verify workflow, and performs `bun publish --dry-run`.
- Did not update `README.md`; existing user guidance already covers the workspace-root and notes behavior needed for RC.2, and maintainer-only verification detail belongs in planning evidence.
- Did not create `v0.19.0-rc.2`; this execution validated with `--skip-tag` only.

## Deviations from Plan

None - the implementation stayed within the planned RC.2 artifact, smoke-test, and validation scope.

## Issues Encountered

### Focused manager grouped command

- **Command:** `bun test tests/tui/dashboard/integ-action-menu.test.tsx tests/lib/lifecycle.test.ts tests/lib/workspace-command.test.ts tests/tui/dashboard/issue-actions.test.ts tests/tui/dashboard/snapshots/ProgressView.snap.test.tsx`
- **Result:** Failed in the grouped invocation with `SyntaxError: Export named 'buildBaseEnv' not found in module '/home/nnex/dev/prj/git-stacks/src/lib/workspace-env.ts'.`
- **Decision:** Accepted as a known mixed Bun mock/cache grouped-invocation issue, not an RC blocker.
- **Scope evidence:** `bun test tests/tui/dashboard/integ-action-menu.test.tsx` passed by itself, and `bun test tests/lib/lifecycle.test.ts tests/lib/workspace-command.test.ts tests/tui/dashboard/issue-actions.test.ts tests/tui/dashboard/snapshots/ProgressView.snap.test.tsx` passed as a separate grouped run.

### Focused workspace-root grouped command

- **Command:** `bun test tests/lib/detect-workspace-cwd.test.ts tests/commands/workspace-wrapper-edges.test.ts tests/commands/notes.test.ts tests/lib/integrations/issue-utils.test.ts`
- **Result:** The workspace-root, wrapper, and notes suites passed, then `tests/lib/integrations/issue-utils.test.ts` failed when grouped after CLI subprocess suites because resolver mocks returned `no-issue` instead of recording expected writes.
- **Decision:** Accepted as shared-process mock pollution, not an RC blocker.
- **Scope evidence:** `bun test tests/lib/integrations/issue-utils.test.ts` passed in isolation, and the canonical release gate isolates integration files correctly and passed.

## Verification

- `bun test tests/commands/release-rc.test.ts` - pass, 7 tests, 80 expects.
- `bun test tests/tui/dashboard/integ-action-menu.test.tsx` - pass, 12 tests, 55 expects.
- `bun test tests/lib/lifecycle.test.ts tests/lib/workspace-command.test.ts tests/tui/dashboard/issue-actions.test.ts tests/tui/dashboard/snapshots/ProgressView.snap.test.tsx` - pass, 36 tests, 1 snapshot, 75 expects.
- `bun test tests/lib/completion-generator.test.ts tests/commands/support-readonly.test.ts tests/lib/verify-gates.test.ts` - pass, 156 tests, 479 expects.
- `bun run verify:gates` - pass; inventory, mapped tests, and coverage artifacts aligned.
- `bun test tests/lib/integrations/issue-utils.test.ts` - pass, 17 tests, 30 expects.
- `bun run scripts/release-rc-check.ts --skip-tag` - pass; RC smoke, canonical verification, `bun publish --dry-run`, and skip-tag handoff all completed.

## Release Handoff

- Validated package version: `0.19.0-rc.2`.
- Validated tag target: `v0.19.0-rc.2`.
- No tag was created during this plan because the release gate used `--skip-tag`.
- To create the annotated RC.2 tag after operator approval, run `bun run scripts/release-rc-check.ts`.
- To publish after the approved tag/check path, run `bun publish`.
- Final `v0.19.0` was not tagged or published in this phase; final `0.19.0` remains a later release step.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

The RC.2 artifacts are ready for operator-controlled tag creation and publish. Phase 103 leaves the repo validated for `v0.19.0-rc.2` but intentionally does not create the tag or publish the package.

---
*Phase: 103-v0-19-0-final-release-validation*
*Completed: 2026-05-25*
