# Roadmap: git-stacks

## Milestones

- ✅ **v0.2.0 Foundation** — Phases 1-5 (shipped 2026-03-18) — Registry+Template model, test infra, file ops, destructive-op safety, UX polish. See [milestones/v1.0-ROADMAP.md](milestones/v1.0-ROADMAP.md)
- ✅ **v0.3.0 Dashboard UI Overhaul** — Phases 6-9 (shipped 2026-03-20) — Messaging system, tabbed dashboard, IPC push display, shell completion overhaul. See [milestones/v0.3.0-ROADMAP.md](milestones/v0.3.0-ROADMAP.md)
- **v0.4.0 TUI Hardening & Polish** — Phases 10-15 (in progress)

## Phases

<details>
<summary>✅ v0.2.0 Foundation (Phases 1-5) — SHIPPED 2026-03-18</summary>

See [milestones/v1.0-ROADMAP.md](milestones/v1.0-ROADMAP.md) for full archive.

</details>

<details>
<summary>✅ v0.3.0 Dashboard UI Overhaul (Phases 6-9) — SHIPPED 2026-03-20</summary>

- [x] Phase 6: Message Store + CLI (3/3 plans) — completed 2026-03-19
- [x] Phase 7: Shell Completion Overhaul (1/1 plan) — completed 2026-03-19
- [x] Phase 8: Dashboard Tab Layout (6/6 plans) — completed 2026-03-20
- [x] Phase 9: IPC Push + Message Display (3/3 plans) — completed 2026-03-20

See [milestones/v0.3.0-ROADMAP.md](milestones/v0.3.0-ROADMAP.md) for full details.

</details>

### v0.4.0 TUI Hardening & Polish

- [x] **Phase 10: test-harness** — Component-level test infrastructure using testRender + config dir isolation (completed 2026-03-21)
- [x] **Phase 11: tui-prerequisites** — InlineInput cursor movement and runHooksCaptured before any wizard work (completed 2026-03-21)
- [x] **Phase 12: workspace-sync** — Sync action in workspace action menu with per-repo progress and timeout (completed 2026-03-21)
- [x] **Phase 13: wizard-create-workspace** — WizardView component + create workspace from Templates/Repos tabs (completed 2026-03-21)
- [x] **Phase 14: template-and-repo-management** — Template create wizard + full repo action menu (add/scan/remove) (completed 2026-03-21)
- [x] **Phase 15: integration-tests-and-screen-polish** — App integration tests + help bar, age display, responsive columns (completed 2026-03-21)

## Phase Details

### Phase 10: test-harness
**Goal**: Developers can run component-level TUI tests in CI without a real terminal, using the testRender headless API with isolated config directories
**Depends on**: Nothing (first phase of v0.4.0)
**Requirements**: T-01, T-02, T-03, T-04, T-06
**Success Criteria** (what must be TRUE):
  1. `bun test tests/tui/dashboard/` passes in CI without a display server or real terminal
  2. A test can type into `InlineInput`, press escape, and assert the rendered frame contains expected text
  3. A test can navigate `ActionMenu` with arrow keys and assert selected option changes
  4. Tests for `InlineInput` and `ActionMenu` exist and cover: typing, cursor move, backspace, escape cancel, enter confirm, arrow nav, option select
  5. Setting `GIT_STACKS_CONFIG_DIR` redirects all config reads/writes to a temp directory in any test
**Plans**: 2 plans
Plans:
- [x] 10-01-PLAN.md — Config dir isolation (GIT_STACKS_CONFIG_DIR) + ActionMenu cursor navigation
- [ ] 10-02-PLAN.md — InlineInput and ActionMenu component tests via testRender

### Phase 11: tui-prerequisites
**Goal**: InlineInput supports cursor-positioned editing and hook output is capturable as a stream, unblocking all wizard and create-flow work
**Depends on**: Phase 10 (test harness so prerequisites can be tested)
**Requirements**: P-01, P-02
**Success Criteria** (what must be TRUE):
  1. User can press left/right arrows inside an InlineInput field to move the cursor and insert a character mid-string
  2. A test asserts that InlineInput cursor movement produces the correct output after left-arrow + character insertion
  3. Calling `runHooksCaptured()` from a TUI context does not write any output directly to the terminal — output lines arrive via callback
