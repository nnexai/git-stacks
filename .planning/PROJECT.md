# git-stacks

## What This Is

`git-stacks` is a CLI workspace manager for feature-branch driven development. It creates isolated, fully-configured development environments per feature or task — instantly setting up git worktrees, IDE/terminal multiplexer sessions, and dependency repos from declarative templates. An interactive TUI dashboard (`git-stacks manage`) provides full CRUD for workspaces, templates, and repos, plus a real-time notification system for AI agent hooks. Works for a single developer juggling multiple features in parallel, or for AI agents that each need their own workspace without colliding on files.

## Core Value

One command should take you from "I need to work on feature X" to a fully running dev environment — the right repos checked out, the right branches created, the right IDE/terminal open, hooks run — without manual steps.

## Recent State (2026-05-15)

### What shipped in v0.17.1

- **Safer cleanup and command contracts** — `clean --gone --dry-run` stays preview-only, destructive workspace commands have stronger dry-run/force coverage, and `run --json` now rejects unsupported non-parallel usage instead of silently ignoring the JSON expectation.
- **Verified workspace workflows** — workspace create, clone, list, status, open, close, clean, remove, rename, merge, pull, sync, push, run, paths, env, labels, messages, templates, and repo registry flows are covered through local automation with isolated config and disposable repos.
- **More reliable lifecycle behavior** — hooks, env injection, cwd/path handling, branch starts, generated files, dirty-worktree guards, missing paths, and rollback boundaries were verified against real local fixtures.
- **Integration contract confidence** — forge, issue, session, IDE, and window-manager integrations now have command-construction and safe-failure coverage without requiring live external services or desktop environments.
- **Explicit coverage boundary** — broad TUI rendering, dashboard rollback visibility, live forge services, and real browser/window-manager/IDE launches remain deferred to future dedicated work.

### What shipped in v0.17.0

- **Template labels** — templates now support `template label add|remove|list|clear`, exact-match `template list --label`, and snapshot propagation into workspaces created or cloned from those templates (Phase 74, TLBL-01..07)
- **Workspace creation rollback** — the shared operation runner now rewinds partial workspace-creation work in strict LIFO order, reports rollback progress, and keeps failed creates from leaving half-written workspace state behind (Phase 78, ENGN-01..03)
- **Indexed config lookups** — template/workspace reads now hit an in-memory name index with automatic invalidation on writes and delete helpers that keep cache and filesystem state aligned (Phase 77, ENGN-04..06)
- **Integration plugin hardening** — optional plugin behavior now lives behind narrow TypeScript interfaces and runtime predicates, keeping the capability system compile-time only and out of the user-facing integration list surface (Phases 76 + 78.1, ENGN-07..09)
- **Observability and test seams** — lifecycle/git subprocess paths expose injectable `_exec` seams, `GS_DEBUG=<module[,module]>` filters structured stderr logs by module, and `GIT_STACKS_DEBUG=1` remains a compatibility alias for all-module debug output (Phase 75, OBSV-01..05)

### What shipped in v0.16.0

- **Workspace engine split** — `workspace-ops.ts` was decomposed into `workspace-env.ts`, `workspace-lifecycle.ts`, `workspace-status.ts`, `workspace-git.ts`, and `workspace-yaml.ts` while preserving the public CLI surface
- **Observability** — `GIT_STACKS_DEBUG=1` emits labeled timing/debug lines to `stderr` for status/env/git/lifecycle/YAML flows; normal stdout and `--json` output remain unchanged
- **TUI-safe debug behavior** — `git-stacks manage` silences observability before the alternate-screen dashboard starts; smoke verification confirms zero stderr bytes under debug mode
- **Boundary verification** — extracted-module unit tests now cover env/status/git seams directly, and `bun run test:deps` enforces a cycle-free import graph with `madge`

### What shipped in v0.15.0

- **Dir repo type** — new `type: "dir"` for non-git directories in registry and templates; `repo add --type dir`, `repo scan` detects non-git dirs; `mode: "dir"` in workspace repos
- **Workspace lifecycle guards** — dir repos skip worktree creation/removal; open/close/clean/remove handle dir repos without git errors
- **Git operation guards** — push/pull/sync/merge/ahead-behind/dirty silently skip dir repos in mixed workspaces
- **Status & display** — CLI status/list show dir repos labeled as "dir" with no git metrics; TUI dashboard displays dir repos correctly; doctor reports dir repos health

### What shipped in v0.13.0

- **Shell completion fixes** — no repeated positional args, no parent flag leakage, all enum options offered
- **Env command** — `git-stacks env [workspace]` inspects all merged env vars that a workspace would inject
- **Copilot hook support** — `install --hooks --copilot` installs GitHub Copilot hooks alongside or instead of Claude hooks
- **Doctor & config polish** — forge CLI checks in `git-stacks doctor`, practical tmux pane layout in `configExample`

### What shipped in v0.12.0

- **Multi-workspace AeroSpace config** (BREAKING) — `workspaces` array replaces flat `workspace:` field; each entry independently configures layout, normalization, flatten, focus, and commands
- **Integration CLI tools** — `integration list`, `config example`, `config show`, `aerospace focus <workspace>`, `vscode open <workspace>`
- **Convention-based dynamic completion** — 46-entry `DYNAMIC_COMPLETIONS` replaced with 5-key inference map; integration ID and multi-arg position support across bash/zsh/fish
- **Workspace port allocation** — named port declarations, contiguous range allocation on open, atomic writeYaml with fsync, race-safe lockfile, env injection via `mergeEnv()`
- **Argument naming convention** — Commander.js positional args renamed to match completion inference

### What shipped in Phase 50.1

- **Convention-based completion inference** — `completion-generator.ts` infers completion types from Commander.js argument names (`<workspace>` → workspace, `<repo>` → repo, etc.) via `NAME_TO_COMPLETION_TYPE` map, replacing 50-entry `DYNAMIC_COMPLETIONS` with 4 override entries (issue.link edge cases only)
- **Integration ID completion** — new `integration` completion type emits hardcoded integration ID list (`vscode`, `intellij`, `cmux`, etc.) in bash, zsh, and fish helpers
- **Multi-position argument dispatch** — commands with two completable args (`run <workspace> [repo]`, `cd <workspace> [repo]`) produce position-aware completions in all three shells
- **argChoices extraction** — Commander `.choices()` arrays automatically produce fixed-value completions
- **Command argument renames** — 21 positional argument renames across workspace.ts, repo.ts, and template.ts to use convention-matching names (`<workspace>`, `<repo>`, `<template>`)

