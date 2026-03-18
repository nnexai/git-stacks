# git-stacks

## What This Is

`git-stacks` is a CLI workspace manager for feature-branch driven development. It creates isolated, fully-configured development environments per feature or task — instantly setting up git worktrees, IDE/terminal multiplexer sessions, and dependency repos from declarative templates. Works for a single developer juggling multiple features in parallel, or for AI agents that each need their own workspace without colliding on files.

## Core Value

One command should take you from "I need to work on feature X" to a fully running dev environment — the right repos checked out, the right branches created, the right IDE/terminal open, hooks run — without manual steps.

## Current State — v0.2.0 (shipped 2026-03-18)

### What shipped in v0.2.0

- **Stable foundation** — Test infra with real git repos, Zod schema resilience, prerequisite checks, 5 live bug fixes (atomic merge/remove/rename, mergeNoFF detached HEAD)
- **File ops engine** — Copy/symlink with glob at workspace-instance and per-repo levels; idempotent; loud-fail
- **Dynamic version** — `git-stacks -V` shows `package.json` version + git hash + `-dirty` flag
- **Destructive op safety** — `--dry-run` / `--force` on `remove`, `clean`, `merge`, `rename`; external file warnings before teardown
- **Registry + Template model** — Stack model fully replaced; Repo Registry as source of truth; Templates as reusable workspace recipes; workspace YAML self-contained at creation
- **UX polish** — `formatError` with actionable hints, `--json` on `status`/`doctor`/`sync`, `doctor --fix`, richer `list` columns, `run --parallel`
- **Tech debt closed** — Full `openWorkspace()` lifecycle on "open now?", typed Workspace in new flow, dead code removed

### Current primitives (stable as of v0.2.0)

- **Repo Registry** (`~/.config/git-stacks/registry.yml`) — source of truth for local repo locations and default branches
- **Templates** (`~/.config/git-stacks/templates/{name}.yml`) — reusable workspace recipes with per-repo mode, branch patterns, hooks, env, file ops
- **Workspaces** (`~/.config/git-stacks/workspaces/{name}.yml`) — task-scoped instances; self-contained snapshots at creation time
- **Integrations** — VSCode, IntelliJ, tmux, cmux plugin system; extensible via `src/lib/integrations/`
- **Hooks** — `pre_create`, `post_create`, `pre_open`, `post_open`, `post_merge`, `pre_remove` at stack/template and workspace levels

## Current Milestone: v0.3.0 Dashboard UI Overhaul

**Goal:** Transform the minimal OpenTUI dashboard into management central — full CRUD for all entities, a workspace notification system for AI agent hooks, and comprehensive shell completions.

**Target features:**
- **Dashboard overhaul** — Tabbed layout (Workspaces | Templates | Repos), list + detail pane per tab, all CLI actions accessible in-TUI, system editor integration for config files
- **Notification/messaging system** — `git-stacks message send|clear|list` subcommand family; workspace-scoped notifications with optional sender (for per-agent granularity); displayed in workspace list row (latest + age) and detail pane (per-sender, clearable); drop silently when TUI not running
- **Shell completions overhaul** — Full dynamic coverage (workspaces, templates, repos, branches) + all fixed enum values (sync strategies, modes, output formats) across all commands

## Next Milestone Goals

After v0.3.0 — candidates:

- **Programmatic API** — export `workspace-ops.ts` as typed package; `Result<T>` return type
- **Power user features** — `clone --pr <N>`, WezTerm/Zellij integrations, per-repo ahead/behind
- **Agent-aware** — batch workspace generation (`new --count N`), agent status file protocol

## Versioning

**Current release:** `v0.2.0`
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
| SolidJS for TUI dashboard | Reactive UI in terminal via OpenTUI | — Pending evaluation |
| Workspace YAML self-contained at creation | No template required at open time; resilient to template deletion | ✓ Good |

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
<summary>v1.0 milestone history (GSD internal name for v0.2.0 work)</summary>

**Active goals (now complete):**
- Clarify and stabilize the core primitives (Stack, Workspace, Repo, Integration, Hook contracts)
- Comprehensive test suite: unit tests for all lib functions, integration tests for key flows
- Safe destructive operations: `remove`, `clean`, `merge` with dry-run, confirmation prompts, and rollback paths
- Clear, actionable error messages throughout
- Easier workspace setup from an existing branch (not just new branches)
- Programmatic API surface for agent/automation use cases (deferred to next milestone)

See `.planning/milestones/v1.0-ROADMAP.md` for full archive.
</details>

---
*Last updated: 2026-03-19 — v0.3.0 milestone started*
