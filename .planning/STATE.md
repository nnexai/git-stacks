---
gsd_state_version: 1.0
milestone: v0.17.1
milestone_name: E2E Test Coverage
status: defining_requirements
stopped_at: New milestone initialization
last_updated: "2026-04-10T18:59:07Z"
last_activity: 2026-04-10 - Milestone v0.17.1 started
progress:
  total_phases: 0
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
  percent: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-10)

**Core value:** One command takes you from "I need to work on feature X" to a fully running dev environment — right repos, right branches, right IDE/terminal open, hooks run — without manual steps.
**Current focus:** Milestone v0.17.1 will extend E2E coverage for non-TUI, non-integration CLI behavior and add code coverage reporting across split test runners

## Current Position

Phase: Not started (defining requirements)
Plan: —
Status: Defining requirements
Last activity: 2026-04-10 - Milestone v0.17.1 started

Progress: [░░░░░░░░░░] 0% (0/0 plans)

## Accumulated Context

### Decisions

- v0.17.0 scope: template labels, DI seams + structured logging, integration plugin contracts, indexed config store, operation runner with rollback
- Phase ordering: labels first (zero risk, high value) → DI seams (unblocks rollback closures) → plugin contracts (unblocks runner isolation path) → config index (stable before rollback uses it) → operation runner (highest risk, last)
- Phase numbering continues from v0.16.0: starts at 74
- Rollback order must be strictly LIFO; each undo wrapped in try/catch (best-effort)
- Template labels must be snapshot-copied at workspace creation, not resolved at runtime
- Config index is read-only cache; YAML remains source of truth; every write invalidates relevant entry
- `workspace-ops.ts` facade signature stays unchanged throughout this milestone
- Phase 78 (operation runner) flagged for planning research on integration-specific rollback edge cases
- [Phase 74]: Template label CRUD stays nested under template label to preserve the existing top-level CLI shape
- [Phase 74]: Template list filtering reuses a generic label matcher so workspace and template semantics cannot drift
- [Phase 74]: Merged template labels during composition instead of adding runtime label inheritance.
- [Phase 74]: Clone snapshots now copy source.labels explicitly while workspace creation keeps the existing wizard union boundary.
- [Phase 75]: workspace-lifecycle._exec.spawn delegates to lifecycleExec.spawn — seam reuses lifecycle's SpawnHandle contract exactly
- [Phase 75]: workspace-git._exec initialized with all 12 git.ts helpers so any helper call is interceptable without mocking the full git module
- [Phase 75]: GS_DEBUG is the canonical env var; GIT_STACKS_DEBUG=1 resolved to '1' once in src/index.ts bootstrap — no distributed env parsing elsewhere
- [Phase 75]: Structured log fields rendered as preformatted string in logtape message so existing Bun.stderr.writer sink is reused without a new sink layer
- [Phase 75]: MODULE_ALIASES map normalizes short selector tokens (lifecycle, git, status) to workspace-* category names; stored as Set for O(1) per-category gate
- [Phase 76]: capabilities is required (not optional) on Integration interface — TypeScript enforces declaration at compile time; all 10 first-party plugins declare via new Set<Capability>([])
- [Phase 76]: Runner uses capabilities.has() gates with non-null assertion (!) instead of optional chaining — makes gating contract explicit and eliminates silent fallthrough
- [Phase 76]: [Phase 76-02]: TAG_MAP placed at module top in integration.ts — abbreviations close to use, avoids closure capture
- [Phase 76]: [Phase 76-02]: JSON branch runs before table rendering in integration list action — skips caps computation for JSON callers
- [Phase 77]: Phase 77-01: Option A (workspaceListPopulated flag + Map rebuild) chosen for list caching over separate list array
- [Phase 77]: Phase 77-01: deleteWorkspace/deleteTemplate added to config.ts consolidating unlinkSync + cache eviction in one module
- [Phase 77]: Phase 77-01: removeWorkspace evicts cache before parse-attempt so externally-corrupted YAML is detected (preserves D-12 behavior)
- [Phase 77]: templatePath retained in App.tsx import — still used at line 645 for YAML editor path, only deletion call replaced with deleteTemplate
- [Phase 77]: Task 1 of 77-02 was no-op — Wave 1 (77-01) already replaced all workspace unlinkSync call sites in workspace-lifecycle.ts and workspace-ops.ts
- [Phase 78-operation-runner-with-rollback]: [Plan 78-01]: createRunner uses split do/result API — do() manages stack and rolls back on throw, result() is single source of truth for the discriminated union
- [Phase 78-operation-runner-with-rollback]: [Plan 78-01]: rollbackErrors[] entries duplicate the strings sent through onProgress (D-16) so programmatic callers do not have to re-parse stdout
- [Phase 78-operation-runner-with-rollback]: [Plan 78-01]: runner reuses ProgressCallback from workspace-ops; introduces no new _exec seam — pure control-flow over caller-supplied closures
- [Phase 78-operation-runner-with-rollback]: Plan 78-02: createWorkspace lives only on workspace-lifecycle.ts; D-03 lock holds and workspace-ops.ts is unchanged
- [Phase 78-operation-runner-with-rollback]: Plan 78-02: hook failures use Approach A (synthetic runner.do() in catch + inHookPhase flag) instead of adding runner.fail() — preserves Plan 01 runner contract and keeps result() called exactly once
- [Phase 78-operation-runner-with-rollback]: Plan 78-02: writeWorkspace is structurally unreachable on failure — placed AFTER an early-return on runner.result() ok:false, satisfying success criterion 1 by code structure not assertion
- [Phase 78-operation-runner-with-rollback]: Plan 78-02: Strategy A for file-op undos (no-op because files live inside the worktree the runner already removes) keeps files.ts out of phase scope
- [Phase 78-operation-runner-with-rollback]: Plan 78-03: Both wizard and dashboard now delegate workspace creation to createWorkspace() in workspace-lifecycle.ts (D-03 lock holds — imported direct, not via workspace-ops facade)
- [Phase 78-operation-runner-with-rollback]: Plan 78-03: Dashboard CreateRow state machine driven from four documented onProgress regex constants (CREATING_RE, CREATED_RE, ROLLBACK_RE, ROLLBACK_ERROR_RE) — string parsing approach chosen over extending Plan 02's createWorkspace API
- [Phase 78-operation-runner-with-rollback]: Plan 78-03: Dashboard now adopts wizard's strict-abort semantics — hook failures and file-op failures abort creation and trigger LIFO rollback (previously dashboard silently committed half-built workspaces on hook failure)
- [Phase 78-operation-runner-with-rollback]: Plan 78-03: 'running-hooks' per-repo status during pre_create dropped in dashboard — accepted minor UX regression because pre_create runs inside createWorkspace before any onProgress is emitted, and pre_create hooks are typically rare and quick
- [Phase 78-operation-runner-with-rollback]: Plan 78-03: CONCERNS.md item 'Dashboard Duplicates Workspace Creation Logic' (lines 51-55) marked RESOLVED with pointer to Phase 78 — verified by negative-grep of createdWorktrees in App.tsx
- [Phase 78.1]: Phase 76 D-01 through D-07 are superseded — optional integration behavior now lives in narrow structural interfaces composed at each plugin export site rather than a required `capabilities` Set on the base Integration interface
- [Phase 78.1]: Runner gating now uses `isGenerator`, `isCleaner`, `isConditional`, and `isWindowDetecting` predicates from `src/lib/integrations/types.ts`, eliminating non-null assertions on integration dispatch
- [Phase 78.1]: `git-stacks integration list` no longer exposes capabilities in table or JSON output; capability contracts are compile-time-only and stay out of the changelog-facing surface
- [Phase 79]: v0.17.0 release notes stay user-facing first: template labels are documented as one cohesive feature, GS_DEBUG module filters are documented alongside the legacy GIT_STACKS_DEBUG=1 alias, and the reverted Phase 78.1 capability-list surface stays out of release-facing messaging