### What shipped in Phase 50

- **Integration config introspection** — `git-stacks integration list` shows all 10 integrations with enabled/configured status; `config example` prints YAML snippets for aerospace, vscode, niri, tmux; `config show` dumps current global + workspace-level config
- **AeroSpace focus command** — `git-stacks integration aerospace focus <workspace>` resolves the `focus:true` entry (or falls back to `workspaces[0]`) and switches AeroSpace workspace
- **VSCode standalone open** — `git-stacks integration vscode open <workspace>` generates `.code-workspace` and opens VSCode without hooks or other integrations
- **`configExample` interface extension** — `Integration` interface gains optional `configExample?: string` property; populated for 4 integrations with non-trivial config

### What shipped in v0.12.0

- **Multi-workspace AeroSpace config** (BREAKING) — `workspaces` array replaces flat `workspace:` field; each entry independently configures layout, normalization, flatten, focus, and commands
- **Multi-workspace loop** — `open()` iterates all entries sequentially; bag windows (vscode, intellij) route to `workspaces[0]` only; subsequent entries get own command windows
- **Focus and duplicate validation** — at most one entry may have `focus: true`; duplicate workspace names rejected with plain-English errors
- **Cross-entry snapshot isolation** — shared `beforeSet` prevents cross-entry window misattribution; `listWorkspaces()` hoisted before loop (called once)

### What shipped in v0.11.0/v0.11.1

- **AeroSpace shell wrappers** — typed async CLI wrappers in `src/lib/aerospace.ts` with `--format` TSV parsing, injectable `_exec` for test isolation, and `snapshotWindowIds()` for snapshot-delta detection
- **AeroSpace integration plugin** — tier-3 plugin (order 31) in `src/lib/integrations/aerospace.ts`; snapshot-delta window detection, `move-node-to-workspace` targeting, `list-workspaces` validation, no-op cleanup
- **Layout control** — normalization-aware layout application (`flatten-workspace-tree` + `layout`), `flatten_before_open` container reset, `focus` workspace switching
- **App launching** — `commands` array with `source`/`app`/`command` entries, per-command `cwd`/`repo`/`args`/`focus`, snapshot-delta detection for launched windows
- **Doctor checks** — warn-level `aerospace` binary availability check on macOS, silent skip on Linux
- **Bug fixes** (v0.11.1) — pinned @opentui/core and @opentui/solid to 0.1.87; suppressed git credential prompts in TUI-reachable network commands

### What shipped in v0.10.0/v0.10.1

- **Agent path discovery** — `git-stacks paths` outputs workspace repo paths for agent CLI injection with `--prefix`/`--filter` flags
- **Multi-repo pull** — `git-stacks pull` with `--ff-only`, dirty-repo skip, fetch dedup by `main_path`, and CWD autodetection
- **TUI upstream staleness** — per-repo "N behind" badges in dashboard with 5-minute TTL cache, cursor-triggered fetch, `r`-key force refresh
- **Template composition** — `includes:` field for meta-templates + repeatable `--template` on `git-stacks new`; repos union (worktree wins), hooks concatenated, env last-wins
- **Security hardening** (v0.10.1) — NameSchema input validation blocks path traversal/shell metacharacters; atomic writeYaml; env_file boundary check; doctor structured fixes; tmux/niri shell quoting; deterministic snapshot tests

### What shipped in v0.9.0

- **Name-based identity** — workspace and template `name` field is canonical identity; filename is storage only; all lookups, operations, and TUI display use the name field; rename keeps name+filename in sync
- **Template rename cascade** — `template rename` updates all workspace YAML files referencing the old template name
- **Dynamic shell completion** — tab-completion for workspace/template arguments reads YAML `name` fields instead of filename globs; works in bash, zsh, and fish
- **Shell completion audit** — full completion coverage for all commands including forge (`pr create/open/status`) and issue (`link/unlink/open`) subcommands across all shells
- **TUI integration display fix** — dashboard hides globally disabled integrations that have no workspace/template override
- **Test isolation framework** — custom test runner separating unit/integration modes, complete mock factories, zero cache-busting imports

### What shipped in v0.8.0

