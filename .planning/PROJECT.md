# git-stacks

## What This Is

`git-stacks` is a CLI workspace manager for feature-branch driven development. It creates isolated, fully-configured development environments per feature or task — instantly setting up git worktrees, IDE/terminal multiplexer sessions, and dependency repos from declarative templates. An interactive TUI dashboard (`git-stacks manage`) provides full CRUD for workspaces, templates, and repos, plus a real-time notification system for AI agent hooks. Works for a single developer juggling multiple features in parallel, or for AI agents that each need their own workspace without colliding on files.

## Core Value

One command should take you from "I need to work on feature X" to a fully running dev environment — the right repos checked out, the right branches created, the right IDE/terminal open, hooks run — without manual steps.

## Current State — v0.10.0 in progress (Phase 37 complete, 2026-03-26)

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
- **Integrations** — VSCode, IntelliJ, tmux, cmux, niri plugin system; extensible via `src/lib/integrations/`
- **Issue Tracking** — `issue link/unlink/open` commands on GitHub, GitLab, Gitea, and Jira integration plugins; shared `issue-utils.ts` for resolution/persistence
- **Hooks** — full lifecycle hook pairs (`pre_close`/`post_close`, `pre_clean`/`post_clean`, `pre_merge`/`post_merge`, `pre_remove`/`post_remove`, plus `pre_create`/`post_create`, `pre_open`/`post_open`) at template and workspace levels; per-repo `pre_open` and `pre_clean`; cascade design (remove → clean → close); hooks receive `GS_WORKSPACE_NAME`, `GS_WORKSPACE_BRANCH`, `GS_WORKSPACE_PATH`, `GS_REPO_NAME`, `GS_TRIGGERED_BY`

## Requirements

### Validated

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

### Active

- [x] `git-stacks paths` — output workspace repo paths with `--prefix` flag for agent CLI arg injection — v0.10.0 Phase 37
- [ ] `git-stacks pull` — pull latest for all repos in a workspace (worktrees pull branch, trunk repos pull default branch)
- [ ] `git-stacks env` — dump merged workspace env vars with `--format shell|dotenv|json`
- [ ] TUI upstream staleness indicator — periodic "N behind" badge per repo with cached fetch check
- [ ] Template composition — `includes:` field for meta-templates + ad-hoc `--template a --template b` on `git-stacks new`
- [ ] Release prep — version bump, CHANGELOG, README updates

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

## Current Milestone: v0.10.0 Multi-Agent Workspace Tooling

**Goal:** Make git-stacks the infrastructure layer for humans managing multiple AI agents — queryable workspace data for agent bootstrap, repo sync primitives, and composable templates.

**Target features:**
- `git-stacks paths` — output workspace repo paths with `--prefix` flag for agent CLI arg injection
- `git-stacks pull` — pull latest for all repos in a workspace (worktrees pull branch, trunk repos pull default branch)
- `git-stacks env` — dump merged workspace env vars (global → template → workspace → GS_* injected); `--format shell|dotenv|json`
- TUI upstream staleness indicator — periodic "N behind" badge per repo; cached fetch check on workspace focus + manual refresh
- Template composition — `includes:` field for meta-templates + ad-hoc `--template a --template b` on `git-stacks new`; merge rules: repos union (worktree wins), hooks concatenate, env merges
- Release prep — version bump, CHANGELOG, README

## Completed Milestone: v0.9.0 Identity & Completion Integrity (2026-03-25)

**Goal:** Make workspace/template identity robust using name fields as canonical keys, and ensure shell completions cover all commands shipped to date.

**Shipped:** All target features delivered across 6 phases (33-36, plus 34.1 test isolation insert).

## Future Candidates (v1.0.0+)

- **Programmatic API** — export `workspace-ops.ts` as typed package; `Result<T>` return type; version gate for v1.0
- **Power user features** — `clone --pr <N>`, WezTerm/Zellij integrations
- **Agent-aware** — batch workspace generation (`new --count N`), agent status file protocol, Windows IPC fallback
- **TUI completeness** — R-02 (add repo from TUI), R-03 (scan repos from TUI), T-03 cursor movement tests

## Versioning

**Current release:** `v0.9.0`
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
*Last updated: 2026-03-26 — Phase 37 (Agent Path Discovery) complete*
