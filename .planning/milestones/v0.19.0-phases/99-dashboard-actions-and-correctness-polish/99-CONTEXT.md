# Phase 99: Dashboard Actions and Correctness Polish - Context

**Gathered:** 2026-05-17T15:42:14+02:00
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 99 improves dashboard action surfaces after the Phase 98 grounded dashboard work. It adds missing useful actions to existing TUI menus: repo edit from the Repos tab, linked issue opening from the workspace menu, and manual workspace command discovery/execution from the workspace menu. It also keeps action labels, disabled states, shortcuts, and footer hints coherent across Workspaces, Templates, and Repos.

**Scope override:** Dashboard create-flow rollback progress visibility is excluded from Phase 99 completely, even though older roadmap and requirements text still mention it through `DASH-01`. Downstream agents must not implement rollback progress work in this phase.

</domain>

<decisions>
## Implementation Decisions

### Action Menu Shape
- **D-01:** Use grouped action rows for new surfaces where the action may branch into multiple choices.
- **D-02:** Grouped rows should remain visible even when unavailable, using disabled state rather than disappearing.
- **D-03:** Disabled grouped rows should include the reason in the label, such as `Issue... (none linked)` or `Commands... (none configured)`.
- **D-04:** Preserve existing action-menu shortcuts when possible. Keep current letters stable and add new letters around them rather than rebalance the whole menu.

### Manual Command TUI Behavior
- **D-05:** Workspace `Commands...` opens a picker of visible command names, then runs the selected command through the existing manual-command execution behavior.
- **D-06:** The picker shows main command names only. Hidden `pre*` and `post*` command names remain implicit buckets and are not shown as primary picker entries.
- **D-07:** Manual command execution reuses the existing generic progress view rather than adding a dedicated command progress UI.
- **D-08:** Manual command failures should stay in the progress view until keypress so the user can read output and failure context before returning to the dashboard.

### Linked Issue Opening
- **D-09:** When exactly one linked issue exists, `Issue...` opens it directly.
- **D-10:** When multiple linked issues exist across trackers, open a tracker picker with rows like `GitHub: ABC-123` or `Jira: ABC-123`.
- **D-11:** Linked issue disabled labels should distinguish no linked issue from no available opener when that can be detected cheaply.
- **D-12:** If opening fails after the user selects an issue, stay in the generic progress/error view until keypress.

### Rollback Progress Visibility
- **D-13:** Exclude rollback progress visibility from Phase 99 completely. Do not change `CreateProgressView` or dashboard create-flow rollback rendering in this phase.

### the agent's Discretion
The agent may choose exact component boundaries, helper names, picker component reuse, and shortcut letters for new grouped rows. These choices must preserve existing shortcuts where possible and must not implement rollback progress visibility.

### Folded Todos
- **Add repo edit action** (`.planning/todos/pending/2026-05-17-add-repo-edit-action.md`): Folded fully into Phase 99. The Repos tab should expose an edit action wired consistently with existing workspace/template edit behavior.
- **Surface manual commands in TUI workspace menu** (`.planning/todos/pending/2026-05-17-surface-manual-commands-in-tui-menu.md`): Folded fully into Phase 99. The workspace action menu should expose manual commands through a grouped row and picker while preserving Phase 95 command-list defaults.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase Scope
- `.planning/ROADMAP.md` — Phase 99 goal and success criteria; note that rollback progress text is superseded by this context's scope override.
- `.planning/REQUIREMENTS.md` — `TUI-05` and `TUI-06` remain in scope; `DASH-01` is excluded from Phase 99 by this context.
- `.planning/PROJECT.md` — v0.19.0 operator-control-center goals and dashboard constraints.

### Folded Todo Seeds
- `.planning/todos/pending/2026-05-17-add-repo-edit-action.md` — Repo edit action motivation and target files.
- `.planning/todos/pending/2026-05-17-surface-manual-commands-in-tui-menu.md` — Manual command TUI menu motivation and boundaries.

### Prior Phase Contracts
- `.planning/phases/95-manual-workspace-commands/95-CONTEXT.md` — Manual command behavior, hidden `pre*` / `post*` defaults, execution semantics.
- `.planning/phases/96-workspace-notes/96-CONTEXT.md` — Notes stay separate from Phase 99 actions.
- `.planning/phases/97-file-status-view-model-for-tui/97-CONTEXT.md` — File status TUI support is adjacent dashboard detail work, not action-menu scope.
- `.planning/phases/98-grounded-dashboard-control-center/98-CONTEXT.md` — Dashboard layout/detail boundary and explicit deferral of repo edit/manual command menus to Phase 99.

