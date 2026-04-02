---
phase: 51-workspace-port-allocation
plan: "04"
subsystem: tui/workspace-wizard, lib/composition
tags: [ports, workspace-creation, template-composition]
dependency_graph:
  requires: ["51-01", "51-02"]
  provides: ["PORT-WIZARD-01", "PORT-TEMPLATE-01"]
  affects: ["src/tui/workspace-wizard.ts", "src/lib/composition.ts"]
tech_stack:
  added: []
  patterns: ["template-snapshot-at-creation", "last-wins-merge", "ports-composition"]
key_files:
  created: []
  modified:
    - src/tui/workspace-wizard.ts
    - src/lib/composition.ts
    - tests/tui/workspace-wizard.test.ts
decisions:
  - "composition.ts mergeTemplatePorts is self-contained (no import from ports.ts) to avoid coupling"
  - "port names prompt placed after description, before integration overrides, applies to all creation modes"
metrics:
  duration: "6min"
  completed: "2026-04-01"
  tasks_completed: 2
  files_modified: 3
---

# Phase 51 Plan 04: Workspace Port Wizard and Template Composition Summary

**One-liner:** Port name prompt added to workspace wizard with template port snapshotting; template composition extended to merge ports with last-wins precedence.

## What Was Built

**Task 1: Port name prompt and template port snapshot (src/tui/workspace-wizard.ts)**

- Added `import { mergePorts } from "../lib/ports"` at top of file
- Added `let wsPorts: Record<string, number | null> | undefined` alongside other `ws*` variables
- Added `wsPorts = template.ports ? { ...template.ports } : undefined` in all 3 template snapshot blocks (templateNames CLI flow, fromSource template flow, interactive template selection flow)
- Added port name prompt after description prompt: "Port names (comma-separated, leave empty to skip):"
- User-declared port names are converted to `{ NAME: null }` entries (unresolved, per D-01)
- `mergePorts(wsPorts, userDeclaredPorts)` merges template ports with user-declared ports — workspace/user wins on same key (per D-04)
- `...(wsPorts ? { ports: wsPorts } : {})` added to workspace object construction

**Task 2: Ports merge in template composition (src/lib/composition.ts)**

- Added `mergeTemplatePorts(templates: Template[])` function following same pattern as `mergeEnvVars`
- Last-wins semantics via `Object.assign` — consistent with env merge behavior
- Self-contained in composition.ts, no import from ports.ts (avoids coupling)
- Added `ports: mergeTemplatePorts(orderedTemplates)` to `composeTemplates` return object

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Updated workspace-wizard tests to handle new port names prompt**
- **Found during:** Post-task full test suite run
- **Issue:** 4 existing workspace-wizard integration tests provided 3 `safeText` mock values (name, branch, description) but the new port names prompt added a 4th `safeText` call — all 4 tests failed
- **Fix:** Added `.mockResolvedValueOnce("")` (empty = skip ports) as 4th mock value in each of the 4 tests
- **Files modified:** `tests/tui/workspace-wizard.test.ts`
- **Commit:** 37100d0

## Commits

| Task | Commit | Message |
|------|--------|---------|
| Task 1 | 5ee6255 | feat(51-04): add port name prompt and template port snapshot to workspace wizard |
| Task 2 | d5c1266 | feat(51-04): add ports merge to template composition |
| Fix | 37100d0 | fix(51-04): update workspace-wizard tests to provide port names prompt input |

## Verification

- `bun run typecheck` passes
- `bun run test` passes — 37/37 integration test suites, all unit tests
- `grep -n "Port names" src/tui/workspace-wizard.ts` shows prompt at line 341-344
- `grep -n "mergePorts" src/tui/workspace-wizard.ts` shows import (line 30) and call (line 358)
- `grep -n "mergeTemplatePorts" src/lib/composition.ts` shows function (line 100) and usage (line 243)

## Self-Check: PASSED

- [x] `src/tui/workspace-wizard.ts` exists and contains all required changes
- [x] `src/lib/composition.ts` exists and contains `mergeTemplatePorts`
- [x] Commits 5ee6255, d5c1266, 37100d0 exist in git log
- [x] Full test suite passes
