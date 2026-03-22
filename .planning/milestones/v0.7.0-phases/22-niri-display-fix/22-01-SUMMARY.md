---
phase: 22-niri-display-fix
plan: "01"
subsystem: tui/dashboard
tags: [bug-fix, tui, niri, config-display]
dependency_graph:
  requires: []
  provides: [formatConfigValue helper, readable niri columns display]
  affects: [WorkspaceDetail.tsx, TemplateDetail.tsx]
tech_stack:
  added: []
  patterns: [shared utility helper for config serialization]
key_files:
  created:
    - src/tui/dashboard/configUtils.ts
    - tests/tui/dashboard/configUtils.test.ts
  modified:
    - src/tui/dashboard/WorkspaceDetail.tsx
    - src/tui/dashboard/TemplateDetail.tsx
    - tests/tui/dashboard/WorkspaceDetail.test.tsx
    - tests/tui/dashboard/TemplateDetail.test.tsx
decisions:
  - "formatConfigValue: niri columns detected by presence of 'windows' key on every array element — no niri-specific import needed in configUtils"
  - "Singular/plural: 1 col vs N cols for user readability"
metrics:
  duration: "2 min"
  completed_date: "2026-03-22"
  tasks: 2
  files: 6
---

# Phase 22 Plan 01: Niri Display Fix Summary

**One-liner:** Fixed `[object Object]` rendering in TUI detail panes by adding a `formatConfigValue` helper that serializes niri columns arrays as "N cols" and other non-primitive values as compact JSON.

## Objective

Fix the TUI workspace and template detail panes to render niri `columns` configuration as human-readable text instead of the raw `[object Object]` JavaScript serialization artifact.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Create formatConfigValue helper with unit tests | 2b69c2a | src/tui/dashboard/configUtils.ts, tests/tui/dashboard/configUtils.test.ts |
| 2 | Apply formatConfigValue to both detail panes and add integration tests | 2ec9e81 | WorkspaceDetail.tsx, TemplateDetail.tsx, WorkspaceDetail.test.tsx, TemplateDetail.test.tsx |

## What Was Built

### `src/tui/dashboard/configUtils.ts`

A single exported function `formatConfigValue(value: unknown): string` that:
- Returns `""` for null/undefined
- Returns `String(value)` for string, number, boolean primitives
- Returns elements joined with `", "` for arrays of primitives
- Returns `"N col(s)"` for niri columns arrays (objects with `windows` property)
- Returns `JSON.stringify(value)` for generic objects and arrays

### Detail Pane Fixes

Both `WorkspaceDetail.tsx` and `TemplateDetail.tsx` previously used:
```typescript
.map(([k, v]) => `${k}: ${v}`)   // BUG: v.toString() on objects = "[object Object]"
```

Both now use:
```typescript
.map(([k, v]) => `${k}: ${formatConfigValue(v)}`)
```

### Tests

- 10 unit tests for `formatConfigValue` covering all value types
- Test 7 in WorkspaceDetail: niri 2-column config renders "2 cols", not "[object Object]"
- Test 5 in TemplateDetail: niri 1-column config renders "1 col", not "[object Object]"

## Verification Results

- `bun test tests/tui/dashboard/configUtils.test.ts` — 10/10 pass
- `bun test tests/tui/dashboard/WorkspaceDetail.test.tsx tests/tui/dashboard/TemplateDetail.test.tsx` — 12/12 pass (7 + 5)
- `bun run typecheck` — clean, no errors
- `grep "object Object" WorkspaceDetail.tsx TemplateDetail.tsx` — no matches

## Deviations from Plan

None — plan executed exactly as written. TDD RED/GREEN cycle followed for Task 1.

## Known Stubs

None — all code paths are wired and tested.

## Self-Check: PASSED
