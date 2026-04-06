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
- 🚧 **v0.17.0 Engine Hardening & Template Labels** — Phases 74-79 (in progress) — Template label CLI + propagation, DI seams + structured logging, integration plugin contracts, indexed config store, operation runner with rollback, release prep.

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

### 🚧 v0.17.0 Engine Hardening & Template Labels (In Progress)

**Milestone Goal:** Extend template labels to parity with workspace labels, add structured debug logging with module filtering, introduce typed integration capability contracts, speed up config lookups with an in-memory index, and make multi-step workspace operations safe to fail via a compensation-stack rollback.

- [x] **Phase 74: Template Label CLI & Propagation** - Template label CRUD commands, `--label` filter on `template list`, label snapshot into workspace at create/clone time (completed 2026-04-05)
- [x] **Phase 75: DI Seams & Structured Logging** - Injectable `_exec` seams in lifecycle modules, structured debug fields, `GS_DEBUG` module filter (completed 2026-04-05)
- [x] **Phase 76: Integration Plugin Capability Contracts** - `capabilities` field on Integration interface, capability-driven runner guards, `integration list` displays capabilities (completed 2026-04-06)
- [x] **Phase 77: Indexed Config Store** - In-memory index for workspace/template lookups, write-triggered invalidation, scan fallback (completed 2026-04-06)
- [x] **Phase 78: Operation Runner with Rollback** - LIFO compensation stack in `operation-runner.ts`, `workspace-lifecycle.ts` wired to runner, rollback progress via `onProgress` (completed 2026-04-06)
- [ ] **Phase 79: Release Prep** - v0.17.0 version bump, CHANGELOG, README updates

## Phase Details

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
- [ ] `75-01-PLAN.md` — Add real mutable `_exec` seams to `workspace-lifecycle.ts` and `workspace-git.ts` with focused module tests
- [ ] `75-02-PLAN.md` — Extend `src/lib/observability.ts` and `src/index.ts` for `GS_DEBUG`, structured stderr fields, selector filtering, and CLI regression coverage

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
- [ ] `76-01-PLAN.md` — Capability type, Integration interface field, all 10 plugins updated, runner capability-gated calls
- [ ] `76-02-PLAN.md` — integration list capabilities column (table + JSON output)

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
- [ ] `77-01-PLAN.md` — In-memory index Maps with _cache seam, cache-gated read/write/list/exists, deleteWorkspace/deleteTemplate, tests
- [ ] `77-02-PLAN.md` — Migrate all unlinkSync(workspacePath/templatePath) call sites to deleteWorkspace/deleteTemplate

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
- [ ] `78-01-PLAN.md` — Pure operation-runner primitive (`src/lib/operation-runner.ts`) with LIFO compensation stack, discriminated-union return, and eight unit tests
- [ ] `78-02-PLAN.md` — `createWorkspace()` on `workspace-lifecycle.ts` wiring runner into D-12 creation ordering with integration tests forcing failures via Phase 75 _exec seams
- [ ] `78-03-PLAN.md` — Wizard and dashboard migration to shared `createWorkspace()`; delete hand-rolled rollback at App.tsx:883-911; CONCERNS.md:51-55 resolved

### Phase 78.1: turn capability enums into actual typescript interface instead of capability return function. also remove it from the integration list and documentation (INSERTED)

**Goal:** Replace the Capability string union and capabilities Set on Integration with narrow TypeScript interfaces composed via intersection types; remove the Capabilities column from `git-stacks integration list` and the audit-trail updates in REQUIREMENTS.md/STATE.md. Phase 76 user-facing capability surface fully reverted (per CONTEXT.md D-01..D-18); the underlying gating goal is preserved via type predicates in src/lib/integrations/types.ts.
**Requirements**: ENGN-07, ENGN-08, ENGN-09 (rewritten in place per D-13)
**Depends on:** Phase 78
**Plans:** 3 plans

Plans:
- [ ] `78.1-01-PLAN.md` — Add narrow capability interfaces (Generates, Cleans, HasCommands, HasConfigExample, WindowDetecting, Conditional) and type predicates (isGenerator, isCleaner, isConditional, isWindowDetecting) to src/lib/integrations/types.ts; remove Capability type and capabilities field from base Integration interface
- [ ] `78.1-02-PLAN.md` — Update all 10 plugin files to drop `capabilities: new Set(...)` literal and use intersection types at export site; rewrite runner.ts to use type predicates with zero non-null assertions on integration method calls
- [ ] `78.1-03-PLAN.md` — Strip Capabilities column from `git-stacks integration list` (table + JSON), delete TAG_MAP constant, update 4 test files (drop fake `capabilities: new Set(...)` and delete obsolete Phase 76-02 test block), rewrite REQUIREMENTS.md ENGN-07/08/09 in place, append Phase 78.1 decisions section to STATE.md

### Phase 79: Release Prep
**Goal**: v0.17.0 is version-bumped, documented, and ready to ship
**Depends on**: Phase 78
**Requirements**: (release prep — no REQUIREMENTS.md entry)
**Success Criteria** (what must be TRUE):
  1. `package.json` version is `0.17.0` and `bun run dev --version` reports it
  2. CHANGELOG has an entry for v0.17.0 listing all milestone features
  3. README documents `template label` commands and `GS_DEBUG` module filter syntax
**Plans**: TBD

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 74. Template Label CLI & Propagation | v0.17.0 | 2/2 | Complete    | 2026-04-05 |
| 75. DI Seams & Structured Logging | v0.17.0 | 2/2 | Complete    | 2026-04-05 |
| 76. Integration Plugin Capability Contracts | v0.17.0 | 2/2 | Complete    | 2026-04-06 |
| 77. Indexed Config Store | v0.17.0 | 2/2 | Complete    | 2026-04-06 |
| 78. Operation Runner with Rollback | v0.17.0 | 3/3 | Complete   | 2026-04-06 |
| 79. Release Prep | v0.17.0 | 0/TBD | Not started | - |
