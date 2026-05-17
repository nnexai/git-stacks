# Milestones

## v0.19.0-rc.1 Operator Control Center (Release Candidate: 2026-05-17)

**Phases completed:** 5 phases, 15 plans, 22 tasks

**Key accomplishments:**

- Workspace notes storage now uses config-root JSONL files with fail-closed corruption handling and a reusable count/latest summary helper.
- `git-stacks notes` now supports add/list/clear with deterministic workspace resolution, newest-first display, and guarded clear semantics over the JSONL note store.
- Grouped workspace/repo file-status model with TUI severity, detail buckets, and CLI parity tests over the existing files status behavior
- Lazy dashboard file-status hook that loads the grouped model for one selected workspace and returns explicit dashboard state
- Typed workspace grouping and focused row/list snapshots for the grounded dashboard list surface
- Scrollable operational workspace detail with notes and Phase 97 file-status data
- Contextual dashboard footer and terminal snapshots for the Phase 98 acceptance matrix
- Repos tab registry editing via `Edit ($EDITOR)` with stable existing shortcuts and dashboard reload after editor exit
- Workspace `Issue...` action with disabled state, direct single-issue opening, multi-tracker picker, and persistent progress output
- Workspace `Commands...` action with visible-command picker, `runManualCommand()` execution, and persistent failure output
- Focused regression tests for grouped action rows, failure persistence, and explicit non-implementation of rollback progress rows

**Release candidate boundary:**

- Package metadata and tag target are `0.19.0-rc.1` / `v0.19.0-rc.1`; final `0.19.0` tagging remains separate after RC validation.
- Dashboard rollback progress visibility remains deferred as backlog work and was explicitly excluded from Phase 99.
- Known deferred artifacts at close: 6 acknowledged open items, recorded in `.planning/STATE.md`.

**Archive:** [.planning/milestones/v0.19.0-ROADMAP.md](.planning/milestones/v0.19.0-ROADMAP.md)

---

## v0.17.1 Functional Confidence Coverage (Shipped: 2026-05-15)

**Phases completed:** 13 phases, 35 plans, 35 requirements

**Key accomplishments:**

- Common workspace flows are now verified through local end-to-end automation: create, clone, list, status, open, close, clean, remove, rename, merge, pull, sync, push, run, paths, env, labels, messages, templates, and repo registry commands.
- Safety-sensitive paths were hardened, including `clean --gone --dry-run`, destructive workspace command dry-runs, dirty-worktree guards, missing-path handling, and non-interactive prompt boundaries.
- `run --json` now has a clear contract: JSON output is supported with `--parallel --json`, while the unsupported non-parallel form is rejected instead of ignored.
- Workspace lifecycle hooks, env injection, cwd/path handling, branch starts, and generated workspace files are now covered against disposable local repositories and isolated config homes.
- Forge, issue, session, IDE, and window-manager integrations have contract coverage for command construction and safe failures without requiring live external services or desktop environments.
- The milestone audit passed with 35/35 requirements complete and no open debug, quick-task, todo, UAT, verification, or context-question artifacts.

**Accepted gaps:**

- Broad TUI rendering, dashboard rollback visibility, live forge services, and real browser/window-manager/IDE launches remain deferred to later dedicated work.
- Completion and command error coverage uses stable representative checks rather than brittle full-output or every-combination snapshots.

**Archive:** [.planning/milestones/v0.17.1-ROADMAP.md](.planning/milestones/v0.17.1-ROADMAP.md)

---

## v0.16.0 Core Engine & Observability (Shipped: 2026-04-05)

**Phases completed:** 5 phases (69-73), 9 plans
**Timeline:** 2026-04-05 → 2026-04-05 (1 day)
**Stats:** 56 files changed, +3,391 / -1,626 lines (source only), 53 commits since v0.15.0

**Key accomplishments:**

