---
phase: 13-wizard-create-workspace
plan: 02
subsystem: ui
tags: [opentui, solidjs, tui, dashboard, worktrees, templates]

# Dependency graph
requires:
  - phase: 13-01
    provides: WizardView component with step system, CreateProgressView with per-repo status rows, UIView union extended with wizard-create and create-progress variants
  - phase: 12-workspace-sync
    provides: SyncProgressView pattern for any-key-to-continue, runHooksCaptured for TUI-safe hook execution

provides:
  - Template-based create workspace flow wired end-to-end in App.tsx
  - TemplateActionMenu [w] Create workspace entry dispatching 'create-workspace' action
  - buildTemplateWizardSteps() for name+branch collection with existence validation and pattern prefill
  - executeCreateWorkspace() with full creation sequence: pre/post hooks, worktree creation, file ops, env files, YAML write, integration artifacts
  - D-17: hook failures warn but don't abort (abortOnFailure=false)
  - D-19: partial failure cleanup removes already-created worktrees
  - D-20: cursor placement on new workspace in Workspaces tab after creation
  - Keyboard guards for wizard-create and create-progress views

affects: [13-03-adhoc-flow, any plan that adds workspace creation flows]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "executeCreateWorkspace() follows workspace-wizard.ts creation sequence: pre_create hooks -> create worktrees -> file ops -> env files -> post_create hooks -> writeWorkspace -> integrations"
    - "Any-key-to-continue on create-progress done: reload().then() with cursor placement, same pattern as sync-progress"
    - "Wizard keyboard guard: if (v.view === 'wizard-create') return — WizardView handles its own keys"

key-files:
  created: []
  modified:
    - src/tui/dashboard/TemplateActionMenu.tsx
    - src/tui/dashboard/App.tsx

key-decisions:
  - "executeCreateWorkspace handles both template-based and ad-hoc (repoNames) flows in a single function — ad-hoc path stub included for D-09 completeness, wired in Plan 03"
  - "readTemplate() called inside JSX render closure for wizard-create view to ensure fresh template data at wizard launch time"
  - "Pre-create hook rows reset to 'pending' after hooks run, before worktree creation begins — provides cleaner progress UX"

patterns-established:
  - "Detail box title updated for new views: wizard-create -> ' Create Workspace ', create-progress -> ' Creating {name}... '"
  - "Keyboard isolation: wizard-create guard placed after inline-input guard, before list view handler"

requirements-completed: [C-01, C-02, C-03]

# Metrics
duration: 15min
completed: 2026-03-21
---

# Phase 13 Plan 02: Wire Template-Based Create Workspace Flow Summary

**Full template-based workspace creation wired in TUI: TemplateActionMenu [w] key -> WizardView name+branch -> CreateProgressView per-repo progress -> cursor on new workspace in Workspaces tab**

## Performance

- **Duration:** 15 min
- **Started:** 2026-03-21T09:45:00Z
- **Completed:** 2026-03-21T09:50:17Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- TemplateActionMenu gains [w] Create workspace entry with `w` key handler dispatching `"create-workspace"` action
- App.tsx wired with complete template-based creation flow: WizardView data collection, executeCreateWorkspace() executing the full creation sequence, CreateProgressView per-repo progress display
- D-17 (hook failure tolerance), D-19 (partial failure cleanup), D-20 (cursor placement after creation) all implemented

## Task Commits

Each task was committed atomically:

1. **Task 1: Add create-workspace action to TemplateActionMenu** - `03b03b4` (feat)
2. **Task 2: Wire template-based create flow into App.tsx** - `d61a97f` (feat)

## Files Created/Modified

- `src/tui/dashboard/TemplateActionMenu.tsx` - Added [w] Create workspace entry, updated onAction type to include "create-workspace"
- `src/tui/dashboard/App.tsx` - Added imports (WizardView, CreateProgressView, config/git/lifecycle/files/integrations), signals (createRows, createDone, createSummary), buildTemplateWizardSteps(), executeCreateWorkspace(), keyboard guards for wizard-create and create-progress, JSX rendering, detailBoxTitle updates

## Decisions Made

- executeCreateWorkspace handles both template-based and ad-hoc (repoNames) flows in a single function — ad-hoc code path included for completeness but only wired when repoNames is provided (Plan 03 will wire ad-hoc)
- readTemplate() called inside JSX render closure at wizard launch time to ensure fresh template data
- Pre-create hook progress rows reset to "pending" after hooks run — provides cleaner progress UX

## Deviations from Plan

None - plan executed exactly as written. One minor improvement added during implementation: pre_create hook rows are reset to "pending" status after hooks complete (before worktree creation begins) for cleaner UX. This was not in the plan spec but improves progress display without changing any behavior.

## Issues Encountered

None. TypeCheck passed on first attempt after all changes applied. All 39 existing tests remain green.

## Next Phase Readiness

- Template-based create flow complete and functional
- Plan 03 can add the ad-hoc (repo-selection) flow — executeCreateWorkspace already accepts repoNames parameter
- No blockers

---
*Phase: 13-wizard-create-workspace*
*Completed: 2026-03-21*
