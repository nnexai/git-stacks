# Phase 87 Source Coverage Audit

SOURCE | ID | Feature/Requirement | Plan | Status | Notes
--- | --- | --- | --- | --- | ---
GOAL | - | Integration-related functionality is covered through real source modules and injected executors without local Niri, AeroSpace, cmux, VSCode, browser, or forge CLI environments | 01-04 | COVERED | Roadmap goal maps to utility, forge command, session/IDE, and coverage audit plans.
REQ | INTG-02 | Issue and forge utility modules are tested through real source exports for workspace/repo resolution, linked issue persistence, error formatting, enabled-forge detection, base branch selection, and missing-tool/no-remote cases | 01, 04 | COVERED | Plan 01 repairs utility tests; Plan 04 audits coverage.
REQ | INTG-03 | Forge command integrations are covered with injected executors for argument construction, JSON parse failures, missing PR/issue/repo cases, exit-code propagation, and safe browser-open behavior | 02, 04 | COVERED | Plan 02 covers GitHub/GitLab/Gitea/Jira command contracts.
REQ | INTG-04 | Session and IDE integrations are covered with injected executors for config parsing, command construction, artifact-bag routing, skip behavior, and safe failure handling | 03, 04 | COVERED | Plan 03 covers tmux/cmux/niri/AeroSpace/VSCode/IntelliJ.
REQ | GATE-03 | Existing unit, integration, dependency, and typecheck commands continue to pass with expanded tests | 01-04 | COVERED | Plans include focused tests, `bun run test:unit`, `bun run typecheck`, coverage, and verify-gates.
RESEARCH | R-01 | Do not run `bun test tests/` because `mock.module()` contamination requires custom runner isolation | 01-04 | COVERED | Every plan explicitly forbids direct full-tree Bun test runs.
RESEARCH | R-02 | Replace inline utility implementation copies in `issue-utils.test.ts` and `forge-utils.test.ts` | 01, 04 | COVERED | Plan 01 repairs, Plan 04 grep-audits.
RESEARCH | R-03 | Use injected executor seams for forge command modules | 02 | COVERED | Plan 02 names `_exec.run`, `_exec.runCapture`, `_exec.openUrl`, and `_exec.runShell`.
RESEARCH | R-04 | Use fake detectors/helper modules for session and IDE integrations | 03 | COVERED | Plan 03 covers tmux/cmux/niri/AeroSpace/VSCode/IntelliJ through mocks.
CONTEXT | D-01 | Tests should import and exercise real `src/lib/integrations/**` modules and public helper APIs | 01, 04 | COVERED | Plan 01 and Plan 04 cite D-01.
CONTEXT | D-02 | Replace or supplement tests that mock by duplicating source logic | 01, 04 | COVERED | Plan 01 and Plan 04 cite D-02/source-bypassing audit.
CONTEXT | D-03 | Use module mocks only for true external boundaries | 01-03 | COVERED | Plans constrain mocks to config, detection, executors, filesystem, and helpers.
CONTEXT | D-04 | Follow custom runner isolation for `mock.module()` tests | 01-04 | COVERED | Verification commands avoid `bun test tests/`.
CONTEXT | D-05 | Forge and issue utility coverage includes required resolution, persistence, detection, and error cases | 01 | COVERED | Plan 01 cites D-05/INTG-02.
CONTEXT | D-06 | Forge command modules use injected executors for command contracts and safe browser-open behavior | 02 | COVERED | Plan 02 cites D-06/INTG-03.
CONTEXT | D-07 | Session/IDE integrations use injected executors or fake detectors | 03 | COVERED | Plan 03 cites D-07/INTG-04.
CONTEXT | D-08 | In-scope integration modules include forge command and session/IDE contracts where applicable | 02-03 | COVERED | Plans 02 and 03 cite D-08.
CONTEXT | D-09 | Out-of-scope external environments, TUI rendering, CI, and milestone finalization stay out | 03-04 | COVERED | Plan 03 and Plan 04 cite D-09.
CONTEXT | D-10 | Exact helper shape and grouping are agent discretion if criteria stay traceable | 04 | COVERED | Plan 04 records discretion and traceability audit.
CONTEXT | D-11 | Full real/containerized external integration E2E remains deferred outside v0.17.1 | 04 | COVERED | Plan 04 records deferred external environments.
