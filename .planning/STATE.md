---
gsd_state_version: 1.0
milestone: v0.7.0
milestone_name: Close Command & Polish
status: unknown
last_updated: "2026-03-22T17:51:53.806Z"
last_activity: 2026-03-22
progress:
  total_phases: 9
  completed_phases: 9
  total_plans: 20
  completed_plans: 20
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-22)

**Core value:** One command takes you from "I need to work on feature X" to a fully running dev environment — right repos, right branches, right IDE/terminal open, hooks run — without manual steps.
**Current focus:** Phase 28 — issue-task-tracking-integration

## Current Position

Phase: 28
Plan: Not started

## Performance Metrics

**Velocity:**

- Total plans completed: 0 (this milestone)
- Average duration: —
- Total execution time: —

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| - | - | - | - |

## Accumulated Context

*Carried from v0.6.0:*

| Phase 16-artifact-type-foundation P01 | 2 | 2 tasks | 7 files |
| Phase 17-integration-runner P01 | 15 | 2 tasks | 8 files |
| Phase 17-integration-runner P02 | 5 | 1 tasks | 4 files |
| Phase 18-artifact-population P01 | 3 | 2 tasks | 5 files |
| Phase 19-niri-shell-wrappers P01 | 9min | 2 tasks | 2 files |
| Phase 20 P01 | 3min | 2 tasks | 3 files |
| Phase 21-workspace-close-command P01 | 6min | 2 tasks | 8 files |
| Phase 22-niri-display-fix P01 | 2min | 2 tasks | 6 files |
| Phase 23-test-environment-isolation P01 | 7min | 2 tasks | 4 files |
| Phase 24-mock-architecture-refactor P02 | 8min | 2 tasks | 18 files |
| Phase 24-mock-architecture-refactor P01 | 12min | 2 tasks | 6 files |
| Phase 24.1-test-mock-hygiene P01 | 2min | 2 tasks | 7 files |
| Phase 25-dedicated-lifecycle-phases P01 | 17 | 2 tasks | 3 files |
| Phase 25-dedicated-lifecycle-phases P02 | 4 | 2 tasks | 2 files |
| Phase 25-dedicated-lifecycle-phases P03 | 5 | 2 tasks | 4 files |
| Phase 26-autocompletion-editor-polish P01 | 3min | 1 tasks | 2 files |
| Phase 26-autocompletion-editor-polish P02 | 2min | 2 tasks | 6 files |
| Phase 26-autocompletion-editor-polish P03 | 4min | 2 tasks | 3 files |
| Phase 27-git-forge-integrations P01 | 2min | 2 tasks | 4 files |
| Phase 27-git-forge-integrations P03 | 3min | 2 tasks | 5 files |
| Phase 27-git-forge-integrations P02 | 7min | 2 tasks | 8 files |
| Phase 27 P04 | 65s | 2 tasks | 2 files |
| Phase 28-issue-task-tracking-integration P01 | 1min | 1 tasks | 2 files |
| Phase 28-issue-task-tracking-integration P03 | 244s | 2 tasks | 5 files |
| Phase 28-issue-task-tracking-integration P02 | 5min | 2 tasks | 6 files |
| Phase 28-issue-task-tracking-integration P04 | 2min | 2 tasks | 2 files |

### Decisions

