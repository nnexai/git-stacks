# Retrospective

Living document — one section per shipped milestone.

---

## Milestone: v0.3.0 — Dashboard UI Overhaul

**Shipped:** 2026-03-20
**Phases:** 4 (Phases 6–9) | **Plans:** 13 | **Commits:** ~60

### What Was Built

- JSONL-backed workspace notification store with `message send|list|clear` CLI and real-time IPC push via Unix socket
- Tabbed dashboard with split list+detail pane per tab (Workspaces | Templates | Repos)
- Full in-TUI CRUD for workspaces, templates, and repo registry
- IPC push message display — live previews in list rows, per-sender grouped history in detail pane, full-screen overlay
- Shell completion overhaul — OPTION_ENUMS + FLAG_COMPLETIONS tables with prev-word detection in all three shells

### What Worked

- **Phase sequencing was correct**: Phase 6 (message store) being first meant Phase 9 (IPC display) had stable types to build on — zero type churn across phases
- **TDD for shell completions**: RED commit (data tables + failing tests) then GREEN (implementation) kept the completion work clean and the 45-test suite caught regressions immediately
- **Separate concerns in SolidJS**: keeping `tab` signal independent of `UIView` meant the 6-plan Phase 8 progression was composable without rework
- **Planning docs paid off**: SUMMARY.md files with `key-decisions` frontmatter gave instant context for each new plan; no "where were we" time wasted between plans
- **gsd-tools CLI**: `roadmap analyze`, `summary-extract`, `milestone complete` saved significant orchestrator context vs manually parsing files

### What Was Inefficient

- **UAT gap loop in Phase 8**: Root cause of tab switching freeze required 2 extra plans (08-05 and 08-06) after initial UAT. The OpenTUI nested `<text>` constraint isn't in any docs — the investigation was from scratch. Documenting this upfront in the research phase would have eliminated ~1 plan.
- **REQUIREMENTS.md stale checkboxes**: MSG-01 through MSG-10 were never updated as Phase 6 completed; found during milestone completion. Checking off requirements immediately after each plan would prevent this.
- **ROADMAP.md progress table**: The progress table was not updated during execution, requiring manual correction at archive time. Either automate this or remove it in favor of phase directory status.
- **Phase 9 UAT**: Verification score was 17/17 but status stayed `human_needed` — a manual sign-off step that added friction without clear value since all automated checks passed.

### Patterns Established

- **OpenTUI row pattern**: `<box height={1} flexDirection="row" backgroundColor={focused ? "#333333" : undefined}>` with sibling `<text fg="color">` segments — never nest `<text>` inside `<text>`
- **SolidJS `<For>` reactivity**: use `const fn = () => expr` (function) not `const val = expr` (constant) for signal-dependent values inside `<For>` callbacks
- **Height-based tab visibility**: `height={tab() === X ? value : 0}` instead of `Switch/Match` for tabs — OpenTUI does not repaint when SolidJS swaps conditional DOM branches
- **IPC reactivity**: `new Map()` on every push (not mutate-in-place) — SolidJS requires reference change to trigger reactive updates
- **Bun.connect data handler**: write-only socket clients still require a `data()` no-op callback in the Bun socket API

### Key Lessons

1. **Document renderer constraints during research**: OpenTUI layout and rendering quirks (nested text, DOM swap repaint) are not in the library docs. Spike these in Phase Research, not during plan execution.
2. **Check requirements off as you go**: Phase 6 completed without updating REQUIREMENTS.md; caused confusion at milestone completion. Make requirement checkbox updates part of the plan execution gate.
3. **IPC on startup is fragile**: Always-unlink on startup is safer than probing with `Bun.connect` — the probe causes hangs when a stale socket file exists from a crash.
4. **SolidJS in a terminal renderer has subtleties**: The virtual DOM model doesn't fully apply when the underlying renderer only repaints on explicit layout changes. Test tab switching with multiple complete components before assuming it works.

### Cost Observations

- Model mix: primarily sonnet for execution, opus for planning (balanced profile)
- Sessions: 4-5 sessions across 2 days (2026-03-18 → 2026-03-20)
- Notable: Phase 8 required the most iterations (6 plans vs 1-3 for others) due to TUI renderer discovery

---

## Milestone: v0.4.0 — TUI Hardening & Polish

**Shipped:** 2026-03-21
**Phases:** 8 (Phases 10–15.2) | **Plans:** 21 | **Tasks:** 43

### What Was Built

- Headless TUI test infrastructure (`testRender` + `mockInput` + `captureCharFrame`) with `GIT_STACKS_CONFIG_DIR` isolation — 311 tests across 38 files
- InlineInput rewrite to built-in `<input>` wrapper with cursor movement; `runHooksCaptured()` for TUI-safe hook execution
- Workspace sync action with per-repo progress, 30s fetch timeout, and keyboard blocking
- Multi-step WizardView + CreateProgressView components powering workspace creation from Templates and Repos tabs
- Template creation from Repos tab, repo remove with blocked-reference detection, unified `>[x]` selection display
- Screen polish: width-tiered help bar, relative workspace ages, responsive column widths
- CenteredDialog overlay architecture for all 11 dialog types with three size variants
- Integration override cascade: per-template and per-workspace settings via CLI wizards, TUI detail pane display with source annotations

### What Worked

