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

- [x] **Phase 123: Archived Workspaces and Safe Removal** — Add the persisted archive state and terminal-aware destructive removal contract across core, service, web, and TUI. (completed 2026-07-16)
- [x] **Phase 124: User Shell and Environment Authority** — Run user-authored commands through supported configured shells and refresh allowlisted dynamic environment values safely. (completed 2026-07-16)
- [x] **Phase 125: Terminal-Safe Keyboard Navigation** — Deliver configurable collision-aware shortcuts, singleton fuzzy overlays, terminal switching, and next-attention navigation. (completed 2026-07-16)
- [x] **Phase 126: Web Workflow and Forge-Source Parity** — Bring high-value lifecycle/Git/notes/status actions to web and create normal workspaces from PR/MR URLs. (completed 2026-07-17)
- [ ] **Phase 127: Stale Workspace Intelligence and RC Closure** — Add explainable, non-destructive cleanup candidates and prepare the `v0.22.0-rc.1` release candidate.

## Phase 123: Archived Workspaces and Safe Removal

**Goal:** Make active-workspace cleanup reversible by default and destructive removal explicit, terminal-aware, and consistent across clients.
**Depends on:** Nothing
**Requirements:** ARCH-01, ARCH-02, ARCH-03, ARCH-04, ARCH-05, ARCH-06, REMOVE-01, REMOVE-02, REMOVE-03, REMOVE-04, REMOVE-05
**Plans:** 8/8 plans complete

Plans:
**Wave 1**

- [x] 123-01-PLAN.md — Core archive persistence and typed staged removal authority

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 123-02-PLAN.md — Aggregate catalog, strict lifecycle schemas, and shared successor ordering

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 123-03-PLAN.md — Target terminal admission and confirmed real-exit shutdown

**Wave 4** *(blocked on Wave 3 completion)*

- [x] 123-04-PLAN.md — Revision-bound lifecycle coordinator and honest progress

**Wave 5** *(blocked on Wave 4 completion)*

- [x] 123-05-PLAN.md — Secure router/client adapters and shared runtime composition

**Wave 6** *(blocked on Wave 5 completion)*

- [x] 123-06-PLAN.md — Web archive, remove, force, and reconciliation surface
- [x] 123-07-PLAN.md — TUI archive, remove, force, and reconciliation surface

**Wave 7** *(blocked on Wave 6 completion)*

- [x] 123-08-PLAN.md — Full gates, autonomous fixture evidence, and Phase 127 milestone-end live UAT handoff

**Success criteria:**

1. Archiving from web or TUI first stops and confirms every service-owned workspace terminal, then atomically writes `archived`/`archived_at` and removes the workspace from all normal projections and navigation while leaving repositories, worktrees, workspace files, notes, configuration, and pin state intact; any unconfirmed terminal exit leaves persisted archive state unchanged.
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

**Plans:** 8/8 plans complete

Plans:
**Wave 1**

- [x] 126-01-PLAN.md — Strict action, note, file, operation, and reviewed-source protocol contracts

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 126-02-PLAN.md — Provider-backed GitHub/GitLab resolver and real-SHA source preparation
- [x] 126-03-PLAN.md — Canonical service action authority, Pull/notes adapters, and honest cancellation

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 126-04-PLAN.md — Secure projections/routes, review-token authority, and SHA-safe creation

**Wave 4** *(blocked on Wave 3 completion)*

- [x] 126-05-PLAN.md — Shared action registry, operation tracker, and resolve-review state

**Wave 5** *(blocked on Wave 4 completion)*

- [x] 126-06-PLAN.md — OpenTUI action/detail/operation/review parity
- [x] 126-07-PLAN.md — Web action/detail/operation/review parity

**Wave 6** *(blocked on Wave 5 completion)*

- [x] 126-08-PLAN.md — Cross-client conformance, security/full gates, and Phase 127 handoff

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
**Plans:** 8/14 plans executed

Plans:
**Wave 0**

- [x] 127-01-PLAN.md — Create guarded-import runtime Zod, provider, abortable remote-branch, policy, cache, revision, and no-mutation RED contracts.
- [x] 127-02-PLAN.md — Create guarded-import web, TUI, conformance, authority RED contracts and an isolated named hermetic pre-metadata no-outward-release-action fence.

**Wave 1** *(blocked on Wave 0 completion)*

