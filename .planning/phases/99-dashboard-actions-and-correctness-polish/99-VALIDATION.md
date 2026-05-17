# Phase 99 Validation Strategy

**Phase:** 99
**Created:** 2026-05-17
**Status:** Ready

## Validation Architecture

Phase 99 validation samples action correctness across menu rendering, picker routing, side-effect dispatch, and regression boundaries.

| Dimension | Required Sample |
|-----------|-----------------|
| Repo actions | `RepoActionMenu` renders `Edit ($EDITOR)` and dispatches `edit` without changing `w`, `t`, or `r`. |
| Workspace disabled rows | `ActionMenu` shows `Issue... (none linked)` and `Commands... (none configured)` as disabled rows that Enter and shortcuts cannot activate. |
| Workspace enabled rows | `Issue...` and `Commands...` open the correct direct action or picker flow. |
| Picker behavior | One linked issue opens directly; multiple issues show tracker-labeled rows. Visible manual commands show; hidden `pre*`/`post*` rows do not. |
| Progress behavior | Manual command failures and issue-open failures stay in `ProgressView` until keypress. |
| Rollback exclusion | Tests or source assertions prove Phase 99 does not modify `CreateProgressView` or create-flow rollback rendering. |

## Minimum Automated Gate

- `bun run test tests/tui/dashboard/ActionMenu.test.tsx tests/tui/dashboard/RepoActionMenu.test.tsx tests/tui/dashboard/integ-action-menu.test.tsx`
- Add focused tests for any new picker component.
- `bun run typecheck`

## Manual Smoke

After implementation, run `git-stacks manage` in a fixture config with:

- A repo registry entry, then verify Repos -> Enter -> Edit launches the configured editor path.
- A workspace with no issue and no commands, then verify disabled labels.
- A workspace with one linked issue, then verify direct open progress/error visibility.
- A workspace with multiple linked issues, then verify the tracker picker.
- A workspace with `verify`, `preverify`, and `postverify`, then verify only `verify` appears in the picker and runs the resolved command group.

## Validation Risk

The biggest risk is App-level mocking brittleness. Prefer focused component tests for menu/picker state and keep App integration tests narrow around routing and visible progress output.
