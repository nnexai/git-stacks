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
- ✅ **v0.16.0 Core Engine & Observability** — Phases 69-73 (shipped 2026-04-05) — Workspace engine extraction, stderr debug observability, focused module tests, dependency gate. See [milestones/v0.16.0-ROADMAP.md](milestones/v0.16.0-ROADMAP.md)
- ✅ **v0.17.0 Engine Hardening & Template Labels** — Phases 74-79 (shipped 2026-04-06) — Template label CLI + propagation, DI seams + structured logging, integration plugin contracts, indexed config store, operation runner with rollback, release prep.
- ✅ **v0.17.1 Functional Confidence Coverage** — Phases 80-88 with 81.x/82.x/84.x splits (shipped 2026-05-15) — User-facing workspace, template, repo, label, message, support, and integration-contract behavior covered through local automation; safety fixes for gone-branch cleanup, JSON command contracts, and hook execution. See [milestones/v0.17.1-ROADMAP.md](milestones/v0.17.1-ROADMAP.md)
- ✅ **v0.18.0 Workspace File Sync and Forge Sources** — Phases 89-94 with 93.1 split (completed 2026-05-16) — Bidirectional real-file sync under `files.sync` with `git-stacks files status|pull|push`, GitLab-first forge `--source` workspace creation, and release-gate test runner parallelization with coherent coverage merging.
- 🟡 **v0.19.0 Operator Control Center** — Phases 95-99 (planning) — Manual workspace commands, workspace notes, file status in the TUI, grounded dashboard density/grouping improvements, repo edit, linked issue opening, and rollback progress visibility.

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

<details>
<summary>✅ v0.16.0 Core Engine & Observability (Phases 69-73) — SHIPPED 2026-04-05</summary>

- [x] Phase 69: Extract workspace-env.ts and workspace-lifecycle.ts (1/1 plan) — completed 2026-04-05
- [x] Phase 70: Extract remaining domain modules and workspace-ops facade (3/3 plans) — completed 2026-04-05
- [x] Phase 71: Observability (2/2 plans) — completed 2026-04-05
- [x] Phase 72: Extraction tests (2/2 plans) — completed 2026-04-05
- [x] Phase 73: Release Prep (1/1 plan) — completed 2026-04-05

See [milestones/v0.16.0-ROADMAP.md](milestones/v0.16.0-ROADMAP.md) for full details.

</details>

### ✅ v0.17.0 Engine Hardening & Template Labels (Complete)

**Milestone Goal:** Extend template labels to parity with workspace labels, add structured debug logging with module filtering, introduce typed integration capability contracts, speed up config lookups with an in-memory index, and make multi-step workspace operations safe to fail via a compensation-stack rollback.

- [x] **Phase 74: Template Label CLI & Propagation** - Template label CRUD commands, `--label` filter on `template list`, label snapshot into workspace at create/clone time (completed 2026-04-05)
- [x] **Phase 75: DI Seams & Structured Logging** - Injectable `_exec` seams in lifecycle modules, structured debug fields, `GS_DEBUG` module filter (completed 2026-04-05)
- [x] **Phase 76: Integration Plugin Capability Contracts** - `capabilities` field on Integration interface, capability-driven runner guards, `integration list` displays capabilities (completed 2026-04-06)
- [x] **Phase 77: Indexed Config Store** - In-memory index for workspace/template lookups, write-triggered invalidation, scan fallback (completed 2026-04-06)
- [x] **Phase 78: Operation Runner with Rollback** - LIFO compensation stack in `operation-runner.ts`, `workspace-lifecycle.ts` wired to runner, rollback progress via `onProgress` (completed 2026-04-06)
- [x] **Phase 79: Release Prep** - v0.17.0 version bump, CHANGELOG, README updates (completed 2026-04-06)

### ✅ v0.17.1 Functional Confidence Coverage (Complete)

**Milestone Goal:** Extend automated coverage until the project has meaningful functional confidence, not just green commands: prove high-risk workspace/git assumptions in real temp repos, generate trustworthy subprocess-aware coverage reports, and fill the stable non-TUI/non-environment-dependent gaps that the coverage report exposed.

- [x] **Phase 80: E2E CLI Harness and Living Inventory** - Extend existing test helpers with isolated real-process CLI execution and maintain the in-scope inventory as tests are planned (completed 2026-05-14)
- [x] **Phase 81: Workspace and Git Operation E2E Coverage** - Prove high-risk workspace behavior including branch start points, env/hooks, explicit cwd/path handling, run/open safety, merge, and pull/sync/push (completed 2026-05-14)
- [x] **Phase 82: Template, Repo, Label, and Message E2E Coverage** - Add focused E2E coverage for template, registry, label, and message command families (completed 2026-05-14)
- [x] **Phase 82.1: Support Commands and Error-Path E2E Coverage** - Add config, doctor, completion, version, install hook, env/path support, and representative failure scenarios (completed 2026-05-14)
- [x] **Phase 83: Istanbul-Based Subprocess Coverage Reporting** - Generate coverage reports that include source exercised by both shared-process unit tests and isolated subprocess E2E files (completed 2026-05-14)
- [x] **Phase 84: Local Coverage Gates, Docs, and Release Prep** - Add local inventory/test mapping gates and verify the expanded suite with existing quality commands (completed 2026-05-14)
- [x] **Phase 84.1: Coverage Report Accuracy and TUI Instrumentation Follow-up** - Coverage report accuracy verified through canonical full-suite coverage and local release-prep gates (completed 2026-05-14)
- [x] **Phase 85: Core Real-Fixture Functional Hardening** - Add high-value tests for core workspace/git/hooks/files/env behavior using real temp directories and local git repositories instead of mocks (completed 2026-05-15)
- [x] **Phase 86: Workspace Command Workflow Edge Coverage** - Cover stable command workflows and destructive/safety edge cases that are testable through the real CLI without driving prompt UIs or external desktop integrations (completed 2026-05-15)
- [x] **Phase 87: Integration Contract and Source-Module Coverage** - Replace brittle or source-bypassing integration tests with injected-executor contract tests that exercise the real forge/issue/session modules without launching external tools (completed 2026-05-15)
- [x] **Phase 88: Functional Coverage Readiness Gate** - Reassess functional-only coverage, document remaining accepted gaps, and add local gates or inventories that prevent regression in the newly covered core areas (completed 2026-05-15)

### ✅ v0.18.0 Workspace File Sync and Forge Sources (Complete)

**Milestone Goal:** Make workspace file materialization useful for private planning/agent configuration through bidirectional real-file sync, then add a GitLab-first forge source path for creating normal template-backed workspaces from merge requests.

