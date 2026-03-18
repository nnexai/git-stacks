# Feature Landscape — v0.3.0

**Domain:** Rich terminal management UI, inter-process workspace messaging, shell completion completeness
**Researched:** 2026-03-19
**Scope:** v0.3.0 milestone only — dashboard overhaul, notification/messaging system, shell completion improvements

---

## Current State Baseline

The existing dashboard (`git-stacks manage`) is a SolidJS/OpenTUI single-screen list with:
- Workspace list, cursor navigation (j/k/arrows), space-to-select batch
- Action popup menu per workspace (open, status, edit, clean, remove, merge)
- Confirm dialog for destructive actions
- Progress view for long-running ops
- Detail status pane (repo list with dirty/missing indicators)
- / filter, R refresh, q quit

Shell completions cover: top-level commands, workspace names for workspace commands, repo names for repo subcommands, template names for template subcommands. Missing: branches, enum flag values (--sort, --strategy), all flags for subcommands with subcommands (repo.add, repo.scan, template.new, etc.), and the new `message` command.

---

## Table Stakes

Features users expect from any serious terminal management UI. Missing these makes the tool feel unfinished compared to lazygit, k9s, or htop.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **Tab row for entity switching (Workspaces / Templates / Repos)** | Any multi-entity TUI uses tab navigation. lazygit uses [ ] to switch tabs within a panel. k9s uses numeric shortcuts. Users managing 3 entity types from one `manage` command expect to reach all three without exiting. | MEDIUM | Tab row renders above list; [ and ] (or 1/2/3) switch between tabs. Each tab has its own cursor position, selection state, and data hook. Existing `WorkspaceList` becomes one of three tab views. |
| **Detail pane alongside list (master-detail split)** | lazygit, k9s, and htop all show a detail pane next to or below the list. The current dashboard navigates *away* from the list to show details — users lose the list context entirely. A persistent right-side or bottom pane that updates as cursor moves is the expected pattern. | MEDIUM | Split layout: list occupies 60% width, detail 40%. Detail auto-updates reactively as cursor changes. No "enter detail view" step needed for read-only info; actions still require Enter. |
| **All entity-type CRUD accessible in-TUI** | Templates tab: new, edit, clone, remove. Repos tab: list only (add/scan require wizard which needs full terminal; those should launch editor/wizard via suspend+resume like the existing `edit` action). Users who open `manage` expect to not need to exit for common tasks. | MEDIUM | Actions menus per tab follow the existing ActionMenu pattern. Suspend/resume via `renderer.suspend()`/`renderer.resume()` already works for editor launch — same mechanism for spawning wizards. |
| **Persistent help bar showing current-context keys** | lazygit's context-aware `?` help is the gold standard. At minimum a static help bar that updates per tab/view is required. Currently the help bar only shows list-view keys and disappears in other views. | LOW | One-line status bar at bottom. Update it per active view. Show at least 5 most important bindings. |
| **? key for full key reference** | Standard in terminal tools: ? pops a scrollable keybinding reference. Users discovering the tool for the first time need this to not feel lost. | LOW | A `KeyHelp` overlay showing all bindings for current context. Pressing ? again or Esc dismisses it. |
| **Consistent Esc to go back** | Every view should be dismissible with Esc. The existing ActionMenu, ConfirmDialog, and DetailStatus all handle Esc correctly — but a tab-level detail pane has no dismiss behavior defined yet. | LOW | When detail pane is in "expanded" mode (occupies full screen), Esc returns to split. Otherwise Esc from list goes to previous tab or quits. |
| **Message/notification display in workspace list row** | v0.3.0 adds a messaging system. The workspace row must show: latest message preview (truncated to ~30 chars), sender name, and relative age ("2m ago"). Currently the row shows name + branch + dirty count + created date — no message slot exists. | MEDIUM | Add message column to `WorkspaceRow`. Requires reading message store per workspace on load and on `R` refresh. Must not slow down initial render — load messages async alongside status checks. |
| **Message list in workspace detail pane** | Detail pane currently shows only repo list. With the messaging system, the detail pane must show: per-sender message history, timestamps, and a clear-all or clear-by-sender action. This is the primary read surface for workspace notifications. | MEDIUM | Add a "Messages" section below the repos section in `DetailStatus`. Since messages can grow, make it scrollable within the pane. |
| **Shell completion covers all commands and flag values** | When tab-completing `git-stacks sync --strategy `, the user expects `rebase` and `merge` as completions. When typing `git-stacks list --sort `, they expect `date name status`. Users who use completions notice immediately when common flags give no suggestions. | LOW | Add enum value completions to the existing generator. This is a generator-level change: emit a choices array for known options, use it in the case/argument blocks per shell. |
| **Shell completion covers `message` subcommand family** | The new `message send|clear|list` commands need completions including workspace name as first argument for `send` and `clear`. This is a straightforward extension of the existing `DYNAMIC_COMPLETIONS` map. | LOW | Add `"message.send": "workspace"`, `"message.clear": "workspace"`, `"message.list": "workspace"` to the map. Add `"message"` as a new top-level entry in the command tree. |