- **Stable core-engine split** — `workspace-ops.ts` was decomposed into `workspace-env.ts`, `workspace-lifecycle.ts`, `workspace-status.ts`, `workspace-git.ts`, and `workspace-yaml.ts` without breaking the public CLI surface
- **Status and git boundaries** — status queries, CWD detection, sync/push/pull flows, and YAML editing now live in focused modules with direct runtime imports instead of monolithic facades
- **Stderr-only observability** — `GIT_STACKS_DEBUG=1` emits labeled timing/debug lines like `[workspace-status] getWorkspaceListInfo: 12ms` without polluting human-readable stdout or `--json` output
- **TUI-safe debug behavior** — `git-stacks manage` explicitly silences debug output before the alternate-screen dashboard starts; smoke run confirmed zero stderr bytes under debug mode
- **Focused extraction verification** — direct `workspace-env`, `workspace-status`, and `workspace-git` tests now cover the extracted seams without real repo fixtures
- **Dependency gate** — `bun run test:deps` uses `madge` to enforce a cycle-free import graph, and the dashboard IPC state was split out to remove live cycles

**Archive:** [.planning/milestones/v0.16.0-ROADMAP.md](.planning/milestones/v0.16.0-ROADMAP.md)

---

## v0.15.0 Dir Mode & Polish (Shipped: 2026-04-05)

**Phases completed:** 5 phases (64-68), 7 plans
**Timeline:** 2026-04-04 → 2026-04-05 (2 days)
**Stats:** 7 files changed, +236 / -86 lines (source only), 16,445 LOC total

**Key accomplishments:**

- **Dir repo type** — `type: "dir"` in Zod schemas with `is_dir` boolean defaulting to false for backward compatibility; `mode: "dir"` in workspace repos with `main_path` only (no `task_path`, no branch)
- **Registry CLI support** — `repo add` and `repo scan` detect and register non-git directories; `repo list`/`show` display dir repos correctly
- **Workspace lifecycle guards** — dir repos skip worktree creation/removal; open/close/clean/remove handle dir repos without git errors
- **Git operation guards** — push/pull/sync/merge/ahead-behind/dirty silently skip dir repos in mixed workspaces
- **CLI status & doctor** — [dir] label in status output, `--fetch` skips dir repos, `findInvalidDirRepos` validates directory existence and type
- **TUI dashboard** — [dir] label in WorkspaceDetail, dir count in WorkspaceRow, missing-dir detection in hasMissing

**Archive:** [.planning/milestones/v0.15.0-ROADMAP.md](.planning/milestones/v0.15.0-ROADMAP.md)

---

## v0.14.0 Workflow Completion & Workspace UX (Shipped: 2026-04-03)

**Phases completed:** 6 phases, 18 plans, 33 requirements
**Timeline:** 2026-04-03 → 2026-04-03 (1 day)
**Stats:** 104 files changed, +14,142 / -1,248 lines, 52 commits since v0.13.0

**Key accomplishments:**

- Ahead/behind tracking now flows from git primitives into workspace status, `list`/`status`, and dashboard row/detail surfaces with stale-awareness
- `git-stacks push` ships with parallel multi-repo push orchestration, JSON/text output, and matching dashboard push progress
- Labels now work end-to-end across schemas, CLI CRUD/filter/create flows, and dashboard grouping/filtering
- Secrets resolve at runtime for `open` and `env` without persisting plaintext to workspace YAML
- `git-stacks sync --stash` safely handles dirty worktrees with reverse restore and explicit recovery output
- v0.14.0 docs/version/changelog were closed out and archived with a passing milestone audit

**Archive:** [.planning/milestones/v0.14.0-ROADMAP.md](.planning/milestones/v0.14.0-ROADMAP.md)

---

## v0.13.0 CLI Polish & Completions (Shipped: 2026-04-02)

**Phases completed:** 5 phases, 9 plans, 23 tasks

**Key accomplishments:**