- [x] **Phase 89: Files Sync Schema and Materialization** - Add `files.sync` to template/workspace schemas and materialize sync sources into workspace targets as real files with optional local git excludes. (completed 2026-05-16)
- [x] **Phase 90: Files Command Surface and Conflict Policy** - Add `git-stacks files status|pull|push`, lightweight drift detection, conservative overwrite/delete behavior, and explicit sync-back semantics. (completed 2026-05-16)
- [x] **Phase 91: Files Sync Integration and Machine Output** - Integrate sync behavior with create/open/recreate flows where appropriate, expose stable JSON/status output, and keep future TUI hooks available without building broad TUI changes. (completed 2026-05-16)
- [x] **Phase 92: Forge Source Research and Resolver Design** - Research GitLab MR, Gitea PR, and GitHub PR source resolution with GitLab first; design enabled-forge resolver contracts, repo matching, and validation boundaries. (completed 2026-05-16)
- [x] **Phase 93: Forge Source Workspace Creation** - Add `git-stacks new --source <forge-url> --template <template>` for GitLab-first forge changes, including repo matching, source checkout/fetch, workspace metadata, labels, and clear failures. (completed 2026-05-16)
- [x] **Phase 93.1: Parallel Integration Test Runner and Coherent Coverage Merging** - Run isolated integration test files in bounded parallel workers while preserving deterministic output, accurate failure reporting, and one coherent merged coverage result. (completed 2026-05-16)
- [x] **Phase 94: v0.18.0 Docs and Release Prep** - Document `files.sync`, `git-stacks files status|pull|push`, forge-source workspace creation, validation limits, and prepare the user-facing v0.18.0 release artifacts. (completed 2026-05-16)

### 🟡 v0.19.0 Operator Control Center (Active)

**Milestone Goal:** Make `git-stacks` better at managing workspaces from the CLI and TUI through notes, manual commands, richer dashboard status, and useful workspace actions.

- [x] **Phase 95: Manual Workspace Commands** - Add named, inspectable, manually-triggered template/workspace commands that reuse existing hook/env/cwd execution machinery without becoming lifecycle hooks. (completed 2026-05-17)
- [x] **Phase 96: Workspace Notes** - Add lightweight append-only workspace notes stored outside managed project repos, with CLI surfaces and durable operator metadata. (completed 2026-05-17)
- [x] **Phase 97: File Status View Model for TUI** - Expose a reusable TUI-facing file config/status model from the v0.18.0 files status behavior, covering copy, symlink, and sync mappings. (completed 2026-05-17)
- [x] **Phase 98: Grounded Dashboard Control Center** - Apply the grounded TUI reset: denser list/detail layout, grouped workspace scanning, structured detail sections, notes and file status summaries, and focused terminal snapshots. (completed 2026-05-17)
- [x] **Phase 99: Dashboard Actions and Correctness Polish** - Add repo edit, linked issue opening, and complete rollback progress visibility in dashboard create flows. (completed 2026-05-17)

## Phase Details

### Phase 95: Manual Workspace Commands

**Goal**: Users can define, inspect, and run named workspace commands manually, using existing workspace execution context rather than lifecycle timing.
**Depends on**: Phase 94
**Requirements**: WCMD-01, WCMD-02, WCMD-03, WCMD-04
**Success Criteria** (what must be TRUE):

  1. Templates, workspaces, and repo entries accept a narrow string-valued `commands.<name>: <shell command>` shape, and template-backed workspaces snapshot those commands into saved workspace YAML.
  2. Workspace command resolution follows copied-template semantics, with workspace-level entries before repo-level entries and npm-style `pre<name>` / `post<name>` bucket ordering.
  3. `git-stacks command list [workspace]` hides `pre*` / `post*` commands by default, while `git-stacks command run --dry-run [workspace] <command>` shows the full resolved execution plan.
  4. `git-stacks command run [workspace] <command>` uses existing workspace env, ports, cwd targeting, and optional secret skipping, streams output directly, and exits on the first failing command status.
  5. Focused tests cover schema parsing, template/workspace snapshot behavior, dry-run inspection, execution context, failure propagation, and inventory/gate alignment for the new command family.

**Plans**: 4 plans

Plans:

- [x] 95-01-PLAN.md - Schema and persistence contract for manual commands
- [x] 95-02-PLAN.md - Template snapshot wiring across create and clone surfaces
- [x] 95-03-PLAN.md - Resolved manual command engine and exit semantics
- [x] 95-04-PLAN.md - `git-stacks command` CLI surface and verification inventory

### Phase 96: Workspace Notes

**Goal**: Users can keep lightweight operator notes for workspaces without writing those notes into managed project repos or GSD planning directories.
**Depends on**: Phase 95
**Requirements**: NOTE-01, NOTE-02
**Success Criteria** (what must be TRUE):

  1. User can add, list, and clear notes for a workspace through `git-stacks notes`, with explicit workspace name, cwd detection, or `GS_WORKSPACE_NAME` fallback.
  2. Notes are stored as append-only JSONL records outside project repos and `.planning`, using per-workspace files with plain-text note content and created timestamp.
  3. `notes list` is the only read surface, displays newest notes first, defaults to a latest-N slice, and has a way to show all notes.
  4. Missing workspace, orphaned old-name note files, cleared/empty notes, and malformed note stores fail or recover predictably without mutating corrupt data.
  5. Tests cover persistence, ordering, resolution precedence, clear confirmation/`--force`, and summary metadata needed by later TUI work.

**Plans**: 2 plans

Plans:

- [x] 96-01-PLAN.md - Storage, path, and summary contract for workspace notes
- [x] 96-02-PLAN.md - `git-stacks notes` CLI surface and workspace resolution

### Phase 97: File Status View Model for TUI

**Goal**: TUI code can display file copy/symlink/sync configuration and status using the same behavior exposed by `git-stacks files status`, without duplicating file sync logic.
**Depends on**: Phase 96
**Requirements**: TUI-04
**Success Criteria** (what must be TRUE):

  1. A reusable source module returns workspace file config/status for copy, symlink, and sync entries in a TUI-friendly shape.
  2. Sync status exposes useful drift/missing/unsafe states from the v0.18.0 files status model while preserving conservative sync semantics.
  3. File status loading handles missing workspaces, missing paths, dir/trunk/worktree differences, and JSON/human command parity.
  4. The dashboard can consume file status without running separate CLI subprocesses or reimplementing file sync policy.
  5. Tests cover copy, symlink, sync, missing target/source, drift, and status-summary aggregation.

**Plans**: 2 plans

Plans:

- [x] 97-01-PLAN.md - Shared grouped file-status model and CLI parity coverage
- [x] 97-02-PLAN.md - Lazy dashboard loader and TUI file-status state contract

### Phase 98: Grounded Dashboard Control Center

**Goal**: `git-stacks manage` becomes a denser operator control center while preserving the current keyboard-first list/detail model.
**Depends on**: Phase 97
**Requirements**: NOTE-03, TUI-01, TUI-02, TUI-03, TUI-07
**Success Criteria** (what must be TRUE):

  1. The workspace list preserves the current tabbed list/detail model while improving density and keeping message attention last in rows.
  2. Workspace grouping supports scan-focused modes such as none/label/state without hiding the concrete status tokens that explain group placement.
  3. Workspace details use structured sections ordered by operational value: attention/messages, repos, file config/status, source/issue links, integrations, notes, and config.
  4. Workspace notes and file status appear as compact summaries in details without replacing their full command surfaces.
  5. Narrow, medium, and wide terminal snapshots cover row truncation, grouped headers, detail ordering, file status display, note summary, and contextual footers.

