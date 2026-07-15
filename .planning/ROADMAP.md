# Roadmap: v0.22.0 Workspace Productivity

## v0.22.0 Workspace Productivity

### Milestone goal

Turn the shared service-backed clients into a terminal-first daily productivity surface: safe workspace lifecycle controls, user-compatible command execution, collision-aware keyboard navigation, high-value web parity, and explainable cleanup guidance.

## Dependency order

```text
123 archive + terminal-aware remove
  -> 124 user shell + dynamic environment
      -> 125 keyboard navigation + attention
          -> 126 web parity + forge-source creation
              -> 127 stale intelligence + v0.22.0-rc.1 closure
```

- [ ] **Phase 123: Archived Workspaces and Safe Removal** — Add the persisted archive state and terminal-aware destructive removal contract across core, service, web, and TUI.
- [ ] **Phase 124: User Shell and Environment Authority** — Run user-authored commands through supported configured shells and refresh allowlisted dynamic environment values safely.
- [ ] **Phase 125: Terminal-Safe Keyboard Navigation** — Deliver configurable collision-aware shortcuts, singleton fuzzy overlays, terminal switching, and next-attention navigation.
- [ ] **Phase 126: Web Workflow and Forge-Source Parity** — Bring high-value lifecycle/Git/notes/status actions to web and create normal workspaces from PR/MR URLs.
- [ ] **Phase 127: Stale Workspace Intelligence and RC Closure** — Add explainable, non-destructive cleanup candidates and prepare the `v0.22.0-rc.1` release candidate.

## Phase 123: Archived Workspaces and Safe Removal

**Goal:** Make active-workspace cleanup reversible by default and destructive removal explicit, terminal-aware, and consistent across clients.
**Depends on:** Nothing
**Requirements:** ARCH-01, ARCH-02, ARCH-03, ARCH-04, ARCH-05, ARCH-06, REMOVE-01, REMOVE-02, REMOVE-03, REMOVE-04, REMOVE-05

**Success criteria:**

1. Archiving from web or TUI atomically writes `archived`/`archived_at`, removes the workspace from all normal projections and navigation, and leaves worktrees, files, notes, pins, and live terminal processes intact.
2. A minimal web/TUI archived list is newest-first by relevant activity/archive time, shows that time, supports unarchive, and does not expose the normal detailed workspace surface.
3. Confirmed Remove closes every owned terminal before applying the existing dirty-worktree guard; a close failure deletes nothing and a dirty-worktree failure names the blocking repositories.
4. Successful Remove deletes managed worktrees, the workspace directory, and YAML definition, then reconciles client selection, signals, terminal tabs, counts, and progress without touching unrelated state.
5. Cross-client and concurrency tests prove archive/unarchive/remove use one shared operation contract and remain correct under stale snapshots, repeated requests, partial failure, and service reconciliation.

## Phase 124: User Shell and Environment Authority

**Goal:** Make configured commands, hooks, and PTYs behave like the developer's initialized shell while keeping service and browser trust boundaries explicit.
**Depends on:** Phase 123
**Requirements:** SHELL-01, SHELL-02, SHELL-03, SHELL-04, SHELL-05, SHELL-06, SHELL-07

**Success criteria:**

1. One shared Bash/zsh/fish adapter plans user-authored command, hook, and PTY launches; web, TUI, CLI, and service paths no longer carry independent `/bin/sh` rules for those operations.
2. An nvm-style runtime, interactive shell function, and alias defined only by normal user initialization work in configured commands without changing command text or restarting the helper.
3. Trusted local launches refresh bounded/redacted `PATH` and `SSH_AUTH_SOCK` values for new processes, while browser projections and persisted workspace files contain none of the raw values.
4. Workspace/repository/port/secret/`GS_*` overlays win after initialization, and SSH-agent discovery plus `ssh-add` behavior works across a socket rotation.
5. Supported-host tests preserve output, exit status, quoting, cancellation, process-tree cleanup, and diagnostics for broken startup files, missing executables, unsupported shells, and initialization timeouts.

## Phase 125: Terminal-Safe Keyboard Navigation

**Goal:** Let a user operate the web client at speed while xterm retains focus, without stealing ordinary shell/TUI input or relying on browser-hard shortcuts.
**Depends on:** Phase 124
**Requirements:** KEY-01, KEY-02, KEY-03, KEY-04, KEY-05, KEY-06, KEY-07, KEY-08, KEY-09, KEY-10, ATTN-01, ATTN-02, ATTN-03

**Success criteria:**

