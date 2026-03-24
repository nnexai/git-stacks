---
phase: 33-name-based-identity
plan: "01"
subsystem: config-io
tags: [identity, scan-based-lookup, doctor, drift-detection]
dependency_graph:
  requires: []
  provides: [scan-based-workspace-lookup, scan-based-template-lookup, doctor-drift-detection]
  affects: [src/lib/config.ts, src/commands/doctor.ts, tests/lib/config.test.ts]
tech_stack:
  added: []
  patterns: [scan-based YAML lookup, drift detection via filename-stem vs name-field comparison]
key_files:
  created: []
  modified:
    - src/lib/config.ts
    - src/commands/doctor.ts
    - tests/lib/config.test.ts
decisions:
  - "findWorkspaceFile and findTemplateFile are non-exported internal helpers — scan all .yml files in WORKSPACES_DIR/TEMPLATES_DIR and match on name field"
  - "listWorkspaces and listTemplates now use join(DIR, f) directly instead of workspacePath(name) / templatePath(name)"
  - "Doctor drift detection uses same scan pattern as findWorkspaceFile — reads each .yml, checks name !== filename stem"
metrics:
  duration: "4 minutes"
  completed: "2026-03-24T20:10:43Z"
  tasks_completed: 2
  files_modified: 3
---

# Phase 33 Plan 01: Scan-Based Identity Lookup Summary

Replaced filename-based workspace and template lookup with scan-based YAML name field resolution. Added doctor drift detection for name/filename divergence.

## What Was Built

**scan-based lookup in `src/lib/config.ts`:** Two internal (non-exported) helper functions `findWorkspaceFile(name)` and `findTemplateFile(name)` scan all `.yml` files in `WORKSPACES_DIR` and `TEMPLATES_DIR` respectively, matching on the `name` field parsed from YAML. When multiple files share the same name, a stderr warning is emitted and the first match is returned.

**Updated public functions:** `workspaceExists`, `readWorkspace`, `templateExists`, `readTemplate` all delegate to the scan helpers. `listWorkspaces` and `listTemplates` use `join(DIR, f)` directly instead of path-by-name helpers.

**Doctor drift detection in `src/commands/doctor.ts`:** `findWorkspaceNameDrift()` and `findTemplateNameDrift()` scan their respective directories and return `Issue[]` with icon `"warn"` when a file's YAML `name` field differs from the filename stem. Both are wired into `allIssues` and `wsIssuesByEntity`. Fix suggestion: `git-stacks rename X X` / `git-stacks template rename X X`.

## Tasks Completed

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | Scan-based lookup helpers in config.ts | 6d4ff45 | src/lib/config.ts, tests/lib/config.test.ts |
| 2 | Doctor drift detection | 012a1ef | src/commands/doctor.ts, tests/lib/config.test.ts |

## Test Coverage

- 41 tests pass in `tests/lib/config.test.ts` (6 new scan-based lookup tests, 3 new doctor drift detection tests)
- 7 new test cases in `describe("scan-based lookup")` block
- 3 new test cases in `describe("doctor drift detection")` block

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

None - all functionality is fully wired.

## Self-Check

- [x] `src/lib/config.ts` contains `function findWorkspaceFile`
- [x] `src/lib/config.ts` contains `function findTemplateFile`
- [x] `findWorkspaceFile` and `findTemplateFile` are NOT exported
- [x] `workspaceExists` contains `findWorkspaceFile(name) !== null`
- [x] `readWorkspace` contains `findWorkspaceFile(name)`
- [x] `templateExists` contains `findTemplateFile(name) !== null`
- [x] `readTemplate` contains `findTemplateFile(name)`
- [x] `listWorkspaces` uses `join(WORKSPACES_DIR, f)`
- [x] `listTemplates` uses `join(TEMPLATES_DIR, f)`
- [x] `doctor.ts` contains `function findWorkspaceNameDrift`
- [x] `doctor.ts` contains `function findTemplateNameDrift`
- [x] `doctor.ts` contains `...workspaceNameDrift` and `...templateNameDrift` in allIssues
- [x] `bun test tests/lib/config.test.ts` exits 0 (41 pass, 0 fail)
- [x] `bun run typecheck` exits 0

## Self-Check: PASSED