- [Phase 20]: No cleanup on workspace remove — user manages niri workspace lifecycle manually; close command fills this gap
- [Phase 19]: Injectable `_exec` for niri test isolation — Bun built-in modules can't be mocked via mock.module
- [Phase 16-18]: ArtifactBag as Record<string, artifact | null> — niri reads bag values without mutation
- [Phase 21-workspace-close-command]: closeWorkspace preserves worktrees and YAML — non-destructive, open works immediately after
- [Phase 21-workspace-close-command]: No confirmation prompt for close (non-destructive) — same UX pattern as open, x shortcut in TUI after Open entry
- [Phase 22-niri-display-fix]: formatConfigValue: niri columns detected by presence of 'windows' key on every array element — no niri-specific import needed in configUtils
- [Phase 23-test-environment-isolation]: Re-establish mock in beforeEach when multiple describe blocks share one isolated config — prevents io-roundtrip test from overriding the shared file-level mock
- [Phase 23-test-environment-isolation]: useIsolatedConfig + cache-busting dynamic imports replaces saveGlobalConfig/restoreGlobalConfig pattern — tests no longer touch real config files
- [Phase 24-mock-architecture-refactor]: prompts wrapper pattern: import { prompts as p } from @/tui/utils alias preserves all p.confirm/p.select call sites; tests mocking @/tui/utils directly need prompts in mock shape
- [Phase 24-01]: lifecycle.ts _exec.spawn returns SpawnHandle not resolved result — required for concurrent stream drain in runHooksCaptured
- [Phase 24-01]: Lifecycle real-shell tests use cache-busting import to prevent mock.module contamination from consumer tests
- [Phase 24.1-test-mock-hygiene]: integration-commands.test.ts needs no @/tui/utils mock — tested code exercises command structure only, not prompt paths
- [Phase 24.1-test-mock-hygiene]: Always mock @/tui/utils (not @clack/prompts) in tests — production code routes all prompts through the wrapper
- [Phase 25-dedicated-lifecycle-phases]: buildBaseEnv exported for reuse by plans 02 and 03; _executeClose private inner function; post_close fires after integration cleanup; restore real lifecycle in test to prevent parallel mock contamination
- [Phase 25-dedicated-lifecycle-phases]: _executeClean cascade pattern: _executeClose called first, then pre_clean, then per-repo pre_clean interleaved with removal, then post_clean; triggeredBy propagated through entire chain
- [Phase 25-dedicated-lifecycle-phases]: post_remove failure after YAML deletion logs but does not fail — YAML already gone, no rollback path
- [Phase 25-dedicated-lifecycle-phases]: mergeWorkspace composes _executeClean for steps 1-6 rather than calling _executeClose directly — matches removeWorkspace pattern and avoids duplicating close+clean logic
- [Phase 25-dedicated-lifecycle-phases]: post_merge fires after post_remove (D-11 ordering) — workspace is fully deleted before merge notification hooks run
- [Phase 25-dedicated-lifecycle-phases]: All TUI lifecycle dispatches pass captured:true to prevent OpenTUI screen corruption when hooks run during clean/remove/merge
- [quick-260322-m2k]: All hook env vars renamed from WS_ to GS_ prefix; buildRepoEnv helper extracted; openWorkspace now uses buildBaseEnv (injects GS_TRIGGERED_BY=open); create flows inject GS_TRIGGERED_BY=create
- [Phase 26-autocompletion-editor-polish]: COMMAND_FLAG_COMPLETIONS key format commandPath:--flag; message --from excluded (freeform); resolveFlagCompletion checks command-specific before global
- [Phase 26-autocompletion-editor-polish]: openYamlInEditor: no path printed before editor opens (D-07), VISUAL|EDITOR|vi fallback chain, validates with correct Zod schema after editor exits
- [Phase 26-autocompletion-editor-polish]: deleteFolder opt in _executeClean as last step after post_clean hooks — worktrees deregistered before folder deleted
- [Phase 26-autocompletion-editor-polish]: removeWorkspace --force malformed YAML fallback: readGlobalConfig safe, name-based rmSync, no hook execution
- [Phase 26-autocompletion-editor-polish]: CLI clean: folder deletion in command layer after cleanWorkspace returns — cleaner separation, second p.confirm prompt
- [Phase 27-01]: resolveForgeRepo validates registry forge field against expected forge before returning success (FORGE-11 / D-14)
- [Phase 27-01]: ForgeTypeSchema as z.enum(['github','gitlab','gitea']).optional() — omission is valid for repos not using forge integrations (backward compat FORGE-02)
- [Phase 27-03]: Bun.spawn for teaPullsLs in forge detection — Bun shell $ template has no .cwd() chain method
- [Phase 27-03]: Gitea detection URL-agnostic via tea pulls ls success — self-hosted instances can have any domain; URL matching would have high false-negative rate
- [Phase 27-03]: D-05 fork: auto-select forge when exactly 1 match detected; p.select prompt when 0 or multiple matches — zero-match prompt shows all forges with initialValue:none for easy skip
- [Phase 27-02]: GitLab pr status uses 'glab mr list' not 'glab mr status' — mr status subcommand does not exist in glab CLI
- [Phase 27-02]: Gitea _exec has three methods: run (inherit stdio), runCapture (piped stdout for JSON), openUrl (platform-aware xdg-open/open)
- [Phase 27-02]: All forge integrations pass forge identifier string as third arg to resolveForgeRepo — triggers D-14 forge mismatch validation
- [Phase 27]: Forge entries inserted at top of [Unreleased] Added section for discoverability; forge table rows use tier 5 (command-only, no open() artifacts)
- [Phase 28-01]: Issue IDs stored as strings regardless of source format (String(issueId) coercion) — unifies GitHub int and Jira alphanumeric
- [Phase 28-01]: issue-utils mirrors forge-utils pattern: shared resolution + formatting helpers extracted once for all four tracker integrations
- [Phase 28-issue-task-tracking-integration]: jiraIntegration.order = 53 — tier 5, after gitea (52); avoids collision with gitlab at 51
- [Phase 28-issue-task-tracking-integration]: _exec.runShell uses sh -c with ISSUE_ID env var for shell injection safety — no string interpolation (Jira Pitfall 5)
- [Phase 28-issue-task-tracking-integration]: Doctor jira check uses warn severity — jira-cli is optional, configurable template fallback exists (D-06)
- [Phase 28-02]: Gitea issue open uses tea issues ls --output json --fields index,url --state all (tea has no issue view command)
- [Phase 28-02]: Issue link/unlink delegate to issue-utils pure YAML ops — no forge CLI invocation needed for link/unlink
- [Phase 28-issue-task-tracking-integration]: Issue tracking docs: entries placed after forge entries in CHANGELOG.md for logical feature grouping; README table rows updated in-place to mention issues alongside PRs

### Pending Todos

1 pending todo:

- **Issue and task tracking integration (Jira, GitHub, GitLab, Gitea)** — deferred from phase 27 discussion; design unified issue/task linking across forges + Jira

### Roadmap Evolution

- Phase 24 added: Mock Architecture Refactor — replace module-level mock.module() with injectable dependency mocking (_exec pattern)
- Phases 25-27 added from promoted todos: Dedicated Lifecycle Phases, Autocompletion & Editor Polish, Git Forge Integrations
- Phase 28 added: Issue & Task Tracking Integration — deferred from phase 27 discussion; covers GitHub/GitLab/Gitea issue commands + Jira integration

### Blockers/Concerns

None.

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 260322-m2k | unify hook env vars — consistent naming and values across all lifecycle functions | 2026-03-22 | f653790 | [260322-m2k-unify-hook-env-vars-consistent-naming-an](./quick/260322-m2k-unify-hook-env-vars-consistent-naming-an/) |

## Session Continuity

Last session: 2026-03-22T17:48:19.928Z
Last activity: 2026-03-22
Resume file: None
Next action: /gsd:plan-phase 21
