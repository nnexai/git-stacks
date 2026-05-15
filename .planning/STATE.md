---
gsd_state_version: 1.0
milestone: v0.17.1
milestone_name: Functional Confidence Coverage
status: Awaiting next milestone
stopped_at: Completed 88-02-PLAN.md
last_updated: "2026-05-15T19:45:33.000Z"
last_activity: 2026-05-15 — Completed quick task 260515-u0q: Update worktree creation so an existing local workspace branch is reused, and if origin/<branch> exists it is configured as upstream like git checkout would do
progress:
  total_phases: 13
  completed_phases: 13
  total_plans: 35
  completed_plans: 35
  percent: 100
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-10)

**Core value:** One command takes you from "I need to work on feature X" to a fully running dev environment — right repos, right branches, right IDE/terminal open, hooks run — without manual steps.
**Current focus:** Awaiting next milestone after v0.17.1 archive

## Current Position

Phase: Milestone v0.17.1 complete
Plan: —
Status: Awaiting next milestone
Last activity: 2026-05-15 — Completed quick task 260515-u0q: Update worktree creation so an existing local workspace branch is reused, and if origin/<branch> exists it is configured as upstream like git checkout would do

## Performance Metrics

**Velocity:** Phase 80 completed 2 plans in the current execution session.

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 80 | 2 | 2 | ~40 min |
| 81.1 | 1 | 1 | ~5 min |
| 81-84 plus splits | 0 | 18 | - |
| 81 | 4 | - | - |
| Phase 81.1.1 P01 | 5 min | 2 tasks | 5 files |
| Phase 82.1 P01 | 7 min | 3 tasks | 4 files |
| Phase 82.1 P02 | 6 min | 2 tasks | 2 files |
| Phase 82.1 P03 | 16 min | 3 tasks | 7 files |
| 82.1 | 3 | - | - |
| 84 | 3 | ~2h | ~40 min |
| Phase 84.1 P02 | 9min | 1 tasks | 1 files |
| Phase 85 P01 | 24min | 2 tasks | 4 files |
| Phase 85 P02 | 3min | 2 tasks | 1 files |
| Phase 85 P03 | 5min | 2 tasks | 1 files |
| Phase 85-core-real-fixture-functional-hardening P04 | 20min | 2 tasks | 3 files |
| Phase 87 P01 | 18 min | 2 tasks | 3 files |
| Phase 87 P02 | 12 min | 2 tasks | 5 files |
| Phase 87 P03 | 25 min | 3 tasks | 7 files |
| Phase 87 P04 | 12 min | 2 tasks | 3 files |
| Phase 88 P01 | 4 min | 2 tasks | 4 files |
| Phase 88 P02 | 12 min | 2 tasks | 6 files |

## Accumulated Context

### Decisions

- [Phase 87]: Session, IDE, and window-manager integration tests use mocked helpers and executor seams only; no real desktop, editor, tmux, cmux, niri, or AeroSpace processes are launched.

- [Phase 87]: Forge command tests exercise GitHub, GitLab, Gitea, and Jira command modules through injected executor seams without launching real external tools.

