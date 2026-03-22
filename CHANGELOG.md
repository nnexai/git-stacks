# Changelog

All notable changes to `git-stacks` are documented here.

---

## [0.6.0] — 2026-03-22

### Added

**Integration artifact pipeline**
- `Integration.open()` now returns `IntegrationArtifact | null` instead of `void` — typed discriminated union covers tmux, cmux, and window variants
- `ArtifactBag` accumulator type threads artifact results through the integration chain — each integration receives prior integrations' outputs
- tmux returns `{ kind: "tmux", sessionName }`, cmux returns `{ kind: "cmux", workspaceRef }`, vscode/intellij return `{ kind: "window", pid, app_id, title }`

**Centralized integration runner** (`src/lib/integrations/runner.ts`)
- `runIntegrations(ctx, skip)` — generate + open mode with ArtifactBag accumulation; replaces the inline loop in `workspace-ops.ts`
- `runIntegrationGenerate(ctx)` — generate-only mode for TUI callers; replaces inline loops in `workspace-wizard.ts`, `workspace-clone.ts`, `App.tsx`
- Three-tier numeric ordering via `order` field on `Integration` interface: tier 1 (10-19: vscode, intellij, tmux), tier 2 (20-29: cmux), tier 3 (30+: niri)
- Existing `--no-ide` / `--no-cmux` skip flags preserved through the runner

**Niri compositor integration** (`src/lib/integrations/niri.ts`)
- Tier-3 integration plugin (order 30, disabled by default) — runs after all other integrations
- Creates/reuses a named niri workspace per git-stacks workspace via `niri msg action set-workspace-name`
- Moves windows from prior integrations onto the named workspace using niriWindowIds from the ArtifactBag
- Focuses the niri workspace after setup so new windows open there naturally
- User-configurable `commands: string[]` — spawned via `niri msg action spawn` (niri owns the windows, no shell wrapper). Supports `$WS_WORKSPACE`, `$WS_BRANCH`, `$WS_TASKS_DIR` env var substitution. Commands read from workspace settings first, global config as fallback.
- Cleanup on workspace clean/remove: unsets niri workspace name
- Gated by `NIRI_SOCKET` env var — silently skips when niri is not running
- Idempotent on re-open: checks if named workspace already exists before creating
- Config schema: `{ enabled: boolean, commands?: string[] }`

**Integration helper commands** (`git-stacks integration <name> <action>`)
- New optional `commands?(parent: Command): void` method on `Integration` interface — integrations register their own CLI subcommands
- `git-stacks integration tmux attach [workspace]` — attach to a workspace's tmux session
- `git-stacks integration niri focus-workspace [workspace]` — focus a workspace's niri workspace

**Niri shell wrappers** (`src/lib/niri.ts`)
- 8 typed async functions wrapping all `niri msg` IPC calls: `isNiriRunning()`, `listNiriWindows()`, `listNiriWorkspaces()`, `setNiriWorkspaceName()`, `moveWindowToWorkspace()`, `niriSpawn()`, `focusNiriWorkspace()`, `snapshotWindowIds()`
- Zod-validated JSON schemas for niri window and workspace data
- Injectable `_exec` object for test isolation — all niri calls mockable without spawning real processes

**Test coverage**
- 63 new tests (375 → 438 total) covering runner ordering/skip/accumulation, artifact return values, niri shell wrappers, and niri integration plugin
- All niri tests pass without `NIRI_SOCKET` present in the test environment

### Changed