**Plans**: 3

Plans:

- [x] `98-01-PLAN.md` - Workspace list density and grouping modes
- [x] `98-02-PLAN.md` - Ordered scrollable workspace detail sections
- [x] `98-03-PLAN.md` - Dashboard footer and snapshot acceptance coverage

### Phase 99: Dashboard Actions and Correctness Polish

**Goal**: Dashboard action menus expose the missing useful actions and dashboard create flows surface all rollback progress.
**Depends on**: Phase 98
**Requirements**: TUI-05, TUI-06, DASH-01
**Success Criteria** (what must be TRUE):

  1. Repos tab action menu includes an edit action wired consistently with workspace/template edit behavior.
  2. Workspace action menu can open linked issues when issue metadata is configured, using existing issue integration behavior and clear disabled/error states.
  3. Dashboard create flows display every rollback progress event emitted by `createWorkspace()`, including file ops, workspace file ops, and env-file writes.
  4. Action menu shortcuts, labels, disabled states, and footer hints stay coherent across Workspaces, Templates, and Repos.
  5. Focused component/snapshot tests cover repo edit, linked issue opening, rollback progress rendering, and action-menu regressions.

**Plans**: TBD

Plans:

- [ ] TBD

**Cross-cutting constraints:**

- D-13: rollback progress visibility is excluded from this plan.

### Phase 89: Files Sync Schema and Materialization

**Goal**: Users can define `files.sync` entries and pull source directories/files into workspace targets as real files, with optional worktree-local git excludes.
**Depends on**: Phase 88
**Requirements**: FSYNC-01, FSYNC-02, FSYNC-03
**Success Criteria** (what must be TRUE):

  1. `TemplateSchema` and `WorkspaceSchema` accept `files.sync` entries with `source`, `target`, and optional `git_exclude` fields while preserving existing `copy` and `symlink` behavior.
  2. Sync materialization copies source content into the workspace target as real files/directories, not symlinks.
  3. `git_exclude: true` writes target paths to the local worktree `.git/info/exclude` file without modifying project `.gitignore`.
  4. Sync materialization refuses obvious unsafe target paths and tracked-file collisions unless an explicit later policy allows them.

**Plans**: TBD

### Phase 90: Files Command Surface and Conflict Policy

**Goal**: Users can inspect, pull, and push synced workspace files through `git-stacks files status|pull|push` with conservative conflict and delete behavior.
**Depends on**: Phase 89
**Requirements**: FSYNC-04, FSYNC-05, FSYNC-06, FSYNC-07, FSYNC-08
**Success Criteria** (what must be TRUE):

  1. `git-stacks files status [workspace]` shows file materialization state for copy/symlink/sync entries, with sync drift visible at a useful summary level.
  2. `git-stacks files pull [workspace]` refreshes sync targets from their configured sources.
  3. `git-stacks files push [workspace]` explicitly syncs workspace target changes back to source paths.
  4. Push refuses obvious conflicts and unsafe deletes/overwrites by default.
  5. The implementation avoids a mandatory full per-file hash manifest for large sync trees such as `.planning/`.

**Plans**: 3 plans

Plans:

- **Wave 1**
  - `90-01-PLAN.md` — Add current-tree status and sync comparison helpers for copy, symlink, and sync entries.
- **Wave 2** *(blocked on Wave 1 completion)*
  - `90-02-PLAN.md` — Add conservative pull/push planning and application with dry-run, default refusals, and force mirror semantics.
- **Wave 3** *(blocked on Wave 2 completion)*
  - `90-03-PLAN.md` — Expose `git-stacks files status|pull|push`, register the command group, and validate CLI behavior.

Cross-cutting constraints:

- Phase 90 must not add mandatory manifests, stable JSON output, lifecycle integration, TUI behavior, or middle policy flags such as `--merge`/`--add-only`.

### Phase 91: Files Sync Integration and Machine Output

**Goal**: File sync behavior is integrated with existing workspace lifecycle entrypoints where appropriate and exposes stable machine-readable output for future TUI/automation.
**Depends on**: Phase 90
**Requirements**: FSYNC-09
**Success Criteria** (what must be TRUE):

  1. Workspace create/open/recreate behavior has a clear and documented relationship to `files.sync` pull behavior.
  2. `git-stacks files status|pull|push --json` or equivalent machine output is stable enough for future dashboard use.
  3. Existing file copy/symlink behavior remains backward-compatible.
  4. The README examples cover the GSD planning/agent config use case without requiring symlinks.

**Plans**: 4 plans

Plans:

- [x] `91-01-PLAN.md` — Integrate `files.sync` pull/materialization into workspace create and missing-worktree recreation while preserving conservative normal-open behavior and existing copy/symlink compatibility.
- [x] `91-02-PLAN.md` — Add stable machine-readable `--json` output for `git-stacks files status|pull|push` with capped details and meaningful automation exit codes.
- [x] `91-03-PLAN.md` — Expose `files status|pull|push` help/completion coverage and document the real-file sync workflow without adding dashboard UI or full README JSON examples.
- [x] `91-04-PLAN.md` — Run the final Phase 91 focused gates and record execution evidence for lifecycle integration, machine output, completion/help, documentation, and copy/symlink compatibility.

### Phase 92: Forge Source Research and Resolver Design

**Goal**: GitLab-first forge source creation is researched and designed before implementation, with clear limits for live `glab` validation and a reusable resolver contract for Gitea/GitHub follow-up.
**Depends on**: Phase 91
**Requirements**: FSRC-02, FSRC-03, FSRC-08
**Success Criteria** (what must be TRUE):

  1. GitLab MR URL formats, `glab` capabilities, fetch strategies, and local validation constraints are documented.
  2. Gitea and GitHub PR URL parsing and resolver differences are documented enough to avoid painting the implementation into a GitLab-only corner.
  3. A forge source resolver contract describes the normalized source metadata needed by workspace creation.
  4. Repo matching uses existing registry/forge/upstream metadata where possible, with ambiguity and missing-template-repo cases specified.

**Plans**:
**Wave 1**

- [ ] `92-01-PLAN.md` - Document official GitLab/GitHub research, local Tea validation limits, self-hosted config design, repo matching, and the plain Git checkout boundary for Phase 93.
- [ ] `92-02-PLAN.md` - Add backwards-compatible config schema design for forge integration base URLs and repo-level forge metadata.

**Wave 2** *(blocked on Wave 1 completion)*

- [ ] `92-03-PLAN.md` - Add the pure forge source URL parser and typed resolver contract with GitLab, GitHub, and Gitea coverage.

**Wave 3** *(blocked on Wave 2 completion)*

- [ ] `92-04-PLAN.md` - Finalize the Phase 93 fetch/checkout handoff and run focused contract/config/typecheck gates.