### Existing Implementation
- `src/tui/dashboard/App.tsx` — Dashboard action routing, edit flows, progress views, repo actions, and create-flow code to avoid for rollback work.
- `src/tui/dashboard/ActionMenu.tsx` — Workspace action menu and existing `Run` row pattern.
- `src/tui/dashboard/RepoActionMenu.tsx` — Repos tab action menu target for edit action.
- `src/tui/dashboard/TemplateActionMenu.tsx` — Existing template edit pattern and shortcut consistency reference.
- `src/tui/dashboard/CreateProgressView.tsx` — Explicit non-target for this phase except for tests proving rollback is not included.
- `src/lib/workspace-command.ts` — Manual command listing, plan, hidden-command filtering, and execution behavior.
- `src/commands/command.ts` — CLI command surface that Phase 99 should mirror for visible command names and execution behavior.
- `src/lib/integrations/issue-utils.ts` — Existing linked issue resolution and error formatting helpers.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `ActionMenu.tsx` already supports a workspace action menu with direct rows, cursor navigation, letter shortcuts, and an optional `Run` row.
- `RepoActionMenu.tsx` is small and currently exposes create-workspace, create-template, and remove actions; it is the direct target for repo edit.
- `TemplateActionMenu.tsx` already exposes `Edit ($EDITOR)` and provides the consistency model for repo edit.
- `App.tsx` already has workspace and template editor launch flows that suspend/resume the renderer around `$EDITOR`.
- `workspace-command.ts` already provides `listManualCommands()`, `planManualCommand()`, and `runManualCommand()`.
- `WorkspaceDetail.tsx` already detects linked issue metadata for display, and `issue-utils.ts` provides shared issue helpers.

### Established Patterns
- Dashboard action menus use small centered dialogs, arrow navigation, Enter, Escape, and stable letter shortcuts.
- Existing progress-style dashboard actions keep the user in a progress view until they press a key after completion or failure.
- TUI code should call source helpers directly rather than shelling out to the CLI when library functions exist.
- Production code in `src/` must use relative imports, not `@/*`.

### Integration Points
- Extend `ActionMenu.tsx` with grouped rows for `Issue...` and `Commands...`, disabled labels, and picker transitions.
- Extend `RepoActionMenu.tsx` and `App.tsx` for repo edit routing using the existing editor suspend/resume pattern.
- Add a command picker view or reusable action picker for manual commands and multiple linked issues.
- Use `listManualCommands()` for visible command names and `runManualCommand()` for execution, preserving hidden bucket behavior.
- Use issue integration/open helpers where available and surface disabled/error states through menu labels and the generic progress/error view.
- Do not modify rollback progress parsing/rendering in create flows for this phase.

</code_context>

<specifics>
## Specific Ideas

New actions should feel like part of the existing dashboard, not a new command palette. Prefer grouped rows such as `Commands...` and `Issue...`, keep them visible with disabled reasons, and preserve existing menu shortcuts. Manual commands should be quick to run from the TUI without showing hidden `pre*` / `post*` entries or adding a dry-run step.

</specifics>

<deferred>
## Deferred Ideas

- Dashboard create-flow rollback progress visibility is excluded from Phase 99 and should be deferred or removed from the current milestone scope.
- Workspace stale classification remains deferred from v0.19.0.
- Forge source workspace creation is already completed in v0.18.0 and is not Phase 99 scope.
- Template composition explanation remains future template ergonomics work.

### Reviewed Todos (not folded)
- **Improve TUI dashboard experience** — Already folded into Phase 98; Phase 99 only carries action-menu consistency.
- **Add manual workspace commands** — Phase 95 implementation is complete; Phase 99 only surfaces those commands in the TUI.
- **Add workspace notes** — Phase 96/98 own notes storage and display; no Phase 99 action work.
- **Add workspace stale view** — Explicitly deferred from v0.19.0 by user request.
- **Create workspace from forge source** — Completed in v0.18.0.
- **Improve template composition understanding** — Weak match; leave as future template UX/documentation work.

</deferred>

---

*Phase: 99-Dashboard Actions and Correctness Polish*
*Context gathered: 2026-05-17T15:42:14+02:00*
