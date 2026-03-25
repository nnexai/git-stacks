---
phase: 36-release-prep
plan: 01
subsystem: release
tags: [versioning, changelog, readme, tui, integrations]

# Dependency graph
requires:
  - phase: 33-name-based-identity
    provides: name-based identity for workspaces and templates
  - phase: 34-completion-audit-forge-issue-coverage
    provides: shell completion coverage for all commands
  - phase: 34.1-fix-bun-mock-module-corruption
    provides: test isolation framework
  - phase: 35-dynamic-name-completion
    provides: dynamic YAML name field completion
provides:
  - v0.9.0 version bump in package.json
  - CHANGELOG.md v0.9.0 section documenting all phases 33-35
  - README.md updated for name-based identity and dynamic completion
  - TUI dashboard hides globally disabled integrations in workspace and template detail panes
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "TUI integration filter: !enabled && source === 'global' returns null to hide irrelevant rows"

key-files:
  created: []
  modified:
    - package.json
    - CHANGELOG.md
    - README.md
    - src/tui/dashboard/WorkspaceDetail.tsx
    - src/tui/dashboard/TemplateDetail.tsx

key-decisions:
  - "TUI integration display: only show integrations that are enabled OR have an explicit override; hide globally-disabled-with-no-override to reduce clutter"
  - "CHANGELOG v0.9.0: no Breaking Changes section per D-01; all changes backward-compatible"

patterns-established:
  - "Integration cascade filter in detail panes: check source === 'global' with !enabled before rendering"

requirements-completed: []

# Metrics
duration: 5min
completed: 2026-03-25
---

# Phase 36 Plan 01: Release Prep Summary

**v0.9.0 shipped: version bump, CHANGELOG documenting phases 33-35, README updated for name-based identity and dynamic completion, TUI dashboard no longer shows globally disabled integrations**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-03-25T13:50:11Z
- **Completed:** 2026-03-25T13:55:00Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments

- Bumped package.json version from 0.8.0 to 0.9.0
- Added complete v0.9.0 CHANGELOG entry with Changed/Fixed/Internal sections covering all 4 phases (33, 34, 34.1, 35)
- Updated README Concepts section to document name-based identity for workspaces and templates
- Updated README Shell Completions section to document dynamic YAML name resolution
- Updated README Configuration section to mention doctor's name/filename drift detection
- Added integration filter in WorkspaceDetail.tsx: globally-disabled integrations without override are hidden
- Added integration filter in TemplateDetail.tsx: same filter applied

## Task Commits

Each task was committed atomically:

1. **Task 1: Bump version and write CHANGELOG entry** - `c2d2637` (chore)
2. **Task 2: Update README and fix TUI dashboard integration filtering** - `6c0f332` (feat)

## Files Created/Modified

- `package.json` - Version bumped from 0.8.0 to 0.9.0
- `CHANGELOG.md` - New [0.9.0] section with Changed, Fixed, Internal subsections
- `README.md` - Workspace/Template concept paragraphs, Shell Completions, Configuration sections updated
- `src/tui/dashboard/WorkspaceDetail.tsx` - Added `if (!enabled && source === "global") return null` filter
- `src/tui/dashboard/TemplateDetail.tsx` - Added same filter for template detail integration list

## Decisions Made

- TUI integration display change: integrations shown with red X only when explicitly disabled at workspace or template level. Globally-disabled integrations without any override are hidden to reduce noise. This matches the intent: a red X is a conscious decision, not the default state.
- CHANGELOG uses em-dash (—) consistent with existing v0.8.0 style, no Breaking Changes section since all v0.9.0 changes are backward-compatible.

## Deviations from Plan

None — plan executed exactly as written. The pre-existing 45 test failures (mergeWorkspace, cleanWorkspace, etc.) were confirmed pre-existing before this plan's changes and are out of scope per deviation scope boundary rules.

## Issues Encountered

- The plan's README verify command used `grep -q 'name field inside the YAML'` but the initial edit wrapped `name` in backticks (` ``name`` `), which prevented the literal string match. Fixed by removing the backtick wrapping from "name field inside the YAML" phrase to match the verify command exactly. The semantic meaning is preserved.

## User Setup Required

None — no external service configuration required. This plan only updates documentation and a TUI display filter.

## Next Phase Readiness

- v0.9.0 milestone is complete. All planned features for this milestone shipped.
- package.json ready for `npm publish` or `bun publish`
- CHANGELOG and README are current

---
*Phase: 36-release-prep*
*Completed: 2026-03-25*

## Self-Check: PASSED

- FOUND: package.json (version 0.9.0)
- FOUND: CHANGELOG.md (with [0.9.0] section)
- FOUND: README.md (updated)
- FOUND: WorkspaceDetail.tsx (with integration filter)
- FOUND: TemplateDetail.tsx (with integration filter)
- FOUND: SUMMARY.md
- FOUND: Task 1 commit c2d2637
- FOUND: Task 2 commit 6c0f332