- Treat v0.17.0 as the completed baseline even though MILESTONES.md is stale; phases 74-79 are complete and v0.17.1 starts at Phase 80.
- v0.17.1 scope is non-TUI, non-integration E2E coverage plus usable coverage reports across the split test runner architecture.
- TUI behavior, external integration behavior, editor-launching edit commands, and the v0.17.0 terminal UI rollback visibility audit gap stay out of this milestone.
- Phase structure after planning feedback: combined harness/inventory foundation (80), workspace/git-operation E2E (81), template/repo/label/message E2E (82), support/error E2E (82.1), Istanbul-based subprocess coverage reports (83), local gates/docs/release prep (84).
- Existing test runner constraint: unit files run in one shared Bun test process; integration/E2E-style files run as isolated per-file Bun test subprocesses.
- There is no CI in the project today; v0.17.1 gates are local verification scripts/commands, not CI workflow work.
- Coverage reporting must include source exercised by subprocess E2E tests. The old "or document the limitation" fallback is intentionally removed; Phase 83 will use Istanbul-compatible source instrumentation with per-process artifact merging.
- Phase 80 should extend existing helpers in `tests/helpers.ts` rather than replacing them.
- The Phase 80 inventory must have a machine-parseable source of truth so Phase 84 local gates can detect unmapped commands and missing test mappings.
- Phase 80 no longer requires a separate human-readable inventory surface; the canonical artifact is the machine-parseable source itself.
- The milestone's core testing intent is to falsify assumptions around env injection, hooks, cwd/path selection, branch starting points, merge/pull/sync/push behavior, and command execution that uses explicit cwd/path handling instead of shell `cd` state.
- Phase 81.1 repo add forge eligibility uses global integration config only; zero enabled forge matches register with forge unset and no prompt; ambiguous prompts include only enabled matching forges plus None.
- Backlog 999.2 (README debug format) promoted into Phase 84 SC 6; 999.1 and 999.3 remain backlog.
- Wizard-driven commands (new, clone, config wizard, repo scan, template new, template edit, install prompts) are excluded from E2E scope; tested indirectly via pre-built fixtures where applicable.
- `cd`, `edit --yaml`, `integration list`, and `integration <id> config show/example` were missing from phase success criteria and have been added.
- **Coverage spike findings (2026-04-10):** (1) Bun ignores `NODE_V8_COVERAGE` — no V8 coverage JSON produced from Bun subprocesses. (2) `bun test --coverage` works for in-process imports only; subprocess code is invisible. (3) `c8 --all` sees the source tree but reports 0% because Bun subprocesses don't emit V8 artifacts. (4) Istanbul source instrumentation (`istanbul-lib-instrument` with `parserPlugins: ["typescript"]`) works end-to-end under Bun: instrument TS → run instrumented code in subprocess → collect `globalThis.__coverage__` → get per-function/statement/branch hit counts. (5) Phase 83 approach confirmed: Istanbul source instrumentation + `__coverage__` collection + artifact merge. Phase 82.1 SC 6 requires a minimal proof-of-concept before Phase 83 planning begins.
- [Phase 81.1.1]: 81.1.1 non-interactive new resolves template names and repeatable --template composition only; local-path --from remains interactive-only. — Keeps the urgent prerequisite narrow and avoids local-path automation scope creep.
- [Phase 81.1.1]: 81.1.1 non-interactive clone preserves source workspace settings while skipping integration override prompts. — Matches the inherited/default cascade requirement without introducing a prompt in automation mode.
- [Phase 81.1.1]: 81.1.1 workspace opening remains opt-in through --open for new and clone non-interactive paths. — Prevents unintended side effects in subprocess E2E setup.
- [Phase 82.1]: Readonly support completion checks assert shell-specific invariants instead of snapshots. — Avoids brittle completion goldens while proving the generated command tree includes support surfaces.
- [Phase 82.1]: The fake editor records exact target paths and appends a YAML comment for valid mutations so schema validation remains authoritative. — Provides a deterministic external-editor subprocess proof without weakening YAML schema validation.
- [Phase 82.1]: Failure coverage stays representative, not a cross-product matrix. — Plan 03 intentionally satisfied E2E-13 with one case per required failure class.
- [Phase 82.1]: Manual editor UX remains excluded, while fake-editor --yaml subprocess contracts are in scope. — The inventory now separates automation-safe editor subprocess behavior from manual editor interaction.
- [Phase 82.1]: Istanbul proof is isolated from full coverage tooling so Phase 83 can build on a verified handoff. — Plan 03 proves source instrumentation and mergeability without adding reports or suite-wide tooling.
- [Phase 84]: `bun run verify` is the stable local release-prep gate, with `verify:prereqs` and `verify:gates` available for step-level debugging.
- [Phase 84]: Coverage gates validate artifact existence and parseability only; no CI workflow or numeric coverage threshold was introduced.
- [Phase 84.1]: Coverage report accuracy is a milestone gate; coverage reports that undercount existing TUI/source test execution must be fixed before closing v0.17.1.
- [Phase 84.1]: Plan 01 selected an instrumented `.coverage/runtime-root` execution path after preload-only redirect/load-time instrumentation failed; focused coverage now records nonzero hits for `src/lib/messages.ts` and `src/tui/dashboard/ActionMenu.tsx`.
- [Phase 84.1]: Canonical full-suite coverage and local release-prep verification passed with nonzero sentinel hits for src/lib/messages.ts and src/tui/dashboard/ActionMenu.tsx.
- [Phase 85-88]: The milestone is not ready to close just because tests are green. The coverage report shows functional confidence gaps in command workflows, real-source integration utilities, and stable non-TUI core behaviors.
- [Phase 85-88]: New coverage work should prioritize real temp directories, local git/bare remotes, isolated config homes, and injected executor contracts. Avoid brittle prompt/spinner assertions, TUI rendering, and real desktop/plugin environments.
- [Phase 85-88]: Tests must execute real source modules. Existing patterns that inline implementation copies in mocks, especially around issue/forge utilities, should be replaced or supplemented so coverage means source behavior was exercised.
- [Phase 85-core-real-fixture-functional-hardening]: Phase 85 coverage validation stays local-only without numeric thresholds or CI requirements.
- [Phase 85-core-real-fixture-functional-hardening]: Phase 85 focused gap closure is limited to core source modules already inside the phase boundary.
- [Phase 87]: Utility tests now import real issue-utils and forge-utils source modules while mocking only config, workspace detection, and forge environment boundaries.
- [Phase 87]: Forge utility tests use the exported `_detect` seam and real `resolveForgeRepoAnyMode()` instead of source-copying mocks.
- [Phase 87]: Local tests/lib/integrations contract tests belong in coverage:unit because they exercise source modules through injected executors and mocks, not real external environments. — Needed for Phase 87 coverage artifacts to reflect real integration source modules.
- [Phase 87]: Phase 87 coverage notes hand final readiness classification to Phase 88 and do not claim live forge, browser, editor, IDE, or window-manager readiness. — Preserves the Phase 87 scope boundary.
- [Phase 88]: Functional readiness uses targeted source sentinels from Phases 85-87 instead of numeric coverage thresholds.
- [Phase 88]: Readiness evidence remains pre-finalization only; archive, tag, publish, cleanup, and $gsd-complete-milestone stay outside Phase 88.
- [Phase 88]: Functional readiness is enforced through the existing local verify:gates path, not through CI or numeric thresholds.
- [Phase 88]: Phase 88 remains pre-finalization only; archive, tag, publish, cleanup, and $gsd-complete-milestone stay outside this phase.

