# Phase 99 - Pattern Map

## Files and Existing Analogs

| Target | Role | Closest Analog | Pattern to Reuse |
|--------|------|----------------|------------------|
| `src/tui/dashboard/ActionMenu.tsx` | Workspace menu rows, disabled/grouped rows, issue/command entrypoints | Existing workspace menu rows and optional `Run` row | Preserve stable shortcuts and `CenteredDialog` keyboard handling. |
| `src/tui/dashboard/RepoActionMenu.tsx` | Repo menu edit row | `TemplateActionMenu.tsx` edit row | Add `Edit ($EDITOR)` without changing `w`, `t`, `r`. |
| `src/tui/dashboard/App.tsx` | Action routing, editor launch, progress views, picker transitions | Existing `runAction()`, `handleTemplateAction()`, `handleRepoAction()`, `ProgressView` flow | Keep side effects centralized; reload relevant lists after edits. |
| `src/tui/dashboard/types.ts` | View/action unions | Existing `Action` and `UIView` unions | Add explicit issue/command picker view states instead of widening `any`. |
| `src/tui/dashboard/CenteredDialog.tsx` | Shared dialog frame | Existing action menus and progress views | Reuse for any picker; no nested cards. |
| `src/lib/workspace-command.ts` | Manual command discovery and execution | Phase 95 command helpers | Use `listManualCommands()` and `runManualCommand()` directly. |
| `src/lib/workspace-yaml.ts` | Editor validation wrappers | Existing workspace/template/global/registry edit helpers | Use `editRegistryYaml()` for repo edit. |
| `src/lib/integrations/issue-utils.ts` | Linked issue resolution and error text | Existing integration issue commands | Reuse or extend narrowly for dashboard candidate discovery/error formatting. |
| `tests/tui/dashboard/ActionMenu.test.tsx` | Workspace menu component coverage | Existing shortcut/cursor tests | Add disabled row and new entrypoint assertions. |
| `tests/tui/dashboard/RepoActionMenu.test.tsx` | Repo menu component coverage | Existing selection-aware label tests | Add edit label/shortcut/dispatch assertions. |
| `tests/tui/dashboard/integ-action-menu.test.tsx` | App-level routing coverage | Existing action menu dispatch mocks | Add narrow routing tests for repo edit, issue picker/progress, and command picker/progress. |

## Data Flow

1. `App.tsx` passes selected workspace capability state into `ActionMenu`.
2. `ActionMenu` renders existing direct workspace rows plus grouped `Issue...` and `Commands...` rows with disabled reasons.
3. `App.tsx` handles enabled grouped rows:
   - issue: discover linked issue candidates, open directly for one, or show picker for many.
   - commands: call `listManualCommands()` and show the command picker.
4. Picker selection routes back to `App.tsx`, which sets `ProgressView`, runs the source helper or existing integration command behavior, appends output/error lines, and sets done.
5. Repo edit routes from `RepoActionMenu` to `App.tsx`, suspends the renderer, opens `registry.yml` through `editRegistryYaml()`, resumes, then reloads repos.

## Landmines

- `ActionMenu` currently uses a module-level `actions` array and direct shortcut lookup. Disabled rows require an item model that knows whether activation is allowed.
- `App.tsx` currently treats all action-menu views as `view: "action-menu"` for workspaces/templates. New picker views must be blocked in the global keyboard guard.
- `handleRun()` currently shells out to `git-stacks run`. Manual commands should not reuse that old run path; use Phase 95 helpers.
- Issue tracker open behavior may be easiest to reach through existing CLI modules, but direct subprocess use is harder to test. If a source helper is added, keep it narrow and covered by tracker tests.
- Phase 98 may still touch `App.tsx` and detail components. Executors must re-read current files before editing and keep Phase 99 changes minimal.
