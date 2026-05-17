---
phase: 99-dashboard-actions-and-correctness-polish
status: clean
review_depth: standard
files_reviewed: 9
findings:
  critical: 0
  warning: 0
  info: 1
  total: 1
reviewed: 2026-05-17
---

# Phase 99 Code Review

## Scope

- `src/tui/dashboard/ActionMenu.tsx`
- `src/tui/dashboard/App.tsx`
- `src/tui/dashboard/RepoActionMenu.tsx`
- `src/tui/dashboard/issue-actions.ts`
- `src/tui/dashboard/types.ts`
- `tests/tui/dashboard/ActionMenu.test.tsx`
- `tests/tui/dashboard/RepoActionMenu.test.tsx`
- `tests/tui/dashboard/integ-action-menu.test.tsx`
- `tests/tui/dashboard/issue-actions.test.ts`

## Findings

No open issues remain.

## Fixed During Review

### INFO-01: Forge issue action used non-web CLI form

`openWorkspaceIssue()` originally called `git-stacks integration <tracker> issue open <workspace>` for every tracker. For GitHub, GitLab, and Gitea, that command form prints issue information or URL unless `--web` is passed. The dashboard action is an operator "open issue" action, so the helper now adds `--web` for forge trackers while preserving Jira's command shape.

Fixed in commit `b6096d3` with focused `issue-actions` coverage.

## Verification

- `bun test tests/tui/dashboard/issue-actions.test.ts`
- `bun test tests/tui/dashboard/integ-action-menu.test.tsx`
- `bun run typecheck`
- `git diff --check`