### Roadmap Evolution

- Phase 81.1 inserted after Phase 81: Repo add honors enabled forge integrations (URGENT)
- Phase 81.1.1 inserted after Phase 81.1: Minimal non-interactive workspace create and clone variants (URGENT)
- Phase 81.1.1 completed on 2026-05-14: `new` and `clone` now expose prompt-free `--non-interactive` paths for template-backed create and workspace clone E2E setup.
- Phase 81.1 completed on 2026-05-14: `repo add` now honors globally enabled forge integrations before detection and prompting.
- Phase 80 completed on 2026-05-14: shared E2E CLI harness and canonical machine-parseable inventory are now available.
- Phase 82 completed on 2026-05-14: template, repo, label, and message command families now have isolated real-CLI E2E coverage and inventory mappings.
- Phase 83 coverage surface remediated on 2026-05-14: `coverage`, `coverage:unit`, and `coverage:integ` scripts now generate stable `.coverage/coverage-final.json`, `.coverage/coverage-summary.json`, `.coverage/lcov.info`, and `.coverage/index.html` artifacts for Phase 84 gates.
- Phase 83 completion artifacts reconciled on 2026-05-15: summaries and roadmap checkboxes now match the already-shipped coverage implementation consumed by Phases 84 and 84.1.
- Phase 84 completed on 2026-05-14: local `bun run verify` orchestration now checks prerequisite surfaces, refreshes coverage, aggregates inventory/mapping/coverage gate findings, runs existing quality commands, and documents the v0.17.1 release-prep path.
- Phase 84.1 inserted after Phase 84: Coverage Report Accuracy and TUI Instrumentation Follow-up (URGENT)
- Phase 85 inserted after Phase 84.1: Core Real-Fixture Functional Hardening
- Phase 86 inserted after Phase 85: Workspace Command Workflow Edge Coverage
- Phase 87 inserted after Phase 86: Integration Contract and Source-Module Coverage
- Phase 88 inserted after Phase 87: Functional Coverage Readiness Gate

### Pending Todos

- Add manual workspace commands — captured 2026-05-15. Explore named, manually triggered template/workspace command recipes that reuse hook/env/cwd execution machinery without being bound to lifecycle events. See `.planning/todos/pending/2026-05-15-add-manual-workspace-commands.md`.
- Add bidirectional files sync — captured 2026-05-15. Explore `files.sync` for real-file two-way sync of uncommitted planning/agent config directories, with a `git-stacks files ...` command family and lightweight drift detection instead of large hash manifests. See `.planning/todos/pending/2026-05-15-add-bidirectional-files-sync.md`.
- Add workspace notes — captured 2026-05-15. Explore lightweight operator notes for workspaces, stored outside project repos and surfaced later in dashboard/stale views. See `.planning/todos/pending/2026-05-15-add-workspace-notes.md`.
- Add workspace stale view — captured 2026-05-15. Explore a `git-stacks stale` advisory command that classifies old workspaces as active, idle, ready-to-clean, needs-attention, or orphaned. See `.planning/todos/pending/2026-05-15-add-workspace-stale-view.md`.
- Improve TUI dashboard experience — captured 2026-05-15. Future reminder to make `git-stacks manage` a richer workspace control center, especially after notes/stale/files/manual-command surfaces are chosen. See `.planning/todos/pending/2026-05-15-improve-tui-dashboard-experience.md`.

### Blockers/Concerns

None blocking. Concern: functional-only coverage is not yet sufficient for release confidence; new phases 85-88 are intended to close or explicitly classify those gaps.

### Quick Tasks Completed

| # | Description | Date | Commit | Status | Directory |
|---|-------------|------|--------|--------|-----------|
| 260515-u0q | Update worktree creation so an existing local workspace branch is reused, and if origin/<branch> exists it is configured as upstream like git checkout would do | 2026-05-15 | 2533bba | Verified | [260515-u0q-update-worktree-creation-so-an-existing-](./quick/260515-u0q-update-worktree-creation-so-an-existing-/) |

## Session Continuity

Last session: 2026-05-15T06:13:59.593Z
Stopped at: Completed 88-02-PLAN.md
Resume file: None

## Operator Next Steps

- Start the next milestone with /gsd-new-milestone