- **Upstream worktree branch tracking** — `ensureUpstreamTracking()` auto-detects existing upstream branches during worktree creation and sets up tracking; two-layer detection (local rev-parse first, ls-remote fallback); wired into all 4 creation flows (new, clone, TUI wizard, open); 781 tests pass
- **Dashboard linked issues fix** — separate Linked Issues section in WorkspaceDetail reads exclusively from `ws().settings`; issue key filtered from config summary to prevent global config leak
- **Workspace CWD auto-detection** — `detectWorkspaceFromCwd()` matches worktree task_paths with deepest-match, trunk-skip, and prefix-collision guard; `resolveWorkspaceArg()` shared helper; all 4 tracker integrations (Jira, GitHub, GitLab, Gitea) now accept optional `[workspace]` on `link`/`unlink`/`open`
- **GitLab branch slash investigation** — confirmed glab CLI bug (#948, fixed in MR !1183); our `gitlab.ts` does not manipulate branch names; workaround: update glab to v1.28+

### What shipped in v0.7.0

- **Dedicated lifecycle phases** — close, clean, remove, and merge each have dedicated pre/post hook pairs; lifecycle cascade (remove → clean → close) ensures consistent teardown ordering; `WS_TRIGGERED_BY` env var tells hooks which top-level operation initiated the cascade; per-repo `pre_clean` hook runs before each individual worktree removal; `mergeWorkspace` follows full D-10 lifecycle order via cascade composition
- **Workspace close command** — `git-stacks close <name>` tears down integration sessions (tmux kill, niri unname) and runs `pre_close` hooks without deleting worktrees or workspace YAML; workspace remains fully re-openable via `git-stacks open`; TUI dashboard action menu includes Close with `x` shortcut
- **Niri display fix** — TUI detail panes render niri columns config as human-readable "N col(s)" instead of `[object Object]`; shared `formatConfigValue` helper handles all non-primitive config values
- **Test environment isolation** — `useIsolatedConfig` shared helper in `tests/helpers.ts` redirects all config I/O to temp directories; all mock.module calls export complete module interfaces to prevent cross-test contamination; 513 tests pass with 0 failures
- **Mock architecture refactor** — injectable `_exec` objects in tmux.ts, cmux.ts, and lifecycle.ts (matching niri.ts pattern); centralized `prompts` wrapper in tui/utils.ts replaces all direct `@clack/prompts` imports across 15 production files; enables fast isolated unit tests via property replacement instead of `mock.module()`; 574 tests pass with 0 failures
- **Test mock hygiene** — eliminated all dead `mock.module("@clack/prompts")` calls from 7 test files; added explicit `@/tui/utils` mocks where missing; completes Phase 24 import migration cleanup
- **Git forge integrations** — GitHub (`gh`), GitLab (`glab`), and Gitea (`tea`) integration plugins add `pr create/open/status` subcommands; `forge` field on repo registry schema with auto-detection during `repo add`/`repo scan`; `git-stacks doctor` checks for forge CLI binaries; 682 tests pass
- **Issue & task tracking integration** — `issue link`, `issue unlink`, and `issue open` subcommands on all four tracker integrations (GitHub, GitLab, Gitea, Jira); shared `issue-utils.ts` module with `resolveIssueRef`, `linkIssue`, `unlinkIssue`, `formatIssueError`; standalone Jira integration plugin with configurable `open_cmd` template (`$ISSUE_ID` env var substitution); doctor checks for `jira` binary; 727 tests pass

### What shipped in v0.6.0

- **Integration artifact pipeline** — `open()` returns typed `IntegrationArtifact | null` (TmuxArtifact, CmuxArtifact, WindowArtifact discriminated union); `ArtifactBag` accumulates artifacts across the integration chain
- **Centralized integration runner** — `runner.ts` with `runIntegrationGenerate()` and `runIntegrations()`; tier-based numeric ordering (10-19 tier 1, 20-29 tier 2, 30+ tier 3); replaces four inline loops
- **Real artifact values** — tmux returns session name, cmux returns workspace ref, vscode/intellij return WindowArtifact with PID via `Bun.spawn`
- **Niri shell wrappers** — `src/lib/niri.ts` with 8 typed async IPC wrappers, Zod-validated JSON schemas, injectable `_exec` for test isolation; 26 unit tests pass without NIRI_SOCKET
- **Niri compositor integration** — tier-3 plugin (order 30); creates/reuses named niri workspace, moves windows via PID matching from ArtifactBag, supports user-configured `commands` array, NIRI_SOCKET gate; 13 unit tests with mocked wrappers

### What shipped in v0.4.0

- **E2E test infrastructure** — headless `testRender` + `mockInput` + `captureCharFrame` for automated TUI validation; `GIT_STACKS_CONFIG_DIR` for config isolation; 14 integration tests covering tab switching, action menus, wizards, and sync flows
- **TUI screen polish** — width-tiered help bar (progressive dropping at 50/65/80/100 cols), relative workspace ages (`3d`, `2h`, `5m`), responsive column widths across all list views
- **Create workspace wizard** — template-based and ad-hoc creation with back-navigation, cursor placement, and deferred focus
- **Repo management** — RepoActionMenu with create workspace/template/remove actions; blocked-removal view shows references; template creation from selected repos
- **Workspace sync** — per-repo progress display with 30s fetch timeout; sync action in workspace action menu
- **Unified selection display** — `>[x]` checkbox prefix across all three dashboard tabs
- **InlineInput** — cursor-positioned editing via built-in `<input>` wrapper replacing hand-rolled keyboard accumulation
- **TUI-safe hooks** — `runHooksCaptured()` with callback streaming prevents OpenTUI screen corruption
- **CenteredDialog architecture** — all 11 dialog types rendered as dimmed overlays at App root level with consistent cursor navigation and three size variants (small/medium/large)
- **Integration override cascade** — per-template and per-workspace integration settings via `promptIntegrationOverrides()` helper; TUI detail panes show resolved enabled state with source annotations ([global], [template], [workspace], [skipped])
- **`git-stacks edit`** — post-creation workspace integration override editing

### What shipped in v0.3.0

- **Workspace notification system** — `git-stacks message send|list|clear` subcommand family; JSONL-backed per-workspace message store; optional sender identity (`--from agent-name`); durable when TUI is not running; IPC push via Unix socket delivers to running dashboard in real time
- **Dashboard overhaul** — Tabbed layout (Workspaces | Templates | Repos), split list + detail pane per tab, independent cursor/filter state per tab, keyboard navigation (1/2/3, [/], ↑/↓)
- **Full in-TUI CRUD** — all workspace actions (open, rename, merge, run, clean, remove, edit YAML) via action menus; template edit/clone/remove; repo registry browsing with disk health indicators
- **IPC push message display** — workspace list rows show live notification previews; detail pane shows per-sender grouped history; full-screen MessageOverlay (`m` key); IPC socket status indicator in help bar
- **Shell completion overhaul** — OPTION_ENUMS + FLAG_COMPLETIONS with prev-word detection in bash/zsh/fish; covers `--strategy`, `--sort`, `--workspace`, `--from`, and the full message subcommand tree

### Current primitives (stable as of v0.3.0)

- **Repo Registry** (`~/.config/git-stacks/registry.yml`) — source of truth for local repo locations and default branches
- **Templates** (`~/.config/git-stacks/templates/{name}.yml`) — reusable workspace recipes with per-repo mode, branch patterns, hooks, env, file ops
- **Workspaces** (`~/.config/git-stacks/workspaces/{name}.yml`) — task-scoped instances; self-contained snapshots at creation time
- **Messages** (`~/.config/git-stacks/messages/{workspace}.jsonl`) — workspace-scoped notification store; IPC-delivered to running TUI via `/tmp/git-stacks.sock`
- **Dir Repos** — non-git directories registered with `type: dir`; referenced by `main_path` only, skipped by all git operations, shown with [dir] label in CLI and TUI
- **Integrations** — VSCode, IntelliJ, tmux, cmux, niri, AeroSpace plugin system; extensible via `src/lib/integrations/`
- **Issue Tracking** — `issue link/unlink/open` commands on GitHub, GitLab, Gitea, and Jira integration plugins; shared `issue-utils.ts` for resolution/persistence
- **Hooks** — full lifecycle hook pairs (`pre_close`/`post_close`, `pre_clean`/`post_clean`, `pre_merge`/`post_merge`, `pre_remove`/`post_remove`, plus `pre_create`/`post_create`, `pre_open`/`post_open`) at template and workspace levels; per-repo `pre_open` and `pre_clean`; cascade design (remove → clean → close); hooks receive `GS_WORKSPACE_NAME`, `GS_WORKSPACE_BRANCH`, `GS_WORKSPACE_PATH`, `GS_REPO_NAME`, `GS_TRIGGERED_BY`

## Requirements

### Validated

- ✓ Template labels on templates, exact-match `template list --label`, and snapshot propagation into workspace create/clone flows — v0.17.0 Phase 74
- ✓ Workspace engine decomposition — `workspace-env`, `workspace-lifecycle`, `workspace-status`, `workspace-git`, and `workspace-yaml` extracted behind a stable facade — v0.16.0 Phases 69-70
- ✓ Stderr-only debug observability — `GIT_STACKS_DEBUG=1` labeled timings/logs with JSON-safe stdout and pre-TUI silencing for `manage` — v0.16.0 Phase 71
- ✓ Extracted-module regression gate — direct env/status/git tests plus `bun run test:deps` circular-dependency enforcement — v0.16.0 Phase 72
- ✓ Headless TUI component test infrastructure (`testRender` + `mockInput` + `captureCharFrame`) — v0.4.0 Phase 10
- ✓ Config directory isolation via `GIT_STACKS_CONFIG_DIR` env var — v0.4.0 Phase 10
- ✓ ActionMenu arrow-key cursor navigation — v0.4.0 Phase 10
- ✓ InlineInput cursor-positioned editing via built-in `<input>` wrapper — v0.4.0 Phase 11
- ✓ `runHooksCaptured()` TUI-safe hook output streaming via callback — v0.4.0 Phase 11
- ✓ TUI workspace sync with per-repo progress display and 30s fetch timeout — v0.4.0 Phase 12
- ✓ TUI workspace creation wizard (template-based and ad-hoc) with back-navigation and cursor placement — v0.4.0 Phase 13
- ✓ TUI template creation from Repos tab action menu with duplicate-name validation — v0.4.0 Phase 14
- ✓ TUI repo remove (blocked path shows references, safe path with ConfirmDialog) — v0.4.0 Phase 14
- ✓ RepoActionMenu with selection-aware labels (`[w]`/`[t]`/`[r]` shortcuts) — v0.4.0 Phase 14
- ✓ Unified checkbox prefix display across all dashboard tabs — v0.4.0 Phase 14
- ✓ App-level integration tests covering tab switching, action menu dispatch, wizard entry/cancel, and sync progress — v0.4.0 Phase 15
- ✓ Width-tiered help bar fitting within 80 columns — v0.4.0 Phase 15
- ✓ Relative workspace ages in list view (`3d`, `2h`, `5m`) — v0.4.0 Phase 15
- ✓ Responsive column widths across all list views — v0.4.0 Phase 15
- ✓ CenteredDialog overlay architecture with three size variants — v0.4.0 Phase 15.1
- ✓ Unified cursor navigation in all action menus (arrow keys + Enter) — v0.4.0 Phase 15.1
- ✓ Per-template integration overrides via CLI wizard (new + edit) — v0.4.0 Phase 15.2
- ✓ Per-workspace integration overrides via CLI wizard (new + clone + edit) — v0.4.0 Phase 15.2
- ✓ TUI detail pane integration cascade display with source annotations — v0.4.0 Phase 15.2
- ✓ Integration artifact pipeline — typed open() returns, ArtifactBag accumulator — v0.6.0 Phase 16
- ✓ Integration runner — centralized runner.ts with tier-ordered execution — v0.6.0 Phase 17
- ✓ Real artifact values — tmux/cmux/vscode/intellij return typed artifacts — v0.6.0 Phase 18
- ✓ Niri shell wrappers — 8 typed IPC wrappers with mockable interface — v0.6.0 Phase 19
- ✓ Niri compositor integration — tier-3 plugin, named workspace, window moves — v0.6.0 Phase 20
- ✓ Repo Registry as source of truth for repo paths — v0.2.0
- ✓ Templates as reusable workspace recipes — v0.2.0
- ✓ Workspace YAML self-contained at creation — v0.2.0
- ✓ Destructive op safety (`--dry-run`, `--force`) — v0.2.0
- ✓ `--json` output on status/doctor/sync — v0.2.0
- ✓ `doctor --fix` for drift repair — v0.2.0
- ✓ `run --parallel` for multi-repo commands — v0.2.0
- ✓ JSONL-backed workspace notification store with CLI (`message send|list|clear`) — v0.3.0
- ✓ Real-time IPC push via Unix socket to running TUI — v0.3.0
- ✓ Dashboard tabbed layout with split list+detail pane per tab — v0.3.0
- ✓ Full in-TUI CRUD for workspaces, templates, repos — v0.3.0
- ✓ Shell completion coverage for all commands, subcommands, and fixed enum flag values — v0.3.0

- ✓ Workspace close command — lightweight teardown (tmux, niri) without deleting workspace/worktrees — v0.7.0 Phase 21
- ✓ Niri columns display fix — formatConfigValue helper for non-primitive config rendering — v0.7.0 Phase 22
- ✓ Test environment isolation — useIsolatedConfig helper, all tests use temp dirs — v0.7.0 Phase 23
- ✓ Mock architecture refactor — injectable `_exec` objects + centralized prompts wrapper — v0.7.0 Phase 24
- ✓ Cascading lifecycle phases — close → clean → remove → merge with fine-grained hooks — v0.7.0 Phase 25
- ✓ Shell completion & editor polish — `--from` completion, `--yaml` flags, force cleanup — v0.7.0 Phase 26
- ✓ Git forge integrations — GitHub/GitLab/Gitea PR creation via CLI pass-through — v0.7.0 Phase 27
- ✓ Issue & task tracking — link/unlink/open across GitHub/GitLab/Gitea/Jira — v0.7.0 Phase 28

- ✓ Upstream worktree branch tracking — auto-detect and set up tracking for existing upstream branches — v0.8.0 Phase 29
- ✓ Dashboard linked issues fix — workspace-only data, no global config fallback — v0.8.0 Phase 30
- ✓ CWD auto-detection for all 4 tracker integrations — optional [workspace] on link/unlink/open — v0.8.0 Phase 31
- ✓ GitLab branch '/' investigation — glab CLI bug confirmed, documented with version guidance — v0.8.0 Phase 32
- ✓ Name-based identity — name field is canonical for workspaces and templates; rename keeps name+filename in sync; TUI/CLI reverse-lookups use name — v0.9.0 Phase 33
- ✓ Shell completion audit — full bash/zsh/fish coverage for all commands including forge/issue subcommands — v0.9.0 Phase 34
- ✓ Test isolation framework — custom test runner, complete mock factories, zero cache-busting imports — v0.9.0 Phase 34.1
- ✓ Dynamic name completion — shell completion resolves workspace/template names from YAML `name` fields instead of filename globs — v0.9.0 Phase 35
- ✓ `git-stacks paths` — workspace repo path output with `--prefix`/`--filter` flags for agent CLI injection — v0.10.0 Phase 37
- ✓ `git-stacks pull` — multi-repo pull with `--ff-only`, dirty skip, fetch dedup, CWD autodetection — v0.10.0 Phase 38
- ✓ TUI upstream staleness — per-repo "N behind" badges with 5-min TTL cache and `r`-key force refresh — v0.10.0 Phase 39
- ✓ Template composition — `includes:` field for meta-templates, ad-hoc `--template` on `git-stacks new`, repo union with worktree-wins, hook concatenation — v0.10.0 Phase 40
- ✓ NameSchema input validation — Zod regex blocks path traversal and shell metacharacters at schema level — v0.10.1 Phase 42
- ✓ Atomic writeYaml — temp-file + rename prevents config corruption on interrupted writes — v0.10.1 Phase 42
- ✓ Shell path quoting — tmux/niri quote interpolated cwd paths with POSIX shellQuote — v0.10.1 Phase 42

- ✓ AeroSpace shell wrappers — typed async CLI wrappers with injectable `_exec` and snapshot-delta detection — v0.11.0 Phase 43
- ✓ AeroSpace integration plugin — tier-3 plugin (order 31) with snapshot-delta window detection and workspace targeting — v0.11.0 Phase 44
- ✓ Normalization-aware layout control — flatten-workspace-tree + layout commands with normalization config — v0.11.0 Phase 45
- ✓ Target AeroSpace workspace configuration in workspace/template YAML — v0.11.0 Phase 44
- ✓ Doctor checks for aerospace binary (macOS-gated) — v0.11.0 Phase 43
- ✓ App launching commands array with source/app/command entries and snapshot-delta — v0.11.0 Phase 45

- ✓ Multi-workspace AeroSpace config — `workspaces` array replacing flat single-workspace config — v0.12.0 Phase 47
- ✓ Per-workspace-entry independent configuration (layout, normalization, flatten, focus, commands) — v0.12.0 Phase 47
- ✓ Focus validation — at most one workspace entry may have `focus: true` — v0.12.0 Phase 47
- ✓ Unrouted tier-1 windows (vscode, intellij) default to first workspace in array — v0.12.0 Phase 48
- ✓ Cross-entry snapshot isolation via shared `beforeSet` — v0.12.0 Phase 48
- ✓ `listWorkspaces()` hoisted before loop for upfront validation — v0.12.0 Phase 48
- ✓ Integration config introspection — `integration list`, `config example`, `config show` commands — v0.12.0 Phase 50
- ✓ AeroSpace focus command — `integration aerospace focus <workspace>` — v0.12.0 Phase 50
- ✓ VSCode standalone open — `integration vscode open <workspace>` — v0.12.0 Phase 50
- ✓ `configExample` property on Integration interface — v0.12.0 Phase 50
- ✓ Convention-based completion inference from argument names — v0.12.0 Phase 50.1
- ✓ Integration ID completion type — v0.12.0 Phase 50.1
- ✓ Multi-position argument dispatch in completions — v0.12.0 Phase 50.1
- ✓ Workspace port allocation — named ports, contiguous range, env injection — v0.12.0 Phase 51
- ✓ Atomic writeYaml with fsync — v0.12.0 Phase 51
- ✓ Race-safe port allocation lockfile — v0.12.0 Phase 51
- ✓ Port names in new workspace wizard — v0.12.0 Phase 51
- ✓ Template port inheritance with workspace merge — v0.12.0 Phase 51

- ✓ Shell completion arity enforcement — variadic-aware positional arg limits across bash/zsh/fish — v0.13.0 Phase 53
- ✓ Option value enum auto-detection from Commander `.choices()` — v0.13.0 Phase 53
- ✓ `git-stacks env [workspace]` — merged env var inspection with `--format` output — v0.13.0 Phase 54
- ✓ `install --hooks --copilot` — Copilot hook support alongside Claude hooks — v0.13.0 Phase 55
- ✓ Forge CLI checks in `git-stacks doctor` — conditional `gh`/`glab`/`tea` binary checks — v0.13.0 Phase 56
- ✓ Tmux `configExample` with practical pane layout — v0.13.0 Phase 56

- ✓ Ahead/behind tracking — per-repo commit distance display in status and TUI with fetch dedup — v0.14.0 Phase 58
- ✓ `git-stacks push` — multi-repo push with upstream setup, dirty skip, CWD detection — v0.14.0 Phase 59
- ✓ Workspace labels — `label add/remove/list/clear` with `--label` filter on `list`/`status` — v0.14.0 Phase 60
- ✓ Secret resolution — `${{ resolver:path }}` syntax with keychain/env/cmd resolvers — v0.14.0 Phase 61
- ✓ Stash-on-sync — automatic stash/pop around sync fetch+merge for dirty repos — v0.14.0 Phase 62

- ✓ Dir repo type in Zod schemas — `type: "dir"` and `is_dir` field with backward-compatible defaults — v0.15.0 Phase 64
- ✓ Dir repo registry support — `repo add` and `repo scan` detect and register non-git directories — v0.15.0 Phase 64
- ✓ Dir repo workspace lifecycle — new/open/close/clean/remove handle dir repos (no worktrees, no git errors) — v0.15.0 Phase 65
- ✓ Git operation guards for dir repos — push/pull/sync/merge/ahead-behind/dirty silently skip dir repos — v0.15.0 Phase 66
- ✓ Dir repo CLI display — `status` shows [dir] label, `--fetch` skips dir repos, `list` handles dir-only workspaces — v0.15.0 Phase 67
- ✓ Dir repo doctor health checks — `findInvalidDirRepos` validates directory existence and accessibility — v0.15.0 Phase 67
- ✓ Dir repo TUI rendering — [dir] label in WorkspaceDetail, dir count in WorkspaceRow, missing-dir detection — v0.15.0 Phase 67
- ✓ Workspace/git E2E coverage — real-process CLI tests now prove workspace create/clone fixtures, env/hooks, cwd/path handling, lifecycle guards, merge/pull/sync/push behavior against local bare remotes, and `status --fetch` ahead/behind refresh — v0.17.1 Phase 81

### Active

## Current Milestone: v0.18.0 Workspace File Sync and Forge Sources

**Goal:** Make workspace file materialization useful for private planning/agent configuration through bidirectional real-file sync, then add a GitLab-first forge source path for creating normal template-backed workspaces from merge requests.

**Target features:**
- `files.sync` entries under the existing `files` model for real-file materialization of directories such as `.planning/` and `.codex/`, avoiding external symlink targets that agents may refuse to follow. Phase 89 completed the schema, composition, materialization, target-safety, tracked-target refusal, and repo-level local exclude slice.
- `git-stacks files status|pull|push` as the user-facing command family for file materialization and bidirectional sync, keeping this separate from existing branch-level `git-stacks sync`.
- Local `.git/info/exclude` support for synced targets so private planning/agent files can exist inside worktrees without becoming project repo commits.
- Lightweight drift/conflict detection for sync targets without storing a full per-file hash manifest, because large `.planning` trees would make exhaustive manifests noisy and expensive.
- Manual sync-back only by default: `files push` is explicit, not tied to close/clean/remove/open lifecycle hooks.
- Forge source workspace creation through `git-stacks new --source <forge-url> --template <template>`, with GitLab merge requests first, then Gitea pull requests, then GitHub pull requests.
- Forge source resolution should run through enabled forge integrations and existing forge/upstream autodetection where possible; live `glab` coverage is research-heavy and may be limited to contract/local proof unless the user can validate against a real GitLab environment.

### Out of Scope

| Feature | Reason |
|---------|--------|
| Remote/cloud workspace sharing | Local-machine focus; no server component planned |
| GUI application | TUI and CLI only |
| Built-in package/tool version management | Delegate to mise/asdf via hooks |
| AI-triggered conflict resolution | Secondary priority; requires stable API first |
| Nix/devenv as first-class dependency | Out of domain; composable via hooks |
| Container/sandbox isolation | Out of scope for v0.x; revisit when agent-safety requirements clarify |
| Monorepo build caching | Nx/Turborepo's domain |
| Windows IPC support | Deferred to v0.4.0+ (AF_UNIX on Win10 1803+) |
| Opinionated onboarding (init/task) | Deferred until author has more hands-on usage experience |

## Current State

**Latest milestone release:** v0.17.1 Functional Confidence Coverage (2026-05-15)

**Shipped:** v0.17.1 closed the broad local confidence pass for workspace, template, repo, label, message, support, and integration-contract surfaces. Common workspace flows are now covered with local automation, command contracts were tightened, and the release audit passed with all v0.17.1 requirements complete.

**Status:** Phase 89 completed the foundational `files.sync` materialization layer. Next is the Phase 90 command/policy surface for `git-stacks files status|pull|push`; forge source work remains a GitLab-first track with explicit research and validation constraints.

## Next Milestone Goals
- Add the user-facing command and conflict-policy layer for `files.sync` now that Phase 89 provides real-file materialization and repo-local excludes.
- Expose `git-stacks files status|pull|push` for inspecting, pulling, and pushing synced file targets without overloading git branch `sync`.
- Keep sync-back explicit and operator-controlled; no automatic lifecycle push by default.
- Avoid full file-hash manifests for large sync trees; choose a lighter status/conflict model that scales to `.planning/`.
- Add forge-source workspace creation with GitLab merge requests first, then Gitea and GitHub, using enabled forge integrations and normal template-backed workspace creation.

## Completed Milestone: v0.17.0 Engine Hardening & Template Labels (2026-04-06)

**Goal:** Harden the core engine with rollback semantics, config indexing, and plugin contracts — plus ship template-level labels that cascade to workspaces on creation.

**Shipped:** All target features delivered across Phases 74-79. Template labels now propagate through creation and clone flows; lifecycle/git seams and structured debug logging landed; optional integration behavior moved behind compile-time-only structural interfaces; workspace/template lookup indexing and invalidation shipped; workspace creation rollback now protects both CLI and TUI create paths; release-prep closed the package, changelog, README, and closeout artifacts.

## Completed Milestone: v0.15.0 Dir Mode & Polish (2026-04-05)

**Goal:** Add a "dir" repo type for non-git directories that behave like trunk repos but are invisible to all git operations.

**Shipped:** All target features delivered across 5 phases (64-68). Dir repo type in Zod schemas with backward-compatible defaults, registry CLI support for non-git directories, workspace lifecycle guards, git operation guards silently skipping dir repos, CLI status/doctor display, TUI dashboard rendering with [dir] labels and dir count.

## Completed Milestone: v0.14.0 Workflow Completion & Workspace UX (2026-04-03)

**Goal:** Ship remaining workspace workflow commands (ahead/behind, push, labels, secrets, stash-on-sync) to complete the core workspace lifecycle.

**Shipped:** All target features delivered across 6 phases (58-63). Per-repo ahead/behind tracking with fetch dedup, multi-repo push with upstream setup, workspace label system, pluggable secret resolution with keychain/env/cmd resolvers, automatic stash/pop around sync operations.

## Completed Milestone: v0.13.0 CLI Polish & Completions (2026-04-02)

**Goal:** Fix shell completion edge cases, add env inspection command, extend hook system to Copilot, and polish doctor/config output.

**Shipped:** All target features delivered across 5 phases (53-57). Shell completion arity enforcement with variadic awareness, `git-stacks env` command with multi-format output, Copilot hook plugin with `--copilot`/`--claude` install flags, conditional forge CLI doctor checks, practical tmux config example.

## Completed Milestone: v0.12.0 Multi-Workspace AeroSpace, Integration Tools & Port Allocation (2026-04-02)

**Goal:** Extend AeroSpace to multi-workspace configs, add integration CLI tools, and introduce collision-free workspace port allocation.

**Shipped:** All target features delivered across 7 phases (47-51, 50.1, 52). Breaking schema change to `workspaces` array, integration config/list/focus/open subcommands, convention-based completion inference, workspace port allocation with race-safe lockfile and env injection.

## Completed Milestone: v0.11.0 AeroSpace Window Management (2026-03-29)

**Goal:** Add AeroSpace tiling window manager integration for macOS — arrange workspace windows on named/numbered AeroSpace workspaces using snapshot-delta detection, matching the niri integration pattern.

**Shipped:** All target features delivered across 4 phases (43-46). Typed async CLI wrappers with injectable `_exec`, tier-3 integration plugin with snapshot-delta window detection, normalization-aware layout control, app launching via `commands` array, doctor binary checks. v0.11.1 patch: pinned OpenTUI deps, suppressed git credential prompts.

## Completed Milestone: v0.10.0 Multi-Agent Workspace Tooling (2026-03-28)

**Goal:** Make git-stacks the infrastructure layer for humans managing multiple AI agents — queryable workspace data for agent bootstrap, repo sync primitives, and composable templates.

**Shipped:** All target features delivered across 6 phases (37-42). `git-stacks paths` and `git-stacks pull` commands, TUI upstream staleness badges, template composition via `includes:`, plus post-release security hardening (input validation, atomic writes, shell quoting).

## Completed Milestone: v0.9.0 Identity & Completion Integrity (2026-03-25)

**Goal:** Make workspace/template identity robust using name fields as canonical keys, and ensure shell completions cover all commands shipped to date.

**Shipped:** All target features delivered across 6 phases (33-36, plus 34.1 test isolation insert).

## Future Candidates (v1.0.0+)

- **Programmatic API** — export `workspace-ops.ts` as typed package; `Result<T>` return type; version gate for v1.0
- **Power user features** — `clone --pr <N>`, WezTerm/Zellij integrations
- **Agent-aware** — batch workspace generation (`new --count N`), agent status file protocol, Windows IPC fallback
- **TUI completeness** — R-02 (add repo from TUI), R-03 (scan repos from TUI), T-03 cursor movement tests

## Versioning

**Current release:** `v0.17.0`
**Scheme:** Zerover (`0.x`) until programmatic API is stabilized and declared stable.
**Version gate for 1.0:** Programmatic API (`Result<T>`, typed exports), core primitives battle-tested.

## Constraints

- **Runtime**: Bun — no Node.js compatibility required; use Bun APIs freely (`$`, `spawn`, `Bun.file`)
- **Language**: TypeScript strict mode throughout
- **Config format**: YAML with Zod validation — preserve schema compatibility with existing user configs
- **No breaking changes**: Existing workspace YAML files must continue to work across improvements

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Bun runtime over Node.js | Performance + native TS + shell scripting via `$` | ✓ Good |
| YAML for all config | Human-readable, editable without the tool | ✓ Good |
| Integration plugin pattern | Add IDE/terminal support without touching core | ✓ Good |
| Git worktrees as isolation primitive | Avoids full clones, preserves git history/branches | ✓ Good |
| Stack model → Registry+Template (v0.2.0) | Cleaner primitives, zerover clean break, no migration shim | ✓ Done |
| Per-template + per-workspace hooks | Composable automation at the right scope | ✓ Good |
| SolidJS for TUI dashboard | Reactive UI in terminal via OpenTUI | ✓ Good — works well for list+detail reactivity |
| Workspace YAML self-contained at creation | No template required at open time; resilient to template deletion | ✓ Good |
| JSONL per-workspace message store | Not a WorkspaceSchema field — avoids concurrent write corruption from agents | ✓ Good |
| Single global Unix socket `/tmp/git-stacks.sock` | All messages carry workspace field for routing; simpler than per-workspace sockets | ✓ Good |
| OPTION_ENUMS static table (not Commander `.choices()`) | Avoids unintended runtime validation side-effects in completion generator | ✓ Good |
| No nested `<text>` in OpenTUI | TextRenderable.add() rejects TextRenderable children — use `<box flexDirection="row">` with sibling `<text>` | ✓ Established pattern |
| Height-based tab visibility over Switch/Match | OpenTUI renderer does not repaint when SolidJS swaps conditional DOM branches | ✓ Good |
| Built-in `<input>` for all text fields | Gains cursor movement, selection, undo/redo; replaces hand-rolled `useKeyboard` + `_` cursor | ✓ Established pattern |
| Input keyboard isolation: guard + deferred focus | `useKeyboard` is global broadcast — input-mode guard must be ABOVE navigation; defer focus via setTimeout(0) to prevent trigger key leak | ✓ Established pattern |
| CenteredDialog overlay architecture | All dialogs render at App root with dimmed background; three size variants (small/medium/large) | ✓ Established pattern |
| Integration override cascade (global → template → workspace) | Reusable `promptIntegrationOverrides()` helper; conditional YAML storage (no key when user declines) | ✓ Good |
| Query-parameter cache-busting for bun mock.module | `import("@/path?unit-test")` bypasses stale mock.module cache from cross-file contamination | ✓ Workaround for bun limitation |
| Three-tier integration ordering (10/20/30) | Numeric `order` field on Integration interface; extensible without hardcoding to niri | ✓ Good |
| ArtifactBag as Record<string, artifact \| null> | Simple key-value accumulator; niri reads bag values without mutation | ✓ Good |
| Bun.spawn for IDE PID capture | `Bun.$` blocks until exit (no PID); `Bun.spawn` returns immediately with `.pid` | ✓ Good |
| Injectable `_exec` for niri test isolation | Bun built-in modules can't be mocked via mock.module; mutable object property is the workaround | ✓ Good |
| Commands array over hardcoded terminal spawn | User configures arbitrary commands; more flexible than single terminal config | ✓ Good — user decision |
| No cleanup on workspace remove | User manages niri workspace lifecycle manually; simplifies integration | ✓ Good — user decision |
| Cascade composition (remove → clean → close) | Higher-level commands compose lower-level functions; consistent teardown ordering | ✓ Good |
| `GS_TRIGGERED_BY` env var in hooks | Hooks know which top-level operation initiated the cascade | ✓ Good |
| Injectable `_exec` for shell-wrapper modules | Property replacement over mock.module() — faster, more explicit, no cache issues | ✓ Good |
| Centralized `prompts` wrapper in tui/utils.ts | Single mutable boundary for all @clack/prompts imports; one mock target | ✓ Good |
| Forge CLI pass-through (gh/glab/tea) | Inherit stdio for interactive auth; no custom API clients | ✓ Good |
| Issue IDs stored as strings | Unifies GitHub integers and Jira alphanumeric keys | ✓ Good |
| Jira configurable `open_cmd` template | Tool-agnostic via `sh -c` with `$ISSUE_ID` env var; no hard dependency | ✓ Good |
| Two-layer upstream detection (rev-parse first, ls-remote fallback) | Local check avoids network; fallback catches fresh pushes | ✓ Good |
| CWD detection via task_path longest-match | Deepest worktree path wins; trailing separator guard prevents prefix collisions | ✓ Good |
| Injectable `_cwdDetect` / `_resolveWorkspaceDeps` | Same `_exec` pattern for test isolation; bypasses bun mock.module cache issues | ✓ Good |
| `link [workspace-or-issue] [issue-id]` Commander.js signature | Both optional; workspaceExists() disambiguation for single-arg case | ✓ Good |
| `--ff-only` as pull default (no `--rebase`) | Rebase mid-work destroys in-progress state; ff-only is the safe default | ✓ Good |
| Fetch dedup by `main_path` in pull | Shared clones across worktrees only need one fetch | ✓ Good |
| Fetch-on-focus + 5-min TTL for staleness | Background polling causes jank; cursor-triggered fetch with cache is clean | ✓ Good |
| Template `includes:` limited to 1 level | Deep nesting adds complexity without demand; revisit if requested | ✓ Good |
| NameSchema `^[A-Za-z0-9._-]+$` regex | Blocks path traversal and shell metacharacters at Zod parse time | ✓ Good |
| Atomic writeYaml via temp-file + rename | Prevents config corruption on interrupted writes | ✓ Good |
| shellQuote for tmux/niri path interpolation | POSIX single-quote escaping prevents shell injection in path values | ✓ Good |
| FixOperation discriminated union for doctor --fix | Structured operations via Bun APIs, not shell strings | ✓ Good |
| `workspaces` array breaking change (v0.12.0) | Array-only schema is cleaner than backward-compat shimming | ✓ Done |
| Bag windows route to `workspaces[0]` only | Tier-1 windows (vscode, intellij) logically belong to primary workspace; subsequent entries get own commands | ✓ Good |
| Focus validation as post-parse runtime check | Zod `.superRefine` produces unfriendly path-qualified error strings in CLI context | ✓ Good |
| Convention-based completion inference | 5-key map replaces 46-entry static table; argument names are the convention | ✓ Good |
| Integration IDs hardcoded at generation time | Runtime filesystem scan adds complexity; IDs are static, known at build | ✓ Good |
| Contiguous port allocation with lockfile | First-fit on sorted free ranges; lockfile prevents race conditions between concurrent opens | ✓ Good |
| Port names as-is for env vars (no prefix) | User controls naming; `ports: { PORT: ~ }` → `PORT=12400` | ✓ Good |
| Workspace YAML is sole source of truth for ports | No separate allocation registry; remove frees ports implicitly via YAML deletion | ✓ Good |
| `is_dir` boolean with `z.boolean().default(false)` | Backward-compatible — existing registry YAML without the field works unchanged | ✓ Good |
| Dir guards in workspace-ops.ts, not git.ts | Git layer stays clean; mode-aware filtering belongs in business logic | ✓ Good |
| Dir repos added to `skipped` array (not silently ignored) | Consistent with trunk skip pattern; visible in status output | ✓ Good |
| `findInvalidDirRepos` separate from git health checks | Dir-specific validation (path exists, is directory) has different semantics than git checks | ✓ Good |

## Out of Scope

| Feature | Reason |
|---------|--------|
| Remote/cloud workspace sharing | Local-machine focus; no server component planned |
| GUI application | TUI and CLI only |
| Built-in package/tool version management | Delegate to mise/asdf via hooks |
| AI-triggered conflict resolution | Secondary priority; requires stable API first |
| Nix/devenv as first-class dependency | Out of domain; composable via hooks |
| Container/sandbox isolation | Out of scope for v0.x; revisit when agent-safety requirements clarify |
| Monorepo build caching | Nx/Turborepo's domain |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd:transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd:complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---

<details>
<summary>v0.2.0 milestone history</summary>

**Active goals (now complete):**
- Clarify and stabilize the core primitives (Stack→Registry+Template, Workspace, Integration, Hook contracts)
- Comprehensive test suite: unit tests for all lib functions, integration tests for key flows
- Safe destructive operations: `remove`, `clean`, `merge` with dry-run, confirmation prompts, and rollback paths
- Clear, actionable error messages throughout
- Easier workspace setup from an existing branch (not just new branches)
- Programmatic API surface for agent/automation use cases (deferred to v0.4.0)

See `.planning/milestones/v1.0-ROADMAP.md` for full archive.

</details>

---
*Last updated: 2026-05-16 after Phase 89 files.sync materialization*
