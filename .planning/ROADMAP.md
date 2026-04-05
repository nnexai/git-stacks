# Roadmap: git-stacks

## Milestones

- ✅ **v0.2.0 Foundation** — Phases 1-5 (shipped 2026-03-18) — Registry+Template model, test infra, file ops, destructive-op safety, UX polish. See [milestones/v1.0-ROADMAP.md](milestones/v1.0-ROADMAP.md)
- ✅ **v0.3.0 Dashboard UI Overhaul** — Phases 6-9 (shipped 2026-03-20) — Messaging system, tabbed dashboard, IPC push display, shell completion overhaul. See [milestones/v0.3.0-ROADMAP.md](milestones/v0.3.0-ROADMAP.md)
- ✅ **v0.4.0 TUI Hardening & Polish** — Phases 10-15.2 (shipped 2026-03-21) — Test harness, workspace sync, wizard create, repo management, screen polish, centered dialogs, integration overrides. See [milestones/v0.4.0-ROADMAP.md](milestones/v0.4.0-ROADMAP.md)
- ✅ **v0.6.0 Integration Orchestration & Niri** — Phases 16-20 (shipped 2026-03-22) — Typed artifact pipeline, centralized runner, niri compositor integration. See [milestones/v0.6.0-ROADMAP.md](milestones/v0.6.0-ROADMAP.md)
- ✅ **v0.7.0 Close Command & Polish** — Phases 21-28 (shipped 2026-03-22) — Workspace close, lifecycle cascade, mock refactor, forge integrations, issue tracking, CLI polish. See [milestones/v0.7.0-ROADMAP.md](milestones/v0.7.0-ROADMAP.md)
- ✅ **v0.8.0 Integration Polish & Workspace UX** — Phases 29-32 (shipped 2026-03-24) — Upstream branch tracking, dashboard linked issues fix, workspace CWD auto-detection, GitLab branch slash investigation. See [milestones/v0.8.0-ROADMAP.md](milestones/v0.8.0-ROADMAP.md)
- ✅ **v0.9.0 Identity & Completion Integrity** — Phases 33-36 (shipped 2026-03-25) — Name-based identity, completion audit, test isolation, dynamic name completion. See [milestones/v0.9.0-ROADMAP.md](milestones/v0.9.0-ROADMAP.md)
- ✅ **v0.10.0 Multi-Agent Workspace Tooling** — Phases 37-42 (shipped 2026-03-28) — Agent path discovery, multi-repo pull, TUI staleness, template composition, security hardening. See [milestones/v0.10.0-ROADMAP.md](milestones/v0.10.0-ROADMAP.md)
- ✅ **v0.11.0 AeroSpace Window Management** — Phases 43-46 (shipped 2026-03-28) — AeroSpace shell wrappers, core integration plugin, layout control, release prep. See [milestones/v0.11.0-ROADMAP.md](milestones/v0.11.0-ROADMAP.md)
- ✅ **v0.12.0 Multi-Workspace AeroSpace, Integration Tools & Port Allocation** — Phases 47-52 (shipped 2026-04-02) — Multi-workspace AeroSpace config, integration CLI tools, convention-based completion, workspace port allocation. See [milestones/v0.12.0-ROADMAP.md](milestones/v0.12.0-ROADMAP.md)
- ✅ **v0.13.0 CLI Polish & Completions** — Phases 53-57 (shipped 2026-04-02) — Shell completion fixes, env command, Copilot hook support, doctor/config polish. See [milestones/v0.13.0-ROADMAP.md](milestones/v0.13.0-ROADMAP.md)
- ✅ **v0.14.0 Workflow Completion & Workspace UX** — Phases 58-63 (shipped 2026-04-03) — Ahead/behind tracking, push command, labels, secrets, stash-on-sync, release prep. See [milestones/v0.14.0-ROADMAP.md](milestones/v0.14.0-ROADMAP.md)
- ✅ **v0.15.0 Dir Mode & Polish** — Phases 64-68 (shipped 2026-04-05) — Dir repo type, registry CLI, lifecycle guards, git operation guards, CLI/TUI display. See [milestones/v0.15.0-ROADMAP.md](milestones/v0.15.0-ROADMAP.md)
- 🚧 **v0.16.0 Core Engine & Observability** — Phases 69-73 (in progress)

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

<details>
<summary>✅ v0.8.0 Integration Polish & Workspace UX (Phases 29-32) — SHIPPED 2026-03-24</summary>