### Roadmap Evolution

- Phase 78.1 inserted after Phase 78: turn capability enums into actual typescript interface instead of capability return function. also remove it from the integration list and documentation (URGENT)
- v0.17.1 scope explicitly excludes TUI behavior and external integration functionality; coverage work should target non-TUI, non-integration CLI and library paths.
- v0.17.1 includes code coverage report generation as part of the milestone, with attention to the existing split runner architecture where unit files run in a shared process and integration/E2E files run in isolated processes.

### Pending Todos

None.

### Blockers/Concerns

None.

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 260406-tis | labels on templates are not propagated to workspaces created from it | 2026-04-06 | uncommitted | [260406-tis-labels-on-templates-are-not-propagated-t](./quick/260406-tis-labels-on-templates-are-not-propagated-t/) |

## Performance Metrics

| Phase | Plan | Duration | Tasks | Files | Notes |
|-------|------|----------|-------|-------|-------|
| 74 | 01 | 5m | 2 | 4 | Template label CLI + list filtering |
| 74 | 02 | 6m | 2 | 5 | Label propagation through composition, creation, and clone |
| Phase 75 P01 | 5m | 2 tasks | 4 files |
| Phase 75 P02 | 5m | 2 tasks | 5 files |
| Phase 76 P01 | 14m | 2 tasks | 15 files |
| Phase 76 P02 | 2m | 1 tasks | 2 files |
| Phase 77 P01 | 20m | 1 tasks | 7 files |
| Phase 77 P02 | 8min | 2 tasks | 2 files |
| Phase 78-operation-runner-with-rollback P01 | 4min | 2 tasks | 2 files |
| Phase 78-operation-runner-with-rollback P02 | 7min | 2 tasks | 2 files |
| Phase 78-operation-runner-with-rollback P03 | 7min | 2 tasks | 3 files |
| Phase 79 P01 | 4min | 1 task | 8 files |

## Session Continuity

Last session: 2026-04-06T19:37:18Z
Stopped at: Completed 79-01-PLAN.md
Resume file: None