1. The configurable registry ships documented macOS `Ctrl+Cmd` and Linux `Ctrl+Alt+Shift` defaults, rejects conflicts, supports rebind/unbind, and presents a current keyboard-help surface.
2. Every registered action works with xterm focused through its pre-processing handler, while unmatched, AltGraph, composition, and non-US-layout events reach the PTY unchanged in browser tests.
3. Workspace/repository switching and configured-command overlays use shared fuzzy ranking, execute the top partial match on Enter, and exclude archived workspaces from navigation.
4. Repeated shortcuts and key-repeat cannot stack overlays; overlay navigation is contained and closing restores the prior terminal focus without sending palette keys to the process.
5. New/close/previous/next terminal and Next Attention actions are single chords, use service-owned state, skip stale/archived targets, wrap deterministically, and expose clear empty/no-attention results.

## Phase 126: Web Workflow and Forge-Source Parity

**Goal:** Make the browser a complete high-frequency workspace control surface and shorten external code-review setup to a reviewed creation form.
**Depends on:** Phases 123 and 125
**Requirements:** PARITY-01, PARITY-02, PARITY-03, PARITY-04, PARITY-05, SOURCE-01, SOURCE-02, SOURCE-03, SOURCE-04

**Success criteria:**

1. Web actions cover archive/unarchive, remove, rename, open/close, pin, sync, pull, push, merge, notes, and file-sync status through the same action registry, service operations, guards, and projections as TUI/CLI.
2. Visible buttons, context menus, and shortcuts share availability, disabled reasons, confirmations, cancellation, progress, errors, and authoritative snapshot refresh rather than duplicating operation logic.
3. GitHub PR and GitLab MR URLs resolve through shared forge integrations into repository, head/base branches, fork/remote needs, and a safe suggested workspace name.
4. The user reviews and may edit resolved name/template/repos/branches before creation; ambiguity, missing auth/tooling, unsupported hosts, inaccessible changes, and branch conflicts fail non-destructively with recovery guidance.
5. Browser UAT proves complete keyboard and pointer workflows against the live service, including reconnect/progress behavior and no browser-local Git, notes, environment, or lifecycle authority.

## Phase 127: Stale Workspace Intelligence and RC Closure

**Goal:** Explain which workspaces may need cleanup without acting automatically, then close the supported v0.22 release-candidate evidence.
**Depends on:** Phase 126
**Requirements:** STALE-01, STALE-02, STALE-03, STALE-04, STALE-05, REL-01, REL-02

**Success criteria:**

1. A separate stale view ranks candidates using explainable merged/closed change, deleted branch, inactivity, and missing-worktree signals and displays every reason and relevant timestamp.
2. Unknown or failed forge/activity evidence stays unknown rather than becoming a stale verdict; users can refresh and open a candidate before taking action.
3. Detection never mutates state automatically, and explicit Archive/Remove follow-ups reuse the Phase 123 terminal, confirmation, dirty-worktree, and failure contracts.
4. Live web/TUI UAT validates archived, stale, attention, fuzzy navigation, forge-source creation, shell environment, SSH agent, and destructive-confirmation workflows on supported hosts.
5. Versioning, changelog, migration and shortcut/shell docs, package checks, and hosted gates prepare `0.22.0-rc.1` / `v0.22.0-rc.1` without tagging, pushing, publishing, or releasing absent explicit approval.

## Progress

| Phase | Name | Requirements | Status |
|---:|---|---:|---|
| 123 | Archived Workspaces and Safe Removal | 11 | Not started |
| 124 | User Shell and Environment Authority | 7 | Not started |
| 125 | Terminal-Safe Keyboard Navigation | 13 | Not started |
| 126 | Web Workflow and Forge-Source Parity | 9 | Not started |
| 127 | Stale Workspace Intelligence and RC Closure | 7 | Not started |

## Scope control

- Archive is reversible state; Remove is confirmed destruction. Stale detection may suggest either but never performs them automatically.
- Terminal sessions are stateful and are not duplicated or cloned. Archive preserves them; Remove closes them before deletion.
- User-shell compatibility applies only to user-authored commands, hooks, and interactive terminals. Internal process execution remains argv-based or deliberately deterministic.
- The shortcut registry must treat browser, operating-system, terminal-emulator, xterm, shell, TUI, AltGraph, IME, and layout collisions as acceptance constraints, not documentation footnotes.
- The first candidate begins again at `rc.1`; a final release remains outside automatic milestone execution.

---
*Roadmap created: 2026-07-15; phase numbering continues after v0.21.0 Phase 122.*
