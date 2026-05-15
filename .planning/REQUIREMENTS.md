# Requirements: git-stacks

**Defined:** 2026-04-10
**Core Value:** One command takes you from "I need to work on feature X" to a fully running dev environment — right repos, right branches, right IDE/terminal open, hooks run — without manual steps.

## v0.17.1 Requirements

Requirements for v0.17.1 Functional Confidence Coverage. Each maps to roadmap phases.

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

- [x] **COVR-01**: Developer can run one command that generates a coverage report for the full test suite, including the existing shared-process unit runner and isolated E2E runner files.
- [x] **COVR-02**: Coverage reports include source files exercised by subprocess-based E2E tests through Istanbul-compatible instrumentation and merged per-process artifacts.
- [x] **COVR-03**: Coverage output is written to a stable ignored directory and supports both human-readable summary output and machine-readable Istanbul artifacts usable by local verification gates.
- [x] **COVR-04**: Coverage reporting does not make normal `bun run test`, `bun run test:unit`, or `bun run test:integ` materially slower unless coverage is explicitly requested.

### Local Regression Gates

- [x] **GATE-01**: Local verification can fail when a new in-scope command is added without updating the E2E coverage inventory.
- [x] **GATE-02**: Local verification can fail when an in-scope inventory item has no mapped E2E test.
- [x] **GATE-03**: Existing unit, integration, dependency, and typecheck commands continue to pass with the expanded E2E and coverage tooling.

### Functional Confidence Extension

- [x] **CORE-01**: Core workspace lifecycle behavior is covered with real temp directories and local git repositories for rollback, cleanup, rename, merge, missing-path, and destructive safety boundaries.
- [x] **CORE-02**: Core git operations are covered with local bare remotes for sync, pull, push, no-op, failure, branch-state, and dirty-worktree behavior that impacts real users.
- [x] **CORE-03**: Hook execution is covered for ordering, cwd, env injection, captured output, failure propagation, and rollback interaction using automation-safe fixtures.
- [x] **CORE-04**: File operations, env/secrets/ports, and config persistence are covered where they affect workspace setup, cleanup, idempotency, external-file safety, resolver order, repo overlay, collision handling, and atomic YAML writes.
- [x] **CORE-05**: Coverage-improving tests execute real source modules and do not satisfy coverage by inlining copies of implementation logic inside test mocks.
- [x] **CMD-01**: `open --recreate` is covered for template-backed workspace update behavior, including no-change, added/removed repos, hook/env/file/integration changes, missing-template errors, workspace-without-template errors, and automation-safe force/cancel behavior.
- [x] **CMD-02**: `clean --gone` is covered with local bare remotes for deleted-upstream detection, dirty-worktree refusal, dry-run/force behavior, multi-workspace handling, and removal failure reporting.
- [x] **CMD-03**: Destructive workspace commands have CLI-level coverage for safety-critical dry-run, force, missing entity, and error behavior that is not already fully proven by core library tests.
- [x] **CMD-04**: Stable command wrappers for `run`, `paths`, `env`, `status`, `sync`, `push`, and `pull` are covered for meaningful option interactions, JSON contracts, cwd detection, and no-op/error branches without brittle prompt/spinner assertions.
- [x] **INTG-02**: Issue and forge utility modules are tested through their real source exports for workspace/repo resolution, linked issue persistence, error formatting, enabled-forge detection, base branch selection, and missing-tool/no-remote cases.
- [x] **INTG-03**: Forge command integrations are covered with injected executors for argument construction, JSON parse failures, missing PR/issue/repo cases, exit-code propagation, and safe browser-open behavior without requiring real forge CLIs.
- [x] **INTG-04**: Session and IDE integrations are covered with injected executors for config parsing, command construction, artifact-bag routing, skip behavior, and safe failure handling without requiring real desktop/window-manager environments.
- [x] **GATE-04**: Maintainer can run a functional coverage readiness gate that distinguishes green tests, covered source, accepted gaps, deferred external-environment coverage, and must-fix-before-release gaps.

## Future Requirements

### TUI Coverage

- **TUI-01**: TUI dashboard flows have full E2E coverage beyond existing headless component/integration tests.
- **TUI-02**: Dashboard rollback progress from the v0.17.0 audit is rendered for every tracked create step, not only worktree rollback steps.

### External Integration Coverage

- **INTG-01**: GitHub/GitLab/Gitea/Jira/tmux/cmux/niri/AeroSpace/IDE integration behaviors have full E2E coverage against mocked or containerized external dependencies.

### Coverage Policy

- [x] **COVR-05**: Future automation may enforce minimum line/function/branch coverage thresholds after the coverage source is stable.

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| TUI dashboard behavior | User requested non-TUI coverage; TUI work has different rendering/test harness risks |
| Real external integration environments | External CLIs and window managers are not launched in this milestone; integration logic may still be covered through injected executors and contract tests |
| Editor-launching edit commands (`git-stacks edit`, `git-stacks template edit`) | They invoke the user's editor and need a separate non-interactive editor harness decision |
| Wizard-driven commands (`new`, `clone`, `config` wizard, `repo scan`, `template new`, `template edit`, `install` prompts) | Interactive TUI prompts cannot be driven by subprocess E2E tests; tested indirectly via pre-built fixtures |
| Fixing v0.17.0 dashboard rollback visibility audit gap | TUI behavior is excluded from this milestone even though the audit is now committed |
| Brittle command-wrapper branch chasing | The extension prioritizes real-fixture core behavior and stable contracts over prompt/spinner/text branches that do not improve functional confidence |
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
| COVR-01 | Phase 83 | Complete |
| COVR-02 | Phase 83 | Complete |
| COVR-03 | Phase 83 | Complete |
| COVR-04 | Phase 83 | Complete |
| GATE-01 | Phase 84 | Complete |
| GATE-02 | Phase 84 | Complete |
| GATE-03 | Phase 84 | Complete |
| CORE-01 | Phase 85 | Planned |
| CORE-02 | Phase 85 | Planned |
| CORE-03 | Phase 85 | Planned |
| CORE-04 | Phase 85 | Planned |
| CORE-05 | Phase 85 | Planned |
| CMD-01 | Phase 86 | Planned |
| CMD-02 | Phase 86 | Planned |
| CMD-03 | Phase 86 | Planned |
| CMD-04 | Phase 86 | Planned |
| INTG-02 | Phase 87 | Planned |
| INTG-03 | Phase 87 | Planned |
| INTG-04 | Phase 87 | Planned |
| GATE-04 | Phase 88 | Planned |
| COVR-05 | Phase 88 | Planned |

**Coverage:**
- v0.17.1 requirements: 35 total
- Mapped to phases: 35
- Unmapped: 0

---
*Requirements defined: 2026-04-10*
*Last updated: 2026-05-15 after functional confidence coverage extension*
