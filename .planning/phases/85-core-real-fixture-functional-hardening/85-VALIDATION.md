# Phase 85 Validation and Source Audit

**Phase:** 85-core-real-fixture-functional-hardening  
**Date:** 2026-05-15  
**Status:** Complete

## Source Audit

| Source | Item | Coverage |
|--------|------|----------|
| GOAL | Core workspace, git, file, hook, env, config, and rollback behavior covered through real temp directories and local git repositories | Plans 85-01, 85-02, 85-03 |
| REQ | CORE-01 workspace lifecycle real-fixture coverage | Plan 85-01 |
| REQ | CORE-02 core git operations with local bare remotes | Plan 85-02 |
| REQ | CORE-03 hook ordering/cwd/env/output/failure/rollback coverage | Plan 85-03 and rollback linkage in 85-01 |
| REQ | CORE-04 file operations, env/secrets/ports, config persistence coverage | Plan 85-03 |
| REQ | CORE-05 tests execute real source modules and avoid inlined implementation copies | All plans, with final audit in 85-04 |
| REQ | GATE-03 existing unit, integration, dependency, and typecheck commands continue to pass | Plans 85-01 through 85-04 verification |
| RESEARCH | Use existing helpers and custom runner | Plans 85-01 through 85-04 |
| RESEARCH | Canonical coverage report remains `bun run coverage` plus `.coverage/coverage-final.json` | Plan 85-04 |
| CONTEXT | Prefer real temp directories, isolated config homes, local repos, and bare remotes | Plans 85-01, 85-02, 85-03 |
| CONTEXT | Extend `tests/helpers.ts` when shared fixture setup is reused | Plan 85-01 |
| CONTEXT | Avoid brittle prompt/spinner/incidental text assertions | Plans 85-01 through 85-03 |
| CONTEXT | Keep edit flows, broad TUI, external environments, CI, and milestone finalization out of scope | All plans |
| CONTEXT | Phase 86 command workflow edges, Phase 87 integration contracts, and Phase 88 readiness gates stay out of Phase 85 | All plans |

No unplanned source items remain. Deferred ideas from CONTEXT.md are none.

## Validation Matrix

| Plan | Focused Verification | Gate Verification |
|------|----------------------|-------------------|
| 85-01 | `bun test tests/lib/workspace-ops-real-fixture.test.ts` | `bun run test:unit`, `bun run typecheck` |
| 85-02 | `bun test tests/lib/git-real-remote.test.ts` | `bun run test:unit`, `bun run typecheck` |
| 85-03 | `bun test tests/lib/lifecycle-files-env-config-real-fixture.test.ts` | `bun run test:unit`, `bun run typecheck` |
| 85-04 | `bun test tests/lib/core-source-coverage-gaps.test.ts` | `bun run coverage`, `bun run verify:gates`, `bun run verify` |

## Threat Model Baseline

Phase 85 adds tests and coverage artifacts only. It does not add production input surfaces. The main security risk is false confidence from source-bypassing tests. Each plan mitigates that by requiring real source execution and focused coverage evidence.