- `Integration` interface: `open()` signature changed from `(ctx, artifactPath) → Promise<void>` to `(ctx, artifactPath, bag) → Promise<IntegrationArtifact | null>`
- `Integration` interface: added required `order: number` field for execution ordering
- `Integration` interface: added optional `cleanup?(ctx): Promise<void>` for resource teardown on workspace clean/remove
- `Integration` interface: added optional `commands?(parent: Command): void` for registering CLI helper subcommands
- VSCode and IntelliJ integrations now use `Bun.spawn` instead of `Bun.$` for IDE launch — enables PID capture for artifact reporting
- tmux `open()` no longer attaches/focuses the session — creates it detached so the user can attach where they want (e.g., via niri commands or `git-stacks integration tmux attach`)
- tmux `cleanup()` kills the session by name on workspace clean/remove
- Niri commands use `niriSpawn()` instead of `runHooks()` — windows are spawned via niri IPC (no shell, no stdio inheritance that would corrupt the TUI dashboard)

---

## [0.5.1] — 2026-03-21

### Improved

- **Workspace list message layout**: moved repo counts (`Nwt Mtr`) to a fixed column after branch name (matching repo tab pattern), freeing remaining space for message previews
- **Message visibility**: message preview text now renders in white instead of gray, making it much more readable against the terminal background
- **Message age color**: age indicator is now always yellow when a message exists, providing consistent visual distinction

### Added

- **WorkspaceRow snapshot tests**: 8 snapshot tests covering focused/unfocused/selected rows, message preview, system messages, dirty repos, name truncation, and message truncation

---

## [0.5.0] — 2026-03-21

### Added

**Agent hook installer** (`git-stacks install --hooks`)
- Install AI agent framework hooks into the current directory's `.claude/settings.json`
- Hooks bridge Claude Code lifecycle events into git-stacks workspace notifications:
  - `Stop` — sends "Claude has finished and may need your attention"
  - `PreToolUse` (AskUserQuestion) — sends "Claude is asking a question — input needed"
  - `UserPromptSubmit` — clears notification (user is responding)
  - `PostToolUse` (AskUserQuestion) — clears notification
- Workspace auto-detection from cwd (path-based) or `WS_WORKSPACE` env var, with interactive fallback
- Multi-select for agent frameworks (extensible plugin system, Claude Code included)
- `git-stacks install --hooks --remove` to uninstall hooks
- Idempotent: running install twice updates hooks without duplication
- Merges into existing `.claude/settings.json` without disturbing other keys (permissions, etc.)

**Extensible agent hook plugin system** (`src/lib/agent-hooks/`)
- `AgentHookPlugin` interface for adding new agent framework integrations
- Plugin registry pattern: add a new file + register in `index.ts`
- Generates proper Claude Code nested hooks format (object keyed by event name with matcher groups)

**Test coverage improvements**
- 30 previously-TODO tests implemented across 6 test files (doctor-json, doctor-fix, status-json, sync-json, list-columns, run-parallel)
- Snapshot tests for 7 TUI dashboard components (CenteredDialog, StatusIndicator, BatchBar, ConfirmDialog, HelpOverlay, ProgressView, RepoDetail)

---

## [0.4.1] — 2026-03-21

### Fixed

- **Wizard input width**: text inputs in all wizard dialogs (create workspace, create template) now span the full dialog width via `flexGrow={1}` instead of showing only a few characters
- **Double-nested dialog**: wizard text steps no longer render `InlineInput` (which wraps in its own `CenteredDialog`), eliminating the double-nesting that clipped inputs to ~35% terminal width
- **Git worktree output bleed**: `git worktree add` output (commit messages) no longer bleeds into the TUI — commands now use `.quiet()`
- **Number keys in dialogs**: pressing 1/2/3 or `[`/`]` no longer switches tabs while a wizard, action menu, confirm dialog, or other overlay is active — dialog guards now block all navigation keys

### Added

- **Batch bar on all tabs**: templates and repos tabs now show a selection bar at the bottom of the list when items are selected, matching the workspaces tab pattern
- **Batch bar positioning**: selection bar anchored to bottom of list pane instead of appearing right after the last selected entry

---

## [0.4.0] — 2026-03-21

### Added

