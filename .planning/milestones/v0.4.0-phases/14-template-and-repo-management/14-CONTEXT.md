# Phase 14: template-and-repo-management — Context

**Gathered:** 2026-03-21
**Status:** Ready for planning

<domain>
## Phase Boundary

Users can create a new template from repos selected on the Repos tab, and perform remove actions on repos — all within the TUI. The Repos tab gets an action menu (Enter), and selection UX is unified across all three tabs with consistent `>[x]` checkbox indicators. Add/scan are deferred (require file path input / file explorer).

</domain>

<decisions>
## Implementation Decisions

### Entry points — template create from Repos tab selection
- **D-01:** Template create (C-04): select repos on Repos tab → Enter → action menu → "Create template" → WizardView (name → confirm) → template saved with selected repos defaulting to worktree mode + registry default branch
- **D-02:** No `n` key on Templates tab for create — creation lives on the Repos tab where the source data (repos) lives, paralleling the workspace create pattern from Phase 13
- **D-03:** The existing `n` shortcut on Repos tab for "Create workspace" moves INTO the action menu — no standalone `n` key anymore

### Repos tab action menu (R-01)
- **D-04:** Enter on a repo row opens `RepoActionMenu` with: `[w] Create workspace`, `[t] Create template`, `[r] Remove`
- **D-05:** Menu is selection-aware — when repos are multi-selected, labels show count: "Create workspace (3 repos)", "Create template (3 repos)", "Remove (3)". When single (no multi-select), shows focused repo name.
- **D-06:** Action menu follows the same component pattern as TemplateActionMenu and workspace ActionMenu

### Repo remove (R-04)
- **D-07:** Remove shows a ConfirmDialog listing workspaces and templates that reference the repo
- **D-08:** Remove is BLOCKED if any workspace or template references the repo — user must remove those references first. Dialog shows what references it and explains why removal is blocked.
- **D-09:** If no references exist, standard confirm dialog with repo name and path

### Unified selection display
- **D-10:** All three tabs use the `>[x]` / `>[ ]` / ` [x]` / ` [ ]` checkbox indicator style (currently only Workspaces uses this; Repos uses bare `x`/`>` markers)
- **D-11:** Templates tab gains Space multi-select (currently has none) — all three tabs behave identically: Space to toggle, Enter for action menu
- **D-12:** RepoList row format updated from bare markers to checkbox format matching WorkspaceRow
- **D-13:** TemplateList row format updated to include checkbox column

### Help bar alignment
- **D-14:** Repos tab help bar changes from `Space Select  n Create` to match the other tabs: `Enter Actions  Space Select  / Filter  r Refresh  ? Help  q Quit`
- **D-15:** All three tab help bars show the same core shortcuts — `1/2/3 Tabs  ↑↓/jk Navigate  Enter Actions  Space Select  / Filter  r Refresh  ? Help  q Quit`. Workspaces additionally shows `m Messages`.

### Template create wizard flow
- **D-16:** WizardView steps: name (text, with uniqueness validation via `templateExists()`) → confirm (shows template name + repo list with modes)
- **D-17:** All repos default to worktree mode + registry default branch — no per-repo mode picker in wizard. User can edit YAML after for description, branch patterns, hooks, modes.
- **D-18:** After template creation, switch to Templates tab and position cursor on the new template (parallels D-20 from Phase 13 for workspace create)

### Scope reduction — deferred
- **D-19:** Add repo (R-02) deferred — requires path input / file explorer component
- **D-20:** Scan repos (R-03) deferred — requires path input for scan directory
- **D-21:** No rename action on repos for now — edit YAML or use CLI

### Claude's Discretion
- RepoActionMenu component implementation details
- How to detect references (grep workspace/template YAMLs for repo name)
- Template YAML structure for the new template (schema already exists in config.ts)
- Whether `templateExists()` needs a new helper or reuses existing config functions
- Batch remove UX when multiple repos selected (sequential confirms or single batch confirm)

</decisions>

<specifics>
## Specific Ideas