---

## Differentiators

Features that set this v0.3.0 release apart. Not universally expected, but highly valued.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Workspace messaging system (file-based JSONL)** | No comparable workspace CLI has a built-in notification/messaging system. The primary use case is AI agents running in workspaces posting status updates that a human developer can see in the TUI. This is unique to git-stacks' multi-agent positioning. The file-based JSONL approach — one file per workspace at `~/.config/git-stacks/messages/{workspace}.jsonl` — is durable, inspectable, and trivially implemented with no IPC complexity. | MEDIUM | CLI surface: `git-stacks message send <workspace> "<text>" [--from <sender>]`, `git-stacks message list <workspace>`, `git-stacks message clear <workspace> [--from <sender>]`. Storage: append-only JSONL, one record per line: `{"id":"uuid","from":"agent-1","text":"done","ts":"ISO8601"}`. Dashboard polls on R refresh. No daemon, no sockets, no background process. |
| **Silent-drop behavior when TUI not running** | `message send` completes successfully even when the TUI dashboard is not open. This is non-obvious but correct: agents calling `message send` from hooks shouldn't fail or hang waiting for a consumer. Messages persist on disk and are read when the dashboard next opens. | LOW | `message send` is pure file-append. No socket, no PID check. This is the correct design — implement it this way by default, not as a fallback. |
| **Per-sender message scoping** | Agents can identify themselves by name (`--from claude-agent-1`). The detail pane groups messages by sender, and `message clear --from <sender>` clears only that sender's messages. This gives the human developer per-agent visibility at a glance without mixing up which agent said what. | LOW | Storage is per-workspace (one file per workspace), not per-sender. Sender name is a field in each record. Grouping is done at render time in the detail pane. |
| **Template tab with inline YAML edit** | Templates are YAML files and editing them through the wizard is slow. The Templates tab in the dashboard should offer "e — edit in $EDITOR" using the same suspend/resume pattern already working for workspace YAML edit. Power users who maintain templates will find this significantly faster than exiting to run `template edit`. | LOW | Reuse `editWorkspaceYaml()` pattern. Template path is `~/.config/git-stacks/templates/{name}.yml`. Already have `templatePath()` in config.ts. |
| **Repos tab as read-only registry browser** | The Repos tab shows the registry with name, type, default branch, path, and disk-exists status. `repo add` and `repo scan` require interactive input unsuitable for TUI — they should be documented as "run from terminal", not hidden or faked. The Repos tab is useful as a health-check surface: flag repos where the path no longer exists on disk. | LOW | Load registry via `readRegistry()`. Compute `existsSync(entry.local_path)` per entry for health indicator. No write actions except "e — open YAML directly" for advanced users. |
| **Branch completions for `new --from` and `clone`** | `git-stacks new --from <branch>` and `git-stacks clone <source>` benefit from branch completion. This requires running `git branch -r` at completion time against the repos in the registry. This is more complex than the static completions but makes the workflow significantly smoother when creating workspaces from existing branches. | HIGH | Fish/zsh/bash dynamic completion functions can call `git branch -r` but need a repo path context. Feasible for zsh/fish with a shell function. Mark LOW confidence on implementation approach — needs per-phase research. |
| **Enum value completions for all flag choices** | `--sort date|name|status`, `--strategy rebase|merge`, `--output json|text` — providing these completions requires only adding a `choices` property to the OptionInfo type in the completion generator and emitting them in the shell-specific case blocks. This is pure mechanical work with high payoff: completions feel complete and professional. | LOW | Generator change: add `choices?: string[]` to `OptionInfo`. In `buildNode()`, parse choices from commander option metadata if available, otherwise hard-code per-option in the `DYNAMIC_COMPLETIONS` equivalent. Commander does not store choices natively; maintain a `OPTION_CHOICES` map keyed by `"command.--flag"`. |

