# Phase 13: wizard-create-workspace — Context

**Gathered:** 2026-03-21
**Status:** Ready for planning

<domain>
## Phase Boundary

Users can create a new workspace entirely from within the TUI — either from a template (Templates tab) or ad-hoc from selected repos (Repos tab). A generic WizardView component powers both flows with multi-step navigation, back-navigation, and cursor placement on the new entry after creation. No create action from the Workspaces tab — creation lives where the source data lives.

</domain>

<decisions>
## Implementation Decisions

### Entry points — create from source, not from destination
- **D-01:** Template-based create: Templates tab → action menu gains "Create workspace" action → launches wizard
- **D-02:** Ad-hoc create: Repos tab → multi-select repos (Space) or use highlighted repo → press `n` → launches wizard with selected repos defaulting to worktree mode
- **D-03:** No `n` key or create action in the Workspaces tab — the roadmap's C-01 requirement is fulfilled via Templates/Repos tabs instead
- **D-04:** Repos tab `n` behavior: if repos are multi-selected, uses those; if none selected, uses the currently highlighted repo

### Wizard step flow — template-based
- **D-05:** Steps: select template (skipped — already selected from Templates tab) → enter name → enter branch (prefilled from auto-expanded template pattern) → summary/confirm → create
- **D-06:** Branch input auto-expands the template's `branch_pattern` using the entered workspace name, shown as a prefilled editable input the user can accept or modify
- **D-07:** Summary step shows: template name, resolved branch, repo list with modes → `y` to create, `Esc` to go back

### Wizard step flow — ad-hoc (from Repos tab)
- **D-08:** Steps: repo selection (already done via multi-select/highlight) → enter name → enter branch (blank input, no pattern) → summary/confirm → create
- **D-09:** All selected repos default to worktree mode — no per-repo mode picker in the wizard (user can edit YAML after creation)

### Kept simple — edit later
- **D-10:** No per-repo mode override step in either wizard flow
- **D-11:** No description step — user can add via `e` (edit YAML) after creation
- **D-12:** No integration configuration step — use template/global defaults

### Back-navigation
- **D-13:** Escape at any non-first step returns to the previous step (C-02)
- **D-14:** Template wizard: escape at first step (name input) cancels and returns to Templates tab action menu/list
- **D-15:** Ad-hoc wizard: escape at first step (name input) cancels and returns to Repos tab list

### Progress display during creation
- **D-16:** After confirm, wizard transitions to a per-repo progress view — same pattern as SyncProgressView (one status line per repo updating in-place: pending → creating worktree → running hooks → done/failed)
- **D-17:** Hook failure shows a warning inline but does NOT abort — remaining repos continue
- **D-18:** "Done. Press any key to continue." pause after completion before returning to list
- **D-19:** If creation fails partway through, clean up partial state (remove created worktrees, delete workspace YAML) and show the error

### Post-creation cursor placement
- **D-20:** After creation completes and user dismisses progress, switch to Workspaces tab, reload list, and position cursor on the newly created workspace (C-03)

### Generic WizardView component
- **D-21:** Build a reusable WizardView component that Phase 14 (template create) can also use
- **D-22:** WizardView manages step/data state as local signals inside the component (per STATE.md decision)
- **D-23:** WizardView renders inside the detail box (same universal action zone pattern as action menu, confirm, progress)

### Claude's Discretion
- Exact WizardView step abstraction API (step definitions, data accumulation pattern)
- Progress view spinner/indicator characters and colors
- Hook output display (inline beneath repo line or collapsed)
- Cleanup implementation details on partial failure
- Whether summary step is a distinct WizardView step or a ConfirmDialog reuse
- Keyboard isolation approach within wizard steps

</decisions>

<specifics>
## Specific Ideas

- Entry point design: "create where the source data is" — user is already looking at the template or repos, so starting the wizard from there is natural context
- SyncProgressView from Phase 12 is the reference pattern for the creation progress display
- The WizardView component should be generic enough that Phase 14's template creation wizard reuses it without modification

