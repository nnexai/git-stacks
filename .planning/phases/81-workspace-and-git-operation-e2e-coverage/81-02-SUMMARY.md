---
phase: 81-workspace-and-git-operation-e2e-coverage
plan: 02
subsystem: tests
tags: [e2e, execution-context, json-contracts, hooks]

# Dependency graph
requires:
  - phase: 81-01
    provides: "shared E2E helpers and workspace fixtures"
provides:
  - "Artifact-based hook env and cwd E2E proof"
  - "Workspace command JSON/text output contract coverage"
affects:
  - 81-03
  - 81-04

key-files:
  created:
    - tests/commands/workspace-execution-context.test.ts
    - tests/commands/workspace-json-contracts.test.ts
  modified:
    - tests/helpers.ts

key-decisions:
  - "Updated runCli to invoke src/index.ts by absolute path so tests can set subprocess cwd to /tmp and still launch the CLI"
  - "Extended makeWorkspaceFixture with per-repo hooks for repo-level pre_open env/cwd probes"
  - "Tested current hook semantics: workspace post_open hooks receive workspace env, repo pre_open hooks receive repo env"
  - "Locked current paths --prefix contract as prefix-plus-space, matching existing implementation"

requirements-completed: [E2E-08, E2E-14]

# Metrics
completed: 2026-05-14
tasks: 2
---

# Phase 81 Plan 02: Execution Context and Output Contracts Summary

Hidden workspace execution context and output contracts are now covered by isolated CLI subprocess E2E tests.

## Accomplishments

- Added `tests/commands/workspace-execution-context.test.ts` with 10 tests covering:
  - workspace hook env injection for `GS_WORKSPACE_NAME`, `GS_WORKSPACE_BRANCH`, and `GS_TRIGGERED_BY`
  - repo hook env injection for `GS_REPO_NAME` and `GS_REPO_PATH`
  - repo hook cwd via `PROBE_PWD` artifact files
  - CLI command correctness when launched from `/tmp`
  - `open --no-ide --no-cmux` env file generation
- Added `tests/commands/workspace-json-contracts.test.ts` with 13 tests covering:
  - `list --json`
  - `status --json`
  - `run --parallel --json`
  - `env --format json|shell|dotenv`
  - `paths`
  - `cd`
- Improved `runCli` so explicit cwd tests execute the CLI by absolute path instead of relying on `src/index.ts` relative to the subprocess cwd.
- Extended `makeWorkspaceFixture` with per-repo hook YAML support.

## Task Commits

1. `75aae15` - `test(81-02): cover workspace execution context`
2. `6ca7e4c` - `test(81-02): cover workspace output contracts`

## Verification

- `bun test tests/commands/workspace-execution-context.test.ts` - 10 pass, 0 fail
- `bun test tests/commands/workspace-json-contracts.test.ts` - 13 pass, 0 fail
- `bun run typecheck` - passed
- `bun run test:integ` - Integration tests 53/53 passed

## Deviations From Plan

- The plan text referenced a newer `runCli(cfgDir, args, opts?)` shape, but the repo already uses the Phase 80 `runCli(argv, opts)` shape. Tests follow the existing harness API.
- The plan expected repo env on a workspace-level `post_open` hook. Current implementation gives repo env/cwd to repo-level `pre_open` hooks, so the test proves repo env/cwd through repo `pre_open` and workspace env through workspace `post_open`.
- The plan described `paths --prefix` as colon-separated. Current implementation prepends the given prefix plus a space; the contract test locks the current behavior.

## Issues Encountered

- Initial explicit-cwd tests exposed a harness issue: `runCli` changed subprocess cwd but still invoked `src/index.ts` relatively. Fixed by invoking the CLI with an absolute path.

## Next Phase Readiness

The harness now supports explicit cwd subprocess testing and per-repo hook probes, which Plan 81-03 can reuse for lifecycle and guard coverage.

## Self-Check: PASSED

- Probe artifacts prove env and cwd behavior.
- JSON/text contract tests parse and validate required shapes.
- Full integration suite passes.