- **Single-day delivery**: 8 phases, 21 plans, 43 tasks executed in a single session — the GSD wave-based parallel execution maximized throughput
- **Component test infrastructure first**: Phase 10 establishing testRender before any feature work meant every subsequent phase had automated validation from the start
- **WizardView reusability**: The shared wizard component from Phase 13 was reused directly in Phase 14 (template create) — no rework or adaptation needed
- **CenteredDialog as late refinement**: Phase 15.1 wrapped all existing dialogs without modifying their internal logic — clean separation of layout from behavior
- **Parallel executor agents**: Wave 1 of Phase 15.2 ran two agents simultaneously (helper + dashboard display) — independent plans with no file conflicts

### What Was Inefficient

- **Bun mock.module cross-file contamination**: 4 test failures when running wizard-helpers.test.ts alongside workspace-wizard.test.ts. Root cause: bun caches mock.module globally and doesn't invalidate on re-registration. Required query-parameter cache-busting workaround (`import("path?unit-test")`)
- **ROADMAP.md progress table drift**: Phase 10 and 11 rows were missing the milestone column, requiring manual correction at milestone completion
- **Decimal phase plan checkbox tracking**: 15.2-02 checkbox not updated in ROADMAP.md despite SUMMARY.md existing — the `roadmap update-plan-progress` CLI doesn't handle all edge cases for inserted phases

### Patterns Established

- **Query-parameter cache-busting for bun mock.module**: `import("@/path?unit-test")` creates a separate module cache entry, bypassing stale mocks from other test files running in the same process
- **CenteredDialog three-tier sizing**: small (50%) for confirms/menus, medium (70%) for wizards/progress, large (90%) for help/messages — consistent visual hierarchy
- **Integration override cascade**: global → template → workspace with `promptIntegrationOverrides()` reusable helper; conditional YAML storage (no integrations key when user declines)
- **Deferred input focus**: `setTimeout(() => setFocused(true), 0)` prevents trigger keypress from leaking into newly mounted `<input>` fields

### Key Lessons

1. **Bun mock isolation is not test-file-scoped**: `mock.module` is process-global in bun. Tests that mock the same module must either use identical mock shapes or employ cache-busting. This is not documented and cost investigation time.
2. **Parallel agents need `--no-verify`**: Pre-commit hooks contend when multiple agents commit simultaneously. Post-wave hook validation is the correct pattern.
3. **testRender makes TUI refactoring safe**: The CenteredDialog migration (15.1) touched all 11 dialog types with zero regressions because every component had testRender-based assertions.

### Cost Observations

- Model mix: sonnet for execution, opus for orchestration (balanced profile)
- Sessions: 1 session, ~12 hours (2026-03-21 07:33 → 19:47)
- Notable: All 8 phases completed in a single session — the fastest milestone by wall-clock time

---

## Milestone: v0.6.0 — Integration Orchestration & Niri

**Shipped:** 2026-03-22
**Phases:** 5 (Phases 16–20) | **Plans:** 6 | **Tasks:** 11

### What Was Built

- Typed integration artifact pipeline with IntegrationArtifact discriminated union and ArtifactBag accumulator
- Centralized runner.ts replacing four inline integration loops with tier-based ordering
- Real artifact values from all four integrations (tmux session name, cmux workspace ref, vscode/intellij window PID)
- 8 typed niri IPC wrappers in src/lib/niri.ts with Zod validation and injectable test hooks
- Niri compositor integration plugin — tier-3 (order 30), named workspace creation, PID-based window moves, user-configurable commands array

### What Worked

- **Infrastructure-first phasing**: Phases 16-19 built the type system, runner, artifact values, and niri wrappers before Phase 20 composed them all — zero type-level rework
- **Pure infrastructure phase detection**: Phases 16-19 were correctly identified as infrastructure, skipping discuss and writing minimal context — significant time savings without quality loss
- **TDD throughout**: Every phase used RED-GREEN test commits; caught the `Bun.$` vs `Bun.spawn` PID issue during Phase 18 test writing, not in production
- **User decision integration**: The commands array approach (replacing hardcoded terminal spawn) came from smart discuss grey area questioning in Phase 20 — the right design emerged from the conversation

### What Was Inefficient

- **snapshotWindowIds built but unused**: Phase 19 implemented snapshot-diff window identification, but Phase 20 used simpler PID matching from ArtifactBag instead. The function is tested and available for future use but is dead code in v0.6.0
- **niriSpawn built but unused**: Same — user's commands array decision made the niri-specific spawn wrapper unnecessary
- **Stale IDE diagnostics**: TypeScript diagnostics fired after every executor commit but were always stale — the executor had already fixed the issues. Adds noise to the autonomous flow

### Patterns Established

- **Injectable `_exec` for shell wrapper testing**: Bun built-in modules can't be mocked via `mock.module`; mutable exported object is the workaround
- **Three-tier integration ordering**: 10-19 (tier 1: independent), 20-29 (tier 2: partial deps), 30+ (tier 3: window management)
- **ArtifactBag as Record<string, artifact | null>**: Simple key-value accumulator threaded through open() calls; downstream integrations read without mutation
- **Bun.spawn for PID capture**: `Bun.$` blocks until exit and provides no PID; `Bun.spawn` returns immediately with `.pid`

### Key Lessons

