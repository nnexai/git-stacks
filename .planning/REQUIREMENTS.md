# Requirements: v0.22.0 Workspace Productivity

**Defined:** 2026-07-15
**Core value:** A developer can stay in the terminal-focused web or TUI workspace, move between active work instantly, and clean up safely without losing shell compatibility or state.

## Workspace Archival

- [x] **ARCH-01:** A workspace definition can persist `archived: true` and an `archived_at` timestamp in its existing YAML file; omitted archive fields remain backward-compatible and mean active.
- [x] **ARCH-02:** Web and TUI can archive an active workspace and unarchive an archived workspace through the shared core/service operation rather than independent client-side mutation.
- [x] **ARCH-03:** Archived workspaces are excluded from every normal workspace list, count, pin group, fuzzy switcher result, attention traversal, and default selection in web and TUI, regardless of their stored pin state.
- [x] **ARCH-04:** Archiving first stops and confirms every service-owned terminal, then preserves repositories, worktrees, workspace files, notes, configuration, and pin state; an unconfirmed terminal exit leaves persisted archive state unchanged, and unarchiving makes the same non-terminal resources usable again without recreating stopped terminals.
- [x] **ARCH-05:** Web and TUI expose a separate minimal Archived Workspaces surface containing only workspace identity, the latest relevant activity/archive timestamp, and an Unarchive action.
- [x] **ARCH-06:** The archived list is newest-first by `max(last_activity, archived_at)`, displays the chosen timestamp, has an explicit empty state, and never expands into the normal detailed workspace view.

## Confirmed Workspace Removal

- [x] **REMOVE-01:** The destructive action is named **Remove** consistently in web and TUI and always requires confirmation that identifies the workspace and explains that its terminals, worktrees, directory, and YAML definition will be removed.
- [x] **REMOVE-02:** A confirmed removal closes every service-owned terminal for the workspace before filesystem deletion and fails closed without deleting anything if terminal shutdown cannot be confirmed.
- [x] **REMOVE-03:** After terminal shutdown, normal removal applies the existing dirty-worktree protection and reports every blocking repository; only a fresh typed dirty-worktree result may expose web/TUI Force Remove, which requires exact current-name confirmation and never bypasses terminal, stale-revision, not-found, parse, hook, or other non-dirty failures.
- [x] **REMOVE-04:** Successful removal deletes each managed Git worktree, the complete workspace directory, and the workspace YAML definition while leaving unrelated repositories and workspace definitions untouched.
- [x] **REMOVE-05:** Web and TUI reconcile selection, terminal tabs, signals, counts, and navigation immediately after successful removal and show actionable progress/failure feedback throughout the operation.

## User Shell and Dynamic Environment

- [ ] **SHELL-01:** Configured commands and lifecycle hooks execute through the user's actual configured shell rather than hard-coded `/bin/sh`, with a documented per-shell invocation strategy.
- [ ] **SHELL-02:** Supported shells load the initialization needed for the user's interactive/login environment so runtime managers, shell functions, aliases, and dynamically constructed `PATH` values are available.
- [ ] **SHELL-03:** The command is passed as one command argument to the shell rather than interpolated into a generated wrapper, preserving the existing command text and avoiding an additional quoting layer.
- [ ] **SHELL-04:** Global, workspace, repository, port, and `GS_*` environment overlays are applied after shell initialization so authoritative git-stacks values win over profile defaults.
- [ ] **SHELL-05:** Trusted local launchers can refresh an explicit allowlist of dynamic values, initially `PATH` and `SSH_AUTH_SOCK`, into the long-lived helper/service; raw host environment values are never projected to browser code.
- [ ] **SHELL-06:** Interactive PTYs and non-PTY command execution can use the refreshed SSH agent socket, and integration coverage proves `ssh-add`/agent discovery and an nvm-style profile-installed runtime work without restarting the service.
- [ ] **SHELL-07:** Missing, unsupported, or failing shell initialization produces a diagnostic naming the shell, invocation mode, failed initialization stage, and safe recovery path without silently falling back to different semantics.