- "Create from where the source data lives" — parallels Phase 13's workspace create pattern: repos are selected on Repos tab, template/workspace created from there
- Selection display must be identical across all tabs — the `>[x]` checkbox style from WorkspaceRow is the reference
- Help bar should be generic/consistent — tab-specific shortcuts (like `m Messages` for Workspaces) are additive, not replacing the common set

</specifics>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase 13 outputs (direct prerequisites)
- `src/tui/dashboard/WizardView.tsx` — Reusable wizard component; template create wizard reuses this with text + confirm steps
- `src/tui/dashboard/App.tsx` — Contains `executeCreateWorkspace()`, `buildAdhocWizardSteps()`, `reposSelected` signal, Space multi-select on Repos tab, `n` key handler to relocate into action menu
- `src/tui/dashboard/types.ts` — UIView union needs `wizard-create-template` variant; Action union may need extension

### Selection display (unification targets)
- `src/tui/dashboard/WorkspaceRow.tsx` — Reference `>[x]` checkbox implementation (line 28-32)
- `src/tui/dashboard/RepoList.tsx` — Currently bare markers, needs update to checkbox style
- `src/tui/dashboard/TemplateList.tsx` — Currently no selection, needs checkbox column + selected prop

### Action menu patterns
- `src/tui/dashboard/TemplateActionMenu.tsx` — Reference for RepoActionMenu component structure
- `src/tui/dashboard/ActionMenu.tsx` — Workspace action menu pattern

### Repo management
- `src/commands/repo.ts` — CLI `repo remove` implementation for reference
- `src/lib/config.ts` — `removeRegistryEntry()`, `listRegistryEntries()`, `readTemplate()`, `listTemplates()`, `writeTemplate()`, `templatePath()`
- `src/tui/dashboard/hooks/useRepos.ts` — `reload()` for post-remove refresh
- `src/tui/dashboard/hooks/useTemplates.ts` — `reload()` for post-create refresh
- `src/tui/dashboard/RepoDetail.tsx` — Already shows templates & workspaces referencing a repo (reuse for remove dialog)

### Requirements
- `.planning/REQUIREMENTS.md` — C-04, R-01, R-04 (R-02 and R-03 deferred)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `WizardView<T>` — text + confirm step wizard; directly reusable for template create (name → confirm)
- `TemplateActionMenu` — component pattern to replicate for `RepoActionMenu`
- `ConfirmDialog` — reusable for repo remove confirmation
- `WorkspaceRow` prefix logic — `>[x]` / `>[ ]` reference for unified selection
- `RepoDetail` — already computes referencing workspaces/templates (reuse for remove blocker logic)
- `executeCreateWorkspace()` — the `n` key handler logic to relocate into action menu dispatch
- `reposSelected` signal — already works on Repos tab, just needs to feed into action menu

### Established Patterns
- Detail box as universal action zone — action menus, wizards, confirm dialogs all render here
- Action dispatch: ActionMenu → handler → view transition
- Keyboard isolation: view guards block navigation when modal views are active
- Deferred input focus via `setTimeout(0)`
- Height-based tab visibility (OpenTUI renderer limitation)

### Integration Points
- `UIView` union — add `wizard-create-template` variant
- Repos tab Enter handler — currently `return` early; needs to open RepoActionMenu
- Help bar memo — repos line needs update
- `n` key handler on Repos tab — remove standalone handler, move logic into action menu dispatch
- Templates tab — add Space multi-select signal, selected prop to TemplateList
- All three list components — unify selection indicator to `>[x]` checkbox style

</code_context>

<deferred>
## Deferred Ideas

- Add repo from TUI (R-02) — requires path input / file explorer; use CLI `repo add` for now
- Scan repos from TUI (R-03) — requires scan directory path; use CLI `repo scan` for now
- Repo rename in TUI — edit YAML or use CLI `repo rename`
- Per-repo mode/branch picker in template create wizard — edit YAML after creation
- Template description step in wizard — edit YAML after creation
- Batch remove confirmation (single dialog for multiple selected repos) — start with sequential

</deferred>

---

*Phase: 14-template-and-repo-management*
*Context gathered: 2026-03-21*
