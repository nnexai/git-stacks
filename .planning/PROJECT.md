# git-stacks

## What This Is

`git-stacks` is a CLI workspace manager for feature-branch driven development. It creates isolated, fully-configured development environments per feature or task — instantly setting up git worktrees, IDE/terminal multiplexer sessions, and dependency repos from declarative templates. An interactive TUI dashboard (`git-stacks manage`) provides full CRUD for workspaces, templates, and repos, plus a real-time notification system for AI agent hooks. Works for a single developer juggling multiple features in parallel, or for AI agents that each need their own workspace without colliding on files.

## Core Value

One command should take you from "I need to work on feature X" to a fully running dev environment — the right repos checked out, the right branches created, the right IDE/terminal open, hooks run — without manual steps.

## Current Milestone: v0.4.0 TUI Hardening & Polish

**Goal:** Make the TUI fully self-sufficient — e2e tested, visually polished, and capable of all operations currently requiring the CLI.

**Target features:**
- E2E test infrastructure for the TUI dashboard (automated validation replaces slow manual testing)
- TUI screen improvements: info density, screen space usage, layout polish
- Create workspace (new/clone) from within TUI
- Repo management in TUI: add, scan, remove (registry is currently browse-only)
- Template creation from within TUI (edit/clone/remove exist, create does not)
- Workspace sync action in TUI action menu

## Current State — v0.3.0 (shipped 2026-03-20)

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

- [ ] Programmatic API — export `workspace-ops.ts` as typed package; `Result<T>` return type
- [ ] WezTerm/Zellij integrations
- [ ] `clone --pr <N>` — create workspace from GitHub PR branch
- [ ] Per-repo ahead/behind indicator in workspace status
- [ ] Batch workspace generation (`new --count N`) for agent orchestration
- [ ] Agent status file protocol (standardized env injection for agent frameworks)

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

## Next Milestone Goals

After v0.3.0 — candidates for v0.4.0:

- **Programmatic API** — export `workspace-ops.ts` as typed package; `Result<T>` return type; version gate for v1.0
- **Power user features** — `clone --pr <N>`, WezTerm/Zellij integrations, per-repo ahead/behind in status
- **Agent-aware** — batch workspace generation (`new --count N`), agent status file protocol, Windows IPC fallback

## Versioning

**Current release:** `v0.3.0`
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
*Last updated: 2026-03-21 — Phase 12 (workspace-sync) complete*