## Keyboard-First Web Navigation

- [ ] **KEY-01:** The web client has one centralized, configurable shortcut registry with platform-specific defaults, conflict validation, keyboard-help presentation, and the ability to rebind or unbind every app-owned action.
- [ ] **KEY-02:** Safe defaults use `Ctrl+Cmd+<key>` on macOS and `Ctrl+Alt+Shift+<key>` on Linux: `K` workspace switcher, `P` commands, `N` new workspace, `T` new terminal, `W` close active terminal, `J` previous terminal, `L` next terminal, and `A` next attention.
- [ ] **KEY-03:** App shortcuts work while xterm owns focus by using xterm's pre-processing key handler; handled chords are consumed once, while every unmatched key event reaches the PTY unchanged.
- [ ] **KEY-04:** Linux shortcut matching ignores `AltGraph` input, uses physical key codes where appropriate, and has coverage for non-US layouts and IME/composition so character entry is never mistaken for an app shortcut.
- [ ] **KEY-05:** Browser-hard shortcuts such as new/close browser tab or window and browser-tab traversal are not shipped as web defaults; fullscreen Keyboard Lock is not required for baseline operation.
- [ ] **KEY-06:** `Ctrl+K` and `Ctrl+Shift+P` may be configured as aliases, but defaults do not intercept common shell controls or browser-incompatible chords while a terminal is focused.
- [ ] **KEY-07:** The workspace switcher on the `K` action searches active workspaces and their repositories using real fuzzy ranking, excludes archived workspaces, uses recency only as a tie-breaker, and switches to the highest-ranked row when Enter is pressed even for a partial query.
- [ ] **KEY-08:** The commands overlay on the `P` action searches configured commands using the same fuzzy/top-result Enter contract and does not become a generic catalog of unrelated application actions.
- [ ] **KEY-09:** Every overlay is a singleton: repeated shortcut or key-repeat events focus/toggle the existing instance rather than stacking DOM layers, handlers, or backdrops.
- [ ] **KEY-10:** Palette arrow navigation, Escape, Enter, and input focus are contained within the active overlay; closing it restores focus to the previously active terminal without emitting overlay keystrokes to the PTY.

## Attention Navigation

- [ ] **ATTN-01:** A Next Attention action moves to the next active workspace/repository/terminal carrying a current attention signal using the shared priority ordering and wraps deterministically.
- [ ] **ATTN-02:** Archived and removed workspaces, dismissed signals, stale terminal surfaces, and inaccessible targets are skipped without clearing unrelated attention.
- [ ] **ATTN-03:** The action is available from the safe global shortcut, visible UI, and keyboard help with a clear no-attention result.

## Web Workflow Parity

- [ ] **PARITY-01:** Web exposes shared-service actions for archive/unarchive, confirmed remove, rename, open/close, pin/unpin, sync, pull, push, and merge with the same guards and result semantics as CLI/TUI.
- [ ] **PARITY-02:** Web can view and edit workspace notes through the existing authoritative notes implementation without browser-local persistence.
- [ ] **PARITY-03:** Web shows workspace/repository file-sync status and operation progress using shared projections rather than local Git inspection.
- [ ] **PARITY-04:** Action availability, disabled reasons, confirmations, progress, cancellation, errors, and refreshed snapshots are consistent across web and TUI for the supported lifecycle and Git operations.
- [ ] **PARITY-05:** Context menus, visible controls, and keyboard surfaces call one action registry so adding a shortcut cannot create a second implementation of the operation.

## Workspace Creation from Forge URLs

- [ ] **SOURCE-01:** Web and TUI workspace creation accept a supported GitHub pull-request or GitLab merge-request URL in addition to the existing repository/template inputs.
- [ ] **SOURCE-02:** The shared forge integration resolves the canonical repository, source/head branch, target/base branch, fork/remote requirements, and a safe suggested workspace name without browser-side forge authority.
- [ ] **SOURCE-03:** Users review and can edit the resolved workspace name, template, repositories, and branches before creation; Enter or submission never creates from an unresolved or ambiguous source.
- [ ] **SOURCE-04:** Missing forge tooling/authentication, inaccessible or closed changes, unsupported hosts, malformed URLs, and branch/fork conflicts produce actionable non-destructive errors.

