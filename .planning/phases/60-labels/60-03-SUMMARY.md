---
phase: 60-labels
plan: 03
subsystem: workspace-cli
tags: [workspace, list, new, wizard, labels]

requires:
  - phase: 60-labels
    plan: 01
    provides: "labels schema and matchesLabels"
  - phase: 60-labels
    plan: 02
    provides: "label command registration pattern"
provides:
  - "`git-stacks list --label` repeated AND filtering"
  - "`git-stacks new --label` repeated label assignment"
  - "Workspace wizard label prompt and template-label union at creation time"
  - "CLI and wizard tests for label-aware creation and filtering"
affects: [60-04]

tech-stack:
  added: []
  patterns:
    - "CLI list filtering reuses shared matchesLabels utility"
    - "Template labels are snapshotted into workspace YAML at creation time"

key-files:
  created: []
  modified:
    - src/commands/workspace.ts
    - src/tui/workspace-wizard.ts
    - tests/commands/list-columns.test.ts
    - tests/tui/workspace-wizard.test.ts

key-decisions:
  - "`list --label` uses AND logic when repeated"
  - "Wizard prompt accepts comma-separated labels only when CLI labels were not supplied"
  - "Template labels are unioned once during workspace creation, not inherited dynamically"

requirements-completed: [LBL-03, LBL-04, LBL-08]
completed: 2026-04-03
---

# Phase 60 Plan 03: List/New/Wizard Summary

**Wired labels into workspace creation and discovery: repeatable list filters, repeatable new flags, and a label prompt in the wizard**

## Accomplishments

- Added repeatable `--label <tag>` to `git-stacks list`
- Filters list output through shared `matchesLabels()` AND logic
- Added repeatable `--label <tag>` to `git-stacks new`
- Passed CLI labels into `runWorkspaceNew`
- Added wizard label normalization/validation and optional comma-separated label prompt
- Unioned template labels onto the workspace object at creation time
- Added CLI filter tests and wizard tests for CLI label input plus template-label union

## Files Created/Modified

- `src/commands/workspace.ts`
- `src/tui/workspace-wizard.ts`
- `tests/commands/list-columns.test.ts`
- `tests/tui/workspace-wizard.test.ts`

## Self-Check: PASSED

- FOUND: `src/commands/workspace.ts`
- FOUND: `Labels (optional, comma-separated):`
