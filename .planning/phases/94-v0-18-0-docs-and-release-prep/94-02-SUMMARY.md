---
phase: 94-v0-18-0-docs-and-release-prep
plan: 02
subsystem: release
tags: [changelog, release-candidate, package-version]
requires:
  - phase: 94-01
    provides: README and help safety wording for release notes
provides:
  - User-facing 0.18.0-rc.1 changelog entry
  - package.json version aligned to 0.18.0-rc.1
  - v0.18.0-rc.1 tag naming contract for the release gate
affects: [CHANGELOG.md, package.json, release-rc-check]
tech-stack:
  added: []
  patterns: [user-facing release notes, rc package versioning]
key-files:
  created: []
  modified: [CHANGELOG.md, package.json]
key-decisions:
  - "Prepared a release candidate version rather than final 0.18.0."
  - "Release notes lead with user workflows and validation limits instead of internal phase mechanics."
patterns-established:
  - "RC changelog entries should state the package version and matching tag target explicitly."
requirements-completed: [REL-01]
duration: 7 min
completed: 2026-05-17
---

# Phase 94 Plan 02: User-Facing Release Notes And RC Packaging Metadata Summary

**The release candidate now has user-facing v0.18.0 notes and matching `0.18.0-rc.1` package metadata.**

## Performance

- **Duration:** 7 min
- **Started:** 2026-05-16T23:26:00Z
- **Completed:** 2026-05-16T23:32:57Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Added a topmost `0.18.0-rc.1` changelog entry centered on workspace file sync and forge-source workspace creation.
- Documented conservative file sync defaults, explicit `files push` sync-back, `--dry-run`, `--force`, and forge early-support limits in user language.
- Set `package.json` version to `0.18.0-rc.1` so the later RC tag can use `v0.18.0-rc.1` without mismatch.

## Task Commits

1. **Task 1: Write the `0.18.0-rc.1` changelog entry in user language** - `69fc683` (docs)
2. **Task 2: Align package metadata with the release-candidate identifier** - `60f1adf` (chore)

**Plan metadata:** pending

## Files Created/Modified

- `CHANGELOG.md` - Added user-facing `0.18.0-rc.1` release candidate notes.
- `package.json` - Updated version to `0.18.0-rc.1`.

## Decisions Made

- Kept final `0.18.0` out of scope until the RC gate validates the package.
- Described forge-source creation as early support with practical validation caveats for provider auth, self-hosted instances, and fork refs.

## Deviations from Plan

None - plan executed exactly as written.

**Total deviations:** 0 auto-fixed.
**Impact on plan:** No scope change.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Verification

- `rg -n "^## \\[0\\.18\\.0-rc\\.1\\]" CHANGELOG.md` - passed.
- `node -e "console.log(JSON.parse(require('fs').readFileSync('package.json','utf8')).version)"` - printed `0.18.0-rc.1`.

## Next Phase Readiness

Plan 94-03 can build the RC smoke gate against the new changelog entry and package version.

---
*Phase: 94-v0-18-0-docs-and-release-prep*
*Completed: 2026-05-17*