**Cross-cutting constraints:**

- Provider checkout commands are research references only; internal workspace creation must use plain Git fetch/checkout through existing git-stacks logic.

### Phase 93: Forge Source Workspace Creation

**Goal**: Users can create a normal template-backed workspace from a forge change source URL, with GitLab merge requests implemented first and Gitea/GitHub prepared by the shared resolver shape.
**Depends on**: Phase 92
**Requirements**: FSRC-01, FSRC-04, FSRC-05, FSRC-06, FSRC-07
**Success Criteria** (what must be TRUE):

  1. `git-stacks new <name> --template <template> --source <forge-url>` routes the source through enabled forge integrations.
  2. The matched worktree repo is checked out or fetched to the forge change branch/ref while other worktree repos use normal workspace branch creation.
  3. Missing, ambiguous, trunk-mode, or dir-mode repo matches produce clear failures and explicit override guidance where appropriate.
  4. Created workspaces record source metadata in workspace YAML.
  5. Created workspaces receive useful review/source labels such as `review`, forge id, and change number.

**Plans**: 4 plans

Plans:

- [ ] `93-01-PLAN.md` - Add the source CLI contract, resolver handoff, repo override behavior, and dry-run preview.
- [ ] `93-02-PLAN.md` - Fetch source refs with plain Git and hand the matched repo into normal worktree creation.
- [ ] `93-03-PLAN.md` - Persist the dedicated workspace `source` block and preserve the D-15 no-auto-label boundary.
- [ ] `93-04-PLAN.md` - Cover GitLab, Gitea, and GitHub provider paths through local contracts and final source-workspace gates.

### Phase 93.1: Parallel integration test runner and coherent coverage merging (INSERTED)

**Goal:** Integration and coverage runs complete faster through bounded parallel execution without losing the single coherent test result, failure summary, or merged Istanbul coverage artifacts required for local release gates.
**Requirements**: TEST-01, TEST-02, COV-01
**Depends on:** Phase 93
**Success Criteria** (what must be TRUE):

  1. `scripts/test-runner.ts --integ` runs isolated integration test files through a configurable bounded worker pool, with a conservative default that avoids overloading local git/filesystem fixtures.
  2. Test output remains understandable: each file's result is attributed to the file, failures are summarized coherently, and the final pass/fail count matches the serial runner's semantics.
  3. File-system and git fixtures are isolated enough for parallel execution, including temp directory/config paths that avoid fixed-path collisions.
  4. Coverage execution preserves one coherent report by merging all per-process Istanbul coverage artifacts into the existing stable outputs: `.coverage/coverage-final.json`, `.coverage/coverage-summary.json`, `.coverage/lcov.info`, and `.coverage/index.html`.
  5. `bun run test`, `bun run test:integ`, `bun run coverage:integ`, and `bun run verify` continue to provide release-gate quality signals without requiring CI.

**Plans**: 3 plans

Plans:

- [ ] `93.1-01-PLAN.md` - Add the shared worker contract, `--workers` parsing, and buffered completion-order integration output.
- [ ] `93.1-02-PLAN.md` - Harden real-write integration fixtures against shared `/tmp` collisions and add fixture-safety guards.
- [ ] `93.1-03-PLAN.md` - Parallelize coverage integration with per-worker shard dirs while preserving canonical merged Istanbul artifacts.

### Phase 94: v0.18.0 Docs and Release Prep

**Goal**: v0.18.0 is documented and packaged with user-facing release notes that accurately describe file sync behavior and forge source validation limits.
**Depends on**: Phase 93.1
**Requirements**: DOCS-01, DOCS-02, REL-01
**Success Criteria** (what must be TRUE):

  1. README documents `files.sync`, `git-stacks files status|pull|push`, local exclude behavior, and manual push-back.
  2. README documents forge `--source` workspace creation with GitLab-first examples and validation caveats.
  3. CHANGELOG describes user-visible v0.18.0 behavior without overstating live forge coverage.
  4. Local release verification passes before closeout.

**Plans**: 3 plans

Plans:

- [x] `94-01-PLAN.md` - Align workspace/files CLI help and README docs for file sync and forge-source workflows.
- [x] `94-02-PLAN.md` - Write the user-facing `0.18.0-rc.1` changelog entry and bump release-candidate package metadata.
- [x] `94-03-PLAN.md` - Add the repeatable release-candidate smoke gate, dry-run publish check, and RC tag handoff.

### Phase 74: Template Label CLI & Propagation

**Goal**: Users can manage labels on templates via CLI, filter templates by label, and labels automatically flow into workspaces at creation time
**Depends on**: Phase 73 (v0.16.0 complete)
**Requirements**: TLBL-01, TLBL-02, TLBL-03, TLBL-04, TLBL-05, TLBL-06, TLBL-07
**Success Criteria** (what must be TRUE):

  1. User can run `git-stacks template label add <template> <label...>` and the label persists to the template YAML
  2. User can run `git-stacks template label remove/list/clear` symmetrically with the existing workspace label commands
  3. `git-stacks template list --label <label>` returns only templates matching that label
  4. Workspace created from a labeled template has those labels snapshot-copied into the workspace YAML (not a live reference)
  5. `git-stacks clone <workspace>` copies labels from the source workspace into the new workspace YAML

**Plans**: 2 plans

Plans:

- [x] `74-01-PLAN.md` — Nested `template label` CRUD plus `template list --label` exact-match AND filtering
- [x] `74-02-PLAN.md` — Label propagation through template composition, workspace creation snapshot, and workspace clone preservation

### Phase 75: DI Seams & Structured Logging

**Goal**: `workspace-lifecycle.ts` and `workspace-git.ts` have injectable subprocess seams, and debug output carries structured fields filterable by module name
**Depends on**: Phase 74
**Requirements**: OBSV-01, OBSV-02, OBSV-03, OBSV-04, OBSV-05
**Success Criteria** (what must be TRUE):

  1. `workspace-lifecycle.ts` exports a mutable `_exec` object; tests can replace `_exec.spawn` without spawning real processes
  2. `workspace-git.ts` exports a mutable `_exec` object with the same injection pattern
  3. Running `GS_DEBUG=1 git-stacks open <ws>` emits lines with structured fields `{ op, module, repo?, ms?, msg }` on stderr
  4. Running `GS_DEBUG=lifecycle git-stacks open <ws>` emits debug lines only from the `lifecycle` module; git module lines are suppressed
  5. Running `GS_DEBUG=true` shows all module output (backward-compatible with existing behavior)

**Plans**: 2 plans

Plans:

- [x] `75-01-PLAN.md` — Add real mutable `_exec` seams to `workspace-lifecycle.ts` and `workspace-git.ts` with focused module tests
- [x] `75-02-PLAN.md` — Extend `src/lib/observability.ts` and `src/index.ts` for `GS_DEBUG`, structured stderr fields, selector filtering, and CLI regression coverage

### Phase 76: Integration Plugin Capability Contracts

