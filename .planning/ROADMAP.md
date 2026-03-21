# Roadmap: git-stacks

## Milestones

- ✅ **v0.2.0 Foundation** — Phases 1-5 (shipped 2026-03-18) — Registry+Template model, test infra, file ops, destructive-op safety, UX polish. See [milestones/v1.0-ROADMAP.md](milestones/v1.0-ROADMAP.md)
- ✅ **v0.3.0 Dashboard UI Overhaul** — Phases 6-9 (shipped 2026-03-20) — Messaging system, tabbed dashboard, IPC push display, shell completion overhaul. See [milestones/v0.3.0-ROADMAP.md](milestones/v0.3.0-ROADMAP.md)
- ✅ **v0.4.0 TUI Hardening & Polish** — Phases 10-15.2 (shipped 2026-03-21) — Test harness, workspace sync, wizard create, repo management, screen polish, centered dialogs, integration overrides. See [milestones/v0.4.0-ROADMAP.md](milestones/v0.4.0-ROADMAP.md)
- 🚧 **v0.6.0 Integration Orchestration & Niri** — Phases 16-20 (in progress)

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

### 🚧 v0.6.0 Integration Orchestration & Niri (In Progress)

**Milestone Goal:** Transform integrations from isolated side-effects into an ordered pipeline with shared artifacts, and ship a niri compositor integration that arranges all workspace windows onto a dedicated named workspace.

- [x] **Phase 16: artifact-type-foundation** - Define IntegrationArtifact types, ArtifactBag, and update open() signature across all integrations so the build compiles with the new contract (completed 2026-03-21)
- [x] **Phase 17: integration-runner** - Consolidate four duplicated integration loops into a single runner.ts module with tier ordering, artifact accumulation, and skip-flag preservation (completed 2026-03-21)
- [x] **Phase 18: artifact-population** - Make existing integrations (tmux, cmux, vscode, intellij) return real artifact values so the bag is populated for downstream consumers (completed 2026-03-21)
- [ ] **Phase 19: niri-shell-wrappers** - Implement src/lib/niri.ts shell wrapper library with mockable interface covering all niri msg IPC operations
- [ ] **Phase 20: niri-integration** - Implement the full niri integration plugin: workspace lifecycle, window arrangement from artifact bag, terminal spawn, cleanup on remove

## Phase Details

### Phase 16: artifact-type-foundation
**Goal**: The Integration interface compiles with a typed return value for open(), ArtifactBag exists as a shared accumulator type, and all four existing integrations compile without behavioral change
**Depends on**: Phase 15.2 (last shipped phase)
**Requirements**: ORCH-01, ORCH-02, ART-05, ART-06, TEST-03
**Success Criteria** (what must be TRUE):
  1. `bun run typecheck` passes with the new `open(): Promise<IntegrationArtifact | null>` signature across all integration files
  2. `ArtifactBag` type exists in types.ts and is threaded as a parameter through open() on all integrations
  3. All existing integration tests pass unchanged after the signature update (TEST-03)
  4. `IntegrationArtifact` is a discriminated union covering at minimum tmux, cmux, vscode, intellij, and window variants
**Plans:** 1/1 plans complete
Plans:
- [x] 16-01-PLAN.md — Define artifact types, update Integration.open() signature, update all implementations and caller

### Phase 17: integration-runner
**Goal**: A single runner.ts module replaces all four inline integration loops; the two execution modes (generate-only for TUI callers, generate+open for workspace-ops/CLI) are both implemented; skip flags work correctly
**Depends on**: Phase 16
**Requirements**: ORCH-03, ORCH-04, ORCH-05, ORCH-06, ORCH-07, TEST-02
**Success Criteria** (what must be TRUE):
  1. `src/lib/integrations/runner.ts` exists with `runIntegrationGenerate()` and `runIntegrations()` exported functions
  2. `workspace-ops.ts`, `workspace-wizard.ts`, `workspace-clone.ts`, and `App.tsx` no longer contain inline integration loops — all four delegate to runner
  3. `git-stacks open --no-ide` and `git-stacks open --no-cmux` skip their respective integrations as before (regression preserved)
  4. Integrations execute in ascending numeric `order` field order, with tier 1 before tier 2 before tier 3
  5. Runner unit tests cover artifact accumulation, tier ordering, and skip-flag bypass
