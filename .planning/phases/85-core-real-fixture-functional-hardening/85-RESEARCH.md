# Phase 85 Research: Core Real-Fixture Functional Hardening

**Phase:** 85-core-real-fixture-functional-hardening  
**Date:** 2026-05-15  
**Status:** Complete

## Question

What does an executor need to know to plan high-value functional hardening for core workspace, git, hook, file, env, secrets, ports, config, and coverage-report behavior without drifting into Phase 86-88 scope?

## Findings

### Existing Harness and Fixture Surface

- `tests/helpers.ts` already provides the reusable real-fixture primitives this phase should extend when shared setup is needed: `makeTmpDir`, `cleanup`, `runCli`, `makeBareRemote`, `makeRepoWithRemote`, `makeWorkspaceFixture`, `makeProbeHook`, `writeProbeScript`, `makeGitRepo`, `useIsolatedConfig`, and captured real module exports.
- Phase 81 established disposable local git remotes, real clones/worktrees, isolated config homes, probe hooks, and command subprocess diagnostics. Phase 85 should reuse those patterns for deeper library-level source behavior rather than duplicating the earlier broad CLI command pass.
- `scripts/test-runner.ts` is mandatory for full suite runs because `mock.module()` is process-global. Focused files that do not use `mock.module()` can run directly with `bun test`, but phase verification should still include `bun run test` or the relevant `bun run test:unit`/`bun run test:integ` path when feasible.

### Core Source Targets

- Workspace behavior concentrates in `src/lib/workspace-ops.ts`, with real hooks through `src/lib/lifecycle.ts`, git calls through `src/lib/git.ts`, file operations through `src/lib/files.ts`, secret/env/port resolution through `src/lib/secrets.ts`, `src/lib/env.ts`, and `src/lib/ports.ts`, and persistence through `src/lib/config.ts`.
- Existing tests already cover many unit-level branches. The gap is confidence that real filesystem/git/config interactions behave correctly together under rollback, cleanup, branch-state, resolver-order, collision, and atomic-write scenarios.
- `src/lib/git.ts` should be tested against local bare remotes and real repos for branch-state, no-op, failure, dirty-worktree, and upstream cases. Prefer library-level tests when CLI tests already covered user-facing wrappers in Phase 81.

### Coverage Integrity

- Phase 84.1 repaired the canonical coverage path around `bun run coverage`, `.coverage/coverage-final.json`, and sentinel hit validation in `scripts/verify-gates.ts`.
- Phase 85 tests must execute real `src/lib/**` exports. Tests may still use fixture helpers and injected executors where that is the code's public seam, but they must not inline copied implementation logic to manufacture coverage.
- After the first three implementation plans land, a final review should inspect `.coverage/coverage-final.json` for the Phase 85 core source files and close high-value uncovered source behavior inside the Phase 85 boundary.

### Scope Boundaries

- In scope: `workspace-ops`, `git`, `lifecycle`, `files`, `env`, `secrets`, `ports`, `config`, coverage review, and shared helpers required by these tests.
- Out of scope: prompt-driving, broad TUI rendering, real external desktop/plugin tools, CI workflows, `git-stacks edit`, `git-stacks template edit`, Phase 86 command workflow edges, Phase 87 integration contracts, and Phase 88 readiness policy gates.
- Phase 84's local gate contract remains local-only: use `bun run verify` and related scripts, no CI language and no numeric coverage threshold.

## Standard Stack

- Bun test runner with `bun:test`.
- Existing `tests/helpers.ts` real-fixture helpers.
- Local git repositories and local bare remotes.
- Istanbul coverage artifacts produced by `bun run coverage`.
- Local gates through `bun run test`, `bun run coverage`, `bun run verify:gates`, `bun run typecheck`, and `bun run verify` where appropriate.

## Architecture Patterns

- Put tests close to the exercised source module under `tests/lib/` for core library behavior.
- Use `tests/commands/` only when the behavior is meaningfully a CLI wrapper contract; Phase 85 should mostly prefer real source module tests to satisfy CORE-05.
- Extend `tests/helpers.ts` only for reusable fixture setup used by multiple new files.
- Keep external tool behavior behind existing injected seams or local fake executables; do not require real desktop, forge, or secret-store tools.

## Common Pitfalls

- Running `bun test tests/` directly can produce false failures due to shared-process `mock.module()` pollution.
- Tests that copy implementation logic into local mocks do not satisfy CORE-05 even if they increase line coverage.
- Broad command-surface gaps belong to Phase 86, integration utility contracts belong to Phase 87, and release readiness policy belongs to Phase 88.
- Coverage artifact parseability alone is not enough for Phase 85; the final plan must inspect real hit data for the core source modules being hardened.

## Validation Architecture

Phase 85 validation should prove:

- Focused new tests pass for each added file.
- The custom runner path still passes after adding real-fixture tests.
- `bun run coverage` produces canonical artifacts after the new tests land.
- The final coverage review confirms nonzero hits for targeted Phase 85 core modules and documents any accepted in-boundary gaps.
- `bun run verify` remains the local release-prep umbrella check when all Phase 85 plans are complete.

## RESEARCH COMPLETE

