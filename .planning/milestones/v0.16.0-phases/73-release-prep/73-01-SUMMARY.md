---
phase: 73-release-prep
plan: 01
subsystem: release
tags: [release-prep, version-bump, changelog, readme, observability]
requires:
  - phase: 72-extraction-tests
    provides: completed dependency gate and extracted-module verification
provides:
  - package version 0.16.0
  - CHANGELOG entry for extracted workspace modules and stderr-only debug output
  - README documentation for `GIT_STACKS_DEBUG=1`
affects:
  - package.json
  - CHANGELOG.md
  - README.md
tech-stack:
  added: []
  patterns: [keep-a-changelog, semantic-versioning, stderr-only debug docs]
key-files:
  created: []
  modified:
    - package.json
    - CHANGELOG.md
    - README.md
completed: 2026-04-05
---

# Phase 73 Plan 01: Release Prep Summary

**Prepared v0.16.0 by bumping the version, documenting the observability surface in the changelog, and adding README guidance for `GIT_STACKS_DEBUG=1`.**

## Accomplishments

- Bumped `package.json` from `0.15.0` to `0.16.0`.
- Added a `## [0.16.0]` changelog section covering stderr-only debug output plus the workspace-engine extraction and dependency gate.
- Added a standalone `## Debug Output` README section with examples, stderr/JSON behavior, and the `manage` TUI suppression note.

## Files Modified

- `package.json`
- `CHANGELOG.md`
- `README.md`

## Verification

- `grep '"version": "0.16.0"' package.json`
- `bun run src/index.ts --version`
- `grep -n '## \[0.16.0\]' CHANGELOG.md`
- `grep -n '## Debug Output' README.md`
- `bun test tests/lib/observability.test.ts tests/commands/debug-output.test.ts tests/commands/status-json.test.ts`
- `bun run typecheck`

## Self-Check

- [x] package version is `0.16.0`
- [x] CHANGELOG has a top-level `0.16.0` entry
- [x] README documents `GIT_STACKS_DEBUG=1`
- [x] Release docs state the stderr-only contract and `manage` suppression behavior

---

*Phase: 73-release-prep*
*Completed: 2026-04-05*