**Plans:** 2/2 plans complete
Plans:
- [x] 17-01-PLAN.md — Add order field to Integration, create runner.ts with both execution modes, unit tests
- [x] 17-02-PLAN.md — Replace all four inline integration loops with runner calls

### Phase 18: artifact-population
**Goal**: tmux, cmux, vscode, and intellij integrations return real artifact values so downstream integrations can read session names and window identifiers from the artifact bag
**Depends on**: Phase 17
**Requirements**: ART-01, ART-02, ART-03, ART-04
**Success Criteria** (what must be TRUE):
  1. After `git-stacks open` with tmux enabled, the artifact bag contains `{ type: "tmux", sessionName: "<name>" }` for the opened session
  2. After `git-stacks open` with cmux enabled, the artifact bag contains `{ type: "cmux", workspaceRef: "<ref>" }`
  3. VSCode integration returns a window artifact (pid + best-effort window id) or null — never throws when window identification fails
  4. IntelliJ integration returns a window artifact or null — never throws when window identification fails
**Plans:** 1/1 plans complete
Plans:
- [x] 18-01-PLAN.md — Create artifact tests, update tmux/cmux/vscode/intellij to return real artifacts

### Phase 19: niri-shell-wrappers
**Goal**: All niri msg IPC calls are isolated in src/lib/niri.ts behind a clean interface that automated tests can mock without calling the real niri binary
**Depends on**: Phase 16
**Requirements**: NIRI-06, NIRI-07, NIRI-10, TEST-01
**Success Criteria** (what must be TRUE):
  1. `src/lib/niri.ts` exports at minimum: `isNiriRunning()`, `listNiriWindows()`, `listNiriWorkspaces()`, `setNiriWorkspaceName()`, `moveWindowToWorkspace()`, `niriSpawn()`, `snapshotWindowIds()`
  2. Each wrapper function has a corresponding entry in a mockable interface (or is exported as an injectable dependency) so unit tests substitute them without spawning niri processes
  3. `snapshotWindowIds()` implements the before/after snapshot-diff strategy with exponential-backoff polling up to a configurable timeout
  4. Unit tests for niri.ts wrappers pass without `NIRI_SOCKET` present in the test environment
**Plans**: TBD

### Phase 20: niri-integration
**Goal**: Users running niri get all workspace windows automatically arranged onto a dedicated named niri workspace when they open a git-stacks workspace; the integration is idempotent on re-open and cleans up on remove
**Depends on**: Phase 18, Phase 19
**Requirements**: NIRI-01, NIRI-02, NIRI-03, NIRI-04, NIRI-05, NIRI-08, NIRI-09, TEST-04
**Success Criteria** (what must be TRUE):
  1. `git-stacks open <workspace>` on a niri session creates a niri workspace named after the git-stacks workspace and moves all opened IDE/terminal windows onto it
  2. Running `git-stacks open <workspace>` a second time (re-open) does not create a duplicate niri workspace or move already-placed windows
  3. `git-stacks remove <workspace>` while niri is running removes the named workspace label (unset-workspace-name) so the workspace is no longer named
  4. When `NIRI_SOCKET` is not set, the niri integration skips gracefully — no error, no output, other integrations unaffected
  5. The terminal emulator used for niri terminal spawning is configurable via integration config (default: `ghostty`) and the tmux session name from the artifact bag is used for the attach command
**Plans**: TBD

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1-5. Foundation | v0.2.0 | 21/21 | Complete | 2026-03-18 |
| 6-9. Dashboard UI | v0.3.0 | 13/13 | Complete | 2026-03-20 |
| 10-15.2. TUI Hardening | v0.4.0 | 21/21 | Complete | 2026-03-21 |
| 16. artifact-type-foundation | v0.6.0 | 1/1 | Complete    | 2026-03-21 |
| 17. integration-runner | v0.6.0 | 2/2 | Complete    | 2026-03-21 |
| 18. artifact-population | v0.6.0 | 1/1 | Complete    | 2026-03-21 |
| 19. niri-shell-wrappers | v0.6.0 | 0/? | Not started | - |
| 20. niri-integration | v0.6.0 | 0/? | Not started | - |