---

## Anti-Features

Features that seem reasonable to add in v0.3.0 but should be explicitly deferred or avoided.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| **Real-time TUI auto-refresh (polling loop)** | A background polling interval that reruns `getWorkspaceStatus()` across all workspaces constantly will hammer the filesystem, block git operations, and produce flickering. No user asked for this. | Provide `R` manual refresh. That is sufficient. If the user wants live updates, the dashboard is the wrong tool — they should use `watch git-stacks status`. |
| **Websocket/Unix socket IPC for message delivery** | Tempting to make `message send` push directly into the running TUI via a socket. This requires the TUI to act as a server, adds a daemon lifetime problem, and fails silently in many environments. High complexity for marginal benefit. | File-based JSONL is sufficient. On `R` refresh the TUI reads the latest. If real-time push is needed in a future milestone, add it then with a proper design. |
| **Message persistence across workspace lifetime** | Storing messages permanently creates unbounded disk growth and stale-data confusion. AI agents can post thousands of messages per session. | Messages belong to a workspace session. Provide `message clear` to wipe. Document "messages are not a log" — they are ephemeral status. Consider auto-clearing on workspace open. |
| **In-TUI wizard for template creation (new or edit)** | Building a wizard (the multi-step @clack/prompts flow) inside the SolidJS renderer requires bridging two rendering contexts. The existing approach — suspend renderer, run wizard in the raw terminal, resume — works without this complexity. | Suspend/resume for template wizard is the correct approach. Do not attempt to render @clack/prompts inside OpenTUI. |
| **Animated progress indicators beyond the existing ProgressView** | Spinners per row, animated status indicators, pulse effects — these are scope creep and distracting in a management tool. The existing `StatusIndicator` and `ProgressView` are sufficient. | Ship what exists. Add animations only if users report the tool feels slow or unresponsive. |
| **Searching/filtering within detail pane** | The detail pane shows at most ~20 repos per workspace. Adding an in-pane search is premature. | The top-level `/` filter for workspace names is sufficient for v0.3.0. |
| **Flag completions that require external API calls** | Completing `--sort` with a network call to check what keys are sortable, or querying GitHub for `--pr` PR numbers, adds latency and failure modes to shell completion. | Static enum values only for v0.3.0. Branch completions from local git are acceptable (local disk, fast). No network calls in completion scripts. |
| **Mouse support in the TUI** | OpenTUI/SolidJS TUI does not provide mouse event handling today. Adding mouse support would require patching the underlying renderer or waiting for library support. | Keyboard-first is the right default for a developer tool. Do not add mouse support in v0.3.0. |

---

## Feature Dependencies

