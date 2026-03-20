# Requirements: git-stacks v0.3.0

**Defined:** 2026-03-19
**Milestone:** v0.3.0 — Dashboard UI Overhaul
**Core Value:** One command takes you from "I need to work on feature X" to a fully running dev environment — right repos, right branches, right IDE/terminal open, hooks run — without manual steps.

## v0.3.0 Requirements

### Dashboard

- [x] **DASH-01**: User can switch between Workspaces, Templates, and Repos tabs using `[` / `]` or `1` / `2` / `3` keyboard shortcuts
- [x] **DASH-02**: Each tab maintains independent cursor position and filter state when switching tabs
- [x] **DASH-03**: Dashboard displays list and detail pane simultaneously in a split layout (list ~60% width, detail ~40%)
- [x] **DASH-04**: Detail pane auto-updates reactively as cursor moves through the list without additional input
- [x] **DASH-05**: User can perform all workspace actions (open, status, rename, merge, run, clean, remove) from the Workspaces tab action menu
- [x] **DASH-06**: User can edit a workspace YAML file in `$EDITOR` from the Workspaces tab; TUI suspends during editing and resumes after exit
- [x] **DASH-07**: User can view, edit (in `$EDITOR`), clone, and remove templates from the Templates tab
- [x] **DASH-08**: User can browse the repo registry in the Repos tab with a disk-health indicator per entry (path exists vs. missing on disk)
- [x] **DASH-09**: A persistent one-line help bar at the bottom shows context-sensitive key bindings for the active view/tab
- [x] **DASH-10**: Pressing `?` opens a scrollable keybinding reference overlay for the current context; `Esc` or `?` closes it
- [x] **DASH-11**: Pressing `Esc` consistently navigates back (action menu → list, overlay → split) without unintentionally exiting the TUI

### Messaging

- [ ] **MSG-01**: User can send a notification to a workspace via `git-stacks message send "<text>"` with workspace auto-detected from the `WS_WORKSPACE` environment variable
- [ ] **MSG-02**: User can explicitly specify the target workspace via `--workspace <name>` in `message send`, `message list`, and `message clear`
- [ ] **MSG-03**: User can optionally identify the message sender via `--from <sender-name>` in `message send`
- [ ] **MSG-04**: User can list all active notifications for a workspace via `git-stacks message list [--workspace <name>]`, showing sender, text, and timestamp
- [ ] **MSG-05**: User can clear all notifications for a workspace via `git-stacks message clear [--workspace <name>]`
- [ ] **MSG-06**: User can clear notifications from a specific sender via `git-stacks message clear --from <sender-name>`
- [ ] **MSG-07**: Each notification is persisted to a JSONL file at `~/.config/git-stacks/messages/{workspace}.jsonl`; messages survive TUI restarts
- [ ] **MSG-08**: `git-stacks message send` exits 0 when the TUI is not running (IPC push silently dropped; file write still succeeds)
- [ ] **MSG-09**: When the TUI is running, `git-stacks message send` delivers the notification in real-time via Unix socket without requiring a manual `R` refresh
- [ ] **MSG-10**: TUI opens a Unix socket on startup and removes the socket file on clean exit; stale socket from a previous crash is detected and replaced at startup
- [x] **MSG-11**: Workspaces tab list row shows a notification indicator per workspace that has active messages: most recent sender (if set), truncated text, and relative age (e.g., "2m ago")
- [x] **MSG-12**: Workspaces tab detail pane shows all active notifications for the selected workspace grouped by sender, with a per-sender `c` clear action

### Completions

