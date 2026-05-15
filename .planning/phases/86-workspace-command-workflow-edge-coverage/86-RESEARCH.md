# Phase 86: Workspace Command Workflow Edge Coverage - Research

**Researched:** 2026-05-15
**Status:** Ready for planning

## Executive Summary

Phase 86 should add focused command-level tests around stable workspace workflows where the CLI wiring materially affects behavior. The codebase already has real subprocess helpers, local git/bare-remote fixtures, and workspace YAML factories from Phase 81, so this phase does not need new dependencies or a new runner. The highest-value implementation shape is three bounded test slices:

- `open --recreate` template/workspace drift coverage.
- `clean --gone` and destructive command safety coverage.
- Wrapper contract coverage for `run`, `paths`, `env`, `status`, `sync`, `push`, and `pull`, plus inventory mapping.

The phase should keep assertions on stable state, JSON shapes, exit codes, generated files, and safety-critical messages. It should avoid prompt-driving, spinner snapshots, broad prose snapshots, TUI rendering, external desktop tools, CI, and editor-launching flows.

## Relevant Requirements

| Requirement | Planning implication |
|-------------|----------------------|
| CMD-01 | Cover `open --recreate` with template-backed workspace fixtures and automation-safe force/cancel paths. |
| CMD-02 | Cover `clean --gone` using local bare remotes and real branch deletion/drift. |
| CMD-03 | Add CLI-level smoke for destructive safety around `clean`, `remove`, `merge`, and `rename` where lower-level library tests are not enough. |
| CMD-04 | Add focused wrapper coverage for meaningful option interactions, JSON contracts, cwd detection, and no-op/error branches. |
| GATE-03 | Keep the existing local verification commands green and update inventory mappings so local gates still represent the expanded surface. |

## Current Implementation Findings

### Existing surfaces to exercise

- `src/commands/workspace.ts` owns the relevant command wiring:
  - `open <workspace> --recreate --force`
  - `clean [workspace] --gone --force --dry-run`
  - `clean`, `remove`, `merge`, `rename` destructive flags
  - `run`, `paths`, `env`, `status`, `sync`, `push`, `pull`
- `tests/helpers.ts` already exports:
  - `runCli(argv, opts)` for isolated real CLI subprocess execution.
  - `createConfigFixture`, `writeTemplateFixture`, `writeWorkspaceFixture`, and `makeWorkspaceFixture`.
  - `makeBareRemote`, `makeRepoWithRemote`, `gitExecOptions`, and `applyTestGitEnv`.
  - `formatCliFailure` for readable failed assertions.
- Existing command tests already cover broad happy paths, so Phase 86 should focus on uncovered edge contracts instead of duplicating previous assertions.

### Prior phase patterns to preserve

- Phase 81 proved that pre-built fixtures are the right way to cover workspace behavior without driving wizards.
- Phase 81 used local bare remotes and peer clones to create real remote drift for fetch, sync, pull, and push.
- Phase 82.1 kept failure coverage representative rather than a cross-product matrix.
- Phase 84.1 made `bun run coverage`, `bun run verify:gates`, and `bun run verify` the canonical local gate path.

## Planning Guidance

### Plan 01: `open --recreate`

Create a dedicated `tests/commands/workspace-recreate.test.ts`. Use config/template/workspace fixtures directly. Assert that:

- A no-change template-backed workspace reports no changes and leaves YAML stable.
- Added and removed template repos mutate workspace YAML only with `--force`.
- Hook, env, env_file, files, and integrations drift from the template is copied into the workspace on forced recreate.
- Missing template and workspace-without-template fail without mutating existing workspace YAML.
- Non-force recreate reaches the automation-safe cancel path in a non-interactive subprocess and does not mutate YAML.

### Plan 02: `clean --gone` and destructive safety

Create focused tests using local bare remotes and real workspace fixtures. Assert that:

- Deleted upstream branches are detected through local bare remotes.
- Dirty worktrees block `clean --gone` before mutation.
- `--dry-run` reports intended removals without deleting YAML/worktrees.
- `--force` removes gone workspaces, including multiple gone workspaces in one command.
- Removal failure reporting is covered by a stable filesystem or config fixture that makes one removal fail.
- `clean`, `remove`, `merge`, and `rename` safety smoke covers dry-run, force, missing entity, and non-interactive non-force refusal where current source behavior routes through prompts.

### Plan 03: command wrappers and inventory

Create `tests/commands/workspace-wrapper-edges.test.ts` and update `tests/e2e-inventory.ts` for all Phase 86 surfaces. Assert stable contracts for:

- `run` option conflicts and JSON success/failure shapes.
- `paths` cwd detection and filter/no-path branches.
- `env` cwd detection, `--repo`, and JSON output.
- `status` JSON/cwd/fetch behavior that is not already covered by Phase 81.
- `sync`, `push`, and `pull` no-op/error branches with local remotes and disposable repositories.
- Inventory mappings include the new tests for `workspace.git-operations`, `workspace.run`, `workspace.paths`, `workspace.env`, and `workspace.status` as applicable.

## Validation Architecture

### Test commands

- Fast per-plan checks should run the newly created command test files with `bun test`.
- Plan 03 should additionally run `bun test tests/e2e-inventory.test.ts` if present, otherwise use the existing inventory gate command through `bun run verify:gates`.
- Phase completion should run `bun run test:integ`, `bun run coverage`, `bun run verify:gates`, and `bun run verify`.

### Sampling constraints

- Use `bun test <specific files>` for tight loops.
- Use `bun run test:integ` after each plan because all created files live under `tests/commands/`.
- Do not run `bun test tests/` directly; the custom runner owns full-suite isolation.

### Acceptance signals

- New tests execute real `src/commands/workspace.ts` through subprocesses.
- Tests use real source modules and do not inline implementation copies.
- Assertions are stable: JSON, exit code, file/YAML state, git branch/remotes, and safety-critical error text only.
- Inventory/gates recognize the expanded Phase 86 surfaces.
