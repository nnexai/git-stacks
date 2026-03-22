---
phase: 28-issue-task-tracking-integration
plan: "03"
subsystem: integrations
tags: [jira, issue-tracking, integration-plugin, doctor]
dependency_graph:
  requires: ["28-01"]
  provides: ["jira-integration", "jira-doctor-check"]
  affects: ["src/lib/integrations/index.ts", "src/commands/doctor.ts"]
tech_stack:
  added: []
  patterns: ["injectable _exec for test isolation", "sh -c with ISSUE_ID env var for shell injection safety"]
key_files:
  created:
    - src/lib/integrations/jira.ts
    - tests/lib/integrations/jira.test.ts
  modified:
    - src/lib/integrations/index.ts
    - src/commands/doctor.ts
    - tests/lib/integration-commands.test.ts
decisions:
  - "jiraIntegration.order = 53 — tier 5, after gitea (52); avoids collision with gitlab at 51"
  - "Default open_cmd = 'jira open $ISSUE_ID' per D-05; users can override via globalConfig.integrations.jira.open_cmd"
  - "_exec.runShell uses Bun.spawn(['sh', '-c', cmd]) with ISSUE_ID as env var — no string interpolation (Pitfall 5)"
  - "Doctor jira check uses warn severity — jira-cli is optional, configurable template fallback exists"
metrics:
  duration: "244s"
  completed_date: "2026-03-22"
  tasks_completed: 2
  files_changed: 5
---

# Phase 28 Plan 03: Jira Integration Plugin Summary

Standalone Jira integration plugin using sh -c with ISSUE_ID env var for shell-injection-safe configurable issue open command, registered in integrations/index.ts, with jira binary check added to doctor.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Create Jira integration plugin with configurable issue open template | 948b00a | src/lib/integrations/jira.ts, src/lib/integrations/index.ts, tests/lib/integrations/jira.test.ts |
| 2 | Add jira binary check to doctor and update integration-commands test | e4c3b45 | src/commands/doctor.ts, tests/lib/integration-commands.test.ts, tests/lib/integrations/jira.test.ts |

## What Was Built

**Jira integration plugin** (`src/lib/integrations/jira.ts`):
- Implements the `Integration` interface with `id: "jira"`, `enabledByDefault: false`, `order: 53`
- `_exec.runShell` spawns `["sh", "-c", cmd]` with `ISSUE_ID` as an environment variable — no string interpolation (Pitfall 5: shell injection safety)
- `issue link <workspace> <issue-id>` — calls `linkIssue(workspaceName, "jira", issueId)` from shared issue-utils
- `issue unlink <workspace>` — calls `unlinkIssue(workspaceName, "jira")`
- `issue open <workspace>` — reads `open_cmd` from `globalConfig.integrations.jira`, defaults to `"jira open $ISSUE_ID"` (per D-05)
- `configurePrompt` uses `p.text` from `@/tui/utils` for open_cmd input
- Does NOT accept `[repo]` argument — Jira is not repo-bound (unlike forge trackers)

**Integration registry** (`src/lib/integrations/index.ts`):
- Added `jiraIntegration` import and registration at end of `integrations` array

**Doctor binary check** (`src/commands/doctor.ts`):
- Added `checkBinary("jira")` with `"warn"` severity (optional, not required for core)
- Message references jira-cli and configurable template fallback
- Fix URL: `https://github.com/ankitpokhrel/jira-cli`

**Integration commands test** (`tests/lib/integration-commands.test.ts`):
- Added required mocks: `@/lib/integrations/issue-utils`, `@/lib/config`, `@/tui/utils` (with safeText, cancel)
- Added 5 new tests: jira subcommand exists, jira has issue sub-subcommand, jira issue has link/unlink/open, github has issue sub-subcommand (from Plan 02), github issue has link/unlink/open

## Decisions Made

1. **order = 53**: Plan RESEARCH.md used 51 but gitlab already occupies order=51; 53 avoids collision and maintains tier 5 placement after gitea (52).
2. **sh -c with env var**: `_exec.runShell(cmd, { ISSUE_ID: issueId })` passes `ISSUE_ID` as an environment variable to `sh -c`. This prevents shell injection compared to string interpolation (`"jira open " + issueId`).
3. **warn not fail for jira binary**: Doctor uses warn because jira-cli is optional — the configurable open_cmd template means users can use any CLI or browser URL command.
4. **No `[repo]` arg on issue open**: Jira issues are workspace-scoped, not repo-bound. Unlike forge integrations that need a git repo CWD for `gh`/`glab`/`tea`, Jira's configured command runs anywhere.

## Test Results

- `bun test tests/lib/integrations/jira.test.ts` — 8 tests, 0 failures
- `bun test tests/lib/integration-commands.test.ts` — 15 tests, 0 failures
- `bun test tests/` — 727 tests, 0 failures (no regressions)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical functionality] jira.test.ts needed ts-ignore and type fixes**
- **Found during:** Task 2 verification (typecheck)
- **Issue:** `const resolveIssueRefMock = mock(() => ...)` inferred strict return type; `mockImplementation` with `ok: false` caused TS2322; cache-busting import needed `@ts-ignore`
- **Fix:** Changed mock type to `mock((): any => ...)`, removed `as const` from mockImplementation return values, added `// @ts-ignore` comment before cache-busting import
- **Files modified:** tests/lib/integrations/jira.test.ts
- **Commit:** e4c3b45

**2. [Rule 2 - Missing critical functionality] integration-commands.test.ts needed fuller mock for @/lib/config**
- **Found during:** Task 2 (running integration-commands tests)
- **Issue:** Adding `mock.module("@/lib/config")` with only `workspaceExists` and `readGlobalConfig` caused cmux.ts import to fail (needs `readWorkspace` and `writeWorkspace`)
- **Fix:** Extended config mock to include `readWorkspace`, `writeWorkspace`, `readRegistry`, `listWorkspaces`
- **Files modified:** tests/lib/integration-commands.test.ts
- **Commit:** e4c3b45

**3. [Rule 2 - Missing critical functionality] integration-commands.test.ts needed fuller mock for @/tui/utils**
- **Found during:** Task 2 (running integration-commands tests)
- **Issue:** Adding `mock.module("@/tui/utils")` without `safeText` caused vscode.ts import to fail
- **Fix:** Added `safeText`, `cancel`, and full `prompts` shape to mock
- **Files modified:** tests/lib/integration-commands.test.ts
- **Commit:** e4c3b45

### Pre-existing Issues (Out of Scope)

The following TypeScript errors existed before this plan and are not caused by plan 03 changes:
- `tests/lib/integrations/gitea.test.ts(284)` — introduced by Plan 02 (aa7f23b); `resolveIssueRefMock` strict type conflict
- `tests/lib/integrations/github.test.ts(213)` — pre-existing from Plan 02
- `tests/lib/integrations/gitlab.test.ts(212)` — pre-existing from Plan 02

These are logged to `deferred-items.md` for follow-up.

## Self-Check: PASSED

- src/lib/integrations/jira.ts exists: FOUND
- src/lib/integrations/index.ts contains jiraIntegration: FOUND
- src/commands/doctor.ts contains checkBinary("jira"): FOUND
- tests/lib/integrations/jira.test.ts exists: FOUND
- tests/lib/integration-commands.test.ts contains expect(names).toContain("jira"): FOUND
- Commit 948b00a exists: FOUND
- Commit e4c3b45 exists: FOUND
