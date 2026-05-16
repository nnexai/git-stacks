# Phase 93: Forge Source Workspace Creation - Pattern Map

**Mapped:** 2026-05-16
**Files analyzed:** 12
**Analogs found:** 12 / 12

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/commands/workspace.ts` | CLI command | request-response | `src/commands/workspace.ts` | exact |
| `src/tui/workspace-wizard.ts` | command orchestration | batch/workspace creation | `src/tui/workspace-wizard.ts` | exact |
| `src/lib/workspace-source.ts` | service | transform + Git side effects | `src/lib/workspace-lifecycle.ts`, `src/lib/integrations/forge-utils.ts` | role-match |
| `src/lib/git.ts` | utility | Git subprocess | `src/lib/git.ts` | exact |
| `src/lib/config.ts` | schema/model | YAML parse/stringify | `src/lib/config.ts` | exact |
| `src/lib/integrations/forge-source.ts` | integration utility | parse + resolver union | `src/lib/integrations/forge-utils.ts`, Phase 92 plans | role-match |
| `tests/lib/workspace-source.test.ts` | unit test | injected service | `tests/lib/workspace-lifecycle-create.test.ts` | role-match |
| `tests/commands/workspace-source.test.ts` | subprocess test | CLI + YAML | `tests/commands/template-consumption.test.ts` | role-match |
| `tests/commands/workspace-source-git.test.ts` | integration test | local bare Git remotes | `tests/commands/workspace-git-ops.test.ts` | exact |
| `tests/lib/config.test.ts` | schema test | YAML validation | existing config tests | role-match |
| `docs/forge-source-resolver.md` | docs | source assertions | Phase 92 plan docs contract | role-match |
| `.planning/phases/93-forge-source-workspace-creation/*-PLAN.md` | plan artifacts | GSD execution | Phase 92 plan files | exact |

## Pattern Assignments

### `src/commands/workspace.ts` (CLI command, request-response)

**Analog:** `src/commands/workspace.ts`

**Pattern:** `registerWorkspaceCommands()` defines `.command("new [name]")`, adds Commander `.option(...)` calls, validates simple CLI conflicts at command level, and delegates to `runWorkspaceNew(...)`.

**Use for Phase 93:** Add `--source <forge-url>`, `--repo <name>`, and `--dry-run` beside existing `--template`, `--label`, `--branch`, `--non-interactive`, and `--open`. Keep validation thin: source requires template, source conflicts with `--from`, and source passes through to wizard orchestration.

### `src/tui/workspace-wizard.ts` (command orchestration, batch/workspace creation)

**Analog:** `runWorkspaceNew()` and `buildReposFromTemplate()`

**Pattern:** Non-interactive `new` validates required inputs, checks `workspaceExists()`, composes templates, builds `WorkspaceRepo[]`, resolves labels/env/hooks/files/ports, computes branch, and calls `createWorkspace()`.

**Use for Phase 93:** Insert source resolution after template repo materialization and before branch selection/createWorkspace. Source branch should override the normal template branch pattern only when `--source` is present. `--dry-run` should stop before `createWorkspace()`.

### `src/lib/workspace-source.ts` (service, transform + Git side effects)

**Analogs:** `src/lib/workspace-lifecycle.ts`, `src/lib/integrations/forge-utils.ts`

**Pattern:** Expected domain failures are typed unions in forge utilities; workspace creation side effects use `createRunner()` for tracked forward/rollback steps and `createWorkspace()` is the YAML commit point.

**Use for Phase 93:** Add a focused orchestration module that resolves source, validates matched repo mode, fetches an internal source ref, prepares create inputs, formats expected failures, and cleans operation-created refs if later creation fails.

### `src/lib/git.ts` (utility, Git subprocess)

**Analog:** `createWorktree()`, `fetchOrigin()`, `checkRemoteTrackingRef()`, `checkBranchExistsOnRemote()`

**Pattern:** Git commands use `GIT_TERMINAL_PROMPT=0`, timeouts where networked, `.quiet().nothrow()` for expected failure handling, and clear `Error` messages on hard failures.

**Use for Phase 93:** Add helper(s) for source ref fetch and branch-from-ref worktree creation. Preserve existing branch reuse/upstream behavior and never reset an existing branch to a new source.

### `src/lib/config.ts` (schema/model, YAML)

**Analog:** `WorkspaceSchema`, `WorkspaceSettingsSchema`, `RepoRegistryEntrySchema`

**Pattern:** Zod schemas validate YAML, optional blocks are represented as optional object fields, and `writeWorkspace()` serializes the in-memory `Workspace` object after validation.

**Use for Phase 93:** Add `WorkspaceSourceSchema` and `WorkspaceSchema.source`. Keep source outside `settings.integrations`.

### `tests/lib/workspace-source.test.ts` (unit/injected service)

**Analog:** `tests/lib/workspace-lifecycle-create.test.ts`

**Pattern:** Module mocks are registered before importing the module under test; injectable seams collect calls; assertions check no YAML write or worktree side effects on failure.

**Use for Phase 93:** Mock forge-source resolver and Git fetch helpers to verify ambiguity, missing repo, trunk/dir, auth, branch conflict, dry-run, rollback cleanup, and successful create-input shaping.

### `tests/commands/workspace-source.test.ts` (subprocess CLI + YAML)

**Analog:** `tests/commands/template-consumption.test.ts`

**Pattern:** Use `createConfigFixture()`, `writeRegistryFixture()`, `writeTemplateFixture()`, and `runCli()`; assert stdout/stderr, exit codes, and YAML contents.

**Use for Phase 93:** Assert `new --source` requires `--template`, rejects `--from`, dry-run writes no workspace file, successful source creation writes dedicated `source:` metadata, and no implicit source labels appear.

### `tests/commands/workspace-source-git.test.ts` (local bare Git remotes)

**Analog:** `tests/commands/workspace-git-ops.test.ts`

**Pattern:** Use `makeRepoWithRemote()`, `gitExecOptions()`, peer clones, and real `git` commands under isolated HOME/GIT_CONFIG.

**Use for Phase 93:** Create a source branch in a peer clone, push it to the bare remote, run source workspace creation, and assert the matched repo worktree HEAD equals the source branch commit while another repo uses normal branch creation.

## Shared Patterns

- **Expected failures:** Return typed unions and format user-facing guidance; avoid uncaught stack traces for resolver, matching, branch, and fetch failures.
- **Side-effect ordering:** Resolver/matching/dry-run before fetch; fetch before worktree creation; YAML write remains inside `createWorkspace()` commit point.
- **Rollback:** Operation-created internal refs must be removed when post-fetch workspace creation fails.
- **Validation:** Prefer local Git fixtures and injected seams over live forge CLIs.
- **Labels:** Existing template/manual label merging remains unchanged; Phase 93 does not add review/source labels per D-15.
