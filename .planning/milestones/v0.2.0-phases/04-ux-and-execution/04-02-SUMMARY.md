---
phase: 04-ux-and-execution
plan: "02"
subsystem: ux
tags: [workspace, list, status, json, schema, last_opened, dirty-check]

# Dependency graph
requires:
  - phase: 04-ux-and-execution
    provides: formatError helper used in workspace.ts (plan 01)
  - phase: 03-design-and-conditional-implementation
    provides: WorkspaceSchema, WorkspaceRepoSchema, getWorkspaceListInfo, getWorkspaceStatus
provides:
  - WorkspaceSchema with optional last_opened field
  - WorkspaceListInfo with repoCount and lastOpened fields
  - getWorkspaceListInfo always checks dirty status, returns repoCount + lastOpened
  - openWorkspace updates last_opened timestamp on each open
  - list command shows name/branch/repo-count/last-opened/dirty by default
  - status command with --json flag emitting per-repo task_path
affects: [04-03, 04-04, future-phases-using-workspace-list]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "WorkspaceSchema optional fields: z.string().optional() for backward-compat additions"
    - "Always-on dirty checks in getWorkspaceListInfo (checkStatus param kept for backward compat only)"
    - "status --json: Promise.all over workspaces, per-repo task_path included for agent use"

key-files:
  created: []
  modified:
    - src/lib/config.ts
    - src/lib/workspace-ops.ts
    - src/commands/workspace.ts

key-decisions:
  - "getWorkspaceListInfo always runs dirty checks regardless of checkStatus param — param kept for backward compat only (UX-04)"
  - "dirty type changed from boolean | null to boolean in getWorkspaceListInfo — null was only used when checkStatus=false (now always true)"
  - "list default format: dirty mark + name + branch + repo count + lastOpened age — drops description column (too noisy)"
  - "openWorkspace re-reads workspace after hooks/integrations complete before writing last_opened — ensures latest YAML state is preserved"

patterns-established:
  - "lastOpened falls back to created age when last_opened is absent — smooth migration for existing workspaces"
  - "status --json guard placed before human-readable output — no text before/after JSON when --json flag is set"

requirements-completed: [UX-04, UX-02]

# Metrics
duration: 2min
completed: 2026-03-18
---

# Phase 4 Plan 02: List/Status UX Enhancements Summary

**WorkspaceSchema gains last_opened tracking, list shows branch/repo-count/dirty by default, and status --json emits per-repo task_path for agent use**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-18T20:33:09Z
- **Completed:** 2026-03-18T20:35:09Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Added `last_opened` optional field to WorkspaceSchema — backward compatible with all existing workspace YAMLs
- Extended `WorkspaceListInfo` with `repoCount` and `lastOpened` fields; dirty checks now always run (UX-04)
- `openWorkspace` writes `last_opened` ISO timestamp after each successful open
- `list` default columns now show: dirty mark, name, branch, repo count, last-opened age
- `status --json` flag added, emitting array of workspace objects with per-repo `task_path`, `branch`, `dirty`, `mode`, `exists`

## Task Commits

Each task was committed atomically:

1. **Task 1: Add last_opened to schema, extend getWorkspaceListInfo, update openWorkspace** - `2702780` (feat)
2. **Task 2: Update list default columns and add status --json** - `20667f8` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified
- `src/lib/config.ts` - Added `last_opened: z.string().optional()` to WorkspaceSchema
- `src/lib/workspace-ops.ts` - Extended WorkspaceListInfo with repoCount/lastOpened; always-on dirty checks; openWorkspace writes last_opened
- `src/commands/workspace.ts` - list command richer default columns; status command --json flag with task_path in per-repo objects

## Decisions Made
- `getWorkspaceListInfo` always runs dirty checks — `checkStatus` param kept for backward compatibility but ignored. Changed `dirty` type from `boolean | null` to `boolean` since null was only meaningful when checks were skipped.
- `openWorkspace` re-reads workspace with `readWorkspace(name)` before writing `last_opened` to ensure the latest YAML state (hooks/integrations may modify workspace during open) is preserved.
- `list` format drops the `description` column in favor of `repo count` and `last-opened` — description was truncated to 40 chars anyway and rarely useful at a glance.
- `lastOpened` falls back to `formatAge(workspace.created)` when `last_opened` is absent — graceful migration for existing workspaces.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- UX-04 (list richer columns) and UX-02 (status --json) requirements are complete
- `status --json` is now available for agent/script consumption including task_path per repo
- `last_opened` tracking enables time-based sorting/filtering in future plans
- Remaining phase 04 work: doctor --fix/--json (UX-03), sync --json (UX-02 partial), run --parallel (RUN-01)

## Self-Check: PASSED

All files present, all commits verified.

---
*Phase: 04-ux-and-execution*
*Completed: 2026-03-18*
