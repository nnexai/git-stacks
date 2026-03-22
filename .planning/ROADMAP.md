# Roadmap: git-stacks

## Milestones

- ✅ **v0.2.0 Foundation** — Phases 1-5 (shipped 2026-03-18) — Registry+Template model, test infra, file ops, destructive-op safety, UX polish. See [milestones/v1.0-ROADMAP.md](milestones/v1.0-ROADMAP.md)
- ✅ **v0.3.0 Dashboard UI Overhaul** — Phases 6-9 (shipped 2026-03-20) — Messaging system, tabbed dashboard, IPC push display, shell completion overhaul. See [milestones/v0.3.0-ROADMAP.md](milestones/v0.3.0-ROADMAP.md)
- ✅ **v0.4.0 TUI Hardening & Polish** — Phases 10-15.2 (shipped 2026-03-21) — Test harness, workspace sync, wizard create, repo management, screen polish, centered dialogs, integration overrides. See [milestones/v0.4.0-ROADMAP.md](milestones/v0.4.0-ROADMAP.md)
- ✅ **v0.6.0 Integration Orchestration & Niri** — Phases 16-20 (shipped 2026-03-22) — Typed artifact pipeline, centralized runner, niri compositor integration. See [milestones/v0.6.0-ROADMAP.md](milestones/v0.6.0-ROADMAP.md)
- 🚧 **v0.7.0 Close Command & Polish** — Phases 21-27 (in progress) — Workspace close command, niri display fix, test isolation, mock refactor, lifecycle phases, autocompletion polish, git forge integrations.

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

**Milestone Goal:** Close command, display fixes, test isolation, mock refactor, lifecycle phase separation, CLI polish, and git forge integrations.

- [x] **Phase 21: Workspace Close Command** - CLI and TUI teardown for integrations without deleting workspace state (completed 2026-03-22)
- [x] **Phase 22: Niri Display Fix** - Fix `[object Object]` rendering in TUI details pane for niri columns config (completed 2026-03-22)
- [x] **Phase 23: Test Environment Isolation** - Audit and enforce isolated config dirs across all tests (completed 2026-03-22)
- [x] **Phase 24: Mock Architecture Refactor** - Replace module-level mock.module() with injectable dependency mocking (completed 2026-03-22)
- [x] **Phase 24.1: Test Mock Hygiene (INSERTED)** - Eliminate stale @clack/prompts mocks and fix incomplete @/tui/utils mocks left over from Phase 24 (completed 2026-03-22)
- [ ] **Phase 25: Dedicated Lifecycle Phases** - Close before clean, clean before remove with finer-grained hooks
- [ ] **Phase 26: Autocompletion & Editor Polish** - Shell completion for `new --from`, editor shortcuts, force cleanup improvements
- [ ] **Phase 27: Git Forge Integrations** - GitHub/GitLab/Gitea PR/MR creation and issue/task linking

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
**Plans:** 1/1 plans complete
Plans:
- [x] 22-01-PLAN.md — formatConfigValue helper and detail pane fix for object serialization

### Phase 23: Test Environment Isolation
**Goal**: Every test that touches config reads from and writes to a temporary directory — no test can pollute or read from the real user config at `~/.config/git-stacks`.
**Depends on**: Phase 22
**Requirements**: TEST-01, TEST-02
**Success Criteria** (what must be TRUE):
  1. Running the full test suite leaves no files in `~/.config/git-stacks` or any other real user config path
  2. A shared test helper encapsulates the config isolation setup pattern so individual test files don't need to duplicate `HOME` redirection boilerplate
  3. Any test file that previously wrote to user config now passes with a clean temp dir
**Plans:** 1/1 plans complete
Plans:
- [x] 23-01-PLAN.md — Shared useIsolatedConfig helper + fix 3 offending test files (config, workspace-ops, messages)

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1-5. Foundation | v0.2.0 | 21/21 | Complete | 2026-03-18 |
| 6-9. Dashboard UI | v0.3.0 | 13/13 | Complete | 2026-03-20 |
| 10-15.2. TUI Hardening | v0.4.0 | 21/21 | Complete | 2026-03-21 |
| 16-20. Integration & Niri | v0.6.0 | 6/6 | Complete | 2026-03-22 |
| 21. Workspace Close Command | v0.7.0 | 1/1 | Complete    | 2026-03-22 |
| 22. Niri Display Fix | v0.7.0 | 1/1 | Complete    | 2026-03-22 |
| 23. Test Environment Isolation | v0.7.0 | 1/1 | Complete    | 2026-03-22 |
| 24. Mock Architecture Refactor | v0.7.0 | 2/2 | Complete    | 2026-03-22 |
| 24.1. Test Mock Hygiene | v0.7.0 | 1/1 | Complete    | 2026-03-22 |
| 25. Dedicated Lifecycle Phases | v0.7.0 | 0/3 | Not started | - |
| 26. Autocompletion & Editor Polish | v0.7.0 | 0/? | Not started | - |
| 27. Git Forge Integrations | v0.7.0 | 0/? | Not started | - |