**TUI test infrastructure**
- Headless `testRender` + `mockInput` + `captureCharFrame` API for automated TUI testing — 311 tests across 38 files run in CI without a real terminal
- `GIT_STACKS_CONFIG_DIR` environment variable overrides config directory location for test isolation
- App-level integration tests covering tab switching, action menu dispatch, wizard entry/cancel, and sync progress flows

**Workspace sync** (`git-stacks manage` → Workspaces → `s`)
- Sync action in workspace action menu with per-repo progress display
- 30-second fetch timeout on unreachable remotes — TUI never hangs
- Sync summary showing repos synced, skipped, and failed
- Keyboard input blocked during sync to prevent double-dispatch

**Create workspace from TUI** (`git-stacks manage` → Templates → `w` or Repos → `n`)
- Multi-step wizard: select template → enter name → enter branch → summary/confirm
- Back-navigation (Escape goes to previous step) and full cancel
- After creation, cursor positions on the newly created workspace
- Ad-hoc creation from Repos tab with Space multi-select
- All wizard text fields use built-in `<input>` with cursor movement

**Template and repo management from TUI**
- `git-stacks manage` → Repos → Enter opens action menu with create workspace, create template, and remove options
- Template creation from selected repos via Repos tab action menu
- Repo remove with blocked-removal view (shows referencing workspaces/templates)
- Unified `>[x]` checkbox-style selection indicators across all three tabs

**Screen polish**
- Width-tiered help bar: progressive content at 50/65/80/100 column widths — always fits
- Workspace list rows show relative age (`3d`, `2h`, `5m`) instead of ISO date string
- Responsive column widths across all list views — no hard-coded character widths
- 30-second tick timer refreshes relative timestamps automatically

**CenteredDialog overlay architecture**
- All 11 dialog types (action menus, confirms, wizards, progress views, help, messages) render as centered overlays with dimmed background
- Three size variants: small (50%) for confirms/menus, medium (70%) for wizards/progress, large (90%) for help/messages
- Content behind overlays remains visible — split pane stays rendered underneath
- Arrow key + Enter cursor navigation in all action menus

**Integration overrides**
- `git-stacks template new` / `git-stacks template edit` prompt for per-integration overrides (enable/disable/configure per integration)
- `git-stacks new` / `git-stacks clone` prompt for per-workspace integration overrides with cascade-aware pre-selection
- `git-stacks edit <name>` — new command to modify workspace integration overrides post-creation
- Integration cascade: global → template → workspace; overrides stored conditionally in YAML (no key when user declines)
- TUI detail panes show resolved integration state with source annotations (`[global]`, `[template]`, `[workspace]`, `[skipped: no matching repos]`) and config values inline

**Prerequisites**
- `InlineInput` rewritten to wrap OpenTUI built-in `<input>` — gains cursor movement, selection, undo/redo for free
- `runHooksCaptured()` in `lifecycle.ts` — streams hook stdout/stderr via callback instead of `stdio: "inherit"`, preventing OpenTUI screen corruption

### Fixed

- InlineInput no longer uses hand-rolled `useKeyboard` character accumulation — all text fields use built-in `<input>` component
- Keyboard isolation: input-mode guard placed above all navigation handlers to prevent key leaks when `<input>` is focused
- Deferred focus pattern (`setTimeout(() => setFocused(true), 0)`) prevents trigger keypress from leaking into newly mounted inputs
- Bun `mock.module` cross-file cache collision resolved via query-parameter cache-busting

---

## [0.3.0] — 2026-03-20

### Added

**Workspace notification system**
- `git-stacks message send "<text>"` — send a notification to the current workspace (auto-detected via `WS_WORKSPACE`); use `--workspace <name>` to target explicitly
- `git-stacks message send --from <sender>` — tag message with a sender name (useful for per-agent granularity in hook scripts)
- `git-stacks message list [--workspace <name>]` — list active notifications showing sender, text, and timestamp; supports `--json`
- `git-stacks message clear [--workspace <name>] [--from <sender>]` — clear all messages or per-sender
- Messages are durable JSONL files at `~/.config/git-stacks/messages/{workspace}.jsonl`; survive TUI restarts
- `message send` exits 0 when the TUI is not running — IPC push is silently dropped, file write still succeeds

