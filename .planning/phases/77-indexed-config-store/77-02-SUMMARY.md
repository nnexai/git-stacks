---
phase: 77-indexed-config-store
plan: 02
subsystem: database
tags: [config, cache, yaml, bun, typescript, template, workspace]

requires:
  - phase: 77-01
    provides: deleteWorkspace/deleteTemplate functions with cache eviction in config.ts

provides:
  - All unlinkSync(templatePath(...)) call sites in commands/template.ts and tui/dashboard/App.tsx replaced with deleteTemplate(...)
  - Complete migration: every workspace/template file deletion in src/ now goes through config.ts and evicts the cache

affects:
  - tui-dashboard
  - template-commands
  - 78-operation-runner

tech-stack:
  added: []
  patterns:
    - "deleteTemplate(name) replaces raw unlinkSync(templatePath(name)) at all external call sites"
    - "templatePath still exported for non-deletion uses (editor integration in App.tsx)"

key-files:
  created: []
  modified:
    - src/commands/template.ts
    - src/tui/dashboard/App.tsx

key-decisions:
  - "templatePath retained in App.tsx import — still used at line 645 for YAML editor path; only the deletion call site was replaced"
  - "Task 1 (workspace-lifecycle.ts and workspace-ops.ts) already completed by Wave 1 (77-01) — marked as already-complete, no changes needed"

requirements-completed:
  - ENGN-05

duration: 8min
completed: 2026-04-06
---

# Phase 77 Plan 02: Call-site Migration to deleteTemplate Summary

**Replaced final two raw `unlinkSync(templatePath(...))` call sites in `template.ts` and `App.tsx` with cache-aware `deleteTemplate()`, completing ENGN-05 across all four target files**

## Performance

- **Duration:** 8 min
- **Started:** 2026-04-06T09:29:25Z
- **Completed:** 2026-04-06T09:37:05Z
- **Tasks:** 2 (Task 1 already complete from Wave 1; Task 2 executed)
- **Files modified:** 2

## Accomplishments

- Replaced `unlinkSync(templatePath(template))` in `src/commands/template.ts:167` with `deleteTemplate(template)`; removed unused `unlinkSync` and `templatePath` imports
- Replaced `unlinkSync(templatePath(tmpl.name))` in `src/tui/dashboard/App.tsx:378` with `deleteTemplate(tmpl.name)`; removed `unlinkSync` from fs import; added `deleteTemplate` to config import
- Zero remaining `unlinkSync(workspacePath(...)` or `unlinkSync(templatePath(...)` calls outside `config.ts` — every deletion path now evicts the cache (ENGN-05 complete)
- Full suite 100% green: 544 unit tests + 48/48 integration tests pass; typecheck clean

## Task Commits

1. **Task 1: Migrate workspace deletion call sites to deleteWorkspace** - already complete (Wave 1 / 77-01, commit `8c5b5f2e`)
2. **Task 2: Migrate template deletion call sites to deleteTemplate** - `e86ff0d4` (feat)

## Files Created/Modified

- `/home/nnex/dev/prj/git-stacks/src/commands/template.ts` — replaced `unlinkSync(templatePath(template))` with `deleteTemplate(template)`; removed `unlinkSync` from fs import; replaced `templatePath` import with `deleteTemplate`
- `/home/nnex/dev/prj/git-stacks/src/tui/dashboard/App.tsx` — replaced `unlinkSync(templatePath(tmpl.name))` with `deleteTemplate(tmpl.name)`; removed `unlinkSync` from fs import; added `deleteTemplate` to config import (kept `templatePath` — still used for editor path)

## Decisions Made

- `templatePath` was retained in `App.tsx` — the `executeConfirmed` deletion call was replaced, but `templatePath` is also used at line 645 for the YAML editor open path (`spawn([editor, templatePath(name)])`). Removing it from the import would have broken that feature. Only the deletion call site was migrated.
- Task 1 was a no-op — Wave 1 (77-01) already replaced all workspace call sites in `workspace-lifecycle.ts` and `workspace-ops.ts` as a deviation Rule 1 fix. No changes needed in this plan.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] templatePath retained in App.tsx import after replacing deletion call**

- **Found during:** Task 2 (typecheck after initial edit)
- **Issue:** After replacing the `unlinkSync(templatePath(tmpl.name))` deletion call with `deleteTemplate(tmpl.name)`, TypeScript reported `error TS2552: Cannot find name 'templatePath'` at line 645 — `templatePath` is still used for the YAML editor open path, so removing it from the import broke that feature
- **Fix:** Added `templatePath` back to the config import alongside `deleteTemplate`
- **Files modified:** `src/tui/dashboard/App.tsx`
- **Verification:** `bun run typecheck` exits 0
- **Committed in:** `e86ff0d4` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 — bug from incomplete import analysis)
**Impact on plan:** Fix required for correctness — `templatePath` serves a different purpose (editor path) than the deletion call. No scope creep.

## Issues Encountered

- TypeScript strict mode caught the missing `templatePath` import immediately after the edit — caught at typecheck stage, not at runtime.

## Known Stubs

None — all deletion paths are wired to real cache-evicting functions. No placeholder values introduced.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- ENGN-05 complete: every workspace/template file deletion in `src/` now goes through `config.ts` and evicts the cache
- Phase 77 complete: ENGN-04 (in-memory index), ENGN-05 (write invalidation), ENGN-06 (scan fallback) all delivered
- Phase 78 (operation runner) can depend on O(1) cache-aware workspace/template lookups with correct invalidation on delete

---
*Phase: 77-indexed-config-store*
*Completed: 2026-04-06*

## Self-Check: PASSED

- FOUND: src/commands/template.ts
- FOUND: src/tui/dashboard/App.tsx
- FOUND: .planning/phases/77-indexed-config-store/77-02-SUMMARY.md
- FOUND: commit e86ff0d4
