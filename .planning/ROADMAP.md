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
- [ ] **Phase 12: workspace-sync** — Sync action in workspace action menu with per-repo progress and timeout
- [ ] **Phase 13: wizard-create-workspace** — WizardView component + create workspace from Workspaces tab
- [ ] **Phase 14: template-and-repo-management** — Template create wizard + full repo action menu (add/scan/remove)
- [ ] **Phase 15: integration-tests-and-screen-polish** — App integration tests + help bar, age display, responsive columns

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
**Plans**: TBD

### Phase 13: wizard-create-workspace
**Goal**: Users can create a new workspace entirely from within the TUI Workspaces tab, with full back-navigation and cursor placement on the new entry
**Depends on**: Phase 11 (InlineInput cursor prerequisite), Phase 12 (ProgressView pattern validated)
**Requirements**: C-01, C-02, C-03
**Success Criteria** (what must be TRUE):
  1. Pressing `n` in the Workspaces tab opens a multi-step create wizard: select template, enter name, enter branch
  2. Pressing escape at any non-first step returns to the previous step; pressing escape at the first step cancels and returns to the list
  3. After a workspace is created, the list refreshes and the cursor sits on the newly created workspace row
  4. No `@clack/prompts` functions are called from within the TUI wizard flow (grep check passes)
**Plans**: TBD

### Phase 14: template-and-repo-management
**Goal**: Users can create a new template from the Templates tab and perform add/scan/remove actions on the Repos tab without leaving the TUI
**Depends on**: Phase 13 (WizardView component exists and patterns established)
**Requirements**: C-04, R-01, R-02, R-03, R-04
**Success Criteria** (what must be TRUE):
  1. Pressing `n` in the Templates tab opens a create wizard and the new template appears in the list after completion
  2. Pressing enter on a repo row in the Repos tab opens an action menu with add, scan, and remove options
  3. User can add a repo by entering a filesystem path via InlineInput; an indicator shows whether the path currently exists on disk
  4. User can trigger a directory scan from within the TUI (suspends renderer, runs scan wizard, resumes)
  5. User can remove a repo with a confirm dialog that shows which workspaces currently reference it
**Plans**: TBD

### Phase 15: integration-tests-and-screen-polish
**Goal**: App-level integration tests cover all major flows end-to-end, and the TUI renders cleanly within 80 columns with human-readable workspace ages
**Depends on**: Phase 14 (all features complete before integration tests are meaningful)
**Requirements**: T-05, UI-01, UI-02, UI-03
**Success Criteria** (what must be TRUE):
  1. An integration test exercises the full tab-switch → action menu → wizard entry/completion/cancel sequence using only testRender (no PTY)
  2. The help bar text fits within 80 terminal columns with no truncation or overflow
  3. Workspace list rows display relative ages (`3d`, `2h`, `5m`) instead of ISO date strings
  4. Column widths in workspace and template lists adjust to available terminal width — no hard-coded character widths
**Plans**: TBD

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
| 12. workspace-sync | v0.4.0 | 0/? | Not started | — |
| 13. wizard-create-workspace | v0.4.0 | 0/? | Not started | — |
| 14. template-and-repo-management | v0.4.0 | 0/? | Not started | — |
| 15. integration-tests-and-screen-polish | v0.4.0 | 0/? | Not started | — |