**Goal**: Every integration plugin declares its capabilities explicitly, the runner uses those declarations instead of duck-typing, and `integration list` exposes them
**Depends on**: Phase 75
**Requirements**: ENGN-07, ENGN-08, ENGN-09
**Success Criteria** (what must be TRUE):

  1. `Integration` interface has a typed `capabilities` field; `bun run typecheck` passes with all 10 plugin files updated
  2. Integration runner gates `generate()` and `open()` calls on capability declarations, not optional chaining
  3. `git-stacks integration list` output includes a capabilities column for each plugin

**Plans**: 2 plans

Plans:

- [x] `76-01-PLAN.md` — Capability type, Integration interface field, all 10 plugins updated, runner capability-gated calls
- [x] `76-02-PLAN.md` — integration list capabilities column (table + JSON output)

### Phase 77: Indexed Config Store

**Goal**: Workspace and template lookups use an in-memory index instead of re-scanning and re-parsing all YAML files on every call
**Depends on**: Phase 76
**Requirements**: ENGN-04, ENGN-05, ENGN-06
**Success Criteria** (what must be TRUE):

  1. `listWorkspaces()` and `readWorkspace()` return results sourced from the in-memory index without triggering a full directory scan on repeated calls
  2. Any write operation (create, rename, remove) invalidates the affected index entry so the next read reflects the change
  3. If a requested name is not in the index, the code falls back to a YAML scan and populates the index entry (cache, not source of truth)

**Plans**: 2 plans

Plans:

- [x] `77-01-PLAN.md` — In-memory index Maps with _cache seam, cache-gated read/write/list/exists, deleteWorkspace/deleteTemplate, tests
- [x] `77-02-PLAN.md` — Migrate all unlinkSync(workspacePath/templatePath) call sites to deleteWorkspace/deleteTemplate

### Phase 78: Operation Runner with Rollback

**Goal**: Multi-step workspace creation executes via a LIFO compensation stack so partial failures clean up completed steps automatically. Both the wizard and dashboard creation call sites migrate to a shared `createWorkspace()` that uses the runner (resolves CONCERNS.md:51-55 dashboard duplication).
**Depends on**: Phase 77
**Requirements**: ENGN-01, ENGN-02, ENGN-03
**Success Criteria** (what must be TRUE):

  1. When workspace creation fails mid-way (e.g., second worktree fails), already-created worktrees are removed and the workspace YAML is not written
  2. Rollback steps emit progress messages through the existing `onProgress` callback so the user sees "Rollback: create worktree <repo>" (D-14/D-15: routed through onProgress, not stderr — OpenTUI safety)
  3. If an individual rollback step fails, the error is captured in `rollbackErrors[]` and surfaced via `onProgress`; remaining rollback steps continue (best-effort, no abort)

**Plans**: 3 plans

Plans:

- [x] `78-01-PLAN.md` — Pure operation-runner primitive (`src/lib/operation-runner.ts`) with LIFO compensation stack, discriminated-union return, and eight unit tests
- [x] `78-02-PLAN.md` — `createWorkspace()` on `workspace-lifecycle.ts` wiring runner into D-12 creation ordering with integration tests forcing failures via Phase 75 _exec seams
- [x] `78-03-PLAN.md` — Wizard and dashboard migration to shared `createWorkspace()`; delete hand-rolled rollback at App.tsx:883-911; CONCERNS.md:51-55 resolved

### Phase 78.1: turn capability enums into actual typescript interface instead of capability return function. also remove it from the integration list and documentation (INSERTED)

**Goal:** Replace the Capability string union and capabilities Set on Integration with narrow TypeScript interfaces composed via intersection types; remove the Capabilities column from `git-stacks integration list` and the audit-trail updates in REQUIREMENTS.md/STATE.md. Phase 76 user-facing capability surface fully reverted (per CONTEXT.md D-01..D-18); the underlying gating goal is preserved via type predicates in src/lib/integrations/types.ts.
**Requirements**: ENGN-07, ENGN-08, ENGN-09 (rewritten in place per D-13)
**Depends on:** Phase 78
**Plans:** 3/3 plans complete

Plans:

- [x] `78.1-01-PLAN.md` — Add narrow capability interfaces (Generates, Cleans, HasCommands, HasConfigExample, WindowDetecting, Conditional) and type predicates (isGenerator, isCleaner, isConditional, isWindowDetecting) to src/lib/integrations/types.ts; remove Capability type and capabilities field from base Integration interface
- [x] `78.1-02-PLAN.md` — Update all 10 plugin files to drop `capabilities: new Set(...)` literal and use intersection types at export site; rewrite runner.ts to use type predicates with zero non-null assertions on integration method calls
- [x] `78.1-03-PLAN.md` — Strip Capabilities column from `git-stacks integration list` (table + JSON), delete TAG_MAP constant, update 4 test files (drop fake `capabilities: new Set(...)` and delete obsolete Phase 76-02 test block), rewrite REQUIREMENTS.md ENGN-07/08/09 in place, append Phase 78.1 decisions section to STATE.md

### Phase 79: Release Prep

**Goal**: v0.17.0 is version-bumped, documented, and ready to ship
**Depends on**: Phase 78.1
**Requirements**: (release prep — no REQUIREMENTS.md entry)
**Success Criteria** (what must be TRUE):

  1. `package.json` version is `0.17.0` and `bun run dev --version` reports it
  2. CHANGELOG has an entry for v0.17.0 listing all milestone features
  3. README documents `template label` commands and `GS_DEBUG` module filter syntax

**Plans**: 1/1 plans complete

Plans:

- [x] `79-01-PLAN.md` — Bump the published version to `0.17.0`, add a user-facing v0.17.0 changelog entry (Added / Changed / Internal), document template-label commands/filtering/propagation plus `GS_DEBUG=<module[,module]>` in README, run release validations, and write Phase 79 closeout artifacts

### Phase 80: E2E CLI Harness and Living Inventory

**Goal**: Test authors can run isolated real-process CLI scenarios, and maintainers have an exact machine-parseable inventory source for the non-TUI, non-integration surface tied to the harness
**Depends on**: Phase 79 (v0.17.0 complete)
**Requirements**: E2E-01, E2E-02, E2E-03, E2E-04, E2E-05, E2E-06, E2E-07
**Success Criteria** (what must be TRUE):

  1. Test author can run `git-stacks` as a real CLI process inside an isolated config home without touching developer config
  2. Test author can create disposable git repo, template, workspace, and config fixtures by extending existing `tests/helpers.ts` helpers (`makeTmpDir`, `cleanup`, `touch`, `write`, `makeGitRepo`, git env helpers)
  3. Test author can assert exit code, stdout, stderr, generated files, persisted YAML, and failure diagnostics for each E2E command invocation
  4. Maintainer can inspect the canonical machine-parseable inventory source for every non-TUI, non-integration command and library-backed user flow that requires E2E coverage
  5. Maintainer can see explicit exclusions for terminal UI behavior, external integration behavior, editor-launching edit commands, and the v0.17.0 rollback-visibility audit gap
  6. The inventory has a machine-parseable source of truth, with stable IDs, command/user-flow names, scope status, mapped test file(s), and rationale fields
  7. Maintainer can compare every in-scope inventory item with the implemented E2E suite and identify unmapped coverage gaps while later phases add tests