```
Tab navigation (Workspaces | Templates | Repos)
    └──requires──> Per-tab state (cursor, selection, filter) isolated per tab
    └──enables──> Template tab YAML edit action
    └──enables──> Repos tab registry browser

Master-detail split layout
    └──requires──> Tab navigation (detail content differs per tab)
    └──enables──> Message list in workspace detail pane
    └──enables──> Repo health indicators in repos detail pane

Message storage (JSONL per workspace)
    └──enables──> message send|list|clear CLI commands
    └──enables──> Message preview in workspace list row
    └──enables──> Message list in workspace detail pane
    └──note──> Message commands are independent of TUI; TUI reads from same store

Shell completion for `message` subcommand
    └──requires──> message command registered in commander (index.ts)
    └──requires──> DYNAMIC_COMPLETIONS map updated
    └──blocks on──> message command must be implemented before completion is useful

Enum value completions for flags
    └──requires──> OPTION_CHOICES map in completion-generator.ts
    └──independent──> does not depend on any other v0.3.0 feature
    └──note──> ship this early; it is low-risk and highly visible

Branch completions
    └──requires──> Shell function that calls `git branch -r` with a repo context
    └──complexity──> Context (which repo?) is ambiguous at completion time — needs phase-specific research
    └──deferred to──> Implementation phase; mark as "needs deeper research" in roadmap
```

---

## Complexity Assessment Per Feature Area

### Dashboard Overhaul

**Tab navigation:** MEDIUM. Adding tab state requires restructuring App.tsx to hold `activeTab` signal and conditionally rendering three different list/detail component trees. The keyboard handler grows to include [ and ] (or 1/2/3). Per-tab cursor/selection must be tracked separately. Estimated: 150-250 lines of new component code, major restructure of App.tsx.

**Master-detail split layout:** MEDIUM. Requires changing the layout from a single full-width list to a side-by-side or top-bottom split. OpenTUI's flexbox supports this natively (flexDirection="row"). The detail pane component must be reactive to cursor position — when cursor changes in the list, the detail pane re-renders for the newly focused item. This is straightforward with SolidJS reactive signals.

**CRUD actions per tab:** MEDIUM. Template actions (edit, clone, remove) reuse patterns from workspace actions. The suspend/resume editor launch already works. New `ActionMenu` variants per tab are needed. The wizards (`runTemplateNew`, `runTemplateEdit`) already exist and can be spawned via the same `spawn()` + `renderer.suspend()` pattern.

**Message display in list row:** MEDIUM. Requires reading the JSONL message file per workspace as part of the data-loading pipeline. Must not add blocking I/O to the initial render — load message previews asynchronously alongside the existing `fetchStatuses()` flow.

### Messaging System

**Core CLI commands:** LOW. `message send` is a file append. `message list` is a file read + format. `message clear` is a file delete or line filter. No network, no IPC, no background process. The entire implementation is 50-100 lines including schema definition.

**JSONL schema design:** LOW. Schema is simple: `{id: string, from: string, text: string, ts: string}`. The only design decision is whether to use a per-workspace file or a single global file. Per-workspace is strongly preferred: scoped reads, easy clear, no cross-workspace contamination.

**TUI integration:** MEDIUM. Rendering messages in both the list row (preview) and detail pane (full list) adds two new reactive data streams to the dashboard. The main concern is performance: reading N message files on dashboard open adds N disk reads. These should be batched and cached.

### Shell Completions

**Enum value completions for existing flags:** LOW. Mechanical generator change. Add a `OPTION_CHOICES` constant map. Update `buildNode()` to look up choices. Emit them in `bashCaseBody()`, `zshCaseBody()`, and the fish flags loop. Estimated: 50-80 lines of generator changes, minimal risk.

**`message` command completions:** LOW. Add three entries to `DYNAMIC_COMPLETIONS`. The `message` top-level command needs subcommand handling identical to `repo` and `template`. Estimated: 5-10 lines.