**Plans**: 1 plan
Plans:
- [ ] 11-01-PLAN.md — InlineInput built-in input wrapper + runHooksCaptured lifecycle function

### Phase 12: workspace-sync
**Goal**: Users can sync a workspace from inside the TUI action menu and see per-repo progress without exiting to the CLI
**Depends on**: Phase 11 (prerequisites complete)
**Requirements**: WS-01, WS-02, WS-03, WS-04
**Success Criteria** (what must be TRUE):
  1. Pressing `s` in the workspace action menu starts a sync and shows a ProgressView with one status line per repo
  2. After sync completes, the user sees a summary showing how many repos synced and how many were skipped or failed
  3. A sync on a workspace with an unreachable remote produces an error message within 30 seconds — the TUI does not hang
  4. All other key bindings are blocked while sync is in progress (no double-dispatch)
**Plans**: 3 plans
Plans:
- [x] 12-01-PLAN.md — Backend: fetchOrigin timeout + syncWorkspace structured callback + fetch failure tracking
- [x] 12-02-PLAN.md — SyncProgressView component + tests
- [x] 12-03-PLAN.md — App.tsx integration: types, ActionMenu, executeSync, keyboard guards, render branch

### Phase 13: wizard-create-workspace
**Goal**: Users can create a new workspace entirely from within the TUI via Templates tab (action menu) or Repos tab (n key), with full back-navigation and cursor placement on the new entry
**Depends on**: Phase 11 (InlineInput cursor prerequisite), Phase 12 (ProgressView pattern validated)
**Requirements**: C-01, C-02, C-03
**Success Criteria** (what must be TRUE):
  1. Pressing `w` in the Templates action menu or `n` in the Repos tab opens a multi-step create wizard: enter name, enter branch, summary/confirm
  2. Pressing escape at any non-first step returns to the previous step; pressing escape at the first step cancels and returns to the list
  3. After a workspace is created, the list refreshes and the cursor sits on the newly created workspace row
  4. No `@clack/prompts` functions are called from within the TUI wizard flow (grep check passes)
**Plans**: 3 plans
Plans:
- [x] 13-01-PLAN.md — WizardView + CreateProgressView components, types, useWorkspaces.reload() fix, tests
- [x] 13-02-PLAN.md — Template-based create flow wired into App.tsx via TemplateActionMenu
- [x] 13-03-PLAN.md — Ad-hoc (Repos tab) create flow: multi-select, n key, wizard launch

### Phase 14: template-and-repo-management
**Goal**: Users can create a new template from the Repos tab action menu and perform remove actions on repos, with unified selection display across all tabs
**Depends on**: Phase 13 (WizardView component exists and patterns established)
**Requirements**: C-04, R-01, R-02, R-03, R-04
**Success Criteria** (what must be TRUE):
  1. Pressing Enter on a repo row opens RepoActionMenu with create workspace, create template, and remove options
  2. Selecting repos and pressing `t` in RepoActionMenu opens a template create wizard; new template appears in Templates tab after completion
  3. Pressing `r` on a repo with references shows a blocked-removal view; pressing `r` on a repo with no references shows confirm dialog and removes on confirm
  4. All three tabs use identical `>[x]` checkbox-style selection indicators
  5. Help bars are consistent across all tabs (Enter Actions, Space Select, / Filter, r Refresh, ? Help, q Quit)
**Plans**: 3 plans
Plans:
- [x] 14-01-PLAN.md — UIView type extensions + RepoActionMenu + RemoveBlockedView components with tests
- [x] 14-02-PLAN.md — Selection display unification (RepoList + TemplateList checkbox prefix)
- [x] 14-03-PLAN.md — App.tsx wiring: action handlers, template create wizard, repo remove, keyboard guards, help bar

