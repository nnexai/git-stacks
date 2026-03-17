# Roadmap: git-stacks

## Overview

The PoC is working. This roadmap hardens it into a tool you can trust: stable config schemas that survive upgrades, a test safety net for git operations, destructive commands that cannot corrupt state, a design decision on whether Stacks become Templates backed by a Repo Registry, and the UX polish that makes the tool feel complete. Four phases, each delivering a coherent capability before the next begins.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Foundation** - Stable config schemas, test infrastructure, and live bug fixes — the PoC becomes trustworthy
- [ ] **Phase 2: Safety** - Destructive operations (remove, clean, merge) gain dry-run, confirmation, and consistent --force behavior
- [ ] **Phase 3: Design and Conditional Implementation** - Evaluate Stack vs Repo-Registry/Template model, then implement the winning model (REPO-* and TMPL-* contingent on DESIGN outcome)
- [ ] **Phase 4: UX and Execution** - Actionable errors, --json output, doctor --fix, richer list columns, and parallel run

## Phase Details

### Phase 1: Foundation
**Goal**: The existing PoC does not break mysteriously — corrupt configs are handled gracefully, schema upgrades never break existing user files, git operations have test coverage, and known live bugs are fixed
**Depends on**: Nothing (first phase)
**Requirements**: PREREQ-01, PREREQ-02, PREREQ-03, TEST-01, TEST-02, TEST-03, CONF-01, CONF-02, CONF-03, CONF-04, BUG-01, BUG-02, BUG-03, BUG-04
**Success Criteria** (what must be TRUE):
  1. A corrupt or invalid YAML file in workspaces/ or stacks/ causes a stderr warning and is skipped — no crash, all valid entries still load
  2. Adding a new field to a Stack or Workspace Zod schema without a .default() is caught by a CI test before it ships — existing user config files are never silently broken on upgrade
  3. Core git operations (createWorktree, removeWorktree, mergeNoFF, rebaseBranch) are covered by integration tests using real local git repos — regressions are caught before they reach users
  4. git-stacks fails fast with a clear install instruction when git is absent or below version 2.24
  5. mergeWorkspace, removeWorkspace, and renameWorkspace cannot leave workspace YAML deleted or git worktrees unregistered after a mid-operation failure
**Plans**: 5 plans

Plans:
- [x] 01-01-PLAN.md — Test infrastructure: makeGitRepo helper + git.ts integration tests (TEST-01, TEST-02)
- [ ] 01-02-PLAN.md — Config resilience: formatZodError, safeParse, schema_version, shape guard (CONF-01-04)
- [ ] 01-03-PLAN.md — Prerequisite checks: git version check, integration binary guards, doctor reporting (PREREQ-01-03)
- [ ] 01-04-PLAN.md — Bug fixes: mergeNoFF detached HEAD, atomic merge/remove/clean/rename (BUG-01-04)
- [ ] 01-05-PLAN.md — Workspace lifecycle integration tests (TEST-03)

### Phase 01.2: Version command enhancement (INSERTED)

**Goal:** The -V/--version flag shows the real package.json version and git commit hash (with dirty flag) when running from source, replacing the hardcoded out-of-sync version string
**Requirements**: VER-01
**Depends on:** Phase 1
**Plans:** 1/1 plans complete

Plans:
- [ ] 01.2-01-PLAN.md — Dynamic version string from package.json + git hash + dirty flag (VER-01)

### Phase 01.1: File and folder copy/symlink support between repos for large binary sharing (INSERTED)

**Goal:** Stack and workspace configs support a `files:` block with `copy` and `symlink` arrays that handle files, folders, and glob patterns at two independent levels (workspace-instance and per-repo), with loud-fail error semantics and idempotent re-application on both `new` and `open`
**Requirements**: FILES-01, FILES-02, FILES-03, FILES-04, FILES-05, FILES-06, FILES-07, FILES-08, FILES-09, FILES-10, FILES-11, FILES-12, FILES-13, FILES-14, FILES-15, SCHEMA-01, SCHEMA-02, SCHEMA-03, SCHEMA-04, IDEMPOTENT-01, IDEMPOTENT-02
**Depends on:** Phase 1
**Plans:** 1/2 plans executed

