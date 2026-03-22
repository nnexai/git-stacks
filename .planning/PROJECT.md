# git-stacks

## What This Is

`git-stacks` is a CLI workspace manager for feature-branch driven development. It creates isolated, fully-configured development environments per feature or task — instantly setting up git worktrees, IDE/terminal multiplexer sessions, and dependency repos from declarative templates. An interactive TUI dashboard (`git-stacks manage`) provides full CRUD for workspaces, templates, and repos, plus a real-time notification system for AI agent hooks. Works for a single developer juggling multiple features in parallel, or for AI agents that each need their own workspace without colliding on files.

## Core Value

One command should take you from "I need to work on feature X" to a fully running dev environment — the right repos checked out, the right branches created, the right IDE/terminal open, hooks run — without manual steps.

## Current State — v0.7.0 in progress (2026-03-22)

### What shipped in v0.7.0 (Phase 22 complete)

- **Workspace close command** — `git-stacks close <name>` tears down integration sessions (tmux kill, niri unname) and runs `pre_close` hooks without deleting worktrees or workspace YAML; workspace remains fully re-openable via `git-stacks open`; TUI dashboard action menu includes Close with `x` shortcut
- **Niri display fix** — TUI detail panes render niri columns config as human-readable "N col(s)" instead of `[object Object]`; shared `formatConfigValue` helper handles all non-primitive config values

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
- **Integrations** — VSCode, IntelliJ, tmux, cmux plugin system; extensible via `src/lib/integrations/`
- **Hooks** — `pre_create`, `post_create`, `pre_open`, `post_open`, `post_merge`, `pre_remove` at template and workspace levels; hooks receive `WS_WORKSPACE`, `WS_BRANCH`, `WS_TASKS_DIR`, `WS_REPO_NAME`

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

### Active

- [ ] Workspace close command — lightweight teardown (tmux, niri) without deleting workspace/worktrees
- [ ] Fix niri columns display in TUI details pane — `[object Object]` rendering bug
- [ ] Audit and isolate test environments from user config — ensure all tests use isolated temp dirs

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
| Branch completions for `new --from` | Design spike needed (repo-context resolution at completion time) |

## Current Milestone: v0.7.0 Close Command & Polish

**Goal:** Add workspace close command, fix niri display bug, and harden test isolation.

**Target features:**
- Workspace close command — lightweight teardown (end tmux session, remove niri named workspace) without deleting workspace directory or worktrees
- Fix niri columns `[object Object]` display in TUI details pane
- Audit and isolate all test environments from real user config

## Next Milestone Goals

After v0.7.0 — candidates for v0.8.0+:

- **Programmatic API** — export `workspace-ops.ts` as typed package; `Result<T>` return type; version gate for v1.0
- **Power user features** — `clone --pr <N>`, WezTerm/Zellij integrations, per-repo ahead/behind in status
- **Agent-aware** — batch workspace generation (`new --count N`), agent status file protocol, Windows IPC fallback
- **TUI completeness** — R-02 (add repo from TUI), R-03 (scan repos from TUI), T-03 cursor movement tests

## Versioning

**Current release:** `v0.5.1`
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
*Last updated: 2026-03-22 after v0.7.0 milestone started — Close Command & Polish*