- Auto-detect Commander `.choices()` enum values into OptionInfo and emit per-command bash/zsh/fish completions, replacing manual OPTION_ENUMS entries for `--sort`, `--strategy`, and `--filter`
- Eliminated cross-command option enum leakage by scoping bash/fish enum completions to per-command dispatch blocks, removing the global OPTION_ENUMS `case "$prev"` pattern
- Bash/zsh/fish completions now enforce positional arg arity: single-arg commands stop offering workspace/repo/template names once the argument slot is filled, using COMP_CWORD, _arguments positional specs, and commandline -opc count checks respectively
- Env formatting library with table/shell/dotenv/json output plus CWD-based repo detection for `git-stacks env` command
- One-liner:
- One-liner:
- --copilot/--claude flags on install --hooks bypass interactive multi-select and install named hook sets directly; completion generator fixed to emit boolean flags for commands without dynamic args
- Forge CLI doctor checks gated by integration config (resolveEnabledGlobally), and tmux configExample updated with 3-pane dev layout showing editor, test runner, and dev server
- v0.13.0 release: version bump, CHANGELOG with Phases 53-56 features, and README docs for env command and Copilot hooks

---

## v0.12.0 Multi-Workspace AeroSpace, Integration Tools & Port Allocation (Shipped: 2026-04-02)

**Phases completed:** 7 phases (47-51, 50.1, 52), 14 plans, ~52 commits
**Timeline:** 2026-03-29 → 2026-04-02 (4 days)
**Stats:** 72 files changed, +10,091 / -465 lines

**Key accomplishments:**

- **Multi-workspace AeroSpace config** (BREAKING) — `workspaces` array replaces flat `workspace:` field; per-entry layout, normalization, flatten, focus, and commands; focus/duplicate validation; cross-entry snapshot isolation via shared `beforeSet`
- **Integration CLI tools** — `integration list`, `config example`, `config show`, `aerospace focus <workspace>`, `vscode open <workspace>`; `configExample` property on Integration interface
- **Convention-based dynamic completion** — 46-entry `DYNAMIC_COMPLETIONS` replaced with 5-key `NAME_TO_COMPLETION_TYPE` inference map; integration ID and multi-arg position support across bash/zsh/fish
- **Workspace port allocation** — named port declarations (`ports: { PORT: ~ }`), contiguous range allocation on open, atomic writeYaml with fsync, race-safe lockfile, env injection via `mergeEnv()`
- **Argument naming convention** — Commander.js positional args renamed across all command files to match completion inference (`<workspace>`, `<repo>`, `<template>`)

---

## v0.11.0 AeroSpace Window Management (Shipped: 2026-03-29)

**Phases completed:** 4 phases, 7 plans

**Key accomplishments:**

- Typed async AeroSpace CLI wrappers in `src/lib/aerospace.ts` with `--format` TSV parsing, injectable `_exec` for test isolation, and `snapshotWindowIds()` for snapshot-delta window detection
- Tier-3 AeroSpace integration plugin (order 31) in `src/lib/integrations/aerospace.ts` with snapshot-delta window detection, `move-node-to-workspace` targeting, `list-workspaces` validation, and no-op cleanup
- Normalization-aware layout control: `flatten-workspace-tree` + `layout` commands, `flatten_before_open` container reset, workspace-level `focus` switching
- App launching via `commands` array with `source`/`app`/`command` entries, per-command `cwd`/`repo`/`args`/`focus`, and snapshot-delta detection for launched windows
- Doctor binary availability check for `aerospace` on macOS (warn-level, silent skip on Linux)
- v0.11.1 patch: pinned @opentui/core and @opentui/solid to 0.1.87; suppressed git credential prompts in TUI-reachable network commands

---

## v0.10.0 Multi-Agent Workspace Tooling (Shipped: 2026-03-28)

**Phases completed:** 6 phases, 9 plans, 21 tasks

**Key accomplishments:**

- `git-stacks paths` command with --prefix/--filter flags for agent CLI path injection (e.g., `claude --add-dir $(git-stacks paths myws --prefix "--add-dir")`)
- `git-stacks pull` command with --ff-only, dirty skip, fetch dedup by main_path, and CWD autodetection
- Per-repo "N behind" badges in dashboard workspace detail with 5-minute TTL cache, cursor-triggered fetch, and r-key force refresh
- TemplateSchema extended with `includes` field; `composeTemplates()` merges repos (union, worktree wins), hooks (concatenated), env (last-wins), files, and integrations across templates
- Repeatable --template flag on git-stacks new for ad-hoc composition; all wizard paths auto-resolve template includes
- v0.10.0 release preparation: version bump to 0.10.0, CHANGELOG entry for four features (paths, pull, TUI staleness, template composition), and README documentation with agent CLI injection examples
- NameSchema (Zod regex) blocks path traversal and shell metacharacters; writeYaml atomicity via temp-file+rename; CLI validateName() guards and env_file repo-root boundary checking
- doctor --fix uses FixOperation discriminated union with direct Bun API execution (rmSync/spawnSync); tmux and niri quote all interpolated cwd paths with POSIX shellQuote
- WorkspaceRow snapshot tests now freeze Date.now at 70 days past the fixture date, producing deterministic "70d" output; CLAUDE.md corrected to `bun run test` with mock pollution warning