1. **Build infrastructure ahead but validate demand**: snapshotWindowIds and niriSpawn were correctly designed but lacked consumers. A lighter Phase 19 scope (skip snapshot-diff, add only when Phase 20 needs it) would have been more efficient.
2. **User decisions can simplify architecture**: The commands array approach was simpler than terminal spawn + config — listening to user intent reduced implementation complexity.
3. **PID matching beats snapshot-diff for known windows**: When the ArtifactBag already has PIDs from prior integrations, direct PID matching via listNiriWindows is simpler and more reliable than before/after window snapshots.

### Cost Observations

- Model mix: sonnet for research/execution/verification, opus for planning (balanced profile)
- Sessions: 1 session, autonomous mode for all 5 phases
- Notable: 5 phases, 6 plans, 11 tasks — fastest milestone by task count; autonomous mode required only 2 user interactions (research approval questions + Phase 20 grey area decisions)

---

## Milestone: v0.7.0 — Close Command & Polish

**Shipped:** 2026-03-22
**Phases:** 9 (Phases 21–28 + 24.1) | **Plans:** 20 | **Tasks:** 34

### What Was Built

- Workspace close command (`git-stacks close <name>`) with tmux/niri teardown and TUI action menu
- Cascading lifecycle phases: close → clean → remove → merge with 5 new hook pairs and `GS_TRIGGERED_BY` propagation
- Injectable `_exec` mock architecture in tmux/cmux/lifecycle + centralized `prompts` wrapper routing all 15 production files through tui/utils.ts
- Test mock hygiene: dead mock.module("@clack/prompts") eliminated from 7 files, explicit @/tui/utils mocks
- Git forge integrations: GitHub (`gh`), GitLab (`glab`), Gitea (`tea`) PR plugins with auto-detection at repo add/scan
- Issue & task tracking: `issue link/unlink/open` for GitHub/GitLab/Gitea + standalone Jira plugin with configurable `open_cmd`
- Shell completion for `new --from` and `close`; `--yaml` flags for direct YAML editing; `remove --force` resilience

### What Worked

- **Inserted phases handled cleanly**: Phase 24.1 (Test Mock Hygiene) was inserted as cleanup after Phase 24 shipped — decimal numbering kept context clear and ROADMAP.md tracking worked without issues
- **Quick task mechanism**: Hook env var rename (WS_ → GS_) was done as a quick task mid-milestone — fast, atomic, didn't disrupt phase sequencing
- **Forge → Issue layering**: Phase 27 (forges) was designed with Phase 28 (issue tracking) in mind — shared `_exec` pattern, resolveForgeRepo utility, and issue-utils module all composed cleanly
- **Test count scaling**: 438 → 727 tests (+289 across 9 phases) with zero regressions — the mock refactor (Phase 24) actually improved test reliability by eliminating mock.module() ordering dependencies
- **Autonomous execution**: All 9 phases ran in autonomous mode; user interaction limited to grey area decisions during discuss phases

### What Was Inefficient

- **Nyquist compliance gap**: 0/9 phases had compliant VALIDATION.md files — the audit flagged 4 missing and 5 drafts. The workflow's Nyquist validation step needs to be enforced during execution, not discovered at audit time
- **SUMMARY.md frontmatter empty `requirements_completed`**: Multiple summaries had empty arrays despite satisfying requirements — cosmetic but causes confusion during audit cross-referencing
- **v0.7.0 scope creep (positive)**: Originally scoped as 3 phases (close, display fix, test isolation), grew to 9 phases via promoted todos. Each addition was justified but the milestone name ("Close Command & Polish") undersells the scope

### Patterns Established

- **Centralized prompts wrapper**: `import { prompts as p } from "@/tui/utils"` — single mock target for all interactive prompts; tests mock `@/tui/utils` not `@clack/prompts`
- **Lifecycle cascade composition**: Higher-level commands compose lower-level functions (`removeWorkspace` → `_executeClean` → `_executeClose`) with triggeredBy propagation
- **Forge CLI pass-through**: `stdio: "inherit"` for interactive auth; no custom API clients — user's existing CLI auth works unchanged
- **Issue ID coercion**: `String(issueId)` normalizes GitHub integers and Jira alphanumeric keys to a uniform storage format
- **Configurable command template**: Jira `open_cmd` uses `sh -c` with `$ISSUE_ID` env var — no string interpolation, shell injection safe

### Key Lessons

1. **Mock architecture refactors pay compound interest**: The Phase 24 `_exec` pattern enabled fast, reliable tests for Phases 27 and 28 — each new integration module got instant test isolation without learning mock.module() quirks
2. **Lifecycle cascade needs early design**: Phase 25's cascade design (D-10 lifecycle order) was critical for correctness but complex — the 3-plan structure (close, clean/remove, merge) was the right decomposition
3. **Forge detection is better URL-agnostic**: Gitea's `tea pulls ls` success check works for any self-hosted domain; URL pattern matching would have high false-negative rates
4. **Enforce Nyquist during execution**: Waiting until audit time to discover validation gaps wastes context. The executor should generate VALIDATION.md as part of the plan completion gate.

### Cost Observations

- Model mix: sonnet for execution, opus for planning/orchestration (balanced profile)
- Sessions: 2-3 sessions on 2026-03-22 (~9 hours total)
- Notable: Largest milestone by plan count (20 plans, 34 tasks) — completed same day as v0.6.0. Test suite grew from 438 to 727 (+66%)

---

