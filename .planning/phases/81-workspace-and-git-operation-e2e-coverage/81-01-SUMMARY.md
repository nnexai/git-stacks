---
phase: 81-workspace-and-git-operation-e2e-coverage
plan: 01
subsystem: tests
tags: [e2e, workspace, git, helpers]

# Dependency graph
requires:
  - phase: 80-e2e-cli-harness-and-living-inventory
    provides: "shared runCli harness and integration test runner split"
provides:
  - "Shared E2E helper primitives for bare remotes, remote-backed worktrees, workspace YAML fixtures, and probe hooks"
  - "Workspace create/clone side-effect E2E coverage"
affects:
  - 81-02
  - 81-03
  - 81-04

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Remote-backed git fixture helpers in tests/helpers.ts"
    - "Fixture-driven workspace YAML tests rather than wizard subprocess driving"
    - "runCli plus formatCliFailure for subprocess diagnostics"

key-files:
  created:
    - tests/commands/workspace-create-clone.test.ts
  modified:
    - tests/helpers.ts

key-decisions:
  - "Preserved the existing Phase 80 runCli(argv, opts) API instead of replacing it with the older plan-local signature"
  - "Added only the missing helper primitives: makeBareRemote, makeRepoWithRemote, makeWorkspaceFixture, makeProbeHook, writeProbeScript"
  - "Used pre-built workspace fixtures per D-01/D-02 instead of attempting to automate interactive new/clone wizard flows"
  - "Included task_path for trunk fixture assertions so the CLI status contract can prove main_path-as-task_path representation"

patterns-established:
  - "makeRepoWithRemote(baseDir, repoName, wsBranch) for local bare origin plus main clone plus worktree branch"
  - "makeWorkspaceFixture(cfgDir, wsName, repos, opts) for compact, real YAML workspace setup"

requirements-completed: [E2E-08, E2E-14]

# Metrics
completed: 2026-05-14
tasks: 2
---

# Phase 81 Plan 01: Workspace Create/Clone E2E Foundation Summary

Shared E2E workspace/git helpers and fixture-driven create/clone side-effect coverage are implemented.

## Accomplishments

- Added reusable remote-backed git fixtures to `tests/helpers.ts`:
  - `makeBareRemote`
  - `makeRepoWithRemote`
  - `makeWorkspaceFixture`
  - `makeProbeHook`
  - `writeProbeScript`
- Preserved the existing richer `runCli(argv, opts)` helper from Phase 80.
- Added `tests/commands/workspace-create-clone.test.ts` with 10 tests covering:
  - workspace YAML schema, name, branch, repo, path, and base-branch fields
  - real worktree `task_path` layout and main clone `main_path` layout
  - workspace branch base history
  - `status --json` and `list` against pre-built workspace fixtures
  - cloned workspace branch/path separation
  - worktree versus trunk mode path representation

## Task Commits

1. `8c7e1a5` - `test(81-01): add shared e2e workspace helpers`
2. `a4a0164` - `test(81-01): cover workspace create clone side effects`

## Verification

- `bun run typecheck` - passed
- `grep -c "export function runCli\\|export function makeBareRemote\\|export function makeRepoWithRemote\\|export function makeWorkspaceFixture\\|export function makeProbeHook\\|export function writeProbeScript" tests/helpers.ts` - returned `6`
- `bun test tests/commands/workspace-create-clone.test.ts` - 10 pass, 0 fail
- `bun run test:integ` - Integration tests 51/51 passed

## Deviations From Plan

- The plan text described adding a new `runCli(cfgDir, args, opts?)` helper, but `tests/helpers.ts` already had the Phase 80 `runCli(argv, opts)` with richer diagnostics and isolated git/config handling. I kept that established API and used it in the new tests.
- `makeWorkspaceFixture` accepts optional `taskPath` so trunk and dir fixtures can match the current schema while still allowing trunk tests to explicitly prove a `task_path` equal to `main_path` when desired.

## Issues Encountered

None.

## Next Phase Readiness

Plans 81-02, 81-03, and 81-04 can now reuse the shared bare-remote, workspace-fixture, CLI, and probe-hook helpers.

## Self-Check: PASSED

- Required helper exports exist.
- New E2E test file exists and passes.
- Full integration regression suite passes.