- [x] **CMPL-01**: Shell completions suggest valid values for all fixed-choice flags across all commands (e.g., `--strategy rebase|merge`, `--sort date|name|status`, `--output json|text`, `--mode worktree|trunk`)
- [x] **CMPL-02**: Shell completions suggest workspace names for all commands and subcommands that accept a workspace argument
- [x] **CMPL-03**: Shell completions suggest template names for all template subcommands (`template edit`, `template remove`, etc.)
- [x] **CMPL-04**: Shell completions suggest repo names for all repo subcommands (`repo remove`, etc.)
- [x] **CMPL-05**: Shell completions cover all subcommand trees including `repo add|scan|list|remove`, `template new|edit|list|remove`, and `message send|list|clear`
- [x] **CMPL-06**: `message send`, `message list`, and `message clear` have workspace name completion for the `--workspace` flag

---

## Future Requirements

Acknowledged but deferred to v0.3.x or v0.4.0.

### Completions

- **CMPL-F01**: Branch completions for `new --from <branch>` and `clone` — requires design spike on repo-context resolution at completion time (flagged HIGH complexity)

### Messaging

- **MSG-F01**: Windows IPC support — TCP localhost fallback for `git-stacks message send` push when running on Windows (AF_UNIX requires Win10 1803+; out of scope for v0.3.0)
- **MSG-F02**: Auto-clear messages on `workspace open` — convenient but low priority; users can call `message clear` explicitly
- **MSG-F03**: Message retention policy / configurable TTL — messages are currently ephemeral per-session; bounded retention deferred

### Dashboard

- **DASH-F01**: In-TUI template creation wizard — suspend/resume already handles editing; new-template wizard inside OpenTUI requires renderer bridging, deferred
- **DASH-F02**: Mouse support — OpenTUI capability gap; keyboard-first is correct for v0.3.0

---

## Out of Scope

| Feature | Reason |
|---------|--------|
| Real-time auto-refresh polling loop | Hammers filesystem, produces flicker; `R` manual refresh is sufficient |
| WebSocket/complex pub-sub for messaging | High complexity, marginal benefit over Unix socket; file-based JSONL is ground truth |
| Animated per-row progress indicators | Scope creep; existing `StatusIndicator` and `ProgressView` are sufficient |
| Searching/filtering within the detail pane | Premature; max ~20 repos per workspace |
| Flag completions requiring network calls | Latency + failure modes unacceptable in completion scripts |
| Mouse support in TUI | OpenTUI library does not expose mouse events today |
| Windows IPC support (v0.3.0) | Explicitly deferred; Windows may target v0.4.0+ |

---

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| MSG-01 | Phase 6 | Pending |
| MSG-02 | Phase 6 | Pending |
| MSG-03 | Phase 6 | Pending |
| MSG-04 | Phase 6 | Pending |
| MSG-05 | Phase 6 | Pending |
| MSG-06 | Phase 6 | Pending |
| MSG-07 | Phase 6 | Pending |
| MSG-08 | Phase 6 | Pending |
| MSG-09 | Phase 6 | Pending |
| MSG-10 | Phase 6 | Pending |
| MSG-11 | Phase 9 | Complete |
| MSG-12 | Phase 9 | Complete |
| DASH-01 | Phase 8 | Complete |
| DASH-02 | Phase 8 | Complete |
| DASH-03 | Phase 8 | Complete |
| DASH-04 | Phase 8 | Complete |
| DASH-05 | Phase 8 | Complete |
| DASH-06 | Phase 8 | Complete |
| DASH-07 | Phase 8 | Complete |
| DASH-08 | Phase 8 | Complete |
| DASH-09 | Phase 8 | Complete |
| DASH-10 | Phase 8 | Complete |
| DASH-11 | Phase 8 | Complete |
| CMPL-01 | Phase 7 | Complete |
| CMPL-02 | Phase 7 | Complete |
| CMPL-03 | Phase 7 | Complete |
| CMPL-04 | Phase 7 | Complete |
| CMPL-05 | Phase 7 | Complete |
| CMPL-06 | Phase 7 | Complete |

**Coverage:**
- v0.3.0 requirements: 29 total
- Mapped to phases: 29
- Unmapped: 0 ✓

---
*Requirements defined: 2026-03-19*
*Last updated: 2026-03-19 — traceability populated after roadmap creation*