**Plans**: TBD

### Phase 81: Workspace and Git Operation E2E Coverage

**Goal**: Users can trust workspace lifecycle and git-operation behavior because the highest-risk CLI assumptions are proven in real repos and isolated config homes
**Depends on**: Phase 80
**Requirements**: E2E-08, E2E-14
**Success Criteria** (what must be TRUE):

  1. Workspace create and clone E2E tests prove correct source branch selection, task path/main path persistence, generated YAML, and created worktree layout
  2. Workspace env and hook E2E tests prove injected environment values, hook execution cwd, command cwd/path selection, and generated env files
  3. Workspace list/status/status --fetch/open (`--no-ide`)/close/cd/paths/env/run E2E tests prove stdout, stderr, JSON/text contracts, and no accidental external integration launch
  4. Workspace clean/remove/rename E2E tests prove filesystem and YAML side effects, missing/dirty repo behavior, and safe failure messages
  5. Workspace merge, pull, sync, and push E2E tests run against disposable local git repositories/remotes and prove guard behavior for dir repos, dirty repos, missing remotes, and branch/upstream assumptions
  6. Command-execution E2E tests prove run/hooks/git operations use explicit cwd/path handling and do not depend on shell `cd` state

**Plans:** 4/4 plans complete

Plans:

- [x] 81-01-PLAN.md — Shared E2E helpers + create/clone side-effect tests
- [x] 81-02-PLAN.md — Execution context probes + JSON/text output contracts
- [x] 81-03-PLAN.md — Lifecycle cascading + guard behavior tests
- [x] 81-04-PLAN.md — Git operations against bare remotes + status --fetch

### Phase 81.1: Repo add honors enabled forge integrations (INSERTED)

**Goal:** Make `repo add` honor globally enabled forge integrations so forge detection and prompts only consider forges the user has explicitly enabled, eliminating incorrect prompting when all forges are disabled (the default)
**Requirements**: D-01, D-02, D-03, D-04 (from 81.1-CONTEXT.md)
**Depends on:** Phase 81
**Plans:** 1/1 plans complete
**Success Criteria** (what must be TRUE):

  1. `repo add` only runs forge detectors for globally enabled forge integrations (D-01)
  2. Disabled forges are invisible to both auto-detection and prompt options (D-02)
  3. Zero enabled forge matches → forge unset, no prompt (D-03)
  4. Multiple enabled forge matches → prompt only among enabled matches plus None (D-04)
  5. All tests pass including new forge-utils and repo-add coverage

Plans:

- [x] 81.1-01-PLAN.md — Enabled-aware forge detection + repo add behavioral fix + tests

### Phase 81.1.1: Minimal non-interactive workspace create and clone variants (INSERTED)

**Goal:** Add `--non-interactive` mode to `git-stacks new` and `git-stacks clone` so later E2E phases can create template-backed workspaces and clone existing workspaces without driving TUI prompts
**Requirements**: D-01, D-02, D-03, D-04, D-05, D-06, D-07, D-08, D-09, D-10, D-11
**Depends on:** Phase 81.1
**Plans:** 1/1 plans complete

Plans:

- [x] 81.1.1-01-PLAN.md — Non-interactive new and clone: Commander flags, TUI guards, unit tests

### Phase 82: Template, Repo, Label, and Message E2E Coverage

**Goal**: Users can trust non-workspace command families because template, registry, label, and message behavior is covered through real CLI processes
**Depends on**: Phase 81
**Requirements**: E2E-09, E2E-10, E2E-11
**Success Criteria** (what must be TRUE):

  1. Template flows have E2E coverage for `template list/show/clone/rename/remove`, template label behavior, and template-backed `new --non-interactive` / composition / clone propagation; `template new` and other wizard-driven template flows remain excluded
  2. Repo registry flows have E2E coverage for `repo add/list/show/rename/remove --force` across separate git-repo and dir-repo scenarios, using only no-enabled-forge and exact-one-enabled-match success paths; `repo scan` remains excluded
  3. Workspace label flows extend the existing subprocess coverage to close add/remove/list/clear and output-contract gaps without adding the deferred failure matrix
  4. Message flows have E2E coverage for send/list/clear, workspace resolution, sender metadata, newest-first JSONL persistence, missing-workspace behavior, and an automation-safe socket opt-out; live dashboard delivery remains excluded
  5. The Phase 80 inventory source is updated inline with flow-level mappings and exclusions as each Phase 82 suite lands

**Plans**: 3 plans

Plans:

- [x] 82-01-PLAN.md — Block on missing prerequisites, then add the split template command and template-consumption suites with inline inventory updates
- [x] 82-02-PLAN.md — Add repo registry git-vs-dir success-path coverage and extend workspace label subprocess coverage with inline inventory updates
- [x] 82-03-PLAN.md — Add the explicit message socket opt-out plus the focused message CLI/file contract suite with inline inventory updates

### Phase 82.1: Support Commands and Error-Path E2E Coverage

**Goal**: Users can trust support commands and representative failures because command behavior is exercised outside narrow unit mocks
**Depends on**: Phase 82
**Requirements**: E2E-12, E2E-13
**Success Criteria** (what must be TRUE):

  1. Config show, doctor, completion, version, install hook, env, paths, `edit --yaml` (workspace/template/config/registry), `integration list`, and `integration <id> config show/example` support flows have E2E coverage for success cases and output contracts
  2. Representative malformed input, missing entity, missing path, validation-failure, dirty repo, and permission/error cases are covered for in-scope command families
  3. Doctor tests verify local-only checks without depending on unavailable external integration CLIs unless those integrations are explicitly configured in fixtures
  4. Completion tests verify generated shell completions for current command tree shape without invoking TUI or external integrations
  5. The Phase 80 inventory source has no unmapped in-scope item except consciously deferred exclusions documented with rationale
  6. A minimal pre-Phase-83 proof confirms the chosen Istanbul instrumentation approach can produce mergeable coverage artifacts from at least one isolated subprocess E2E invocation

**Plans**: 3 plans

Plans:

- [x] `82.1-01-PLAN.md` — Verify Phase 80/81.1/81.1.1/82 prerequisite surfaces first, then add readonly plus workspace-adjacent support-command suites
- [x] `82.1-02-PLAN.md` — Add doctor/install and integration-config success-path support-command coverage
- [x] `82.1-03-PLAN.md` — Add representative failure coverage, update the canonical E2E inventory, and commit the Phase 83 Istanbul smoke handoff

### Phase 83: Istanbul-Based Subprocess Coverage Reporting

