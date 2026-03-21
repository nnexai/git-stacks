---
phase: 14-template-and-repo-management
plan: 01
subsystem: tui-dashboard
tags: [components, types, tdd, repo-management]
dependency_graph:
  requires: []
  provides: [UIView-repo-variants, RepoActionMenu, RemoveBlockedView]
  affects: [src/tui/dashboard/types.ts, src/tui/dashboard/App.tsx]
tech_stack:
  added: []
  patterns: [TemplateActionMenu-pattern, For-list-rendering, useKeyboard-escape]
key_files:
  created:
    - src/tui/dashboard/RepoActionMenu.tsx
    - src/tui/dashboard/RemoveBlockedView.tsx
    - tests/tui/dashboard/RepoActionMenu.test.tsx
    - tests/tui/dashboard/RemoveBlockedView.test.tsx
  modified:
    - src/tui/dashboard/types.ts
decisions:
  - "RepoActionMenu uses reactive arrow functions for label text so labels update reactively when selectionCount prop changes"
  - "RemoveBlockedView accepts { name: string }[] for refs (not full Template/Workspace types) to keep component lightweight"
  - "kittyKeyboard: true in test renderOpts enables unambiguous escape sequence parsing, eliminating setTimeout delays"
metrics:
  duration_seconds: 85
  completed_date: "2026-03-21"
  tasks_completed: 2
  files_created: 4
  files_modified: 1
---

# Phase 14 Plan 01: UIView Extensions + Repo Action Components Summary

**One-liner:** UIView union extended with three repo management variants; RepoActionMenu and RemoveBlockedView components created with full TDD test coverage (11 tests, all passing).

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Extend UIView union + create RepoActionMenu component with tests | 0f22ee6 | types.ts, RepoActionMenu.tsx, RepoActionMenu.test.tsx |
| 2 | Create RemoveBlockedView component with tests | d54f5ac | RemoveBlockedView.tsx, RemoveBlockedView.test.tsx |

## What Was Built

### UIView union extensions (types.ts)

Three new discriminated union variants added after `create-progress`:

```typescript
| { view: "wizard-create-template"; source: "repos"; repoNames: string[] }
| { view: "repo-action-menu"; index: number }
| { view: "repo-remove-blocked"; repoName: string }
```

### RepoActionMenu component

Action menu for the repos tab, following the `TemplateActionMenu` pattern exactly. Key behaviors:
- Keyboard shortcuts: `w` = create-workspace, `t` = create-template, `r` = remove, `Escape` = cancel
- Selection-aware labels: when `selectionCount > 0`, labels include count suffix ("(N repos)" or "(N)")
- Reactive arrow functions for labels ensure prop changes update the UI

### RemoveBlockedView component

Read-only informational view shown when repo removal is blocked by active references:
- Header: `Cannot remove "{repoName}" — referenced by:`
- Lists template refs as `template: {name}` and workspace refs as `workspace: {name}`
- Footer: `Remove these references first, then retry.`
- Escape calls `onBack`

## Deviations from Plan

None — plan executed exactly as written.

## Verification Results

- `bun test tests/tui/dashboard/RepoActionMenu.test.tsx` — 6/6 pass
- `bun test tests/tui/dashboard/RemoveBlockedView.test.tsx` — 5/5 pass
- `bun run typecheck` — clean (0 errors)
- All three UIView variants confirmed in types.ts

## Known Stubs

None — components are complete implementations. They will be wired into App.tsx in Plan 03.

## Self-Check: PASSED

- [x] `src/tui/dashboard/types.ts` — exists, contains all three variants
- [x] `src/tui/dashboard/RepoActionMenu.tsx` — exists, exports `RepoActionMenu`
- [x] `src/tui/dashboard/RemoveBlockedView.tsx` — exists, exports `RemoveBlockedView`
- [x] `tests/tui/dashboard/RepoActionMenu.test.tsx` — exists, 6 test() calls
- [x] `tests/tui/dashboard/RemoveBlockedView.test.tsx` — exists, 5 test() calls
- [x] Commit 0f22ee6 — exists
- [x] Commit d54f5ac — exists
