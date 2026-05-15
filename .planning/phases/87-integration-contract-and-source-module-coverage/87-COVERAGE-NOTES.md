---
phase: 87-integration-contract-and-source-module-coverage
artifact: coverage-notes
status: in-progress
created: 2026-05-15
---

# Phase 87 Coverage Notes

## Source-Bypassing Mock Audit

The Phase 87 utility tests were audited for inline replacement implementations of `issue-utils` and `forge-utils`.

Audit command:

```bash
! rg -n "Inline the source implementations|This bypasses the stale mock|function resolveIssueRef|function resolveForgeRepo\\(" tests/lib/integrations/issue-utils.test.ts tests/lib/integrations/forge-utils.test.ts
```

Result: pass. The banned source-copy markers and helper-function copies are absent from the utility test files.

`tests/lib/integrations/issue-utils.test.ts` now imports real `src/lib/integrations/issue-utils.ts` after mocking only configuration and workspace-status boundaries. `tests/lib/integrations/forge-utils.test.ts` now imports real `src/lib/integrations/forge-utils.ts` and drives the exported detector seam rather than copying source logic into the test.

## Real Source Modules Exercised

Phase 87 test coverage is intended to come from these source modules, not from duplicated implementations inside tests:

| Area | Source modules | Test coverage |
|------|----------------|---------------|
| Issue utilities | `src/lib/integrations/issue-utils.ts` | `tests/lib/integrations/issue-utils.test.ts` |
| Forge utilities | `src/lib/integrations/forge-utils.ts` | `tests/lib/integrations/forge-utils.test.ts` |
| Forge command contracts | `src/lib/integrations/github.ts`, `src/lib/integrations/gitlab.ts`, `src/lib/integrations/gitea.ts`, `src/lib/integrations/jira.ts` | `tests/lib/integrations/github.test.ts`, `tests/lib/integrations/gitlab.test.ts`, `tests/lib/integrations/gitea.test.ts`, `tests/lib/integrations/jira.test.ts` |
| Session integrations | `src/lib/integrations/tmux.ts`, `src/lib/integrations/cmux.ts` | `tests/lib/integrations/tmux.test.ts`, `tests/lib/integrations/cmux.test.ts` |
| Window-manager integrations | `src/lib/integrations/niri.ts`, `src/lib/integrations/aerospace.ts` | `tests/lib/integrations/niri.test.ts`, `tests/lib/integrations/aerospace.test.ts` |
| IDE integrations | `src/lib/integrations/vscode.ts`, `src/lib/integrations/intellij.ts` | `tests/lib/integrations/vscode.test.ts`, `tests/lib/integrations/intellij.test.ts` |

The tests use mocks for subprocess, filesystem, browser-open, environment discovery, and lifecycle boundaries only. Those mocks are the external seams under test, not replacement implementations for the source modules.

## Deferred External Environments

Phase 87 does not launch or require live external environments. The following remain explicitly deferred:

- Live forge authentication and live hosted forge APIs.
- Real browser windows or browser automation for forge pages.
- Real editor and IDE launches.
- Real window-manager sessions and desktop state.
- Final functional readiness classification.

This matches the Phase 87 boundary: local source-module and injected-executor contract coverage, not full external-environment E2E.

## Phase 88 Handoff

Phase 88 owns final readiness classification and release evidence. Phase 87 hands off local coverage artifacts and audit notes only; it does not claim that the integrations are ready against real forge auth, browsers, editors, IDEs, desktop window managers, or hosted services.

## Verification Results

Commands run on 2026-05-15:

| Command | Result | Notes |
|---------|--------|-------|
| `bun run coverage:unit` | pass | Ran 62 isolated unit-coverage files after including local `tests/lib/integrations/**` contract tests in unit coverage. |
| `bun run verify:gates` | pass | Inventory, mapped tests, and coverage artifacts are aligned. |
| `bun run typecheck` | pass | TypeScript completed with `tsc --noEmit`. |

Coverage hit inspection from `.coverage/coverage-final.json`:

| Source module | Statement hits | Function hits | Status |
|---------------|----------------|---------------|--------|
| `src/lib/integrations/issue-utils.ts` | 94 | 17 | hit |
| `src/lib/integrations/forge-utils.ts` | 357 | 70 | hit |
| `src/lib/integrations/github.ts` | 489 | 56 | hit |
| `src/lib/integrations/gitlab.ts` | 488 | 56 | hit |
| `src/lib/integrations/gitea.ts` | 688 | 80 | hit |
| `src/lib/integrations/jira.ts` | 266 | 34 | hit |
| `src/lib/integrations/tmux.ts` | 265 | 26 | hit |
| `src/lib/integrations/cmux.ts` | 260 | 11 | hit |
| `src/lib/integrations/niri.ts` | 1931 | 96 | hit |
| `src/lib/integrations/aerospace.ts` | 4438 | 432 | hit |
| `src/lib/integrations/vscode.ts` | 153 | 24 | hit |
| `src/lib/integrations/intellij.ts` | 94 | 12 | hit |

No Phase 87 source module named above remains zero-hit in the refreshed coverage artifact. Deferred external environments remain Phase 88 or later scope; this verification proves local source-module coverage only.
