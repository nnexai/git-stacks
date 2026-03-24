# Milestones

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