</specifics>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Workspace creation logic (CLI reference)
- `src/tui/workspace-wizard.ts` — Full CLI wizard flow: template selection, name validation, repo mode overrides, branch pattern expansion, hooks, file ops, integration artifacts. This is the reference for WHAT creation does, adapted for TUI.
- `src/tui/workspace-clone.ts` — Clone wizard flow (secondary reference)

### Core creation functions
- `src/lib/config.ts` — `listTemplates()`, `readTemplate(name)`, `writeWorkspace()`, `workspaceExists(name)`, `expandBranchPattern(pattern, name)`, `readRegistry()`, `listRegistryEntries()`
- `src/lib/git.ts` — `createWorktree(repoPath, worktreePath, branch)` for git worktree creation
- `src/lib/workspace-ops.ts` — `mergeEnv()`, `writeEnvFiles()` for env setup; no single `createWorkspace()` function — creation logic lives in the wizard
- `src/lib/lifecycle.ts` — `runHooksCaptured()` for TUI-safe hook execution with line-based callbacks
- `src/lib/files.ts` — file copy/symlink operations from templates
- `src/lib/integrations/index.ts` — integration artifact generation after workspace creation

### TUI component patterns
- `src/tui/dashboard/App.tsx` — View state machine, action dispatch pattern, keyboard routing, tab switching
- `src/tui/dashboard/types.ts` — `UIView` union (needs wizard variant), `Action` union (needs create-workspace action for templates)
- `src/tui/dashboard/SyncProgressView.tsx` — Per-repo progress display pattern to replicate for creation progress
- `src/tui/dashboard/ActionMenu.tsx` — Template action menu needs new "Create workspace" entry
- `src/tui/dashboard/InlineInput.tsx` — Built-in `<input>` wrapper for name/branch input steps
- `src/tui/dashboard/ConfirmDialog.tsx` — Confirm pattern (may inform summary step)

### Data hooks
- `src/tui/dashboard/hooks/useWorkspaces.ts` — `reload()` returns `Promise<void>` for cursor placement after creation
- `src/tui/dashboard/hooks/useTemplates.ts` — Template list data for template-based flow

### Requirements
- `.planning/REQUIREMENTS.md` — C-01, C-02, C-03

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `SyncProgressView` — per-repo status table with in-place updates; direct pattern for creation progress
- `InlineInput` — built-in `<input>` wrapper with escape/confirm; used for name and branch steps
- `ConfirmDialog` — y/n confirm pattern; may inform summary/confirm step
- `ActionMenu` — existing template action menu to extend with "Create workspace" entry
- `expandBranchPattern()` — auto-expands `{name}` in branch patterns
- `runHooksCaptured()` — TUI-safe hook execution with line callbacks

### Established Patterns
- Detail box as universal action zone — wizard renders here, list stays visible (Phase 8 D-decision)
- Action dispatch: ActionMenu → `runAction()` → view transition (Phase 8/12 pattern)
- Keyboard isolation: view guards block navigation when modal views are active
- Height-based tab visibility over Switch/Match (Phase 8 decision — OpenTUI renderer limitation)
- Deferred input focus via `setTimeout(0)` to prevent trigger key leak (Phase 11)

### Integration Points
- `UIView` union in `types.ts` — add wizard view variant(s)
- `Action` union — add `"create-workspace"` for template action menu
- Template `ActionMenu` — add create-workspace entry
- Repos tab — add `n` key handler and batch selection support (Space already exists for Workspaces tab; replicate for Repos)
- `App.tsx` keyboard handler — route `n` from Repos tab to wizard launch
- `useWorkspaces.reload()` — call after creation, then set cursor to new workspace index

</code_context>

<deferred>
## Deferred Ideas

- Per-repo mode override in wizard — user can edit YAML after creation for now
- Description input step — edit YAML later
- Integration configuration step — use defaults
- Clone workspace from within TUI (`git-stacks clone` equivalent) — separate from create-new
- Workspace creation from Workspaces tab `n` key — may add later as a shortcut that prompts for template first

</deferred>

---

*Phase: 13-wizard-create-workspace*
*Context gathered: 2026-03-21*
