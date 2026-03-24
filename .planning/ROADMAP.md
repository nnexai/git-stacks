# Roadmap: git-stacks

## Milestones

- ✅ **v0.2.0 Foundation** — Phases 1-5 (shipped 2026-03-18) — Registry+Template model, test infra, file ops, destructive-op safety, UX polish. See [milestones/v1.0-ROADMAP.md](milestones/v1.0-ROADMAP.md)
- ✅ **v0.3.0 Dashboard UI Overhaul** — Phases 6-9 (shipped 2026-03-20) — Messaging system, tabbed dashboard, IPC push display, shell completion overhaul. See [milestones/v0.3.0-ROADMAP.md](milestones/v0.3.0-ROADMAP.md)
- ✅ **v0.4.0 TUI Hardening & Polish** — Phases 10-15.2 (shipped 2026-03-21) — Test harness, workspace sync, wizard create, repo management, screen polish, centered dialogs, integration overrides. See [milestones/v0.4.0-ROADMAP.md](milestones/v0.4.0-ROADMAP.md)
- ✅ **v0.6.0 Integration Orchestration & Niri** — Phases 16-20 (shipped 2026-03-22) — Typed artifact pipeline, centralized runner, niri compositor integration. See [milestones/v0.6.0-ROADMAP.md](milestones/v0.6.0-ROADMAP.md)
- ✅ **v0.7.0 Close Command & Polish** — Phases 21-28 (shipped 2026-03-22) — Workspace close, lifecycle cascade, mock refactor, forge integrations, issue tracking, CLI polish. See [milestones/v0.7.0-ROADMAP.md](milestones/v0.7.0-ROADMAP.md)
- 🚧 **v0.8.0 Integration Polish & Workspace UX** — Phases 29-32 (in progress) — Upstream branch tracking, dashboard linked issues fix, workspace auto-detection from CWD, GitLab branch slash investigation.

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

<details>
<summary>✅ v0.7.0 Close Command & Polish (Phases 21-28) — SHIPPED 2026-03-22</summary>

- [x] Phase 21: Workspace Close Command (1/1 plans) — completed 2026-03-22
- [x] Phase 22: Niri Display Fix (1/1 plans) — completed 2026-03-22
- [x] Phase 23: Test Environment Isolation (1/1 plans) — completed 2026-03-22
- [x] Phase 24: Mock Architecture Refactor (2/2 plans) — completed 2026-03-22
- [x] Phase 24.1: Test Mock Hygiene (1/1 plans) — completed 2026-03-22
- [x] Phase 25: Dedicated Lifecycle Phases (3/3 plans) — completed 2026-03-22
- [x] Phase 26: Autocompletion & Editor Polish (3/3 plans) — completed 2026-03-22
- [x] Phase 27: Git Forge Integrations (4/4 plans) — completed 2026-03-22
- [x] Phase 28: Issue & Task Tracking Integration (4/4 plans) — completed 2026-03-22

See [milestones/v0.7.0-ROADMAP.md](milestones/v0.7.0-ROADMAP.md) for full details.

</details>

### 🚧 v0.8.0 Integration Polish & Workspace UX (In Progress)

**Milestone Goal:** Fix integration bugs and improve workspace UX — upstream branch tracking, dashboard issue display, workspace CWD auto-detection, and GitLab branch slash investigation.

- [x] **Phase 29: Upstream Worktree Branch Tracking** - Worktree creation detects existing upstream branches and sets up tracking automatically (completed 2026-03-24)
- [x] **Phase 30: Dashboard Linked Issues Display Fix** - Dashboard detail pane shows per-workspace linked issues, not global config fallback (completed 2026-03-24)
- [ ] **Phase 31: Workspace CWD Auto-Detection** - Jira and all tracker integrations detect current workspace from working directory
- [ ] **Phase 32: GitLab Branch Slash Investigation** - Investigate and resolve branch names containing '/' in GitLab commands

## Phase Details

