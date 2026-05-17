# Phase 99 Security Audit

- Phase: 99 — dashboard-actions-and-correctness-polish
- ASVS Level: 1
- block_on: open
- threats_open: 0
- audited_on: 2026-05-17

## Threat Verification

| Threat ID | Category | Disposition | Status | Evidence |
|---|---|---|---|---|
| T-99-01 | Tampering | mitigate | CLOSED | `handleRepoAction("edit")` uses `editRegistryYaml()` and validation before returning: `src/tui/dashboard/App.tsx:786-793`; repo-edit integration test asserts helper/validate call: `tests/tui/dashboard/integ-action-menu.test.tsx:280-282`. |
| T-99-02 | Denial of Service | mitigate | CLOSED | Repo edit wraps editor launch in `try/finally` with `renderer.resume()` and `reloadRepos()` in `finally`: `src/tui/dashboard/App.tsx:787-798`. |
| T-99-03 | Spoofing | mitigate | CLOSED | Candidate routing is restricted to known tracker ids `github|gitlab|gitea|jira`: `src/tui/dashboard/App.tsx:650`; label uses tracker display mapping + issue id from settings (`${issueTrackerLabels[tracker]}: ${issueId}`): `src/tui/dashboard/App.tsx:656`, `src/tui/dashboard/issue-actions.ts:8-13`; multi-tracker picker test verifies tracker-labeled rows and routing: `tests/tui/dashboard/integ-action-menu.test.tsx:334-348`. |
| T-99-04 | Repudiation | mitigate | CLOSED | Issue-open output is sent to `ProgressView` with error text and done-state; view remains until keypress transition: `src/tui/dashboard/App.tsx:620-630`, keypress exit gate at `src/tui/dashboard/App.tsx:1241-1249`; tests cover persistence and inspectable failure lines: `tests/tui/dashboard/integ-action-menu.test.tsx:353-375`. |
| T-99-05 | Denial of Service | mitigate | CLOSED | Disabled issue/command rows are visible and blocked on Enter + shortcut dispatch: `src/tui/dashboard/ActionMenu.tsx:34-41,58,66`; tests assert both visibility and non-activation: `tests/tui/dashboard/ActionMenu.test.tsx:183-200,224-240,244-269`. |
| T-99-06 | Elevation of Privilege | accept | CLOSED | Phase 99 manual command execution path calls existing helper `runManualCommand(...)` (no bypass implementation): `src/tui/dashboard/App.tsx:636`; picker source uses `listManualCommands(...)`: `src/tui/dashboard/App.tsx:304,453`; integration test validates command run through helper: `tests/tui/dashboard/integ-action-menu.test.tsx:404-406`. Accepted risk is logged below. |
| T-99-07 | Information Disclosure | mitigate | CLOSED | Command picker uses `listManualCommands(workspace)` default filtering (not `{ all: true }`): `src/tui/dashboard/App.tsx:304,453`; filter hides `pre*`/`post*`: `src/lib/workspace-command.ts:31-32,58`; tests confirm `preverify`/`postverify` omitted: `tests/tui/dashboard/integ-action-menu.test.tsx:395-397`, `tests/lib/workspace-command.test.ts:57-59`. |
| T-99-08 | Repudiation | mitigate | CLOSED | Failed command context includes `failedCommand` in progress error line: `src/tui/dashboard/App.tsx:637-643`; failure test verifies exit code + failed command text persists in view: `tests/tui/dashboard/integ-action-menu.test.tsx:411-436`. |
| T-99-09 | Tampering | mitigate | CLOSED | Action-menu shortcut dispatch is explicitly covered by component tests (legacy and new shortcuts): `tests/tui/dashboard/ActionMenu.test.tsx:107-122,177-180,218-221`; repo shortcuts (`w,t,r`) + new `e` covered: `tests/tui/dashboard/RepoActionMenu.test.tsx:18-24,46-80`. |
| T-99-10 | Repudiation | mitigate | CLOSED | Scope override is explicitly recorded in phase context (`D-13`, excludes `DASH-01` rollback work): `.planning/phases/99-dashboard-actions-and-correctness-polish/99-CONTEXT.md`; exclusion guard test asserts no rollback/file-op rows added in `CreateProgressView`: `tests/tui/dashboard/CreateProgressView.test.tsx:79-85`. |
| T-99-11 | Denial of Service | mitigate | CLOSED | Issue and command failure views are asserted to remain visible with error context before return keypress path: `tests/tui/dashboard/integ-action-menu.test.tsx:353-375,411-436`; progress view exit requires keypress when done: `src/tui/dashboard/App.tsx:1241-1249`. |
| T-99-SC | Tampering | mitigate | CLOSED | No dependency-change evidence in phase execution artifacts (`tech-stack.added: []`; modified files limited to dashboard src/tests): `.planning/phases/99-dashboard-actions-and-correctness-polish/99-01-SUMMARY.md`, `99-02-SUMMARY.md`, `99-03-SUMMARY.md`, `99-04-SUMMARY.md`. |

## Accepted Risks Log

| Threat ID | Rationale | Verification |
|---|---|---|
| T-99-06 | Manual commands are user-authored/operator-triggered behavior inherited from Phase 95; Phase 99 only exposes existing trigger surface in dashboard menus. | Verified no Phase 99 bypass path: execution routes through `runManualCommand` helper (`src/tui/dashboard/App.tsx:636`) with helper-backed tests (`tests/tui/dashboard/integ-action-menu.test.tsx:404-406`). |

## Transfer Risks Log

None.

## Threat Flags

No executor threat flags were recorded in Phase 99 summaries (`99-01-SUMMARY.md` through `99-04-SUMMARY.md` contain no `## Threat Flags` section).

## Unregistered Flags

None.