**Dashboard overhaul** (`git-stacks manage`)
- Tabbed layout: Workspaces | Templates | Repos — switch with `1`/`2`/`3` or `[`/`]`
- Split list + detail pane per tab — detail pane updates reactively as cursor moves; no Enter required
- Independent cursor position and filter state per tab
- Workspaces tab: full action menu (open, rename, merge, run, clean, remove, edit YAML in `$EDITOR`)
- Templates tab: edit in `$EDITOR`, clone, remove
- Repos tab: repo registry browser with disk health indicator (path exists vs missing)
- Persistent context-sensitive help bar; `?` opens scrollable keybinding reference overlay
- `Esc` navigates back consistently (action menu → list, overlay → split)

**IPC push message display**
- Workspace list rows show live notification preview — most recent sender, truncated text, relative age (e.g., "2m ago")
- Workspace detail pane shows notifications grouped by sender, newest first per sender
- `c` key clears a sender's messages from the detail pane
- `m` key opens full-screen MessageOverlay with grouped sender view, cursor navigation, and `c`-to-clear
- IPC socket status indicator (●/○) in help bar for socket health visibility
- 30-second tick timer refreshes relative timestamps automatically

**Shell completion overhaul**
- `--strategy` flag completes to `rebase | merge`
- `--sort` flag completes to `date | name | status`
- `--workspace` flag on all `message` subcommands completes with workspace names
- Full `message send|list|clear` subcommand tree coverage in bash, zsh, and fish
- All previously supported dynamic completions (workspace, template, repo names) preserved

### Fixed

- OpenTUI nested `<text>` crash in TemplateList/RepoList — root cause identified and eliminated; multi-colored row segments now use `<box flexDirection="row">` with sibling `<text>` elements
- Tab switching key-press freeze — resolved by height-based visibility pattern instead of DOM conditional swapping
- Batch selection keys (`Space`, etc.) no longer bleed across tabs — scoped to Workspaces tab only
- Rename view stays on progress on error; resets to list on success
- Relative time display in message previews updates without manual `R` refresh
- IPC socket stale detection: always unlinks on startup instead of Bun.connect probe (eliminates hang)

---

## [0.2.0] — 2026-03-18

### Changed (Breaking)

- **Stack model replaced by Registry + Template model** — existing `~/.config/git-stacks/stacks/` configs are not migrated. Run `git-stacks repo scan` and `git-stacks template new` to recreate.

### Added

- **Repo Registry** — `git-stacks repo add|scan|list|show|remove|rename` manages a flat list of local repos at `~/.config/git-stacks/registry.yml`
- **Templates** — `git-stacks template new|list|show|edit|clone|rename|remove` manages workspace recipes at `~/.config/git-stacks/templates/{name}.yml`
- File ops engine — copy/symlink with glob patterns at workspace-instance and per-repo levels; idempotent
- `git-stacks -V` shows `package.json` version + git hash + `-dirty` flag
- `--dry-run` / `--force` flags on `remove`, `clean`, `merge`, `rename`; external file warnings before teardown
- `--json` output on `status`, `doctor`, `sync`
- `doctor --fix` — auto-repairs drift between config and filesystem
- `run --parallel` — run commands across workspace repos concurrently
- `formatError` with actionable hints throughout CLI

### Fixed

- Atomic merge/remove/rename operations (no partial state on failure)
- `mergeNoFF` detached HEAD bug
- `openWorkspace()` lifecycle properly called when user chooses "open now?" during `new`
- Typed `Workspace` object in new workspace flow

---

## [0.1.x] — pre-v0.2.0

Initial Stack-model implementation. Replaced in v0.2.0.
