# Requirements: git-stacks

**Defined:** 2026-04-10
**Core Value:** One command takes you from "I need to work on feature X" to a fully running dev environment — right repos, right branches, right IDE/terminal open, hooks run — without manual steps.

## v0.17.1 Requirements

Requirements for v0.17.1 E2E Test Coverage. Each maps to roadmap phases.

### Coverage Inventory

- [ ] **E2E-01**: Maintainer can see a documented inventory of every non-TUI, non-integration command and library-backed user flow that must have E2E coverage.
- [ ] **E2E-02**: Maintainer can see explicit exclusions for TUI behavior and external integration functionality so the milestone scope cannot drift.
- [ ] **E2E-03**: Maintainer can compare the command inventory with the implemented E2E suite and identify any unmapped in-scope surface.

### E2E Harness

- [ ] **E2E-04**: Test author can run `git-stacks` as a real CLI process inside an isolated config home without touching the developer's real config.
- [ ] **E2E-05**: Test author can create disposable git repo, template, workspace, and config fixtures for end-to-end scenarios.
- [ ] **E2E-06**: Test author can assert exit code, stdout, stderr, generated files, and persisted YAML for each E2E command invocation.
- [ ] **E2E-07**: Failed E2E assertions provide enough command, environment, stdout, and stderr context to debug the failing scenario quickly.

### CLI E2E Coverage

- [ ] **E2E-08**: User-facing workspace flows have E2E coverage for create/clone/list/status/open-safe behavior, clean/remove/rename, run, paths, env, pull/sync/push guard behavior, and JSON/text output contracts where applicable.
- [ ] **E2E-09**: User-facing template flows have E2E coverage for create/list/show/edit-safe paths, clone/rename/remove, template composition, and template label behavior.
- [ ] **E2E-10**: User-facing repo registry flows have E2E coverage for add/scan/list/show/rename/remove across git and dir repos.
- [ ] **E2E-11**: User-facing workspace label and message flows have E2E coverage for add/remove/list/clear and send/list/clear behavior.
- [ ] **E2E-12**: User-facing config, doctor, completion, version, env, and paths support flows have E2E coverage for success and representative error cases.
- [ ] **E2E-13**: E2E coverage includes representative malformed input, missing entity, dirty repo, missing path, and validation-failure cases for in-scope commands.

### Coverage Reporting

- [ ] **COVR-01**: Developer can run one command that generates a coverage report for the full test suite, including the existing shared-process unit runner and isolated E2E runner files.
- [ ] **COVR-02**: Coverage reports include source files exercised by subprocess-based E2E tests, or clearly document any technical limitation and enforce coverage through the closest reliable measurable proxy.
- [ ] **COVR-03**: Coverage output is written to a stable ignored directory and supports both human-readable summary output and machine-readable artifacts for CI.
- [ ] **COVR-04**: Coverage reporting does not make normal `bun run test`, `bun run test:unit`, or `bun run test:integ` materially slower unless coverage is explicitly requested.

### Regression Gates

- [ ] **GATE-01**: CI or local verification can fail when a new in-scope command is added without updating the E2E coverage inventory.
- [ ] **GATE-02**: CI or local verification can fail when an in-scope inventory item has no mapped E2E test.
- [ ] **GATE-03**: Existing unit, integration, dependency, and typecheck commands continue to pass with the expanded E2E and coverage tooling.

## Future Requirements

### TUI Coverage

- **TUI-01**: TUI dashboard flows have full E2E coverage beyond existing headless component/integration tests.
- **TUI-02**: Dashboard rollback progress from the v0.17.0 audit is rendered for every tracked create step, not only worktree rollback steps.

### External Integration Coverage

- **INTG-01**: GitHub/GitLab/Gitea/Jira/tmux/cmux/niri/AeroSpace/IDE integration behaviors have full E2E coverage against mocked or containerized external dependencies.

### Coverage Policy

- **COVR-05**: CI enforces minimum line/function/branch coverage thresholds after the report source and subprocess limitations are stable.

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| TUI dashboard behavior | User requested non-TUI coverage; TUI work has different rendering/test harness risks |
| External integration behavior | User requested non-integration coverage; external CLIs and window managers need separate fixtures |
| Fixing v0.17.0 dashboard rollback visibility audit gap | TUI behavior is excluded from this milestone even though the audit is now committed |
| Raising mandatory coverage thresholds immediately | First milestone should produce trustworthy reports before enforcing numeric gates |
| Rewriting the whole test runner architecture | Scope is coverage and E2E coverage extension, not a runner replacement unless required by reports |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|

**Coverage:**
- v0.17.1 requirements: 20 total
- Mapped to phases: 0
- Unmapped: 20

---
*Requirements defined: 2026-04-10*
*Last updated: 2026-04-10 after initial definition*
