# Changelog

All notable changes to `git-stacks` are documented here.

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