**Goal**: Developers can generate useful Istanbul-format code coverage reports that include both shared-process unit tests and isolated subprocess E2E files
**Depends on**: Phase 82.1
**Requirements**: COVR-01, COVR-02, COVR-03, COVR-04
**Success Criteria** (what must be TRUE):

  1. Developer can run one command that generates coverage for the full test suite across shared-process unit tests and isolated runner files
  2. Coverage reports include source files exercised by subprocess E2E tests through Istanbul-compatible source instrumentation and per-process JSON artifact merging
  3. Coverage output is written to a stable ignored directory with human-readable summary output and machine-readable Istanbul artifacts usable by local verification gates
  4. Normal `bun run test`, `bun run test:unit`, and `bun run test:integ` runs are not materially slower unless coverage is explicitly requested
  5. Coverage implementation documents any tool-specific caveats without using those caveats as a substitute for subprocess source coverage

**Plans:** 3 plans

Plans:

- [x] `83-01-PLAN.md` — Prerequisites, dependency installation, coverage script surface, and runner/preload scaffold
- [x] `83-02-PLAN.md` — Instrumentation engine, subprocess delegation shim, preload plugin, and test execution wiring
- [x] `83-03-PLAN.md` — Coverage merge, zero-baseline, report generation (text/HTML/JSON/LCOV), and regression verification

### Phase 84: Local Coverage Gates, Docs, and Release Prep

**Goal**: Maintainers can keep the E2E inventory, mapped tests, coverage reports, and existing verification commands aligned without assuming CI exists
**Depends on**: Phase 83
**Requirements**: GATE-01, GATE-02, GATE-03
**Success Criteria** (what must be TRUE):

  1. Local verification fails when a new in-scope command is added without updating the E2E coverage inventory
  2. Local verification fails when an in-scope inventory item has no mapped E2E test
  3. Existing unit, integration, dependency, and typecheck commands continue to pass with the expanded E2E and coverage tooling
  4. Maintainer can run the documented v0.17.1 verification path and see the inventory gates, coverage command, and existing quality commands represented
  5. Release prep updates version/changelog/README as needed for the new E2E and coverage commands
  6. README structured debug logging examples updated to match the shipped key/value format (promotes backlog 999.2)

**Plans**: 3 plans

Plans:

- [x] `84-01-PLAN.md` — Verify Phase 80 inventory and Phase 83 coverage prerequisite surfaces before any Phase 84 implementation work
- [x] `84-02-PLAN.md` — Add local `bun run verify` orchestration plus aggregated inventory, mapping, and coverage gates
- [x] `84-03-PLAN.md` — Apply focused README, CHANGELOG, and version release-prep updates for verify and debug docs

### Phase 84.1: Coverage Report Accuracy and TUI Instrumentation Follow-up (INSERTED)

**Goal:** Coverage reports are trustworthy enough to close v0.17.1: existing tests that import source through relative paths, especially TUI/TSX tests, are captured by the Istanbul instrumentation path instead of appearing as near-zero coverage.
**Requirements**: COVR-01, COVR-02, COVR-03, COVR-04, GATE-03
**Depends on:** Phase 84
**Plans:** 2/2 plans complete

Plans:

- [x] `84.1-01-PLAN.md` — Instrumented runtime-root coverage repair plus sentinel verify-gate checks
- [x] `84.1-02-PLAN.md` — Verify canonical full-suite coverage and local release-prep gates after the instrumentation repair

### Phase 85: Core Real-Fixture Functional Hardening

**Goal**: Core workspace, git, file, hook, env, config, and rollback behavior is covered through real temp directories and local git repositories rather than fragile mocks or command-wrapper-only assertions
**Depends on**: Phase 84.1
**Requirements**: CORE-01, CORE-02, CORE-03, CORE-04, CORE-05, GATE-03
**Success Criteria** (what must be TRUE):

  1. Workspace lifecycle operations have additional real-fixture coverage for rollback, cleanup, rename, merge, missing path, and destructive safety boundaries
  2. Git operations have real local bare-remote coverage for sync/pull/push edge behavior not already covered by the first E2E pass, including failure and no-op cases
  3. Hook execution coverage proves ordering, cwd, env injection, failure propagation, captured output, and rollback interaction using real temp workspaces
  4. File operation coverage proves copy/symlink/glob/external warning/idempotency behavior where it affects workspace setup and cleanup
  5. Env/secrets/ports/config coverage proves resolver order, repo overlay, collision handling, backward-compatible YAML reads, and atomic write behavior with isolated config homes
  6. Coverage improvements come from real source execution; tests must not inline copies of implementation logic to satisfy coverage

**Plans**: 4 plans

Plans:

- [ ] `85-01-PLAN.md` — Workspace lifecycle and rollback real-fixture coverage
- [ ] `85-02-PLAN.md` — Git operation and branch-state real-fixture coverage
- [ ] `85-03-PLAN.md` — Hook, file, env, secrets, ports, and config hardening coverage
- [ ] `85-04-PLAN.md` — Coverage report review and focused gap closure for core source modules

### Phase 86: Workspace Command Workflow Edge Coverage

**Goal**: Stable user-facing workspace command workflows have behavior coverage where CLI wiring matters, without chasing every prompt branch or brittle text formatting detail
**Depends on**: Phase 85
**Requirements**: CMD-01, CMD-02, CMD-03, CMD-04, GATE-03
**Success Criteria** (what must be TRUE):

  1. `open --recreate` is covered with template-backed fixtures for no-change, added/removed repos, hook/env/file/integration changes, missing template, workspace-without-template, and force/cancel-safe behavior where automation-safe
  2. `clean --gone` is covered with local bare remotes for gone-branch detection, dirty-worktree refusal, dry-run/force behavior, multi-workspace handling, and removal failure reporting
  3. Destructive workspace commands (`clean`, `remove`, `merge`, `rename`) have CLI-level smoke for dry-run/force/error behavior that is not already proven by core libraries
  4. `run`, `paths`, `env`, `status`, `sync`, `push`, and `pull` command wrappers have focused coverage for meaningful option interactions, JSON contracts, cwd detection, and "nothing to do" branches
  5. Tests avoid brittle assertions on spinner wording or prompt rendering unless the text is part of a machine-readable or safety-critical contract

**Plans**: 3 plans

Plans:

- [ ] `86-01-PLAN.md` — `open --recreate` and template/workspace update workflows
- [ ] `86-02-PLAN.md` — `clean --gone` and destructive command safety workflows
- [ ] `86-03-PLAN.md` — Command wrapper JSON/cwd/no-op/error contracts for run/status/env/paths/sync/push/pull

### Phase 87: Integration Contract and Source-Module Coverage