Plans:
- [ ] 01.1-01-PLAN.md — Core file ops engine: schema extensions, files.ts rewrite, full test coverage
- [ ] 01.1-02-PLAN.md — Wire file ops into workspace-wizard.ts (new) and workspace-ops.ts (open)

### Phase 2: Safety
**Goal**: Users can safely run remove, clean, and merge knowing exactly what will happen before it does, with consistent --force semantics across all destructive commands
**Depends on**: Phase 1
**Requirements**: SAFE-01, SAFE-02, SAFE-03
**Success Criteria** (what must be TRUE):
  1. Running remove, clean, or merge with --dry-run prints every action that would execute and exits without modifying any files or git state
  2. Running remove or clean without --force prompts for explicit confirmation before any destructive action occurs
  3. --force flag suppresses confirmation prompts identically across remove, clean, merge, and rename — no command behaves differently
**Plans**: TBD

### Phase 3: Design and Conditional Implementation
**Goal**: A documented decision exists on whether Stacks are replaced, renamed, or supplemented by a Repo Registry + Template model — and the chosen model is implemented (REPO-* and TMPL-* execute only if DESIGN-01 and DESIGN-02 conclude they are in scope)

**Note on conditionality:** REPO-* and TMPL-* requirements are contingent on DESIGN-01 and DESIGN-02. If the design evaluation concludes the current Stack model is sufficient, REPO-* and TMPL-* requirements are deferred to v2 and this phase delivers only the design documentation. If the new model is adopted, all nine REPO-* and TMPL-* requirements are implemented within this phase.

**Depends on**: Phase 2
**Requirements**: DESIGN-01, DESIGN-02, REPO-01, REPO-02, REPO-03, REPO-04, TMPL-01, TMPL-02, TMPL-03, TMPL-04, TMPL-05
**Success Criteria** (what must be TRUE):
  1. A written decision document exists comparing the current Stack model against a Repo Registry/Template model across at least 3 representative workflows — rationale and backward-compatibility stance are documented
  2. The design decision is implemented: either the existing Stack model is confirmed and no REPO/TMPL work proceeds, OR a user can register repos and create named Templates that reference them to create workspaces
  3. (Conditional on new model) User can list, view, and remove registered repos from the CLI
  4. (Conditional on new model) Templates support branch-name placeholders (e.g., feature/<workspace-name>) expanded at workspace creation time
  5. (Conditional on new model) Existing stack YAML files continue to work unchanged after the model change is introduced
**Plans**: TBD

### Phase 4: UX and Execution
**Goal**: The tool communicates clearly, works with scripts and agents, and surfaces workspace health at a glance
**Depends on**: Phase 3
**Requirements**: UX-01, UX-02, UX-03, UX-04, RUN-01
**Success Criteria** (what must be TRUE):
  1. Every command error message includes enough context to recover without reading source code (e.g., names the repo, the operation, and a suggested next step)
  2. status, doctor, and sync accept --json and emit machine-readable output — pipeable to jq without post-processing
  3. doctor --fix executes the repair actions it already identifies, with per-action success/failure reported
  4. list shows branch name, repo count, last-opened time, and dirty indicator by default — no extra flags needed
  5. run <workspace> <cmd> --parallel executes across all repos simultaneously with per-repo output and a single aggregated exit code
**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation | 4/5 | In Progress|  |
| 01.1. File ops | 1/2 | In Progress|  |
| 01.2. Version command | 1/1 | Complete    | 2026-03-17 |
| 2. Safety | 0/TBD | Not started | - |
| 3. Design and Conditional Implementation | 0/TBD | Not started | - |
| 4. UX and Execution | 0/TBD | Not started | - |