**Branch completions:** HIGH complexity, LOW confidence on implementation approach. The fundamental problem is that shell completion scripts run in the user's shell environment, not in the git-stacks process. To complete branch names, the completion function needs to know which repo(s) to query. For `new --from`, the relevant repo is ambiguous at completion time (no workspace context yet). For `clone <source>`, the source is itself being completed. This needs per-phase research before implementation.

---

## MVP Definition for v0.3.0

### Must Ship (makes v0.3.0 a coherent release)

1. **Tab navigation** — Workspaces | Templates | Repos tabs with [ ] or 1/2/3 keys
2. **Master-detail split layout** — list + detail pane side-by-side for all three tabs
3. **CRUD actions in-TUI for workspaces and templates** — all existing workspace actions plus template edit/clone/remove
4. **Messaging system CLI** — `message send|list|clear` with JSONL storage per workspace
5. **Message display in dashboard** — preview in list row, full list in detail pane
6. **Enum value completions** — `--sort`, `--strategy`, `--output`, and other fixed-choice flags
7. **`message` command completions** — workspace name completion for send/list/clear

### Defer to v0.3.x or v0.4.0

- **Branch completions** — HIGH complexity, needs design decision on repo context resolution; defer and flag for research
- **In-TUI template creation wizard** — the suspend/resume pattern works for editing; creation wizard is low priority
- **Auto-clear messages on workspace open** — convenient but not critical; let users call `message clear` explicitly
- **Mouse support** — library capability gap; don't attempt

---

## Phase-Specific Research Flags

| Topic | Research Needed | Complexity Indicator |
|-------|-----------------|---------------------|
| Branch completions | How to resolve repo context at completion time in bash/zsh/fish; whether `git branch -r` across multiple registry repos is feasible in a completion function | HIGH — needs dedicated research in implementation phase |
| OpenTUI flexbox split layout | Whether OpenTUI supports stable side-by-side panes at small terminal widths; minimum terminal width assumptions | MEDIUM — verify with codebase/docs before implementation |
| JSONL locking on concurrent writes | If two agents `message send` simultaneously to the same workspace file, is there a race condition on append? Bun's file append behavior needs verification. | LOW — likely safe; verify in implementation |
| Commander option metadata for choices | Whether Commander.js stores `choices()` metadata on the `Option` object in a way the completion generator can read; or whether a manual map is required | LOW — read Commander source; fast to verify |

---

## Sources

- **Existing dashboard codebase** — `src/tui/dashboard/` (HIGH confidence, direct code analysis)
- **Existing completion generator** — `src/lib/completion-generator.ts` (HIGH confidence, direct code analysis)
- **Existing command surface** — `src/commands/workspace.ts`, `src/commands/repo.ts`, `src/commands/template.ts` (HIGH confidence)
- **PROJECT.md** — first-party milestone description (HIGH confidence)
- **lazygit UX patterns** — https://github.com/jesseduffield/lazygit, https://www.bwplotka.dev/2025/lazygit/ (MEDIUM confidence)
- **k9s TUI patterns** — https://k9scli.io/, https://ahmedjama.com/blog/2025/09/the-complete-k9s-cheatsheet/ (MEDIUM confidence)
- **TUI keyboard navigation patterns** — https://notes.suhaib.in/docs/tech/utilities/making-dev-tools-feel-native-with-tui-interfaces/ (MEDIUM confidence)
- **File-based IPC / JSONL pattern** — https://dev.to/uenyioha/porting-claude-codes-agent-teams-to-opencode-4hol (MEDIUM confidence — single source for JSONL inbox pattern, but independently sensible)
- **Shell completion quality** — https://click.palletsprojects.com/en/stable/shell-completion/ (MEDIUM confidence, Python CLI reference but principles apply universally)

---
*Feature research for: v0.3.0 — dashboard overhaul, messaging system, shell completions*
*Researched: 2026-03-19*
