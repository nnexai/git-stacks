---
phase: 79
plan: 01
subsystem: release
tags: [release-prep, docs, changelog, readme, versioning]

# Dependency graph
requires:
  - phase: 74-template-label-cli-propagation
    provides: template label CLI, template filtering, label propagation semantics
  - phase: 75-di-seams-structured-logging
    provides: GS_DEBUG behavior and GIT_STACKS_DEBUG compatibility
  - phase: 77-indexed-config-store
    provides: indexed config-store release note content
  - phase: 78-operation-runner-with-rollback
    provides: rollback-based workspace creation release note content
  - phase: 78.1-turn-capability-enums-into-actual-typescript-interface-inste
    provides: final integration-contract wording constraints for release messaging
provides:
  - v0.17.0 package version bump
  - User-facing v0.17.0 changelog entry
  - README coverage for template-label workflows and GS_DEBUG module filters
  - Phase 79 closeout and verification artifacts
affects:
  - package.json
  - CHANGELOG.md
  - README.md
  - .planning/ROADMAP.md
  - .planning/STATE.md
  - .planning/PROJECT.md

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "release-prep updates only: documentation/versioning with no product-behavior changes"
    - "debug docs preserve backward compatibility while promoting GS_DEBUG as canonical selector"

key-files:
  created:
    - .planning/phases/79-release-prep/79-01-SUMMARY.md
    - .planning/phases/79-release-prep/79-VERIFICATION.md
  modified:
    - package.json
    - CHANGELOG.md
    - README.md
    - .planning/ROADMAP.md
    - .planning/STATE.md
    - .planning/PROJECT.md

key-decisions:
  - "Changelog stays user-facing first and uses Added / Changed / Internal"
  - "Template labels are described as one cohesive feature covering commands, filtering, and propagation"
  - "README documents GS_DEBUG=<module[,module]> while preserving GIT_STACKS_DEBUG=1 compatibility guidance"
  - "Phase 78.1 capability-list churn remains out of release-facing messaging"

requirements-completed: [release-prep]

# Metrics
duration: 4min
completed: 2026-04-06
---

# Phase 79 Plan 01: Release Prep Summary

**v0.17.0 is now release-prepped in-repo: the package version is bumped to 0.17.0, the changelog has a user-facing release note, the README documents template-label workflows plus GS_DEBUG module filtering, and the Phase 79 planning artifacts mark the release-prep phase complete.**

## Scope Completed

- Bumped `package.json` from `0.16.0` to `0.17.0`
- Added a `CHANGELOG.md` entry for `0.17.0` with `Added`, `Changed`, and `Internal` sections
- Updated `README.md` so template labels are documented as one feature: `template label add|remove|list|clear`, `template list --label`, and propagation into created workspaces
- Updated `README.md` debug guidance to preserve `GIT_STACKS_DEBUG=1` while documenting canonical `GS_DEBUG=<module[,module]>` filtering
- Wrote Phase 79 closeout artifacts and updated planning state files to reflect completion

## Validation

- `bun run typecheck`
- `bun run test`
- `bun run dev --version`

See `79-VERIFICATION.md` for command output summaries and results.

## Performance

- **Duration:** ~4 min
- **Started:** 2026-04-06T19:37:18Z
- **Completed:** 2026-04-06T19:41:22Z
- **Tasks:** 1
- **Files modified/created:** 8

## Deviations from Plan

None - plan executed within release-prep scope and without code-behavior changes.

## Threat Flags

None.

## Notes

- No commits were created because the user explicitly requested `Do not commit`.
- No product behavior changed in this phase; all edits are release metadata, documentation, and planning-state updates.

## Self-Check: PASSED

- FOUND: `package.json`
- FOUND: `CHANGELOG.md`
- FOUND: `README.md`
- FOUND: `.planning/phases/79-release-prep/79-01-SUMMARY.md`
- FOUND: `.planning/phases/79-release-prep/79-VERIFICATION.md`