- [x] 127-03-PLAN.md — Add strict stale DTOs and GitHub/GitLab read-only status probes, turning the runtime schema matrix green.

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 127-04-PLAN.md — Implement qualification/ranking over one captured read model, abortable bounded network observations, and volatile cache.

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 127-05-PLAN.md — Wire the revision-first secure route, projection, service lifetime, and trusted client.

**Wave 4** *(blocked on Wave 3 completion)*

- [x] 127-06-PLAN.md — Add shared presentation/generations/retry/TUI seams plus atomic protocol/core/client global stale-entry and distinct scoped-refresh registries.

**Wave 5** *(blocked on Wave 4 completion)*

- [x] 127-07-PLAN.md — Deliver the singleton responsive web stale-workspace overlay.
- [x] 127-08-PLAN.md — Deliver the dedicated width-tiered OpenTUI stale-workspace view.

**Wave 6** *(blocked on Wave 5 completion)*

- [ ] 127-09-PLAN.md — Close deterministic cross-client, architecture, ASVS, build, coverage, and pre-metadata regression gates.

**Wave 7** *(blocked on Wave 6 completion)*

- [ ] 127-10-PLAN.md — Add immediate manifest/lock RED assertions, then move all manifests, exact internal ranges, and lockfile to 0.22.0-rc.1.

**Wave 8** *(blocked on Wave 7 completion)*

- [ ] 127-11-PLAN.md — Add immediate changelog/docs RED assertions and stale/RC documentation, then run the first complete test and validation-only release gates.

**Wave 9** *(blocked on Wave 8 completion)*

- [ ] 127-12-PLAN.md — Freeze the candidate SHA and create the strict canonical JSON row/subcase ledger with every external/manual class exact-SHA PENDING.

**Wave 10** *(blocked on Wave 9 completion)*

- [ ] 127-13-PLAN.md — Run the complete hosted/authenticated forge-shell-runtime and physical/manual lifecycle-parity evidence checkpoints.

**Wave 11** *(blocked on Wave 10 completion)*

- [ ] 127-14-PLAN.md — Reconcile exact-SHA row/subcase approvals with immutable ledger/ancestry checks and derive final validation, prohibition, security, and release-stop status.

**Success criteria:**

1. A separate stale view ranks candidates using explainable merged/closed change, deleted branch, inactivity, and missing-worktree signals and displays every reason and relevant timestamp.
2. Unknown or failed forge/activity evidence stays unknown rather than becoming a stale verdict; users can refresh and open a candidate before taking action.
3. Detection never mutates state automatically, and explicit Archive/Remove follow-ups reuse the Phase 123 terminal, confirmation, dirty-worktree, and failure contracts.
4. Live web/TUI UAT validates archived, stale, attention, fuzzy navigation, forge-source creation, shell environment, SSH agent, and destructive-confirmation workflows on supported hosts.
5. Versioning, changelog, migration and shortcut/shell docs, package checks, and hosted gates prepare `0.22.0-rc.1` / `v0.22.0-rc.1` without tagging, pushing, publishing, or releasing absent explicit approval.

## Progress

| Phase | Name | Requirements | Status |
|---:|---|---:|---|
| 123 | Archived Workspaces and Safe Removal | 11 | Complete    |
| 124 | User Shell and Environment Authority | 7 | Complete    |
| 125 | Terminal-Safe Keyboard Navigation | 13 | Complete    |
| 126 | Web Workflow and Forge-Source Parity | 9 | Complete    |
| 127 | Stale Workspace Intelligence and RC Closure | 7 | In Progress|

## Scope control

- Archive is reversible state; Remove is confirmed destruction. Stale detection may suggest either but never performs them automatically.
- Terminal sessions are stateful and are not duplicated or cloned. Archive and Remove stop and confirm them before persisted mutation; only a current typed dirty-worktree block may expose exact-name Force Remove in web or TUI.
- User-shell compatibility applies only to user-authored commands, hooks, and interactive terminals. Internal process execution remains argv-based or deliberately deterministic.
- The shortcut registry must treat browser, operating-system, terminal-emulator, xterm, shell, TUI, AltGraph, IME, and layout collisions as acceptance constraints, not documentation footnotes.
- The first candidate begins again at `rc.1`; a final release remains outside automatic milestone execution.

---
*Roadmap created: 2026-07-15; phase numbering continues after v0.21.0 Phase 122.*
