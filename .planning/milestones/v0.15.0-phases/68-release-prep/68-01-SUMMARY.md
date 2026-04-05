---
phase: 68-release-prep
plan: "01"
subsystem: release
tags: [release-prep, version-bump, changelog, readme, dir-mode]
dependency_graph:
  requires: [64-schema-registry, 65-workspace-lifecycle, 66-git-operation-guards, 67-status-display-health]
  provides: [v0.15.0-release-artifacts]
  affects: [package.json, CHANGELOG.md, README.md]
tech_stack:
  added: []
  patterns: [keep-a-changelog, semantic-versioning]
key_files:
  created: []
  modified:
    - package.json
    - CHANGELOG.md
    - README.md
decisions:
  - "Typecheck errors in workspace-wizard.ts are pre-existing (confirmed present on base commit cf60ac2c before any changes) — out of scope for this documentation-only plan"
metrics:
  duration: "~10 minutes"
  completed: "2026-04-05"
  tasks_completed: 3
  tasks_total: 3
  files_changed: 3
---

# Phase 68 Plan 01: Release Prep v0.15.0 Summary

One-liner: Bumped version to 0.15.0, added CHANGELOG entry covering dir mode across Phases 64-67, and documented dir repos in README with concepts update and standalone section.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Bump version in package.json to 0.15.0 | d3a51f8a | package.json |
| 2 | Add v0.15.0 section to CHANGELOG.md | 07b00da1 | CHANGELOG.md |
| 3 | Update README.md with dir repos documentation | f46c8485 | README.md |

## What Was Done

**Task 1 — Version bump:** Changed `"version": "0.14.0-rc.0"` to `"0.15.0"` in package.json. Verified with `bun run src/index.ts --version` outputting `0.15.0`.

**Task 2 — CHANGELOG entry:** Inserted `## [0.15.0] — 2026-04-05` section at the top of CHANGELOG.md (above the existing `## [0.14.0]` section). The entry uses a single `### Added` subsection with `**Dir repos**` as a bold title followed by two paragraphs covering the full dir mode feature surface: registration (phases 64), lifecycle (phase 65), git guards (phase 66), and display/health (phase 67).

**Task 3 — README documentation:** Two changes:
1. Updated `## Concepts` — Repo Registry definition now reads "a flat list of local git repos and directories"; Workspace definition now lists `dir` mode as a third mode alongside worktree and trunk.
2. Inserted `## Dir Repos` section between `## Repo Registry` and `## Templates` with usage examples, behavior explanation (`mode: "dir"`, `main_path`, git skipping, hook injection, doctor validation), and illustrative code blocks.

## Verification Results

All acceptance criteria passed:
- `grep '"version": "0.15.0"' package.json` — match
- `bun run src/index.ts --version` — outputs `0.15.0`
- `grep "## \[0.15.0\]" CHANGELOG.md` — match at line 7 (before `## [0.14.0]` at line 17)
- `grep -ci "unreleased" CHANGELOG.md` — returns 0
- All dir-mode content checks (Dir repos, mode: "dir", repo add, repo scan, git-stacks doctor, git-stacks status) — all match
- README section ordering: `## Dir Repos` at line 58, after `## Repo Registry` (line 46), before `## Templates` (line 82)
- All README content checks — all match

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — this plan modifies only documentation files. No UI rendering or data wiring involved.

## Threat Flags

None — no new network endpoints, auth paths, file access patterns, or schema changes introduced. This plan modifies only documentation files.

## Self-Check: PASSED

- [x] package.json exists and contains `"version": "0.15.0"`
- [x] CHANGELOG.md contains `## [0.15.0]` at line 7
- [x] README.md contains `## Dir Repos` at line 58
- [x] Commit d3a51f8a exists (version bump)
- [x] Commit 07b00da1 exists (CHANGELOG)
- [x] Commit f46c8485 exists (README)
