---
phase: 77-indexed-config-store
plan: 01
subsystem: database
tags: [config, cache, in-memory-index, yaml, bun, typescript]

requires:
  - phase: 76-integration-capability-contracts
    provides: stable config.ts read/write surface that the index wraps

provides:
  - In-memory Map index for workspaces and templates in config.ts
  - _cache seam (exported mutable object) for test isolation
  - deleteWorkspace / deleteTemplate functions consolidating YAML deletion + cache eviction
  - Cache-gated readWorkspace, readTemplate, listWorkspaces, listTemplates, workspaceExists, templateExists
  - Cache upsert on writeWorkspace/writeTemplate; cache eviction on delete

affects:
  - 78-operation-runner
  - workspace-lifecycle
  - workspace-ops
  - tui-dashboard

tech-stack:
  added: []
  patterns:
    - "Module-private Map + boolean flag for list caching (Option A: rebuild from Map)"
    - "_cache exported seam mirrors _exec pattern from lifecycle.ts and workspace-git.ts"
    - "beforeEach(_cache.workspaces.clear()) for test isolation in any test using real config functions"
    - "deleteWorkspace/deleteTemplate consolidate unlinkSync + cache eviction in config.ts"

key-files:
  created: []
  modified:
    - src/lib/config.ts
    - src/lib/workspace-lifecycle.ts
    - src/lib/workspace-ops.ts
    - tests/lib/config.test.ts
    - tests/lib/composition.test.ts
    - tests/lib/ports.test.ts
    - tests/helpers.ts

key-decisions:
  - "Option A (workspaceListPopulated boolean + rebuild from Map) chosen over Option B (separate list array) — single source of truth, avoids sync issues"
  - "deleteWorkspace/deleteTemplate added to config.ts (not just cache seam eviction) — consolidates all YAML file I/O in one module"
  - "removeWorkspace evicts cache before parse-attempt so externally-corrupted YAML is detected (D-12 behavior preserved)"
  - "_cache imported into workspace-lifecycle.ts for the corruption-detection eviction; D-07 restriction interpreted as no warmIndex/clearIndex API, not prohibiting _cache use"
  - "composition.test.ts and ports.test.ts added beforeEach cache resets — both write YAML directly to disk (not via writeTemplate/writeWorkspace), so Pitfall 5 applies"

requirements-completed:
  - ENGN-04
  - ENGN-05
  - ENGN-06

duration: 20min
completed: 2026-04-06
---

# Phase 77 Plan 01: Indexed Config Store Summary

**In-memory Map index over workspace and template YAML reads with `_cache` seam, `deleteWorkspace`/`deleteTemplate` consolidation, and O(1) cache-first lookups replacing per-call directory scans**

## Performance

- **Duration:** 20 min
- **Started:** 2026-04-06T09:08:34Z
- **Completed:** 2026-04-06T09:28:38Z
- **Tasks:** 1 (TDD: RED → GREEN → verify)
- **Files modified:** 7

## Accomplishments

- Added `workspaceIndex`/`templateIndex` Maps and `workspaceListPopulated`/`templateListPopulated` flags to `config.ts`
- All six public I/O functions (read/write/list for each entity) plus `workspaceExists`/`templateExists` now check the cache first
- Added `deleteWorkspace`/`deleteTemplate` exported functions that evict the cache and call `unlinkSync` atomically
- Replaced all five raw `unlinkSync(workspacePath/templatePath(...))` call sites in `workspace-lifecycle.ts` and `workspace-ops.ts`
- Exported `_cache` seam for test isolation, consistent with `_exec` pattern
- 13 new cache hit/miss/eviction tests in `describe("in-memory index")` all green
- Full suite 100% green (unit + 48/48 integration)

## Task Commits

1. **Task 1: Add in-memory index to config.ts with cache-gated reads, writes, deletes** - `8c5b5f2e` (feat)

## Files Created/Modified

- `/home/nnex/dev/prj/git-stacks/src/lib/config.ts` — In-memory Maps, `_cache` seam, cache-gated I/O functions, `deleteWorkspace`/`deleteTemplate`
- `/home/nnex/dev/prj/git-stacks/src/lib/workspace-lifecycle.ts` — Replaced 3 `unlinkSync(workspacePath(name))` calls with `deleteWorkspace(name)`; cache eviction before remove parse-attempt
- `/home/nnex/dev/prj/git-stacks/src/lib/workspace-ops.ts` — Replaced `unlinkSync(workspacePath(oldName))` and `unlinkSync(templatePath(oldName))` with `deleteWorkspace`/`deleteTemplate`
- `/home/nnex/dev/prj/git-stacks/tests/lib/config.test.ts` — Added `describe("in-memory index")` suite (13 tests); added `_cache.resetList()` to 4 existing `beforeEach` blocks
- `/home/nnex/dev/prj/git-stacks/tests/lib/composition.test.ts` — Added `beforeEach` cache reset (Pitfall 5: tests write YAML directly to disk)
- `/home/nnex/dev/prj/git-stacks/tests/lib/ports.test.ts` — Added `beforeEach` cache reset (same reason)
- `/home/nnex/dev/prj/git-stacks/tests/helpers.ts` — Added `deleteWorkspace`, `deleteTemplate`, `_cache` to `makeConfigMock` and real captures

