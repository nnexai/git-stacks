# Phase 99 - Research

## User Constraints

### Locked Decisions
- D-01: Use grouped action rows for new surfaces where the action may branch into multiple choices.
- D-02: Grouped rows remain visible when unavailable and use disabled state instead of disappearing.
- D-03: Disabled grouped rows include the reason in the label, such as `Issue... (none linked)` or `Commands... (none configured)`.
- D-04: Preserve existing action-menu shortcuts where possible; add new letters around the current letters instead of rebalancing the whole menu.
- D-05: Workspace `Commands...` opens a picker of visible command names, then runs the selected command through existing manual-command execution behavior.
- D-06: The command picker shows main command names only; hidden `pre*` and `post*` command names remain implicit buckets.
- D-07: Manual command execution reuses the existing generic progress view.
- D-08: Manual command failures stay in the progress view until keypress.
- D-09: When exactly one linked issue exists, `Issue...` opens it directly.
- D-10: When multiple linked issues exist across trackers, open a tracker picker with rows like `GitHub: ABC-123` or `Jira: ABC-123`.
- D-11: Linked issue disabled labels distinguish no linked issue from no available opener when that can be detected cheaply.
- D-12: If opening fails after issue selection, stay in the generic progress/error view until keypress.
- D-13: Exclude rollback progress visibility completely. Do not change `CreateProgressView` or dashboard create-flow rollback rendering in Phase 99.

### Scope Override
- `DASH-01` is mentioned in older roadmap/requirements text, but Phase 99 planning follows `99-CONTEXT.md`: rollback progress visibility is excluded. Plans should satisfy `TUI-05` and `TUI-06`, plus the folded manual-command action-menu todo, without implementing rollback progress rendering.

## Standard Stack

- [VERIFIED: codebase] Dashboard UI is SolidJS/OpenTUI in `src/tui/dashboard/*.tsx`.
- [VERIFIED: codebase] Workspace, template, and repo action menus already use `CenteredDialog`, arrow navigation, Enter dispatch, Escape cancel, and stable letter shortcuts.
- [VERIFIED: codebase] `src/lib/workspace-yaml.ts` exposes `editRegistryYaml()`, `editWorkspaceYaml()`, and `editTemplateYaml()` validation wrappers. Repo edit can reuse `editRegistryYaml()` rather than creating a new registry editor path.
- [VERIFIED: codebase] `src/lib/workspace-command.ts` exposes `listManualCommands()` and `runManualCommand()`. `listManualCommands()` hides `pre*` and `post*` names by default, matching D-06.
- [VERIFIED: codebase] Linked issue metadata is stored under `workspace.settings.integrations.<tracker>.issue`; `WorkspaceDetail.tsx` already uses this source for display.
- [VERIFIED: codebase] Existing issue open behavior lives in tracker integration command modules. Phase 99 can reuse their CLI command family through dashboard progress handling, or add a narrow source helper if execution needs stronger testability.

## Architecture Patterns

- Keep action menus as focused keyboard dialogs. Add grouped rows and optional disabled state to the existing menu components instead of introducing a command palette.
- Keep branchy choices in a reusable picker-shaped component or a small local component that uses the same `CenteredDialog` conventions as action menus.
- Route all side effects through `App.tsx`, where progress views, renderer suspend/resume, tab state, and reload behavior already live.
- For repo edit, call `editRegistryYaml()` and suspend/resume the renderer around `$EDITOR`; reload repos after editor exit.
- For issue opening, derive linked issue candidates from workspace settings for the four existing tracker IDs: `github`, `gitlab`, `gitea`, `jira`. Open one directly; show a picker for multiple.
- For manual commands, derive picker entries from `listManualCommands(workspace)` and call `runManualCommand(workspace, commandName, { config: readGlobalConfig() })`, streaming concise progress lines into `ProgressView`.

## Don't Hand-Roll

- Do not implement rollback progress visibility, new create-flow rows, or `CreateProgressView` rendering.
- Do not duplicate hidden-command filtering; use `listManualCommands()` default behavior.
- Do not add a new broad `WEB-01` or forge browser-opening command family.
- Do not redesign dashboard layout or detail ordering from Phase 98.
- Do not add dependencies or a separate TUI framework.

## Common Pitfalls

- Adding shortcuts can collide with existing workspace menu keys. Preserve `o x n e c r m s p u` behavior and choose new keys only when no current shortcut uses them in the same menu.
- Disabled rows must be skipped by Enter and direct letter shortcuts; otherwise a disabled item can still run.
- Manual command execution from the TUI should not call `git-stacks command run` as a subprocess when the source helper can run the same behavior directly.
- Issue opening should keep failures visible in `ProgressView`; returning immediately to the list hides the exact tracker or CLI failure that the user needs.
- App-level tests often rely on module mocks set before dynamic import. New tests should follow existing `integ-action-menu.test.tsx` patterns.

## Validation Architecture

Nyquist validation for Phase 99 should sample the action surface across three independent dimensions:

- Action surfaces: workspace menu, repo menu, shared picker/progress flow.
- Data states: no issue, one issue, multiple issues, no command, visible commands with hidden `pre*`/`post*` buckets, editor open/reload path.
- Interaction states: disabled row rendering, arrow/Enter selection, direct letter shortcuts, progress view completion/failure until keypress.

Minimum validation is focused component/integration coverage for `ActionMenu`, `RepoActionMenu`, picker behavior, repo edit dispatch, linked issue opening, manual command execution, and a negative rollback-progress guard.

## Project Constraints

- [VERIFIED: codebase] Production `src/**` imports should stay relative.
- [VERIFIED: codebase] Tests may use the repo's existing Bun/OpenTUI `testRender` patterns.
- [VERIFIED: codebase] No package-manager changes are needed.

## RESEARCH COMPLETE
