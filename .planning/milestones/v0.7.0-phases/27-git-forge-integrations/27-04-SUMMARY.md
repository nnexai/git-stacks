---
phase: 27-git-forge-integrations
plan: 04
subsystem: docs
tags: [forge, github, gitlab, gitea, changelog, readme, documentation]

# Dependency graph
requires:
  - 27-01 (ForgeTypeSchema, forge field, resolveForgeRepo)
  - 27-02 (github/gitlab/gitea integration plugins with pr commands)
  - 27-03 (forge detection in repo add/scan, doctor forge CLI checks)
provides:
  - CHANGELOG.md with forge integration entries under [Unreleased] Added
  - README.md Integrations section with forge table rows and usage examples
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns: []

key-files:
  created: []
  modified:
    - CHANGELOG.md
    - README.md

key-decisions:
  - "Forge entries inserted at top of [Unreleased] Added section — new feature documentation appears before per-command completion and YAML editor entries for discoverability"
  - "Forge integration table rows use tier 5 — above session integrations (1-3); forge plugins are command-only, not open() session providers"

requirements-completed: [FORGE-01, FORGE-04, FORGE-06, FORGE-09, FORGE-13]

# Metrics
duration: 65s
completed: 2026-03-22
---

# Phase 27 Plan 04: Documentation Update Summary

**CHANGELOG.md and README.md updated with forge integration feature documentation — PR/MR commands, forge registry field, auto-detection at registration, and doctor CLI checks**

## Performance

- **Duration:** ~1 min
- **Started:** 2026-03-22T16:25:50Z
- **Completed:** 2026-03-22T16:26:55Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Added forge integration entries to `CHANGELOG.md` under `[Unreleased] Added`:
  - Forge integrations section documenting `pr create/open/status` for github/gitlab/gitea
  - Forge field on repo registry (optional, backward compatible)
  - Forge detection at `repo add` / `repo scan` with auto-select and prompt logic
  - Doctor forge CLI checks for `gh`, `glab`, `tea`
- Updated `README.md` Integrations section:
  - Added three new rows (GitHub/GitLab/Gitea at tier 5) to the integrations table
  - Added full "Forge integrations" documentation subsection after niri documentation
  - Included usage examples for create, open (URL + --web), and status commands
  - Documented multi-repo syntax (`<workspace> [repo]` arg)
  - Documented forge field requirement and auto-detection behavior

## Task Commits

1. **Task 1: Update CHANGELOG.md** — `54cac02` (docs)
2. **Task 2: Update README.md** — `9d39efd` (docs)

## Files Modified

- `CHANGELOG.md` — Forge integration entries added under [Unreleased] Added (14 lines inserted)
- `README.md` — Integrations table + forge documentation section added (31 lines inserted)

## Decisions Made

- Forge CHANGELOG entries inserted at the top of the `### Added` section — new major feature deserves prominent placement before smaller polish items
- README forge section placed between niri integration docs and `## Hooks & Env Injection` — follows the existing pattern of per-integration deep dives after the table overview
- Tier 5 used in table for forge integrations — consistent with plan spec; visually signals these are command-only (no `git-stacks open` session artifacts)

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

None — all documentation accurately reflects what was implemented in plans 27-01 through 27-03.

## Self-Check: PASSED

- CHANGELOG.md: FOUND, contains "Forge integration" entries
- README.md: FOUND, contains forge table rows and usage examples
- Commit 54cac02: FOUND
- Commit 9d39efd: FOUND