## Decisions Made

- **Option A for list caching:** `workspaceListPopulated` boolean + `Array.from(workspaceIndex.values())` rebuild. Avoids a second array to keep in sync.
- **`deleteWorkspace`/`deleteTemplate` in config.ts:** Consolidates all YAML file deletion in one module. D-07 ("no clearIndex/warmIndex") interpreted as restricting cache-management-only APIs, not file-deletion helpers.
- **Cache eviction before removeWorkspace parse-attempt:** The D-12 test corrupts a workspace file externally after it's been cached. Without eviction, `readWorkspace` serves the cached (valid) object and the corruption is invisible. Added `_cache.workspaces.delete(name)` before the try/catch in `removeWorkspace`.
- **Pitfall 5 fixes:** `composition.test.ts` and `ports.test.ts` both write YAML files directly via `writeFileSync`/`write()` without going through `writeWorkspace`/`writeTemplate`. These files now get `beforeEach` resets to clear the cache, ensuring each test starts with a fresh scan.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Cache resets for tests that bypass writeWorkspace/writeTemplate**

- **Found during:** Task 1 (GREEN phase verification)
- **Issue:** `composition.test.ts` and `ports.test.ts` write YAML files directly to disk (not via the caching `writeWorkspace`/`writeTemplate`). After the cache was added, list operations returned stale cached data from earlier tests in the same file, causing false failures.
- **Fix:** Added `beforeEach` cache reset blocks to both files importing `_cache` via dynamic import. Also added cache resets to 4 pre-existing `beforeEach` blocks in `config.test.ts` that use real functions.
- **Files modified:** `tests/lib/composition.test.ts`, `tests/lib/ports.test.ts`, `tests/lib/config.test.ts`
- **Verification:** `bun run test` → 100% pass
- **Committed in:** `8c5b5f2e` (same task commit)

**2. [Rule 1 - Bug] Cache eviction before removeWorkspace parse-attempt**

- **Found during:** Task 1 (GREEN phase — workspace-ops test D-12 failure)
- **Issue:** `removeWorkspace` test writes workspace via `writeWorkspace` (caches it), then overwrites YAML with garbage directly via `writeFileSync`. `readWorkspace` returned the cached (valid) object instead of throwing, so the "Cannot parse" error path was never reached.
- **Fix:** Added `_cache.workspaces.delete(name)` in `workspace-lifecycle.ts:removeWorkspace` before the try/catch that reads and validates the workspace YAML. Also imported `_cache` into `workspace-lifecycle.ts`.
- **Files modified:** `src/lib/workspace-lifecycle.ts`
- **Verification:** `bun test tests/lib/workspace-ops.test.ts` → 90/90 pass
- **Committed in:** `8c5b5f2e` (same task commit)

**3. [Rule 1 - Bug] Replaced all unlinkSync call sites in workspace-lifecycle.ts and workspace-ops.ts**

- **Found during:** Task 1 (GREEN phase — mergeWorkspace/removeWorkspace tests showing stale workspaceExists)
- **Issue:** Five `unlinkSync(workspacePath/templatePath(name))` calls outside `config.ts` deleted files without evicting the cache. After deletion, `workspaceExists(name)` still returned `true` from cache.
- **Fix:** Added `deleteWorkspace`/`deleteTemplate` to `config.ts`; replaced all five raw `unlinkSync` call sites in `workspace-lifecycle.ts` (3) and `workspace-ops.ts` (2).
- **Files modified:** `src/lib/workspace-lifecycle.ts`, `src/lib/workspace-ops.ts`
- **Verification:** `bun run test` → all pass
- **Committed in:** `8c5b5f2e` (same task commit)

---

**Total deviations:** 3 auto-fixed (1 missing critical test isolation, 2 correctness bugs from stale cache after external file mutation)

**Impact on plan:** All three fixes were required for correctness — Pitfall 2 and Pitfall 5 from RESEARCH.md were anticipated; fixes matched the documented mitigations exactly. No scope creep.

## Issues Encountered

- TypeScript strict mode flagged unused `workspacePath` import in `workspace-ops.ts` after replacing the last raw `unlinkSync` call — removed from import.

## Known Stubs

None — all cache paths are wired to real data. No placeholder values introduced.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- `deleteWorkspace`/`deleteTemplate` are exported and ready for Plan 02 call-site migration
- `_cache` seam is exported and stable for downstream test isolation
- All ENGN-04, ENGN-05, ENGN-06 behaviors verified and committed
- Phase 78 (operation runner) can depend on O(1) workspace/template lookups

---
*Phase: 77-indexed-config-store*
*Completed: 2026-04-06*