## Stale Workspace Intelligence

- [ ] **STALE-01:** A separate stale-workspace view identifies cleanup candidates using explainable signals such as merged/closed PR or MR, deleted remote branch, prolonged inactivity, or missing managed worktree.
- [ ] **STALE-02:** Every candidate displays its triggering reasons and relevant timestamps; users can refresh evidence and open the workspace before deciding what to do.
- [ ] **STALE-03:** Stale detection is suggestion-only and never archives, removes, closes terminals, discards worktrees, or changes workspace YAML automatically.
- [ ] **STALE-04:** Archive and Remove are explicit follow-up actions using the same confirmation, terminal, dirty-worktree, and failure semantics defined above.
- [ ] **STALE-05:** Forge/network failures and unavailable activity data remain visible as unknown evidence and cannot be treated as proof that a workspace is stale.

## Release Candidate Closure

- [ ] **REL-01:** Package versions, changelog, migration notes, shortcut reference, shell compatibility documentation, and supported-host gates prepare the first v0.22 candidate as `0.22.0-rc.1` / `v0.22.0-rc.1`.
- [ ] **REL-02:** Planning and local release preparation do not tag, push, publish, or create a release without separate explicit approval.

## Future Requirements

- Optional fullscreen Keyboard Lock for users who explicitly want browser-reserved shortcuts and whose browser supports it.
- Import/export or synchronization of personalized shortcut bindings across machines.
- Additional stale signals learned from provider-specific review, CI, or deployment state after the explainable baseline is validated.

## Out of Scope

- Duplicate or cloned terminal tabs; a terminal is a stateful service-owned process.
- Archived workspaces in normal lists, counts, pins, fuzzy switching, or attention traversal.
- Automatic archival/removal, retention policies, bulk deletion, or background destructive cleanup.
- Any dirty-worktree bypass outside the current typed blocker plus exact-name web/TUI Force Remove path, and deletion of external repository roots.
- A generic application command palette unrelated to configured workspace commands.
- Hard dependence on fullscreen, Keyboard Lock, one browser, one keyboard layout, or one shell implementation.
- Portable `/bin/sh` semantics that intentionally skip the user's configured shell initialization.
- A final v0.22.0 tag, push, publish, or release without separate approval.

## Traceability

| Requirement group | Phase | Status |
|---|---:|---|
| ARCH-01..06, REMOVE-01..05 | 123 | Complete |
| SHELL-01..07 | 124 | Pending |
| KEY-01..10, ATTN-01..03 | 125 | Pending |
| PARITY-01..05, SOURCE-01..04 | 126 | Pending |
| STALE-01..05, REL-01..02 | 127 | Pending |

## Research Basis

- Native product conventions: [cmux keyboard shortcuts](https://cmux.com/docs/keyboard-shortcuts), [Supacode keyboard shortcuts](https://docs.supacode.sh/keyboard-shortcuts), and [Ghostty keybindings](https://ghostty.org/docs/config/keybind).
- Browser collision matrices: [Chrome keyboard shortcuts](https://support.google.com/chrome/answer/157179) and [Firefox keyboard shortcuts](https://support.mozilla.org/en-US/kb/keyboard-shortcuts-perform-firefox-tasks-quickly).
- Terminal routing capability and boundary: [xterm custom key handler](https://xtermjs.org/docs/api/terminal/classes/terminal/) and [Chrome Keyboard Lock constraints](https://developer.chrome.com/docs/capabilities/web-apis/keyboard-lock).
- Shell collision baseline: [GNU Readline killing commands](https://www.gnu.org/s/bash/manual/html_node/Readline-Killing-Commands.html) and [zsh line editor](https://zsh.sourceforge.io/Doc/Release/Zsh-Line-Editor.html).

---
*Last updated: 2026-07-15 after terminal, browser, Ghostty, cmux, and Supacode shortcut-collision research.*