- [x] Phase 29: Upstream Worktree Branch Tracking (2/2 plans) — completed 2026-03-24
- [x] Phase 30: Dashboard Linked Issues Display Fix (1/1 plan) — completed 2026-03-24
- [x] Phase 31: Workspace CWD Auto-Detection (2/2 plans) — completed 2026-03-24
- [x] Phase 32: GitLab Branch Slash Investigation (1/1 plan) — completed 2026-03-24

See [milestones/v0.8.0-ROADMAP.md](milestones/v0.8.0-ROADMAP.md) for full details.

</details>

<details>
<summary>✅ v0.9.0 Identity & Completion Integrity (Phases 33-36) — SHIPPED 2026-03-25</summary>

- [x] Phase 33: Name-Based Identity (3/3 plans) — completed 2026-03-25
- [x] Phase 34: Completion Audit & Forge/Issue Coverage (2/2 plans) — completed 2026-03-25
- [x] Phase 34.1: Test Isolation Framework (3/3 plans) — completed 2026-03-25
- [x] Phase 35: Dynamic Name Completion (1/1 plan) — completed 2026-03-25
- [x] Phase 36: Release Prep (1/1 plan) — completed 2026-03-25

See [milestones/v0.9.0-ROADMAP.md](milestones/v0.9.0-ROADMAP.md) for full details.

</details>

<details>
<summary>✅ v0.10.0 Multi-Agent Workspace Tooling (Phases 37-42) — SHIPPED 2026-03-28</summary>

- [x] Phase 37: Agent Path Discovery (1/1 plan) — completed 2026-03-26
- [x] Phase 38: Multi-Repo Pull (1/1 plan) — completed 2026-03-26
- [x] Phase 39: TUI Upstream Staleness (1/1 plan) — completed 2026-03-26
- [x] Phase 40: Template Composition (2/2 plans) — completed 2026-03-26
- [x] Phase 41: Release Prep (1/1 plan) — completed 2026-03-26
- [x] Phase 42: Code Review and Audit Findings (3/3 plans) — completed 2026-03-28

See [milestones/v0.10.0-ROADMAP.md](milestones/v0.10.0-ROADMAP.md) for full details.

</details>

<details>
<summary>✅ v0.11.0 AeroSpace Window Management (Phases 43-46) — SHIPPED 2026-03-28</summary>

- [x] **Phase 43: AeroSpace Shell Wrappers & Doctor** - Typed async CLI wrappers with injectable `_exec`, platform gate, and doctor binary check (completed 2026-03-28)
- [x] **Phase 44: Core Integration Plugin** - Snapshot-delta window detection, workspace validation, window movement, integration plugin registration (completed 2026-03-28)
- [x] **Phase 45: Layout Control & App Launching** - Normalization-aware layout, flatten-before-open, workspace focus, commands array with delta detection (completed 2026-03-28)
- [x] **Phase 46: Release Prep** - v0.11.0 version bump, CHANGELOG entry, README AeroSpace section (completed 2026-03-28)

See [milestones/v0.11.0-ROADMAP.md](milestones/v0.11.0-ROADMAP.md) for full details.

</details>

<details>
<summary>✅ v0.12.0 Multi-Workspace AeroSpace, Integration Tools & Port Allocation (Phases 47-52) — SHIPPED 2026-04-02</summary>

- [x] Phase 47: Multi-Workspace Schema (2/2 plans) — completed 2026-03-29
- [x] Phase 48: Multi-Workspace Loop & Tests (2/2 plans) — completed 2026-03-29
- [x] Phase 49: Release Prep (1/1 plan) — completed 2026-03-29
- [x] Phase 50: Integration Specific Tools (2/2 plans) — completed 2026-04-01
- [x] Phase 50.1: Argument-Based Dynamic Completion (2/2 plans) — completed 2026-04-01
- [x] Phase 51: Workspace Port Allocation (4/4 plans) — completed 2026-04-01
- [x] Phase 52: Release Prep (quick task) — completed 2026-04-02

See [milestones/v0.12.0-ROADMAP.md](milestones/v0.12.0-ROADMAP.md) for full details.

</details>

<details>
<summary>✅ v0.13.0 CLI Polish & Completions (Phases 53-57) — SHIPPED 2026-04-02</summary>

- [x] Phase 53: Shell Completion Fixes (3/3 plans) — completed 2026-04-02
- [x] Phase 54: Env Command (2/2 plans) — completed 2026-04-02
- [x] Phase 55: Copilot Hook Support (2/2 plans) — completed 2026-04-02
- [x] Phase 56: Doctor & Config Polish (1/1 plan) — completed 2026-04-02
- [x] Phase 57: Release Prep (1/1 plan) — completed 2026-04-02

See [milestones/v0.13.0-ROADMAP.md](milestones/v0.13.0-ROADMAP.md) for full details.