### Phase 29: Upstream Worktree Branch Tracking
**Goal**: Worktrees for branches that already exist on origin are created with upstream tracking configured, so `git push` and `git pull` work without `--set-upstream`
**Depends on**: Nothing (first phase of v0.8.0)
**Requirements**: WUX-01
**Success Criteria** (what must be TRUE):
  1. Running `git-stacks new` with a branch name that already exists on origin creates the worktree with upstream tracking set (verified by `git branch -vv` showing `[origin/branch-name]`)
  2. Running `git push` inside a worktree created from an existing upstream branch succeeds without requiring `--set-upstream`
  3. Creating a worktree for a brand-new branch (no remote counterpart) continues to work unchanged — no upstream tracking is attempted
  4. Workspace creation performance is not degraded — the branch check uses local remote-tracking refs after an existing fetch, not a separate network call
**Plans**: 2 plans
Plans:
- [x] 29-01-PLAN.md — TDD: upstream tracking core functions in git.ts
- [ ] 29-02-PLAN.md — Wire ensureUpstreamTracking into all creation and open flows

### Phase 30: Dashboard Linked Issues Display Fix
**Goal**: The workspace detail pane in the dashboard shows per-workspace linked issue IDs for each tracker integration, with a correct empty state when no issue is linked
**Depends on**: Phase 29
**Requirements**: BUG-01
**Success Criteria** (what must be TRUE):
  1. Opening a workspace detail pane shows the linked issue ID (e.g., `PROJ-123`) for each tracker integration that has a linked issue on that workspace
  2. Opening a workspace detail pane that has no linked issues shows an empty or absent "Linked Issues" section — not a global Jira config value
  3. The linked issue display reads exclusively from workspace settings, never from the global integration config fallback
**Plans**: 1 plan
Plans:
- [x] 30-01-PLAN.md — Fix config summary issue leak and add Linked Issues section
**UI hint**: yes

### Phase 31: Workspace CWD Auto-Detection
**Goal**: Jira issue commands and all other tracker integration issue commands auto-detect the current workspace when run from inside a worktree directory, making the `--workspace` argument optional
**Depends on**: Phase 30
**Requirements**: WUX-02, WUX-03
**Success Criteria** (what must be TRUE):
  1. Running `git-stacks integration jira issue link PROJ-123` from inside a worktree directory links the issue to the correct workspace without requiring an explicit `--workspace` argument
  2. Running the same command from outside any known workspace prints a clear error: the workspace cannot be detected from the current directory and the user must use `--workspace`
  3. Passing `--workspace my-workspace` explicitly still works, overriding CWD detection — backward compatibility preserved
  4. GitHub, GitLab, and Gitea issue commands also auto-detect workspace from CWD (same detection logic applied to all four tracker integrations)
  5. Custom `workspace_root` paths configured in global config are honored during CWD detection
**Plans**: TBD

### Phase 32: GitLab Branch Slash Investigation
**Goal**: The root cause of GitLab `open` and `pr` command failures on branch names containing '/' is confirmed, and either fixed (one-line code change) or documented (known glab limitation with version guidance)
**Depends on**: Phase 31
**Requirements**: BUG-02
**Success Criteria** (what must be TRUE):
  1. The failure mode for branches with '/' in their name has been reproduced and the root cause is documented — confirmed as either our `gitlab.ts` invocation or a glab binary behavior
  2. If the bug is in our code: `git-stacks integration gitlab open` and `git-stacks integration gitlab pr` work correctly for branches named `feature/my-feature` — the URL resolves without a 404
  3. If the bug is in glab: release notes for v0.8.0 document the known glab limitation, the affected glab version range, and any available workaround
**Plans**: TBD

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1-5. Foundation | v0.2.0 | 21/21 | Complete | 2026-03-18 |
| 6-9. Dashboard UI | v0.3.0 | 13/13 | Complete | 2026-03-20 |
| 10-15.2. TUI Hardening | v0.4.0 | 21/21 | Complete | 2026-03-21 |
| 16-20. Integration & Niri | v0.6.0 | 6/6 | Complete | 2026-03-22 |
| 21-28. Close Command & Polish | v0.7.0 | 20/20 | Complete | 2026-03-22 |
| 29. Upstream Worktree Branch Tracking | v0.8.0 | 1/2 | Complete    | 2026-03-24 |
| 30. Dashboard Linked Issues Display Fix | v0.8.0 | 1/1 | Complete   | 2026-03-24 |
| 31. Workspace CWD Auto-Detection | v0.8.0 | 0/? | Not started | - |
| 32. GitLab Branch Slash Investigation | v0.8.0 | 0/? | Not started | - |
