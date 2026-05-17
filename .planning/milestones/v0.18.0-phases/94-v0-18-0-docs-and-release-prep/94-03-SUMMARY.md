---
phase: 94-v0-18-0-docs-and-release-prep
plan: 03
subsystem: release
tags: [release-candidate, smoke-test, publish-dry-run, tag]
requires:
  - phase: 94-01
    provides: README and help wording for file sync and forge-source workflows
  - phase: 94-02
    provides: 0.18.0-rc.1 changelog and package metadata
provides:
  - Focused release smoke coverage for docs, CLI help, file sync, and forge-source dry-run behavior
  - Repeatable RC verification script that runs smoke, full verify, publish dry-run, and tag handoff
  - Local annotated v0.18.0-rc.1 tag on the verified release-candidate commit
affects: [release-rc-check, release-process, v0.18.0]
tech-stack:
  added: []
  patterns: [fixture-driven release smoke, scripted rc gate, tag safety check]
key-files:
  created: [tests/commands/release-rc.test.ts, scripts/release-rc-check.ts]
  modified: []
key-decisions:
  - "Release smoke stays fixture-driven and does not require live forge CLIs or authentication."
  - "The RC gate refuses to move an existing v0.18.0-rc.1 tag that points at a different commit."
  - "The release tag points at the exact code/docs commit that passed the publish dry-run."
patterns-established:
  - "RC checks should run targeted release smoke before full verify and packaging checks."
  - "Release smoke should assert docs/help wording and behavior together so docs drift fails locally."
requirements-completed: [DOCS-01, DOCS-02, REL-01]
duration: 10 min
completed: 2026-05-17
---

# Phase 94 Plan 03: Release Candidate Smoke Gate And Tag Handoff Summary

**Fixture-driven RC smoke and a repeatable release gate now validate `0.18.0-rc.1` before local tag handoff.**

## Performance

- **Duration:** 10 min
- **Started:** 2026-05-16T23:33:21Z
- **Completed:** 2026-05-16T23:43:05Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Added a focused release smoke test covering README/changelog wording, CLI help text, files sync drift behavior, conservative pull/push defaults, and forge-source dry-run preview.
- Added `scripts/release-rc-check.ts` to run the targeted smoke, the existing full verify workflow, `bun publish --dry-run`, and annotated RC tag creation.
- Created local tag `v0.18.0-rc.1` on verified commit `3cd416e18fc1d0aa8c43b0e3536f91f9a82cba29`.

## Task Commits

1. **Task 1: Add targeted RC smoke assertions for docs, file sync, and forge-source preview** - `ce17aaf` (test)
2. **Task 2: Add a repeatable RC verification script and tag the verified commit** - `2375991` (chore)
3. **Coverage runtime fix:** `3cd416e` (fix)

**Plan metadata:** pending

## Files Created/Modified

- `tests/commands/release-rc.test.ts` - Release smoke for docs/help alignment, files sync behavior, and forge-source dry-run preview.
- `scripts/release-rc-check.ts` - Repeatable RC gate for smoke, full verify, dry-run publish, and safe tag creation.

## Decisions Made

- Kept forge-source smoke local and fixture-driven so release verification does not depend on live `glab`, `gh`, `tea`, network access, or authentication.
- Required the RC script to fail rather than move a mismatched local `v0.18.0-rc.1` tag.
- Left the release tag on the verified code/docs/package commit; later planning-summary commits are not part of the publishable RC state.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Release smoke initially read docs from the coverage runtime root**
- **Found during:** Task 2 full RC gate.
- **Issue:** `bun run coverage` copies source into `.coverage/runtime-root`, so the new smoke test looked for `README.md` and `CHANGELOG.md` in the runtime copy instead of the repository root.
- **Fix:** Added repository-root resolution that detects `.coverage/runtime-root` and reads docs from the original checkout.
- **Files modified:** `tests/commands/release-rc.test.ts`
- **Verification:** `bun test tests/commands/release-rc.test.ts`, `bun run coverage tests/commands/release-rc.test.ts`, and the full RC gate passed.
- **Committed in:** `3cd416e`

---

**Total deviations:** 1 auto-fixed blocking verification issue.
**Impact on plan:** No scope change; the fix makes the planned smoke valid under the existing coverage architecture.

## Issues Encountered

- The generic post-merge snippet attempted to execute an empty configured build command after the config getter returned an empty quoted string. The intended repo gates were run directly instead: `bun run typecheck` and focused command tests.

## User Setup Required

None - no external service configuration required.

## Verification

- `bun test tests/commands/release-rc.test.ts` - passed.
- `bun run coverage tests/commands/release-rc.test.ts` - passed.
- `bun run scripts/release-rc-check.ts` - passed.
- `git tag --list 'v0.18.0-rc.1' | rg '^v0\\.18\\.0-rc\\.1$'` - passed.
- `git rev-parse HEAD` and `git rev-parse v0.18.0-rc.1^{}` both returned `3cd416e18fc1d0aa8c43b0e3536f91f9a82cba29` before the planning-summary commit.

## Next Phase Readiness

The RC package state has passed local release verification and dry-run publish. The repository is ready for maintainer review and direct `bun publish` from the tagged RC commit.

---
*Phase: 94-v0-18-0-docs-and-release-prep*
*Completed: 2026-05-17*