</details>

<details>
<summary>✅ v0.14.0 Workflow Completion & Workspace UX (Phases 58-63) — SHIPPED 2026-04-03</summary>

- [x] Phase 58: Ahead/Behind Tracking (4/4 plans) — completed 2026-04-03
- [x] Phase 59: Push (4/4 plans) — completed 2026-04-03
- [x] Phase 60: Labels (4/4 plans) — completed 2026-04-03
- [x] Phase 61: Secrets (3/3 plans) — completed 2026-04-03
- [x] Phase 62: Stash on Sync (2/2 plans) — completed 2026-04-03
- [x] Phase 63: Release Prep (1/1 plan) — completed 2026-04-03

See [milestones/v0.14.0-ROADMAP.md](milestones/v0.14.0-ROADMAP.md) for full details.

</details>

<details>
<summary>✅ v0.15.0 Dir Mode & Polish (Phases 64-68) — SHIPPED 2026-04-05</summary>

- [x] Phase 64: Schema & Registry (2/2 plans) — completed 2026-04-04
- [x] Phase 65: Workspace Lifecycle (1/1 plan) — completed 2026-04-04
- [x] Phase 66: Git Operation Guards (1/1 plan) — completed 2026-04-04
- [x] Phase 67: Status, Display & Health (2/2 plans) — completed 2026-04-05
- [x] Phase 68: Release Prep (1/1 plan) — completed 2026-04-05

See [milestones/v0.15.0-ROADMAP.md](milestones/v0.15.0-ROADMAP.md) for full details.

</details>

### 🚧 v0.16.0 Core Engine & Observability (In Progress)

**Milestone Goal:** Break workspace-ops.ts (1,735 lines) into domain-cohesive modules without breaking the public API, add GIT_STACKS_DEBUG trace output, and verify extracted modules with focused unit tests.

- [x] **Phase 69: Extract workspace-env.ts and workspace-lifecycle.ts** - Extract env assembly and lifecycle cascade as two sequential domain modules; workspace-ops.ts re-exports both (completed 2026-04-05)
- [x] **Phase 70: Extract remaining domain modules and workspace-ops facade** - Extract workspace-git, workspace-status, workspace-yaml; finalize workspace-ops as thin lifecycle orchestrator; verify all 800+ tests pass (completed 2026-04-05)
- [ ] **Phase 71: Observability** - Install LogTape, wire GIT_STACKS_DEBUG env var, add labeled debug output and timing to domain modules
- [ ] **Phase 72: Extraction tests** - Focused unit tests for extracted module helpers without real git repos; circular import detection verified
- [ ] **Phase 73: Release Prep** - v0.16.0 version bump, CHANGELOG entry, README observability section

## Phase Details

### Phase 69: Extract workspace-env.ts and workspace-lifecycle.ts
**Goal**: The two most-depended-on domain modules exist as isolated files; workspace-ops.ts re-exports them; all existing tests pass
**Depends on**: Phase 68
**Requirements**: EXTR-02, EXTR-03, EXTR-09
**Success Criteria** (what must be TRUE):
  1. `src/lib/workspace-env.ts` exists and exports mergeEnv, buildBaseEnv, buildRepoEnv, buildWorkspaceEnv, writeEnvFiles
  2. `src/lib/workspace-lifecycle.ts` exists and exports closeWorkspace, cleanWorkspace, removeWorkspace, mergeWorkspace with _executeClose and _executeClean co-located as private helpers
  3. workspace-ops.ts re-exports all moved symbols so no import path in commands/ or tui/ breaks
  4. remove → clean → close cascade order is preserved end-to-end (removeWorkspace calls cleanWorkspace which calls closeWorkspace)
  5. `bun run test` returns 800+ passing, 0 failing after each extraction commit
**Plans**: TBD

### Phase 70: Extract remaining domain modules and workspace-ops facade
**Goal**: workspace-git, workspace-status, and workspace-yaml exist as domain modules; workspace-ops.ts is a thin lifecycle orchestrator with no leftover re-export shims
**Depends on**: Phase 69
**Requirements**: EXTR-01, EXTR-04, EXTR-05, EXTR-06, EXTR-07, EXTR-08
**Success Criteria** (what must be TRUE):
  1. `src/lib/workspace-git.ts` exports syncWorkspace, pushWorkspace, pullWorkspace with _exec injectable; SyncRow/PushRow/PullRow types re-exported from workspace-ops.ts facade until callers are updated
  2. `src/lib/workspace-status.ts` exports getWorkspaceStatus, getDirtyWorktrees, getWorkspaceListInfo, detectWorkspaceFromCwd
  3. `src/lib/workspace-yaml.ts` exports editWorkspaceYaml, editTemplateYaml, editGlobalConfigYaml, editRegistryYaml with _exec injectable for editor spawn
  4. workspace-ops.ts contains only lifecycle operations (open/close/clean/remove/merge/rename) and no dangling re-export shims
  5. `madge --circular src/` returns zero cycles
  6. `bun run test` returns 800+ passing, 0 failing
