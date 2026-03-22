# Roadmap: git-stacks

## Milestones

- ✅ **v0.2.0 Foundation** — Phases 1-5 (shipped 2026-03-18) — Registry+Template model, test infra, file ops, destructive-op safety, UX polish. See [milestones/v1.0-ROADMAP.md](milestones/v1.0-ROADMAP.md)
- ✅ **v0.3.0 Dashboard UI Overhaul** — Phases 6-9 (shipped 2026-03-20) — Messaging system, tabbed dashboard, IPC push display, shell completion overhaul. See [milestones/v0.3.0-ROADMAP.md](milestones/v0.3.0-ROADMAP.md)
- ✅ **v0.4.0 TUI Hardening & Polish** — Phases 10-15.2 (shipped 2026-03-21) — Test harness, workspace sync, wizard create, repo management, screen polish, centered dialogs, integration overrides. See [milestones/v0.4.0-ROADMAP.md](milestones/v0.4.0-ROADMAP.md)
- ✅ **v0.6.0 Integration Orchestration & Niri** — Phases 16-20 (shipped 2026-03-22) — Typed artifact pipeline, centralized runner, niri compositor integration. See [milestones/v0.6.0-ROADMAP.md](milestones/v0.6.0-ROADMAP.md)
- 🚧 **v0.7.0 Close Command & Polish** — Phases 21-23 (in progress) — Workspace close command, niri display fix, test isolation hardening.

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

<details>
<summary>✅ v0.4.0 TUI Hardening & Polish (Phases 10-15.2) — SHIPPED 2026-03-21</summary>

- [x] Phase 10: test-harness (2/2 plans) — completed 2026-03-21
- [x] Phase 11: tui-prerequisites (1/1 plan) — completed 2026-03-21
- [x] Phase 12: workspace-sync (3/3 plans) — completed 2026-03-21
- [x] Phase 13: wizard-create-workspace (3/3 plans) — completed 2026-03-21
- [x] Phase 14: template-and-repo-management (3/3 plans) — completed 2026-03-21
- [x] Phase 15: integration-tests-and-screen-polish (3/3 plans) — completed 2026-03-21
- [x] Phase 15.1: action-menu-cursor-unification-and-centered-dialog (3/3 plans) — completed 2026-03-21
- [x] Phase 15.2: integration-overrides-per-template-and-workspace (3/3 plans) — completed 2026-03-21

See [milestones/v0.4.0-ROADMAP.md](milestones/v0.4.0-ROADMAP.md) for full details.

</details>

<details>
<summary>✅ v0.6.0 Integration Orchestration & Niri (Phases 16-20) — SHIPPED 2026-03-22</summary>

- [x] Phase 16: artifact-type-foundation (1/1 plans) — completed 2026-03-21
- [x] Phase 17: integration-runner (2/2 plans) — completed 2026-03-21
- [x] Phase 18: artifact-population (1/1 plans) — completed 2026-03-21
- [x] Phase 19: niri-shell-wrappers (1/1 plans) — completed 2026-03-22
- [x] Phase 20: niri-integration (1/1 plans) — completed 2026-03-22

See [milestones/v0.6.0-ROADMAP.md](milestones/v0.6.0-ROADMAP.md) for full details.

</details>

### 🚧 v0.7.0 Close Command & Polish (In Progress)

**Milestone Goal:** Add workspace close command, fix niri display bug, and harden test isolation so the tool is reliable and complete for lightweight teardown workflows.

- [x] **Phase 21: Workspace Close Command** - CLI and TUI teardown for integrations without deleting workspace state (completed 2026-03-22)
- [ ] **Phase 22: Niri Display Fix** - Fix `[object Object]` rendering in TUI details pane for niri columns config
- [ ] **Phase 23: Test Environment Isolation** - Audit and enforce isolated config dirs across all tests

## Phase Details

### Phase 21: Workspace Close Command
**Goal**: Users can cleanly tear down integration sessions (tmux, niri) for a workspace without losing any workspace or filesystem state, both from the CLI and the TUI dashboard.
**Depends on**: Phase 20 (niri integration exists; close must clean up what open created)
**Requirements**: CLOSE-01, CLOSE-02, CLOSE-03, CLOSE-04
**Success Criteria** (what must be TRUE):
  1. User can run `git-stacks close [name]` and the command ends the tmux session and removes the niri named workspace without deleting worktrees or workspace YAML
  2. After close, `git-stacks open [name]` succeeds and restores a working session — the workspace is fully re-openable
  3. Close runs any configured teardown hooks before integration cleanup
  4. The TUI dashboard Workspaces action menu includes a "close" entry that triggers the same teardown
**Plans:** 1/1 plans complete
Plans:
- [x] 21-01-PLAN.md — Schema update, closeWorkspace function, CLI command, TUI dashboard action

### Phase 22: Niri Display Fix
**Goal**: The TUI details pane renders niri columns configuration as human-readable text instead of the raw `[object Object]` JavaScript serialization artifact.
**Depends on**: Phase 21
**Requirements**: UI-01
**Success Criteria** (what must be TRUE):
  1. Niri integration config in the TUI workspace details pane shows the full column configuration (app, command, source windows, width) as readable text rather than `[object Object]`
  2. All other TUI detail pane fields are unaffected by the fix
**Plans:** 1 plan
Plans:
- [ ] 22-01-PLAN.md — formatConfigValue helper and detail pane fix for object serialization

### Phase 23: Test Environment Isolation
**Goal**: Every test that touches config reads from and writes to a temporary directory — no test can pollute or read from the real user config at `~/.config/git-stacks`.
**Depends on**: Phase 22
**Requirements**: TEST-01, TEST-02
**Success Criteria** (what must be TRUE):
  1. Running the full test suite leaves no files in `~/.config/git-stacks` or any other real user config path
  2. A shared test helper encapsulates the config isolation setup pattern so individual test files don't need to duplicate `HOME` redirection boilerplate
  3. Any test file that previously wrote to user config now passes with a clean temp dir
**Plans**: TBD

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1-5. Foundation | v0.2.0 | 21/21 | Complete | 2026-03-18 |
| 6-9. Dashboard UI | v0.3.0 | 13/13 | Complete | 2026-03-20 |
| 10-15.2. TUI Hardening | v0.4.0 | 21/21 | Complete | 2026-03-21 |
| 16-20. Integration & Niri | v0.6.0 | 6/6 | Complete | 2026-03-22 |
| 21. Workspace Close Command | v0.7.0 | 1/1 | Complete    | 2026-03-22 |
| 22. Niri Display Fix | v0.7.0 | 0/1 | Not started | - |
| 23. Test Environment Isolation | v0.7.0 | 0/? | Not started | - |