### Phase 24: Mock Architecture Refactor

**Goal**: Add injectable `_exec` objects to shell-wrapper modules (tmux, cmux, lifecycle) and create a `prompts` wrapper in `tui/utils.ts`, following the proven `niri.ts` pattern. Update direct unit tests to use injection instead of `mock.module()`. Establishes the pattern without a full-codebase sweep.
**Requirements**: MOCK-01, MOCK-02, MOCK-03, MOCK-04
**Depends on:** Phase 23
**Plans:** 2/2 plans complete

Plans:
- [x] 24-01-PLAN.md — Add _exec to tmux.ts, cmux.ts, lifecycle.ts + direct unit tests
- [x] 24-02-PLAN.md — Prompts wrapper in tui/utils.ts + production import switchover

### Phase 24.1: Test Mock Hygiene (INSERTED)

**Goal:** Eliminate stale and incomplete test mocks left over from Phase 24's import migration. Remove dead `mock.module("@clack/prompts")` calls from 7 test files (production code no longer imports it), add `prompts` object to incomplete `@/tui/utils` mocks, and fix fragile implicit mock-cache ordering dependencies.
**Requirements**: MOCK-05
**Depends on:** Phase 24
**Plans:** 1/1 plans complete

Plans:
- [x] 24.1-01-PLAN.md — Remove dead @clack/prompts mocks from 7 files, add/fix @/tui/utils mocks in 3 files

### Phase 25: Dedicated Lifecycle Phases

**Goal**: Introduce cascading lifecycle phases so close happens before clean, and clean happens before remove. Each higher-level command composes lower-level functions: `remove` calls `close` then `clean` then does its own work; `clean` calls `close` then does its own work. New hooks (`pre_clean`, `post_close`, `post_clean`, `post_remove`, `pre_merge`) give users finer-grained control over teardown behavior. `merge` also participates in the full cascade.
**Requirements**: LC-01, LC-02, LC-03, LC-04, LC-05, LC-06, LC-07, LC-08, LC-09, LC-10, LC-11, LC-12, LC-13
**Depends on:** Phase 24
**Success Criteria** (what must be TRUE):
  1. `cleanWorkspace` calls `closeWorkspace` (via `_executeClose`) before worktree removal, with `pre_clean`/`post_clean` hooks
  2. `removeWorkspace` calls `cleanWorkspace` (via `_executeClean`) before YAML deletion, with `pre_remove`/`post_remove` hooks
  3. `mergeWorkspace` follows the full D-10 order: pre_close -> cleanup -> post_close -> pre_clean -> worktree removal -> post_clean -> pre_merge -> git merge -> pre_remove -> YAML delete -> post_remove -> post_merge
  4. `WS_TRIGGERED_BY` env var set in all hooks to indicate the parent command (close, clean, remove, merge)
  5. Per-repo `pre_clean` hooks fire immediately before each individual worktree removal (interleaved)
  6. Hook failure at any cascade step aborts the entire operation
  7. TUI dashboard passes `captured: true` to all lifecycle functions
**Plans:** 3 plans

Plans:
- [ ] 25-01-PLAN.md — Schema extensions + closeWorkspace refactor (buildBaseEnv, _executeClose, post_close, WS_TRIGGERED_BY)
- [ ] 25-02-PLAN.md — cleanWorkspace + removeWorkspace cascade refactor (_executeClean, pre_clean/post_clean, per-repo pre_clean, pre_remove/post_remove)
- [ ] 25-03-PLAN.md — mergeWorkspace cascade (full D-10 order, pre_merge) + TUI captured flag fix + runPreRemoveHooks removal

### Phase 26: Autocompletion & Editor Polish

**Goal**: Bundle of CLI quality-of-life improvements: enhance shell autocompletion to complete `new --from <template-name>`, add a quick command to open template/workspace YAML in $EDITOR, make `remove --force` delete folder and config even if config is incomplete, and make `cleanup --force` try removing the workspace folder.
**Requirements**: TBD
**Depends on:** Phase 25
**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd:plan-phase 26 to break down)

### Phase 27: Git Forge Integrations

**Goal**: Add integrations for GitHub, GitLab, and Gitea using their respective CLI tools (gh, glab, tea) to create MR/PRs and open them. Integrations should understand where repos are upstream (via git remote or explicit config). Additionally, provide issue/task linking so users can associate a workspace with a task/issue and quickly open or fetch it.
**Requirements**: TBD
**Depends on:** Phase 26
**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd:plan-phase 27 to break down)
