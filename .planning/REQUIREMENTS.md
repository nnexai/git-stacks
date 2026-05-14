# Requirements: git-stacks

**Defined:** 2026-04-10
**Core Value:** One command takes you from "I need to work on feature X" to a fully running dev environment — right repos, right branches, right IDE/terminal open, hooks run — without manual steps.

## v0.17.1 Requirements

Requirements for v0.17.1 E2E Test Coverage. Each maps to roadmap phases.

### Coverage Inventory and Harness

- [x] **E2E-01**: Maintainer can inspect a living, machine-parseable inventory source of every non-TUI, non-integration command and library-backed user flow that must have E2E coverage.
- [x] **E2E-02**: Maintainer can see explicit exclusions for TUI behavior and external integration functionality so the milestone scope cannot drift.
- [x] **E2E-03**: Maintainer can compare the command inventory with the implemented E2E suite and identify any unmapped in-scope surface as tests are added.
- [x] **E2E-04**: Test author can run `git-stacks` as a real CLI process inside an isolated config home without touching the developer's real config.
- [x] **E2E-05**: Test author can create disposable git repo, template, workspace, and config fixtures for end-to-end scenarios by extending the existing `tests/helpers.ts` primitives.
- [x] **E2E-06**: Test author can assert exit code, stdout, stderr, generated files, and persisted YAML for each E2E command invocation.
- [x] **E2E-07**: Failed E2E assertions provide enough command, environment, stdout, and stderr context to debug the failing scenario quickly.

### CLI E2E Coverage

- [x] **E2E-08**: User-facing workspace flows have E2E coverage for create (via pre-built fixtures)/clone (via pre-built fixtures)/list/status/open (`--no-ide`)/close/cd/clean/remove/rename, run, paths, env, merge, pull/sync/push guards, `status --fetch` (against local bare remote), and JSON/text output contracts where applicable.
- [x] **E2E-09**: User-facing template flows have E2E coverage for create (via pre-built fixtures)/list/show, clone/rename/remove, template composition, and template label behavior. Wizard-driven `template new` and `template edit` are excluded; `template edit --yaml` is tested via Phase 82.1.
- [x] **E2E-10**: User-facing repo registry flows have E2E coverage for add (`--name`/`--branch` to bypass forge prompts)/list/show/rename/remove across git and dir repos. Wizard-driven `repo scan` is excluded.
- [x] **E2E-11**: User-facing workspace label and message flows have E2E coverage for add/remove/list/clear and send/list/clear behavior.
- [x] **E2E-12**: User-facing config show, doctor, completion, version, install hooks, env, paths, `edit --yaml` (workspace/template/config/registry), `integration list`, and `integration <id> config show/example` support flows have E2E coverage for success and representative error cases.
- [x] **E2E-13**: E2E coverage includes representative malformed input, missing entity, dirty repo, missing path, validation-failure, and environment-sensitive cases for in-scope commands.
- [x] **E2E-14**: E2E coverage proves high-risk assumptions around env injection, hook execution, command cwd/path selection, workspace branch starting points, task path persistence, and command execution that uses explicit cwd/path handling instead of relying on shell `cd` state.

### Coverage Reporting

- [ ] **COVR-01**: Developer can run one command that generates a coverage report for the full test suite, including the existing shared-process unit runner and isolated E2E runner files.
- [ ] **COVR-02**: Coverage reports include source files exercised by subprocess-based E2E tests through Istanbul-compatible instrumentation and merged per-process artifacts.
- [ ] **COVR-03**: Coverage output is written to a stable ignored directory and supports both human-readable summary output and machine-readable Istanbul artifacts usable by local verification gates.
- [ ] **COVR-04**: Coverage reporting does not make normal `bun run test`, `bun run test:unit`, or `bun run test:integ` materially slower unless coverage is explicitly requested.

### Local Regression Gates

- [x] **GATE-01**: Local verification can fail when a new in-scope command is added without updating the E2E coverage inventory.
- [x] **GATE-02**: Local verification can fail when an in-scope inventory item has no mapped E2E test.
- [x] **GATE-03**: Existing unit, integration, dependency, and typecheck commands continue to pass with the expanded E2E and coverage tooling.

## Future Requirements

### TUI Coverage

- **TUI-01**: TUI dashboard flows have full E2E coverage beyond existing headless component/integration tests.
- **TUI-02**: Dashboard rollback progress from the v0.17.0 audit is rendered for every tracked create step, not only worktree rollback steps.

### External Integration Coverage

- **INTG-01**: GitHub/GitLab/Gitea/Jira/tmux/cmux/niri/AeroSpace/IDE integration behaviors have full E2E coverage against mocked or containerized external dependencies.

### Coverage Policy

- **COVR-05**: Future automation may enforce minimum line/function/branch coverage thresholds after the coverage source is stable.

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| TUI dashboard behavior | User requested non-TUI coverage; TUI work has different rendering/test harness risks |
| External integration behavior | User requested non-integration coverage; external CLIs and window managers need separate fixtures |
| Editor-launching edit commands (`git-stacks edit`, `git-stacks template edit`) | They invoke the user's editor and need a separate non-interactive editor harness decision |
| Wizard-driven commands (`new`, `clone`, `config` wizard, `repo scan`, `template new`, `template edit`, `install` prompts) | Interactive TUI prompts cannot be driven by subprocess E2E tests; tested indirectly via pre-built fixtures |
| Fixing v0.17.0 dashboard rollback visibility audit gap | TUI behavior is excluded from this milestone even though the audit is now committed |
| Raising mandatory coverage thresholds immediately | First milestone should produce trustworthy reports before enforcing numeric gates |
| Rewriting the whole test runner architecture | Scope is coverage and E2E coverage extension, not a runner replacement unless required by reports |

## Traceability

Which phases cover which requirements. Updated during roadmap refinement.

| Requirement | Phase | Status |
|-------------|-------|--------|
| E2E-01 | Phase 80 | Complete |
| E2E-02 | Phase 80 | Complete |
| E2E-03 | Phase 80 | Complete |
| E2E-04 | Phase 80 | Complete |
| E2E-05 | Phase 80 | Complete |
| E2E-06 | Phase 80 | Complete |
| E2E-07 | Phase 80 | Complete |
| E2E-08 | Phase 81 | Complete |
| E2E-14 | Phase 81 | Complete |
| E2E-09 | Phase 82 | Complete |
| E2E-10 | Phase 82 | Complete |
| E2E-11 | Phase 82 | Complete |
| E2E-12 | Phase 82.1 | Complete |
| E2E-13 | Phase 82.1 | Complete |
| COVR-01 | Phase 83 | Pending |
| COVR-02 | Phase 83 | Pending |
| COVR-03 | Phase 83 | Pending |
| COVR-04 | Phase 83 | Pending |
| GATE-01 | Phase 84 | Complete |
| GATE-02 | Phase 84 | Complete |
| GATE-03 | Phase 84 | Complete |

**Coverage:**
- v0.17.1 requirements: 21 total
- Mapped to phases: 21
- Unmapped: 0

---
*Requirements defined: 2026-04-10*
*Last updated: 2026-04-10 after roadmap refinement*