**Goal**: Integration-related functionality is covered through real source modules and injected executors without requiring local Niri, AeroSpace, cmux, VSCode, browser, or forge CLI environments
**Depends on**: Phase 86
**Requirements**: INTG-02, INTG-03, INTG-04, GATE-03
**Success Criteria** (what must be TRUE):

  1. `issue-utils` tests exercise the real source module and cover linked issue resolution, link/unlink persistence, error formatting, and CWD workspace resolution without inlining implementation copies
  2. `forge-utils` tests exercise the real source module and cover worktree/trunk selection, any-mode repo selection, forge mismatch errors, base branch selection, enabled-forge detection, and no-tool/no-remote cases
  3. Forge integration command modules (GitHub/GitLab/Gitea/Jira where applicable) have injected-executor contract tests for argument construction, JSON parse failures, missing PR/issue/repo cases, and safe browser-open behavior
  4. Session/IDE integrations (tmux/cmux/niri/AeroSpace/VSCode/IntelliJ where applicable) have contract tests for config parsing, command construction, artifact-bag use, skip behavior, and safe failure handling without launching real external tools
  5. Existing integration tests that currently mock by reimplementing source logic are replaced or supplemented so coverage reports reflect the real implementation

**Plans**: 4 plans

Plans:

- [ ] `87-01-PLAN.md` — Real-source issue-utils and forge-utils coverage repair
- [ ] `87-02-PLAN.md` — Forge command contract tests with injected executors
- [ ] `87-03-PLAN.md` — Session and IDE integration contract tests without external environments
- [ ] `87-04-PLAN.md` — Remove source-bypassing mock patterns and verify integration coverage deltas

### Phase 88: Functional Coverage Readiness Gate

**Goal**: Maintainers can decide whether v0.17.1 is ready using functional coverage evidence, explicit accepted gaps, and local gates that protect the newly covered core areas
**Depends on**: Phase 87
**Requirements**: GATE-04, COVR-05
**Success Criteria** (what must be TRUE):

  1. A functional-only coverage report is produced and documented, excluding TUI rendering surfaces and real external-environment plugins while keeping core integration contracts in scope
  2. Remaining uncovered functional areas are classified as accepted gap, deferred external-environment coverage, or must-fix-before-release
  3. Local verification includes either numeric thresholds or targeted sentinel gates for the functional core areas covered in phases 85-87
  4. The milestone inventory and requirements clearly distinguish "green suite", "covered source", and "functional confidence" so future agents do not equate passing tests with complete behavior
  5. Final release-readiness docs summarize what is covered, what is intentionally not covered, and what manual verification remains

**Plans**: 2 plans

Plans:

- [ ] `88-01-PLAN.md` — Functional coverage report, accepted-gap classification, and gate design
- [ ] `88-02-PLAN.md` — Implement readiness gates and final v0.17.1 release evidence update

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 74. Template Label CLI & Propagation | v0.17.0 | 2/2 | Complete    | 2026-04-05 |
| 75. DI Seams & Structured Logging | v0.17.0 | 2/2 | Complete    | 2026-04-05 |
| 76. Integration Plugin Capability Contracts | v0.17.0 | 2/2 | Complete    | 2026-04-06 |
| 77. Indexed Config Store | v0.17.0 | 2/2 | Complete    | 2026-04-06 |
| 78. Operation Runner with Rollback | v0.17.0 | 3/3 | Complete    | 2026-04-06 |
| 79. Release Prep | v0.17.0 | 1/1 | Complete | 2026-04-06 |
| 80. E2E CLI Harness and Living Inventory | v0.17.1 | 2/2 | Complete   | 2026-05-14 |
| 81. Workspace and Git Operation E2E Coverage | v0.17.1 | 4/4 | Complete    | 2026-05-14 |
| 82. Template, Repo, Label, and Message E2E Coverage | v0.17.1 | 3/3 | Complete   | 2026-05-14 |
| 82.1. Support Commands and Error-Path E2E Coverage | v0.17.1 | 3/3 | Complete    | 2026-05-14 |
| 83. Istanbul-Based Subprocess Coverage Reporting | v0.17.1 | 3/3 | Complete | 2026-05-14 |
| 84. Local Coverage Gates, Docs, and Release Prep | v0.17.1 | 3/3 | Complete   | 2026-05-14 |
| 84.1. Coverage Report Accuracy and TUI Instrumentation Follow-up | v0.17.1 | 2/2 | Complete   | 2026-05-14 |
| 85. Core Real-Fixture Functional Hardening | v0.17.1 | 4/4 | Complete   | 2026-05-15 |
| 86. Workspace Command Workflow Edge Coverage | v0.17.1 | 3/3 | Complete   | 2026-05-15 |
| 87. Integration Contract and Source-Module Coverage | v0.17.1 | 4/4 | Complete   | 2026-05-15 |
| 88. Functional Coverage Readiness Gate | v0.17.1 | 2/2 | Complete   | 2026-05-15 |
| 89. Files Sync Schema and Materialization | v0.18.0 | 3/3 | Complete | 2026-05-16 |
| 90. Files Command Surface and Conflict Policy | v0.18.0 | 3/3 | Complete | 2026-05-16 |
| 91. Files Sync Integration and Machine Output | v0.18.0 | 4/4 | Complete | 2026-05-16 |
| 92. Forge Source Research and Resolver Design | v0.18.0 | 4/4 | Complete | 2026-05-16 |
| 93. Forge Source Workspace Creation | v0.18.0 | 4/4 | Complete | 2026-05-16 |
| 93.1. Parallel Integration Test Runner and Coherent Coverage Merging | v0.18.0 | 3/3 | Complete | 2026-05-16 |
| 94. v0.18.0 Docs and Release Prep | v0.18.0 | 3/3 | Complete | 2026-05-16 |
| 95. Manual Workspace Commands | v0.19.0 | 4/4 | Complete   | 2026-05-17 |
| 96. Workspace Notes | v0.19.0 | 2/2 | Complete   | 2026-05-17 |
| 97. File Status View Model for TUI | v0.19.0 | 2/2 | Complete    | 2026-05-17 |
| 98. Grounded Dashboard Control Center | v0.19.0 | 3/3 | Complete   | 2026-05-17 |
| 99. Dashboard Actions and Correctness Polish | v0.19.0 | 4/4 | Complete   | 2026-05-17 |

## Backlog

### ~~Phase 999.1: Dashboard Rollback Progress Visibility~~ (PROMOTED → Phase 99)

**Promoted:** Folded into Phase 99 Dashboard Actions and Correctness Polish.
**Source:** `.planning/v0.17.0-MILESTONE-AUDIT.md` ENGN-02 gap.

### ~~Phase 999.2: README Structured Debug Logging Format~~ (PROMOTED → Phase 84 SC 6)

**Promoted:** Folded into Phase 84 release prep as success criterion 6.
**Source:** `.planning/v0.17.0-MILESTONE-AUDIT.md` Phase 79 tech-debt item.

### Phase 999.3: v0.17.0 Nyquist Validation Gaps (BACKLOG)

**Goal:** Run or fill validation for the v0.17.0 phases whose audit status is partial or missing: 74, 75, 76, 77, 78, 78.1, and 79.
**Source:** `.planning/v0.17.0-MILESTONE-AUDIT.md` Nyquist coverage section.
**Requirements:** TBD
**Plans:** 0 plans

Plans:

- [ ] TBD (promote with /gsd-review-backlog when ready)