**Plans:** 3/3 plans complete
Plans:
- [x] 70-01-PLAN.md — Extract workspace-status.ts and update status callers
- [x] 70-02-PLAN.md — Extract workspace-git.ts and workspace-yaml.ts with _exec seams
- [x] 70-03-PLAN.md — Remove re-export shims, update test mocks and imports

### Phase 71: Observability
**Goal**: GIT_STACKS_DEBUG=1 activates labeled debug output to stderr across all domain modules; normal CLI invocations see zero overhead
**Depends on**: Phase 70
**Requirements**: OBSV-01, OBSV-02, OBSV-03, OBSV-04, OBSV-05
**Success Criteria** (what must be TRUE):
  1. `GIT_STACKS_DEBUG=1 git-stacks status` emits lines like `[workspace-status] getWorkspaceListInfo: 12ms` to stderr and nothing to stdout
  2. `git-stacks status` without GIT_STACKS_DEBUG produces identical stdout output to before this phase (zero debug lines)
  3. `git-stacks status --json 2>/dev/null` output parses as valid JSON (debug output does not corrupt the JSON stream)
  4. `git-stacks manage` (TUI) starts without debug output on screen when GIT_STACKS_DEBUG=1 (stderr-only confirmed by visual check)
  5. Each domain module emits its own label in debug output (e.g., `[workspace-env]`, `[workspace-git]`, `[workspace-lifecycle]`)
**Plans**: TBD

### Phase 72: Extraction tests
**Goal**: Each extracted domain module has focused unit tests that run without real git repos; no circular imports exist in the codebase
**Depends on**: Phase 71
**Requirements**: TEST-01, TEST-02, TEST-03, TEST-04
**Success Criteria** (what must be TRUE):
  1. `tests/lib/workspace-env.test.ts` exists with tests for mergeEnv, buildBaseEnv, buildRepoEnv that use no real filesystem paths
  2. `tests/lib/workspace-status.test.ts` exists with tests for getWorkspaceListInfo and getWorkspaceStatus using mocked config reads
  3. `tests/lib/workspace-git.test.ts` exists with tests for syncWorkspace/pushWorkspace that mock _exec.spawn and verify call shapes without real git
  4. `madge --circular src/` returns zero cycles (confirmed in CI output, not just asserted)
**Plans**: 2 plans
Plans:
- [ ] 72-01-PLAN.md — Add focused workspace-env/status/git module tests and extend `makeGitMock()` for the live extracted seams
- [ ] 72-02-PLAN.md — Install repo-native Madge gate and remove the live dashboard IPC cycles so `test:deps` passes

### Phase 73: Release Prep
**Goal**: v0.16.0 is tagged and documented; version, changelog, and README are consistent
**Depends on**: Phase 72
**Requirements**: (release conventions — no explicit v0.16.0 requirements; standard milestone close-out)
**Success Criteria** (what must be TRUE):
  1. package.json version field reads 0.16.0
  2. CHANGELOG.md has a v0.16.0 entry documenting the module extraction and GIT_STACKS_DEBUG feature
  3. README.md documents GIT_STACKS_DEBUG usage with an example invocation
**Plans**: TBD

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 64. Schema & Registry | v0.15.0 | 2/2 | Complete | 2026-04-04 |
| 65. Workspace Lifecycle | v0.15.0 | 1/1 | Complete | 2026-04-04 |
| 66. Git Operation Guards | v0.15.0 | 1/1 | Complete | 2026-04-04 |
| 67. Status, Display & Health | v0.15.0 | 2/2 | Complete | 2026-04-05 |
| 68. Release Prep | v0.15.0 | 1/1 | Complete | 2026-04-05 |
| 69. Extract workspace-env + workspace-lifecycle | v0.16.0 | 1/1 | Complete    | 2026-04-05 |
| 70. Extract remaining modules + facade | v0.16.0 | 3/3 | Complete    | 2026-04-05 |
| 71. Observability | v0.16.0 | 0/TBD | Not started | - |
| 72. Extraction tests | v0.16.0 | 0/TBD | Not started | - |
| 73. Release Prep | v0.16.0 | 0/TBD | Not started | - |