### Phase 15: integration-tests-and-screen-polish
**Goal**: App-level integration tests cover all major flows end-to-end, and the TUI renders cleanly within 80 columns with human-readable workspace ages
**Depends on**: Phase 14 (all features complete before integration tests are meaningful)
**Requirements**: T-05, UI-01, UI-02, UI-03
**Success Criteria** (what must be TRUE):
  1. An integration test exercises the full tab-switch → action menu → wizard entry/completion/cancel sequence using only testRender (no PTY)
  2. The help bar text fits within 80 terminal columns with no truncation or overflow
  3. Workspace list rows display relative ages (`3d`, `2h`, `5m`) instead of ISO date strings
  4. Column widths in workspace and template lists adjust to available terminal width — no hard-coded character widths
**Plans**: 3 plans
Plans:
- [x] 15-01-PLAN.md — Screen polish: tiered help bar, relative workspace age, responsive column widths
- [x] 15-02-PLAN.md — Integration tests part 1: tab switching + action menu dispatch
- [x] 15-03-PLAN.md — Integration tests part 2: wizard entry/cancel + sync progress flow

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1-5. Foundation | v0.2.0 | 21/21 | Complete | 2026-03-18 |
| 6. Message Store + CLI | v0.3.0 | 3/3 | Complete | 2026-03-19 |
| 7. Shell Completion Overhaul | v0.3.0 | 1/1 | Complete | 2026-03-19 |
| 8. Dashboard Tab Layout | v0.3.0 | 6/6 | Complete | 2026-03-20 |
| 9. IPC Push + Message Display | v0.3.0 | 3/3 | Complete | 2026-03-20 |
| 10. test-harness | 2/2 | Complete    | 2026-03-21 | — |
| 11. tui-prerequisites | 1/1 | Complete    | 2026-03-21 | — |
| 12. workspace-sync | v0.4.0 | 3/3 | Complete    | 2026-03-21 |
| 13. wizard-create-workspace | v0.4.0 | 3/3 | Complete    | 2026-03-21 |
| 14. template-and-repo-management | v0.4.0 | 3/3 | Complete    | 2026-03-21 |
| 15. integration-tests-and-screen-polish | v0.4.0 | 3/3 | Complete   | 2026-03-21 |
| 15.1. action-menu-cursor-unification-and-centered-dialog | v0.4.0 | 3/3 | Complete    | 2026-03-21 |
| 15.2. integration-overrides-per-template-and-workspace | v0.4.0 | 2/3 | In Progress|  |

### Phase 15.2: Integration overrides per template and workspace (INSERTED)

**Goal:** Users can configure per-integration overrides at template and workspace level via CLI wizards, and see resolved integration state in TUI detail panes
**Requirements**: D-01 through D-12 (from CONTEXT.md)
**Depends on:** Phase 15
**Plans:** 3/3 plans complete

Plans:
- [x] 15.2-01-PLAN.md — Shared wizard helper + template wizard integration overrides
- [ ] 15.2-02-PLAN.md — Workspace wizard/clone integration overrides + git-stacks edit command
- [x] 15.2-03-PLAN.md — TUI detail pane integration display (WorkspaceDetail + TemplateDetail)

### Phase 15.1: Action menu cursor unification and centered dialog (INSERTED)

**Goal:** Unify selection cursor across all three tabs and convert all overlay/dialog/wizard/progress views to centered dialog boxes with dimmed backgrounds
**Requirements**: D-01 through D-20 (from CONTEXT.md)
**Depends on:** Phase 15
**Plans:** 3/3 plans complete

Plans:
- [x] 15.1-01-PLAN.md — CenteredDialog component + cursor unification for RepoActionMenu and TemplateActionMenu
- [x] 15.1-02-PLAN.md — Wrap small dialogs with CenteredDialog + promote to App root level
- [x] 15.1-03-PLAN.md — Wrap large/medium components with CenteredDialog + promote remaining views + visual verification
