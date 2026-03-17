# git-stacks

## What This Is

`git-stacks` is a CLI workspace manager for feature-branch driven development. It creates isolated, fully-configured development environments per feature or task — instantly setting up git worktrees, IDE/terminal multiplexer sessions, and dependency repos from declarative stack templates. Works for a single developer juggling multiple features in parallel, or for AI agents that each need their own workspace without colliding on files.

## Core Value

One command should take you from "I need to work on feature X" to a fully running dev environment — the right repos checked out, the right branches created, the right IDE/terminal open, hooks run — without manual steps.

## Requirements

### Validated

- ✓ `git-stacks new` creates a workspace from one or more stack templates — existing
- ✓ `git-stacks open` re-opens an existing workspace, recreating missing worktrees — existing
- ✓ `git-stacks clone` creates a workspace from an existing remote branch — existing
- ✓ Stack YAML format defines repos, modes (worktree/trunk), hooks, env vars, file ops — existing
- ✓ Workspace YAML persists task instances at `~/.config/git-stacks/workspaces/` — existing
- ✓ Git worktree isolation per repo (worktree vs trunk mode) — existing
- ✓ Hook system: `pre_create`, `post_create`, `pre_open`, `post_open`, `post_merge`, `pre_remove` — existing
- ✓ Integration plugin system: VSCode, IntelliJ, tmux, cmux — existing
- ✓ Interactive TUI dashboard (`git-stacks manage`) via SolidJS + OpenTUI — existing
- ✓ Stack wizards: `stack new`, `stack init`, `stack edit` — existing
- ✓ Shell completion for bash/zsh/fish — existing
- ✓ `git-stacks doctor` health check and drift detection — existing
- ✓ `git-stacks merge` with conflict pre-check — existing
- ✓ `git-stacks sync` with rebase/merge strategies — existing
- ✓ `git-stacks run` to execute commands across all workspace repos — existing

### Active

- [ ] Clarify and stabilize the core primitives (Stack, Workspace, Repo, Integration, Hook contracts)
- [ ] Comprehensive test suite: unit tests for all lib functions, integration tests for key flows
- [ ] Safe destructive operations: `remove`, `clean`, `merge` with dry-run, confirmation prompts, and rollback paths
- [ ] Clear, actionable error messages throughout — especially for git failures, missing repos, config errors
- [ ] Easier workspace setup from an existing branch (not just new branches)
- [ ] Better merge tooling: per-repo status visibility, partial merges, conflict surfacing
- [ ] Expand integration support: additional IDE targets, smarter detection
- [ ] Programmatic API surface for agent/automation use cases

### Out of Scope

- Remote/cloud workspace sharing — local-machine focus, no server component planned
- GUI application — TUI and CLI only
- Agent memory/session persistence — interesting problem, revisit after core is solid
- AI-triggered operations (merge conflict resolution, intelligent setup) — secondary priority

## Context

- **Working PoC**: All core commands exist and work. Architecture is clean (layered: config → lib → commands → TUI). The integration plugin pattern and hook system are well-designed extensibility points.
- **Brownfield development**: New work must not break existing config formats (`stacks/{name}.yml`, `workspaces/{name}.yml`) — users may already have configs in place.
- **Multi-agent use case**: The isolation model (one workspace per task) makes this naturally compatible with AI agents working in parallel. Agents creating new worktrees currently see them as fresh projects — context persistence across workspace recreations is an open problem for later.
- **Inspiration**: workmux, cmux — the feel should be fast, composable, and frictionless like those tools.

## Versioning

**Package version:** This roadmap targets the `v0.2.0` npm release. The project is staying on zerover (`0.x`) until core primitives are fully settled (the Stacks-vs-Templates design decision is the main gate).

**GSD epic naming:** The GSD planning system calls this work "v1" internally (first planned milestone). This does not mean semver v1.0. When the GSD roadmap says "v1 requirements," it means requirements for this milestone — not a public API stability promise.

**Version gate for 1.0:** Not planned until: core primitives decided, destructive ops hardened, programmatic API stabilized.

## Constraints

- **Runtime**: Bun — no Node.js compatibility required; use Bun APIs freely (`$`, `spawn`, `Bun.file`)
- **Language**: TypeScript strict mode throughout
- **Config format**: YAML with Zod validation — preserve schema compatibility with existing user configs
- **No breaking changes**: Existing stack/workspace YAML files must continue to work across improvements

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Bun runtime over Node.js | Performance + native TS + shell scripting via `$` | ✓ Good |
| YAML for all config | Human-readable, editable without the tool | ✓ Good |
| Integration plugin pattern | Add IDE/terminal support without touching core | ✓ Good |
| Git worktrees as isolation primitive | Avoids full clones, preserves git history/branches | ✓ Good |
| Per-stack + per-workspace hooks | Composable automation at the right scope | — Pending evaluation |
| SolidJS for TUI dashboard | Reactive UI in terminal via OpenTUI | — Pending evaluation |

---
*Last updated: 2026-03-17 after initialization*