## Milestone: v0.8.0 — Integration Polish & Workspace UX

**Shipped:** 2026-03-24
**Phases:** 4 (Phases 29–32) | **Plans:** 6 | **Commits:** 35

### What Was Built

- Upstream worktree branch tracking with two-layer detection (local rev-parse + ls-remote fallback)
- Dashboard linked issues fix — workspace-only data, no global config leak
- CWD-based workspace auto-detection for all 4 tracker integrations (Jira, GitHub, GitLab, Gitea)
- GitLab branch slash investigation — confirmed glab CLI bug, documented workaround

### What Worked

- **Parallel worktree execution** for Phase 31 Plans 01 and 02 — both plans executed concurrently in separate worktrees, then merged. Saved ~30min of sequential execution.
- **Injectable `_deps` pattern** (from v0.7.0's `_exec`) extended to `_cwdDetect` and `_resolveWorkspaceDeps` — solved bun mock.module cross-file contamination that `beforeAll` re-application couldn't fix.
- **Investigation-only phase** (32) kept scope tight — no speculative code changes before confirming root cause.

### What Was Inefficient

- **Parallel worktree merge conflicts** required manual resolution — the worktree agent re-implemented functions that Plan 01 had already merged to main. The handoff didn't prevent this because worktrees branch from the point of creation.
- **Cross-file test contamination debugging** took ~20min to diagnose that cache-busted imports still resolve their internal dependencies to stale module cache entries. The fix (injectable deps) was fast once the root cause was clear.

### Patterns Established

- `_cwdDetect` / `_resolveWorkspaceDeps` injectable deps pattern for functions that depend on module-cached singletons
- `mock.module("@/lib/config", () => configMod)` is unreliable for deep dependency chains — prefer property injection
- Commander.js `[workspace-or-issue] [issue-id]` signature with `workspaceExists()` disambiguation for mixed optional positionals

### Key Lessons

- Parallel worktree agents are powerful but need merge planning — the HANDOFF.json correctly predicted the conflict files but couldn't prevent the re-implementation
- Pure investigation phases work well — Phase 32 took 15 minutes and avoided premature code changes

### Cost Observations

- Model mix: opus for orchestration/merge, sonnet for verification/integration check
- Sessions: 1 session for completion (~2 hours including merge conflict resolution and investigation)
- Notable: Test suite grew from 727 to 781 (+7%). Smallest milestone by plan count (6 plans) but largest merge complexity due to parallel execution.

---

## Milestone: v0.9.0 — Identity & Completion Integrity

**Shipped:** 2026-03-25
**Phases:** 5 (Phases 33–36 + 34.1) | **Plans:** 10 | **Tasks:** 18

### What Was Built

- Name-based identity: YAML `name` field is canonical for workspaces and templates; filename is storage only; scan-based lookup, rename cascade, doctor drift detection
- Template rename with workspace cascade and dry-run support
- Shell completion audit: recursive generators (bash/zsh/fish) for depth 3-4 integration commands with 26 DYNAMIC_COMPLETIONS entries
- Test isolation framework: custom test runner separating unit/integ modes, 7 mock factory helpers, zero cache-busting imports, DI hack removal
- Dynamic name completion: shell completion resolves names from YAML `name:` fields instead of filename globs
- Release prep: version bump to 0.9.0, CHANGELOG, README updates, TUI integration filter fix

### What Worked

- **Inserted phase (34.1) paid off immediately**: The test isolation framework eliminated 20 pre-existing test failures and removed all cache-busting import hacks — Phase 35 and 36 benefited from clean test infrastructure
- **Autonomous execution for final phases**: Phases 35 and 36 ran fully autonomously (discuss skipped, research skipped for release prep) — the right scope detection kept overhead minimal
- **Single-file phases**: Phases 35 (1 plan, 3 tasks) and 36 (1 plan, 2 tasks) were correctly scoped as small focused changes — no over-planning
- **Integration check thoroughness**: The milestone audit integration checker verified 12 cross-phase connections and 5 E2E flows — caught the IDEN-01/IDEN-02 tracking gap before it became an issue

### What Was Inefficient

- **45 pre-existing test failures remain**: workspace-ops.test.ts mock architecture was not fully migrated in Phase 34.1 — the scope was limited to eliminating cache-busting and DI hacks, not fixing all mock-related failures
- **SUMMARY frontmatter tracking gap**: IDEN-01 and IDEN-02 not explicitly claimed in Phase 33 SUMMARY `requirements-completed` field — the code was verified correct but the planning artifact omitted the claim
- **Research skipped for Phase 35**: While correct (it was a simple grep-based change), the Nyquist VALIDATION.md was also skipped — creating a gap in the validation chain

### Patterns Established

- **scan-based lookup for YAML identity**: `findWorkspaceFile()` / `findTemplateFile()` pattern — read all *.yml, match on `name` field, return first match
- **Mock factory helpers**: `makeConfigMock()`, `makeWorkspaceOpsMock()`, etc. — complete export coverage eliminates partial-mock contamination
- **Custom test runner with auto-classification**: `fileUsesMockModule()` content scan routes files to shared or isolated processes automatically
- **Template rename cascade**: `renameTemplate()` updates all workspace YAML references atomically

### Key Lessons

1. **Test infrastructure is force-multiplier work**: Phase 34.1 (inserted urgently) eliminated the most persistent testing problem in the project — mock.module contamination. Every subsequent phase benefited.
2. **Name-based identity simplifies completion**: Once config.ts scans by name field, completion generators can use the same `grep '^name:'` approach — the identity model and completion model are aligned.
3. **Release prep phases are predictable**: Version bump + CHANGELOG + README is pure bookkeeping — skip research, skip discuss, plan and execute in one pass.

### Cost Observations

- Model mix: opus for planning, sonnet for execution/verification (balanced profile)
- Sessions: 1 session, autonomous mode for phases 35-36
- Notable: 70 commits, 88 files changed, +9505/-504 lines. Test suite at 814 (from 781).

---

## Milestone: v0.10.0 — Multi-Agent Workspace Tooling

**Shipped:** 2026-03-28
**Phases:** 6 (Phases 37–42) | **Plans:** 9 | **Tasks:** 21

### What Was Built

- `git-stacks paths` command with `--prefix`/`--filter` flags for agent CLI path injection
- `git-stacks pull` with `--ff-only`, dirty skip, fetch dedup by `main_path`, and CWD autodetection
- Per-repo "N behind" staleness badges in dashboard with 5-minute TTL cache and `r`-key force refresh
- Template composition via `includes:` field and repeatable `--template` flag on `git-stacks new`
- v0.10.0 release prep (version bump, CHANGELOG, README with agent CLI injection examples)
- Security hardening (v0.10.1): NameSchema input validation, atomic writeYaml, env_file boundary check, doctor structured fixes, tmux/niri shell quoting, deterministic snapshot tests

### What Worked

- **Phase sequencing was clean**: Phases 37-40 built progressively (paths → pull → staleness → composition) with no rework — each phase had stable dependencies from the prior one
- **Post-release audit phase**: Phase 42 (code review findings) as a separate phase after release kept the release clean while addressing all 7 audit findings systematically
- **Quick task mechanism**: The concurrency limiter for useStaleness was done as a quick task between phases — fast, atomic, didn't delay phase sequencing
- **Single-plan phases**: Phases 37, 38, 39, and 41 were correctly scoped as single-plan phases — no over-planning for focused features
- **Milestone audit before completion**: The v0.10.0 audit confirmed 25/25 requirements satisfied, catching documentation gaps (unchecked PATH boxes, pending traceability entries) without blocking completion

### What Was Inefficient

- **REQUIREMENTS.md checkbox maintenance**: PATH-01 through PATH-04 checkboxes were never ticked despite the features being shipped and verified. Same issue as v0.3.0 — the lesson about checking off requirements as you go was not consistently applied
- **Traceability table drift**: COMP-01 through COMP-07 remained "Pending" in traceability despite being checked off in the requirements section — two tracking surfaces that diverged
- **Phase 42 not in original scope**: The roadmap header said "Phases 37-41" but Phase 42 was added post-release. This is normal scope evolution but required header correction at archive time

### Patterns Established

- **`shellQuote()` for path interpolation**: POSIX single-quote escaping defined inline in tmux.ts and niri.ts for all shell command construction
- **NameSchema at Zod level**: Input validation in the schema itself prevents bad names from ever entering the system — no separate validation step needed
- **Atomic writeYaml**: temp-file + renameSync pattern for all YAML config writes
- **FixOperation discriminated union**: doctor --fix actions as typed operations executed via Bun APIs, not shell strings

### Key Lessons

1. **Requirements checkbox maintenance remains a gap**: Third milestone (v0.3.0, v0.8.0, v0.10.0) where requirement checkboxes weren't updated during execution. Consider automating this in the plan completion gate or removing the checkbox layer entirely in favor of the traceability table.
2. **Post-release audit phases work well**: Shipping first, then addressing audit findings in a dedicated phase keeps velocity high while ensuring quality. The v0.10.1 patch release model (ship features → audit → patch) is a good pattern.
3. **Concurrency limiter as quick task was correct**: The useStaleness race condition was a real bug found during Phase 39 testing — fixing it as a quick task rather than a phase avoided scope creep while solving the problem immediately.

### Cost Observations

- Model mix: opus for planning/orchestration, sonnet for execution (balanced profile)
- Sessions: 3-4 sessions across 3 days (2026-03-26 → 2026-03-28)
- Notable: 259 files changed, +12,157 / -1,610 lines. Test suite stability maintained throughout.

---

## Milestone: v0.11.0 — AeroSpace Window Management

**Shipped:** 2026-03-28
**Phases:** 4 (Phases 43–46) | **Plans:** 7 | **Tasks:** ~12

### What Was Built

- Typed async AeroSpace CLI wrappers with `--format` TSV parsing and injectable `_exec`
- Tier-3 AeroSpace integration plugin with snapshot-delta window detection and workspace targeting
- Normalization-aware layout control, flatten_before_open, workspace focus switching
- App launching via `commands` array with source/app/command entries and snapshot-delta detection
- Doctor binary check for `aerospace` (macOS-gated)

### What Worked

- **Followed niri pattern exactly**: The AeroSpace integration reused the same `_exec` injectable, tier-3 ordering, and ArtifactBag consumption patterns established in v0.6.0 — near-zero design decisions needed
- **v0.11.1 patch handled cleanly**: OpenTUI dependency pinning and git credential suppression were quick fixes shipped as a patch release — no milestone disruption

### What Was Inefficient

- **snapshotWindowIds complexity**: The TSV parsing and filtering logic is more complex than needed for the current use cases — simpler PID-based matching would have sufficed for most scenarios
- **Two-day turnaround**: v0.11.0 and v0.11.1 shipped on the same day (2026-03-28) — the v0.11.1 patch could have been folded into v0.11.0 if OpenTUI pinning had been caught during testing

### Patterns Established

- **Snapshot-delta for window detection**: `snapshotWindowIds()` before/after pattern for detecting newly launched windows — reusable across all tiling WM integrations
- **`_exec` injectable for CLI wrappers**: Same pattern as niri.ts, tmux.ts, cmux.ts — consistent test isolation across all shell-wrapper modules

### Key Lessons

1. **Platform-gated integrations work well**: `applies()` returning false on non-macOS prevents AeroSpace from interfering on Linux — clean skip without error
2. **Pin dependencies proactively**: The OpenTUI version drift that required v0.11.1 could have been caught by pinning earlier

### Cost Observations

- Model mix: opus for planning, sonnet for execution (balanced profile)
- Sessions: 1-2 sessions on 2026-03-28
- Notable: Fastest 4-phase milestone — leveraged established patterns from niri integration

---

## Milestone: v0.12.0 — Multi-Workspace AeroSpace, Integration Tools & Port Allocation

**Shipped:** 2026-04-02
**Phases:** 7 (Phases 47–51, 50.1, 52) | **Plans:** 14 | **Tasks:** ~16

### What Was Built

- Multi-workspace AeroSpace config (BREAKING) — `workspaces` array replaces flat `workspace:` field
- Per-entry layout, normalization, flatten, focus, commands with focus/duplicate validation
- Cross-entry snapshot isolation via shared `beforeSet`; upfront `listWorkspaces()` validation
- Integration CLI tools: `integration list`, `config example`, `config show`, `aerospace focus`, `vscode open`
- Convention-based completion inference — 46-entry `DYNAMIC_COMPLETIONS` → 5-key map
- Integration ID completion type and multi-position argument dispatch
- Workspace port allocation with named ports, contiguous range allocation, race-safe lockfile, env injection

### What Worked

- **Breaking change handled cleanly**: Array-only schema with no backward compat was the right call — no shim code, tests updated in batch
- **Phase 50.1 as inserted phase**: Convention-based completion naturally followed Phase 50's integration commands — inserting it immediately after kept the completion system coherent
- **Port allocation design**: First-fit on sorted ranges with lockfile was simple and correct — no over-engineering
- **Quick task for release prep**: Phase 52's work was small enough to handle as a quick task (260402-6c0) — avoided the overhead of full GSD phase machinery for a CHANGELOG/README update
- **40+ test updates in Phase 48**: Batch-updating all existing AeroSpace tests to the new array format was done in one plan — no incremental migration

### What Was Inefficient

- **Requirements doc scoped too narrowly**: REQUIREMENTS.md only covered Phases 47-49 (original scope). Phases 50, 50.1, and 51 had requirements defined inline in ROADMAP.md but not in REQUIREMENTS.md — the traceability table was incomplete
- **Phase 52 not formally planned**: Release prep for Phases 50-51 was done as a quick task rather than executing the planned Phase 52 — the ROADMAP shows 0/1 plans for Phase 52 despite the work being done
- **SUMMARY.md quality for Phase 51**: Some summaries had malformed one-liner fields, causing poor milestone archive extraction

### Patterns Established

- **`configExample` on Integration interface**: Optional property for YAML snippet display — populated only for integrations with non-trivial config
- **Convention-based completion inference**: `NAME_TO_COMPLETION_TYPE` map derives completion types from Commander.js argument names — argument naming IS the completion spec
- **Port allocation via workspace YAML**: No separate registry — workspace YAML is sole source of truth; removal implicitly frees ports
- **Atomic writeYaml with fsync**: Write-to-tmp, fsync, rename — all config writes across the codebase

### Key Lessons

1. **Scope REQUIREMENTS.md for the full milestone, not just initial phases**: When phases are added mid-milestone (50, 50.1, 51), their requirements should be added to REQUIREMENTS.md for traceability
2. **Quick tasks work well for small release prep**: Phase 52 was overkill for a CHANGELOG/README update — quick task was the right tool
3. **Convention-over-configuration extends to completions**: Naming arguments `<workspace>` instead of `<name>` is both better UX and auto-generates completions — one change, two benefits
4. **Port allocation needs no daemon**: Scan-on-open with lockfile is simpler than a persistent allocator service and handles concurrent access correctly

### Cost Observations

- Model mix: opus for planning, sonnet for execution (balanced profile)
- Sessions: 3-4 sessions across 4 days (2026-03-29 → 2026-04-02)
- Notable: 72 files changed, +10,091 / -465 lines. Largest feature set in a single milestone (breaking change + 3 independent features).

---

## Milestone: v0.13.0 — CLI Polish & Completions

**Shipped:** 2026-04-02
**Phases:** 5 (Phases 53–57) | **Plans:** 9 | **Commits:** ~35

### What Was Built

- Shell completion arity enforcement — bash/zsh/fish stop completing after positional args filled
- Enum auto-detection from Commander `.choices()` — option values tab-complete without manual tables
- `git-stacks env [workspace]` — inspect merged env vars in table/shell/dotenv/json formats
- Copilot hook support — `--copilot`/`--claude` flags on `install --hooks` with interactive chooser
- Doctor forge CLI checks — config-gated binary availability warnings for gh/glab/tea/jira
- Tmux configExample updated with practical 3-pane dev layout

### What Worked

- **Requirements scoped upfront**: Unlike v0.12.0, all 14 requirements (COMP/CMD/HOOK/DOC/CFG/REL) were in REQUIREMENTS.md from the start — traceability was complete at audit time
- **Parallel independent phases**: Phases 54/55/56 all depended on 53 but not each other — clean parallel execution potential
- **Plugin architecture for agent hooks**: Extending `install --hooks` to support Copilot was a straightforward plugin addition (`AgentHookPlugin` interface) rather than a rewrite
- **Auto-detection patterns compound**: `OptionInfo.enumValues` from Phase 53 immediately benefited Phase 54's `--format` option — new commands get completions for free
- **Single-session execution**: Entire milestone (all 5 phases + release prep) executed in one autonomous session with zero rework

### What Was Inefficient

- **SUMMARY frontmatter gaps**: Phase 55 (Copilot hooks) had two SUMMARYs with empty `requirements-completed` frontmatter — caused "partial" status in 3-source cross-reference during audit, requiring manual verification that requirements were actually satisfied
- **COMP-02 stale in REQUIREMENTS.md**: Checkbox showed "Pending" despite being verified as satisfied — the `phase complete` tooling doesn't always update the REQUIREMENTS.md traceability status

### Patterns Established

- **`resolveEnabledGlobally` for conditional checks**: Doctor uses the integration system's own config resolver to gate checks — no separate "is configured" detection needed
- **`AgentHookPlugin` interface**: Standardized install/remove/detect pattern for hook-installing plugins — adding a new hook system is a single file + registry addition
- **Boolean-flag completion fallback**: Commands with no dynamic positional args still get `--flag` completions via the boolean-only case in the completion generator

### Key Lessons

1. **SUMMARY frontmatter must list requirements**: When a plan satisfies requirements, the SUMMARY `requirements-completed` field must list them — otherwise the 3-source audit cross-reference flags false partials
2. **Release prep as a formal phase works well**: Phase 57 ensured CHANGELOG/README/version were all verified together with the same GSD machinery — no manual steps forgotten
3. **Small milestones ship fast**: 5 phases / 9 plans is a sweet spot for a polish milestone — one session, zero context rot

### Cost Observations

- Model mix: opus for orchestration, sonnet for execution and verification (balanced profile)
- Sessions: 1 autonomous session
- Notable: 14 files changed, +1,181 / -143 lines. Smallest delta in a milestone — polish work is efficient.

---

## Milestone: v0.14.0 — Workflow Completion & Workspace UX

**Shipped:** 2026-04-03
**Phases:** 6 (Phases 58–63) | **Plans:** 18

### What Was Built

- Ahead/behind tracking flowing from git primitives through status, list, and TUI dashboard
- Multi-repo push with upstream setup, JSON/text output, and dashboard progress
- Workspace label system with CLI CRUD, filtering, and dashboard grouping
- Pluggable secret resolution (`${{ resolver:path }}`) with keychain/env/cmd resolvers
- Stash-on-sync for dirty worktrees with reverse restore and explicit recovery output
- v0.14.0 release prep with passing milestone audit

### What Worked

- **Six feature phases in one day** — coarse granularity (3-4 plans per phase) kept context switching minimal
- **Milestone audit before release** — caught requirement coverage gaps early
- **Secret resolution design** — pluggable resolver pattern kept the core simple while supporting three backends

### What Was Inefficient

- **Release prep phase executed before code phases settled** — Phase 68 (release prep) for v0.15.0 ran and accidentally deleted planning artifacts from completed phases 65-67 in a combined commit

### Patterns Established

- **Resolver registry pattern** — `RESOLVER_REGISTRY` with `resolve(path)` interface for extensible secret backends
- **Stash/pop lifecycle** — automatic stash before sync with reverse-order pop and explicit recovery path on failure

### Key Lessons

1. **Release prep commits must not mix code and planning cleanup** — the version bump commit should be code-only; planning artifact cleanup is a separate concern
2. **Worktree executor merges need artifact verification** — after merging executor worktrees, verify planning artifacts survived the merge

### Cost Observations

- Model mix: opus for orchestration, sonnet/haiku for execution (balanced profile)
- Sessions: 1 primary session
- Notable: 104 files changed, +14,142 / -1,248 lines. Largest feature delta since v0.7.0.

---

## Milestone: v0.15.0 — Dir Mode & Polish

**Shipped:** 2026-04-05
**Phases:** 5 (Phases 64–68) | **Plans:** 7

### What Was Built

- Dir repo type (`type: "dir"`) in Zod schemas with backward-compatible `is_dir` boolean default
- Registry CLI support — `repo add`/`repo scan` detect and register non-git directories
- Workspace lifecycle guards — dir repos skip worktree creation/removal, no git errors
- Git operation guards — push/pull/sync/merge/ahead-behind/dirty silently skip dir repos
- CLI status [dir] label, `--fetch` guard, doctor `findInvalidDirRepos` health checks
- TUI dashboard [dir] label, dir count, missing-dir detection

### What Worked

- **Minimal code surface** — 236 insertions, 86 deletions across 7 source files. The dir mode feature was cleanly isolated to mode-filtering guards
- **Phase 64 as single dependency** — schema foundation enabled parallel work on lifecycle (65) and git guards (66)
- **Test-driven approach** — six dedicated GIT-0x guard tests and TUI component tests caught edge cases early

### What Was Inefficient

- **Planning artifact loss** — Phase 68 (release prep) executor accidentally deleted all phase 65-67 directories in the version bump commit, requiring git-history restoration during milestone completion
- **ROADMAP/REQUIREMENTS staleness** — neither file was updated after phase execution, requiring bulk correction at milestone time

### Patterns Established

- **Mode-filter guards** — `repos.filter(r => r.mode !== 'dir')` before git operations, with dir repos added to `skipped` result array
- **Separate health check functions** — `findInvalidDirRepos` validates dir-specific concerns (path exists, is directory) independently from git health checks

### Key Lessons

1. **Executor worktree merges must preserve planning artifacts** — the combined code+cleanup commit pattern is dangerous; keep them separate
2. **ROADMAP completion status must be updated per-phase, not deferred to milestone** — stale status creates confusion during milestone completion
3. **Dir mode was well-scoped** — 18 requirements across 5 phases with clear dependency structure shipped cleanly in 2 days

### Cost Observations

- Model mix: opus for orchestration, sonnet for execution (balanced profile)
- Sessions: 2 sessions across 2 days
- Notable: 7 source files changed, +236/-86 lines. Smallest feature delta — the dir mode concept maps cleanly to filtering guards.

---

## Milestone: v0.19.0-rc.1 — Operator Control Center

**Prepared:** 2026-05-17
**Phases:** 5 (Phases 95-99) | **Plans:** 15

### What Was Built

- Manual workspace commands for explicit operator-triggered actions.
- Workspace notes stored outside managed project repositories.
- TUI file-status model and lazy dashboard loading for copy, symlink, and sync mappings.
- Denser grounded dashboard layout with grouping, ordered detail sections, notes summaries, file-status summaries, and contextual footers.
- Dashboard action polish for repo edit, linked issue opening, visible manual command execution, disabled states, picker routing, and failure persistence.

### What Worked

- The explicit rollback-progress exclusion kept Phase 99 focused and prevented older `DASH-01` text from expanding the scope.
- Reusing source helpers such as `listManualCommands()`, `runManualCommand()`, and the file-status model kept dashboard behavior aligned with CLI behavior.
- Focused component/integration tests were enough to validate menu behavior without adding broad TUI churn.

### What Was Inefficient

- Manager and roadmap tooling still surfaced stale older milestone recommendations, so live roadmap/state validation remained necessary.
- Bun module-cache interactions required separating some dashboard test files into distinct `bun test` invocations.
- The release-candidate closeout reused a final-release milestone archive path, requiring manual RC wording corrections.

### Patterns Established

- RC closeout should keep package version, changelog entry, and tag name aligned before verification.
- Dashboard actions should stay grouped, visible, disabled with reasons, and route failures through the generic progress view until keypress.
- Backlog exclusions should be backed by negative tests when older roadmap text could pull scope back in.

### Key Lessons

1. Treat explicit user scope overrides as stronger than stale roadmap requirements and make them visible in context, verification, and tests.
2. Keep action-menu additions source-helper-backed; avoid new subprocess command surfaces when existing source behavior is testable.
3. RC archive tooling needs a first-class prerelease mode so generated milestone language does not imply final release.

### Cost Observations

- Model mix: manager plus executor/security agents under the repo's balanced profile.
- Sessions: one manager-driven closeout session.
- Notable: Phase 99 security verification closed 12/12 plan-time threats, including the accepted manual-command risk.

---

## Cross-Milestone Trends

| Milestone | Phases | Plans | Days | Rework Plans |
|-----------|--------|-------|------|--------------|
| v0.2.0 Foundation | 7 | 21 | ~7 | ~3 |
| v0.3.0 Dashboard UI Overhaul | 4 | 13 | 2 | 2 |
| v0.4.0 TUI Hardening & Polish | 8 | 21 | 1 | 0 |
| v0.6.0 Integration & Niri | 5 | 6 | 1 | 0 |
| v0.7.0 Close Command & Polish | 9 | 20 | 1 | 0 |
| v0.8.0 Integration Polish | 4 | 6 | 1 | 0 |
| v0.9.0 Identity & Completion | 5 | 10 | 1 | 0 |
| v0.10.0 Multi-Agent Workspace | 6 | 9 | 3 | 0 |
| v0.11.0 AeroSpace Window Mgmt | 4 | 7 | 1 | 0 |
| v0.12.0 Multi-WS AeroSpace + Ports | 7 | 14 | 4 | 0 |
| v0.13.0 CLI Polish & Completions | 5 | 9 | 1 | 0 |
| v0.14.0 Workflow Completion | 6 | 18 | 1 | 0 |
| v0.15.0 Dir Mode & Polish | 5 | 7 | 2 | 0 |

**Trend:** Zero-rework streak continues (11 milestones). 13 milestones shipped in 19 days (2026-03-18 → 2026-04-05). v0.15.0 had the smallest source delta (+236/-86 lines) — dir mode maps cleanly to mode-filtering guards. Planning artifact loss from executor worktree merges is a new operational risk (hit in v0.15.0, diagnosed and restored). Codebase at ~16,445 LOC TypeScript.