---

## v0.9.0 Identity & Completion Integrity (Shipped: 2026-03-25)

**Phases completed:** 5 phases, 10 plans, 18 tasks

**Key accomplishments:**

- scan-based lookup in `src/lib/config.ts`:
- renameTemplate() in workspace-ops with cascade to workspace YAMLs, dry-run support, and --dry-run flag on `git-stacks template rename`
- Recursive shell completion generators (bash/zsh/fish) for depth 3-4 integration commands with 26 DYNAMIC_COMPLETIONS entries
- Subprocess-based audit tests proving all CLI commands have shell completion coverage across bash/zsh/fish, with documented audit table
- Custom test runner separating unit/integ execution modes, plus 7 complete mock factory helpers covering all exports of config, workspace-ops, forge-utils, issue-utils, paths, lifecycle, and tmux
- Replaced all partial mock.module calls across 14 test files with factory-based complete mocks, eliminating all 20 test failures when running `bun test tests/` (full suite: 814 pass, 0 fail)
- Removed all 23 cache-busting query-string imports from tests/, deleted `_cwdDetect` and `_resolveWorkspaceDeps` DI objects from production code, and added a custom test runner that auto-isolates files using mock.module() into separate processes
- Shell completion helpers for workspaces and templates now extract names from YAML `name:` fields via `grep -h '^name:'` instead of listing filenames with `ls`/glob
- v0.9.0 shipped: version bump, CHANGELOG documenting phases 33-35, README updated for name-based identity and dynamic completion, TUI dashboard no longer shows globally disabled integrations

---

## v0.8.0 Integration Polish & Workspace UX (Shipped: 2026-03-24)

**Phases completed:** 4 phases, 6 plans, 5 tasks

**Key accomplishments:**

