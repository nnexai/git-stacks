# Changelog

All notable changes to `git-stacks` are documented here.

---

## [Unreleased]

### Added

**Dedicated lifecycle phases** — close, clean, remove, and merge now have their own hook pairs:
- `pre_close` / `post_close` — fired when closing integration sessions
- `pre_clean` / `post_clean` — fired when removing worktrees (config kept)
- `pre_merge` — fired before git merge operations (complements existing `post_merge`)
- `post_remove` — fired after workspace config deletion (complements existing `pre_remove`)
- Per-repo `pre_clean` hook — runs before each individual worktree removal

**Lifecycle cascade** — teardown operations compose in layers:
- `remove` calls `clean` which calls `close` — each layer fires its own hooks
- `merge` follows the full cascade: close → clean → merge-specific → remove
- `WS_TRIGGERED_BY` env var injected into all hooks (`close`, `clean`, `remove`, or `merge`) so hooks know which top-level operation initiated the cascade

### Changed

- `mergeWorkspace` refactored to full D-10 lifecycle order via cascade composition instead of inline teardown
- `cleanWorkspace` and `removeWorkspace` compose through inner `_executeClose` / `_executeClean` functions
- TUI dashboard passes `captured: true` for all lifecycle dispatches (close, clean, remove, merge) — prevents hook stdout from corrupting the OpenTUI screen
- `--gone` cleanup path in `git-stacks clean` now delegates to `removeWorkspace()` for full lifecycle coverage

### Removed

- `runPreRemoveHooks` internal function — superseded by the cascade system; all callers migrated

---

## [0.6.0] — 2026-03-22

### Added

**Niri compositor integration** (for [niri](https://github.com/YaLTeR/niri) Wayland compositor users)
- Creates a dedicated named niri workspace per git-stacks workspace
- Moves windows from prior integrations (VSCode, IntelliJ) onto the named workspace automatically
- Declarative `columns` layout in workspace/template YAML:
  - `columns:` array — each column contains 1+ windows, ordered left-to-right
  - `width:` per column (e.g. `"50%"`, `"1280"`)
  - Three window types: `app:` (direct spawn), `command:` (shell spawn with cwd), `source:` (reuse prior integration window like vscode)
  - Multi-window columns stack automatically
  - `$WS_WORKSPACE`, `$WS_BRANCH`, `$WS_TASKS_DIR` env var substitution in args/command/cwd
- Focus control: `focus: true` on a window keeps it focused after layout; `focus: true` on the niri config keeps the workspace focused (without it, switches back — no focus steal)
- Cleanup on workspace clean/remove
- Silently skips when niri is not running
- Disabled by default — enable via `git-stacks config`

**Integration helper commands**
- `git-stacks integration tmux attach <workspace>` — attach to a workspace's tmux session
- `git-stacks integration niri focus-workspace <workspace>` — focus a workspace's niri workspace

**Integration artifact pipeline**
- Integrations now pass artifacts (session names, window PIDs) to subsequent integrations — niri uses this to collect windows spawned by VSCode/IntelliJ/tmux
- Window ID detection is automatic — integrations don't need compositor-specific code

### Changed

- tmux `open()` no longer attaches/focuses the session — creates it detached so the user can attach via `git-stacks integration tmux attach` or niri commands config
- tmux session killed automatically on workspace clean/remove

### Fixed

- **Dashboard open dialog broken** — opening a workspace through the dashboard made the "press any key to continue" dialog unresponsive; keyboard input displayed as raw escape sequences instead of being handled by the TUI
- Niri column ordering now reliable — windows are spawned first, then arranged into columns in a second pass

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