- 1. [Rule 1 - Bug] Test helper makeRepoWithOrigin used conflicting repo initialization
- Task 1 — Creation flows (3 files):
- WorkspaceDetail bug fixed: global Jira config no longer leaks into per-workspace display; new Linked Issues section reads exclusively from workspace settings for github/gitlab/gitea/jira tracker IDs
- CWD-based workspace detection via worktree task_path matching plus resolveWorkspaceArg shared helper — foundation for optional [workspace] arg across all 4 tracker integrations
- Optional [workspace] argument on all 4 tracker integrations via Commander.js signature changes and resolveWorkspaceArg() dispatch — `git-stacks integration jira issue link PROJ-123` from inside a worktree now just works
- Investigation confirms glab CLI bug (#948) — our code does not manipulate branch names and is not at fault

---

## v0.7.0 Close Command & Polish (Shipped: 2026-03-22)

**Phases completed:** 9 phases (21–28 + 24.1), 20 plans, 34 tasks
**Files changed:** 163 files, +22,138 / -505 lines
**Timeline:** 2026-03-22 (1 day, ~9 hours)
**Commits:** 135 since v0.6.0

**Key accomplishments:**

- **Workspace close command** (`git-stacks close <name>`) — lightweight session teardown (tmux kill, niri unname) without deleting worktrees or YAML; TUI dashboard action menu with `x` shortcut
- **Cascading lifecycle phases** — close → clean → remove → merge with 5 new hook pairs (`pre_clean`/`post_clean`, `post_close`, `pre_merge`, `post_remove`); per-repo interleaved `pre_clean`; `GS_TRIGGERED_BY` env var propagated through cascade
- **Mock architecture refactor** — injectable `_exec` objects in tmux/cmux/lifecycle + centralized `prompts` wrapper in tui/utils.ts; 67 new unit tests via property replacement; dead mock.module("@clack/prompts") calls eliminated from 7 test files
- **Git forge integrations** — GitHub (`gh`), GitLab (`glab`), Gitea (`tea`) integration plugins with `pr create/open/status`; forge auto-detection at `repo add`/`repo scan`; doctor binary checks
- **Issue & task tracking** — `issue link/unlink/open` across GitHub, GitLab, Gitea, and standalone Jira plugin with configurable `open_cmd` template; shared issue-utils module
- **CLI polish** — shell completion for `new --from` and `close`; `--yaml` flags for direct YAML editing with Zod validation; `clean` folder deletion; `remove --force` malformed YAML resilience

**Archive:** [.planning/milestones/v0.7.0-ROADMAP.md](.planning/milestones/v0.7.0-ROADMAP.md)

---

## v0.6.0 Integration Orchestration & Niri (Shipped: 2026-03-22)

**Phases completed:** 5 phases, 6 plans, 11 tasks

**Key accomplishments:**

- Typed integration artifact pipeline: TmuxArtifact/CmuxArtifact/WindowArtifact discriminated union, ArtifactBag accumulator, and updated Integration.open() signature threaded through all four integrations and workspace-ops
- Numeric `order` field on Integration interface with tier-based runner module (runIntegrationGenerate + runIntegrations) sorting ascending before iteration, tested via TDD with 14 unit tests.
- All four inline integration loops consolidated into centralized runner calls, completing ORCH-05 with zero regressions across 389 tests
- All four integrations (tmux, cmux, vscode, intellij) now return real typed IntegrationArtifact values from open() instead of null — ArtifactBag is populated for Phase 20 niri consumption
- 8 typed async niri IPC wrappers in src/lib/niri.ts with Zod validation, injectable test hooks, and 26 unit tests that pass without NIRI_SOCKET
- Niri compositor integration plugin (tier-3, order 30) that arranges workspace windows on a dedicated named niri workspace using PID matching from the ArtifactBag

---

## v0.4.0 TUI Hardening & Polish (Shipped: 2026-03-21)

**Phases completed:** 8 phases, 21 plans, 43 tasks

**Key accomplishments:**

- GIT_STACKS_CONFIG_DIR env override in paths.ts and SolidJS arrow-key cursor navigation in ActionMenu — the two production code prerequisites for Plan 02 component tests
- 15 headless TUI component tests via testRender proving keyboard simulation, frame capture, InlineInput behaviors, and ActionMenu arrow navigation all work in CI without a terminal
- InlineInput rewritten to wrap built-in `<input>` with cursor movement, plus runHooksCaptured() for piped hook execution with line callbacks
- fetchOrigin 30-second socket timeout via git -c flag, SyncRow type and onSyncProgress callback added to syncWorkspace, fetch failures tracked per-repo instead of silently swallowed
- SolidJS SyncProgressView component with per-repo status table, opentui-spinner for active rows, conflict file sub-listing, and color-coded summary line
- Sync action wired end-to-end in TUI dashboard: 's' key -> confirm dialog -> executeSync with per-repo SyncProgressView and keyboard-blocked progress state
- Reusable multi-step WizardView and CreateProgressView TUI components with 10 tests, plus UIView/Action type extensions and useWorkspaces.reload() Promise<void> fix
- Full template-based workspace creation wired in TUI: TemplateActionMenu [w] key -> WizardView name+branch -> CreateProgressView per-repo progress -> cursor on new workspace in Workspaces tab
- Repos tab Space multi-select and n key launch ad-hoc wizard via shared WizardView and executeCreateWorkspace with all repos defaulting to worktree mode
- One-liner:
- Unified row prefix to canonical >[x] 4-char checkbox format in RepoList and TemplateList, and added optional selected prop to TemplateList for Plan 03 wiring
- Full App.tsx wiring: Enter on repos opens RepoActionMenu, template create wizard flows end-to-end, repo remove handles blocked/safe paths, Templates Space multi-select active, n-key removed per D-03
- Width-tiered help bar, relative workspace age, and reactive column widths across all three dashboard list views, with four Wave 0 integration test stubs establishing the test file structure
- Tab switching (1/2/3 keys + help bar + relative age) and action menu dispatch (open/remove-confirm/escape) integration tests with config module mock for cross-file isolation
- Two integration test files covering wizard entry/cancel/back-nav and sync action menu/confirm/progress flows, using config module mocking for full-suite resilience
- Shared CenteredDialog wrapper component with three size variants, cursor navigation (arrow keys + Enter) added to RepoActionMenu and TemplateActionMenu, all three action menus wrapped in CenteredDialog at App root level
- ConfirmDialog, RemoveBlockedView, and InlineInput wrapped in CenteredDialog and promoted from detail pane to App root level as full-screen centered overlays
- All 11 dashboard dialog types converted to CenteredDialog overlays at App root level — HelpOverlay and MessageOverlay as large (90%), wizards and progress views as medium (70%), completing the full centered-dialog architecture.
- Shared `promptIntegrationOverrides()` helper extracted from config.ts and wired into both `template new` and `template edit` wizards with confirm-guard and conditional YAML storage (D-01 through D-04)
- Integration override prompts wired into workspace new/clone wizards with cascade-aware pre-selection and git-stacks edit command for post-creation integration changes
- Read-only integration cascade display added to WorkspaceDetail and TemplateDetail showing resolved enabled state, source annotation ([workspace/template/global/skipped]), and config values inline.

---

## v0.3.0 Dashboard UI Overhaul (Shipped: 2026-03-20)

**Phases completed:** 4 phases (6–9), 13 plans
**Files changed:** 75 files, +13,251 / -1,171 lines
**Timeline:** 2026-03-18 → 2026-03-20 (2 days)
**Commits:** ~60 since v0.2.0

**Key accomplishments:**

- **Workspace notification system** (`git-stacks message send|list|clear`) — JSONL-backed per-workspace message store with optional sender identity; delivered in real-time to the running TUI via Unix socket; silently durable when TUI is not running
- **Dashboard tabbed layout** — Workspaces | Templates | Repos tabs with split list + detail pane per tab, independent cursor/filter state per tab, and full keyboard navigation (1/2/3, [/])
- **Full in-TUI CRUD** — all workspace actions (open, rename, merge, run, clean, remove, edit YAML) accessible via action menus; template edit/clone/remove; repo registry browsing with disk health indicators
- **IPC push message display** — workspace list rows show live notification previews (sender, truncated text, relative age); detail pane shows grouped per-sender history; `m` key opens full-screen MessageOverlay with cursor navigation and `c`-to-clear; IPC socket status indicator in help bar
- **Shell completion overhaul** — OPTION_ENUMS + FLAG_COMPLETIONS tables with prev-word detection in bash/zsh/fish; covers `--strategy`, `--sort`, `--workspace`, `--from`, and the full `message send|list|clear` subcommand tree
- **OpenTUI layout patterns** — discovered and documented root cause of nested `<text>` crash; established two-box flexGrow layout, height-based tab visibility, and SolidJS reactive function pattern for `<For>` callbacks

**Archive:** [.planning/milestones/v0.3.0-ROADMAP.md](.planning/milestones/v0.3.0-ROADMAP.md)

---

## v0.2.0 Foundation + Model Redesign (Shipped: 2026-03-18)

**Phases completed:** 7 phases (1–5 + 1.1, 1.2), 21 plans
**Requirements:** 61/61 shipped

**Key accomplishments:**

- Stable Repo Registry + Template model replacing the Stack model
- Test infra with real git repos; Zod schema resilience and prerequisite checks
- File ops engine (copy/symlink with glob, idempotent, loud-fail)
- Destructive op safety (`--dry-run`/`--force` on remove/clean/merge/rename)
- UX polish — `formatError`, `--json`, `doctor --fix`, richer columns, `run --parallel`
- Dynamic version command with git hash and `-dirty` flag

**Archive:** [.planning/milestones/v1.0-ROADMAP.md](.planning/milestones/v1.0-ROADMAP.md)

---
