# Feature Research

**Domain:** Native workspace and terminal command center for parallel worktree and coding-agent workflows
**Researched:** 2026-07-11
**Confidence:** HIGH for the feature baseline and MVP boundary; MEDIUM for emerging agent-attention conventions

## Scope and Product Position

This research covers the **new native-client surface** only. It deliberately does not re-evaluate workspace creation, repository registry, lifecycle hooks, environment/port resolution, named commands, forge/issue integrations, file synchronization, or other capabilities already shipped by git-stacks. The client should expose those capabilities through a versioned service boundary rather than recreate them.

The competitive baseline has moved beyond a workspace list beside a terminal. Supacode treats the worktree as the durable unit of terminal state, including tabs, splits, notifications, and focused surface; dmux treats a task pane as an isolated worktree plus optional agent and makes attention, navigation, and completion actions first-class. Ghostty establishes the quality baseline for an embedded terminal: native platform behavior, tabs/splits at the application layer, modern terminal compatibility, and GPU-backed rendering. The milestone should meet the narrow baseline that makes daily Linux use credible, then differentiate through git-stacks' existing multi-repository workspace model and authoritative environment resolution.

## Feature Landscape

### Table Stakes (Users Expect These)

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Workspace/repository navigator with clear selection | Command centers make the isolation unit continuously visible; users must know which worktree or workspace owns the terminal they are typing into | MEDIUM | Show git-stacks workspace identity first, then member repositories. Preserve selection across refreshes. Do not reinterpret YAML in the client. |
| Fast, correct embedded terminal | The terminal is the primary work surface, not a preview; lag, rendering errors, broken input, or weak clipboard behavior invalidate the app | HIGH | Embed pinned libghostty behind an adapter. Validate keyboard, mouse, resize, Unicode, clipboard, links, scrollback, focus, and shell exit behavior on Linux. |
| Multiple terminal tabs per workspace | Agent, server, tests, and ad-hoc shell commonly run concurrently; Supacode and Ghostty both establish tabs as baseline | HIGH | v0.20 needs tabs, create/close/focus, titles, and independent PTYs. Splits are expected in a mature product but can follow after the vertical slice. |
| Workspace-bound terminal state | Switching workspaces must not destroy or accidentally cross-wire running processes | HIGH | The native client owns PTYs and maps every surface to one workspace and optional repository. "Persistent" means alive while the client runs plus enough metadata to restore the layout after restart; it must not imply impossible process resurrection. |
| Correct launch context | A shell or command opened in the wrong directory or without workspace environment/ports is actively dangerous | MEDIUM | Request resolved cwd and environment from git-stacks for every launch. Repository targeting must be explicit and observable in the tab title/context. |
| Named-command discovery and launch | Repeatable project commands are a core command-center expectation and are already authoritative in git-stacks | MEDIUM | Present existing named workspace commands contextually. Stream output in a dedicated terminal surface and expose running/exited/failed state. Do not invent another configuration system. |
| Loading, progress, failure, and retry states | Workspace mutations and command launches can be slow or fail; a native UI cannot freeze or silently discard errors | MEDIUM | Consume structured progress/events from the service. Keep the last usable snapshot visible when refresh fails and make retry explicit. |
| Keyboard-first navigation and native shortcuts | Terminal users expect rapid workspace/tab switching without reaching for the mouse; Ghostty uses platform-idiomatic shortcuts | MEDIUM | Linux conventions first, with accelerators for workspace navigation, tab create/close/next/previous, and focus transfer. Avoid a general command palette in this milestone. |
| Attention indication tied to source | Background agents and commands require a reliable "needs me" signal; dmux and Supacode both attach notifications to the originating work unit | MEDIUM | Badge the owning workspace/tab, aggregate unread attention, and focus the exact surface when selected. Preserve unread state until the user visits or dismisses it. |
| Safe lifecycle behavior | Closing a tab or app can terminate valuable agent/server processes | MEDIUM | Distinguish closing a view from terminating a PTY; confirm destructive close when a foreground process is active. Define app-quit behavior and surface process ownership clearly. |
| Accessible native UI fundamentals | A native client is expected to support focus order, readable status, theme changes, scaling, and assistive technology | MEDIUM | Use GTK4/libadwaita semantics rather than custom-drawn controls. Terminal canvas accessibility may be constrained by libghostty and needs explicit acceptance testing. |

### Differentiators (Competitive Advantage)

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Multi-repository workspace context | Competitors generally center a repository/worktree; git-stacks can present one task environment spanning several worktrees and directory repos | MEDIUM | Navigator and launch model must preserve workspace identity while allowing a terminal/command to target a member repository. This is the primary product differentiator. |
| Authoritative resolved execution context | Users get the same cwd, environment, allocated ports, and configuration whether launching from CLI, TUI, or native client | MEDIUM | Make the service response the sole source of truth. Show enough context to diagnose a surprising launch without exposing secrets indiscriminately. |
| Structured agent-attention routing | A notification can focus the exact workspace and terminal surface rather than merely announce that "an agent finished" | HIGH | Define versioned event identity, workspace ID, surface ID, severity/kind, timestamp, summary, and optional action. Gracefully degrade when the referenced surface no longer exists. |
| Client-owned sessions without forcing tmux | Provides a coherent native tab model while leaving existing tmux/cmux/IDE workflows supported | HIGH | The client owns only processes it launches. It must not seize or reinterpret sessions created by integrations or the OpenTUI dashboard. |
| Engine/client separation across platforms | One versioned workspace protocol and shared application model allow native Linux and macOS frontends without duplicating workspace semantics | HIGH | Prove the contract with a thin SwiftUI/libghostty shell in v0.20; parity and polish are not proof criteria. |
| Contextual named-command surface | Commands appear where they are relevant, already resolved for a workspace/repository, without a second generic palette | LOW | A compact command list/button near the selected workspace is more direct than duplicating Supacode's global palette. |
| Continuity with CLI and OpenTUI | Users can adopt the native app without abandoning automation or existing terminal integrations | MEDIUM | Mutations must flow through the same engine boundary and event stream. No GUI-only workspace state except terminal layout/session metadata. |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Independent YAML parsing or mutation in the GUI | Appears faster than building a service contract | Creates two engines, schema drift, conflicting writes, and behavior that differs from CLI/TUI | All workspace queries and mutations go through a versioned git-stacks machine API |
| A second command palette/configuration language | Competitors advertise fuzzy global palettes | Named commands already provide the project-specific action model; duplication fragments discovery, precedence, and tests | Contextual named-command launcher plus direct keyboard navigation |
| Full terminal emulator feature parity in v0.20 | Tabs, splits, search, restoration, profiles, SSH, themes, and every Ghostty action look like one bundle | Turns the milestone into a terminal-product rewrite and couples UI architecture to an unstable embedding API | Ship correct tabs and core terminal behavior; stage splits/search/advanced restoration after validation |
| Polished macOS parity | Cross-platform polish makes the architecture feel complete | Doubles UI, packaging, signing, accessibility, and shortcut work before Linux validates the model | Thin SwiftUI/libghostty architectural proof against the same protocol/model |
| Built-in agent orchestration or agent-specific UI | dmux launches many agents and multi-select prompts | Couples the client to volatile agent CLIs and duplicates commands/hooks already expressible by git-stacks | Launch agents as named commands; accept a small agent-neutral attention-event contract |
| Reimplementation of git/forge/CI dashboards | Competitors surface diffs, PRs, checks, merges, and file browsers | Re-researches and duplicates shipped git-stacks/CLI capabilities while expanding the first slice dramatically | Link or invoke existing commands/integrations; add native projections only in later evidence-driven phases |
| Client takeover of tmux/cmux/IDE sessions | A unified session inventory sounds convenient | Violates ownership boundaries and creates attach/control edge cases across integrations | Client owns native surfaces; existing integrations remain independent and supported |
| Silent automatic command execution on selection | Makes a workspace feel instantly ready | Surprising side effects can consume ports, mutate files, or start agents repeatedly | Explicit launch, except narrowly defined creation/setup behavior reported by the engine |
| Cloud account, sync, or remote daemon | Enables cross-device state and remote agents | Conflicts with the local-first milestone, expands security scope, and is unnecessary to validate native workflow | Local service/IPC and local session metadata only |
| Exact resurrection of terminal processes after app restart | "Persistence" is easily interpreted as restoring live processes | A dead client-owned PTY cannot be recreated with process state intact; pretending otherwise risks data loss | Restore workspace/tab metadata and offer relaunch; later consider an explicit durable backend such as tmux |

## Feature Dependencies

```text
[Versioned workspace service protocol]
    ├──> [Workspace/repository navigator]
    ├──> [Resolved launch context] ──> [Workspace-bound terminal tabs]
    │                                  └──> [Named-command launch]
    ├──> [Progress + structured events] ──> [Loading/failure UX]
    └──> [Stable identity model] ──> [Agent-attention routing]
                                      └──> [Exact surface focus]

[Pinned libghostty adapter] ──> [Correct terminal surface]
                               └──> [Tabs now] ──> [Splits/search later]

[Shared application model] ──> [GTK4 Linux client]
                           └──> [SwiftUI macOS proof]

[Client-owned PTYs] ──conflicts──> [Transparent adoption of external session ownership]
[Authoritative engine API] ──conflicts──> [GUI-side YAML mutation]
```

### Dependency Notes

- **Navigation requires a versioned query contract and stable identity:** Names alone are unsafe routing keys across rename/refresh. The client needs stable workspace, repository, command, operation, and terminal-surface identities before state restoration or event focusing is reliable.
- **Terminal launch requires resolved context:** PTY creation should happen only after the service returns validated cwd/environment data. Named commands reuse that path rather than creating a second executor.
- **Attention routing requires terminal ownership and event correlation:** The service can identify the workspace and event; the client must register and own the surface ID that can actually receive focus.
- **Useful mutation UX requires progress and cancellation semantics:** The app should not expose broad mutations until operations have correlation IDs, terminal states, and recoverable error reporting.
- **macOS proof requires the shared model, not Linux widget reuse:** The proof is valuable only when it demonstrates protocol/model portability through a genuinely native frontend boundary.
- **Splits depend on a sound tab/surface lifecycle:** Adding split trees before surface ownership, focus, resize, and close semantics are proven compounds the hardest terminal-state problems.

## Ruthless v0.20.0 MVP Definition

### Launch With: Linux Usable Vertical Slice

- [ ] **Versioned local machine API** for workspace/repository snapshots, named commands, resolved launch context, operation progress, errors, and structured events.
- [ ] **Shared application model with stable IDs** for workspaces, repositories, commands, operations, terminal tabs/surfaces, and agent attention.
- [ ] **GTK4/libadwaita shell** with a workspace/repository navigator, selected-workspace detail, loading/empty/error states, and keyboard focus that behaves like a Linux desktop app.
- [ ] **One correct embedded libghostty surface, then multiple tabs** with create, close, focus, resize, clipboard, scrollback, title/status, and independent client-owned PTYs.
- [ ] **Workspace/repository-bound launch** using only git-stacks-resolved cwd, environment, ports, and configuration.
- [ ] **Contextual named-command launch** into a dedicated terminal tab, with visible running/exited/failed state.
- [ ] **Session metadata continuity** so switching workspaces preserves live tabs and app restart restores workspace/tab layout metadata without claiming to resurrect dead processes.
- [ ] **Structured attention end-to-end**: receive event, badge the workspace/tab, aggregate unread state, select event, and focus the exact live surface or the nearest surviving context.
- [ ] **Non-regression boundary**: CLI, OpenTUI, tmux/cmux, IDE integrations, and workspace YAML remain independently usable and authoritative.
- [ ] **Thin macOS architectural proof** that loads the same model over the same protocol and hosts one libghostty terminal surface in SwiftUI/AppKit bridging. No distribution-grade polish required.

### Explicitly Defer Until the Slice Is Validated

- [ ] Split panes, drag/drop split trees, zoom/equalize, and complex layout persistence.
- [ ] Terminal-output search UI, rich notification history, profiles, theme editor, and exhaustive Ghostty configuration exposure.
- [ ] Native workspace create/rename/remove/merge/pull/push flows beyond the minimum mutation needed to prove protocol progress.
- [ ] Diff/file browser, PR/CI dashboard, merge automation, issue UI, and embedded editor.
- [ ] First-class launch adapters for individual coding agents, prompt composition, multi-agent fan-out, or AI-generated branch/commit naming.
- [ ] External tmux/cmux inventory, preview, attach, or control-plane features (the validated spike remains a separate future option).
- [ ] Packaging breadth, auto-update, macOS signing/notarization, polished platform parity, and Windows support.

### MVP Success Test

A Linux user can launch the native client, choose an existing multi-repository git-stacks workspace, open terminals in two different repository contexts, start an existing named agent/server/test command with the exact resolved environment, switch away without killing it, receive an attention event, and return to the precise terminal surface. The CLI and OpenTUI still observe and mutate the same workspace truth. A minimal macOS frontend demonstrates that none of those domain contracts depend on GTK.

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Versioned query/launch/progress/event protocol | HIGH | HIGH | P1 |
| Shared stable-identity application model | HIGH | HIGH | P1 |
| Linux workspace/repository navigation | HIGH | MEDIUM | P1 |
| Correct embedded terminal surface | HIGH | HIGH | P1 |
| Multiple workspace-bound tabs | HIGH | HIGH | P1 |
| Resolved-context shell and named-command launch | HIGH | MEDIUM | P1 |
| Structured attention routing and exact focus | HIGH | HIGH | P1 |
| Session metadata continuity | HIGH | MEDIUM | P1 |
| macOS protocol/libghostty proof | MEDIUM | HIGH | P1 (proof only) |
| Split panes and advanced terminal layout | MEDIUM | HIGH | P2 |
| Terminal search and richer notification history | MEDIUM | MEDIUM | P2 |
| Native workspace mutation suite | MEDIUM | HIGH | P2 |
| External tmux control plane | MEDIUM | HIGH | P2/P3 |
| Diff, file, PR, and CI center | MEDIUM | HIGH | P3 |
| Agent-specific orchestration | LOW | HIGH | P3 |

## Competitor Feature Analysis

| Feature | Supacode | dmux | Ghostty baseline | git-stacks Native Client Approach |
|---------|----------|------|------------------|----------------------------------|
| Primary isolation unit | Repository worktree | Task pane backed by a worktree/branch | Terminal surface/tab | Existing git-stacks workspace, which may contain multiple repositories/worktrees |
| Terminal ownership | Embedded Ghostty terminal; per-worktree tabs/splits/state | tmux owns panes | App owns windows/tabs/splits over libghostty | Native client owns only its PTYs/tabs; integrations keep their own sessions |
| Repeatable commands | Repository run/setup/archive scripts | Lifecycle hooks and agent launch | General shell/config actions | Existing git-stacks named commands and resolved execution context |
| Background attention | Notifications attached to worktree and exact surface | Native notifications from background panes | Terminal notifications/platform integration | Structured, agent-neutral event routed to workspace and exact client surface |
| Agent workflow | Agents run in terminal/setup command | Multi-agent selection, prompt launch, naming, merge/PR flow | Agent-agnostic terminal | Agent-neutral named-command launch; no bundled orchestrator in v0.20 |
| Git/forge scope | Built-in GitHub PR/CI actions | Merge, cleanup, PR creation, file/diff browsing | None | Do not duplicate shipped engine/integrations in MVP; expose later through service projections |
| Cross-platform native path | macOS product | tmux TUI plus evolving native macOS area | Native macOS and Linux consumers of shared libghostty | Linux GTK4 first; thin SwiftUI proof against shared model/protocol |
| Distinctive value | Cohesive macOS worktree command center | Fast task-to-agent-to-merge loop | Terminal correctness and native performance | Multi-repository workspace truth, resolved environment/ports, and continuity with mature CLI/TUI workflows |

## Sources

Primary sources accessed 2026-07-11:

- [Supacode documentation overview](https://docs.supacode.sh/) — product mental model and feature surface.
- [Supacode terminal documentation](https://docs.supacode.sh/terminal) — per-worktree state, tabs, splits, search, notifications, and exact-surface routing.
- [Supacode repository commands](https://docs.supacode.sh/worktree/repo-configuration) — repeatable run/setup/archive command expectations.
- [Supacode pull requests and CI](https://docs.supacode.sh/github/pull-requests-and-ci) — breadth deliberately excluded from this MVP.
- [dmux official repository README](https://github.com/standardagents/dmux) — worktree isolation, agent launch, notifications, navigation, lifecycle, and merge/PR expectations.
- [Ghostty: About](https://ghostty.org/docs/about) — native macOS/Linux architecture, libghostty boundary, and explicit API-instability warning.
- [Ghostty features](https://ghostty.org/docs/features) — terminal compatibility, native tabs/splits, and GPU-rendering baseline.
- Repo-local `.planning/PROJECT.md` and `.planning/spikes/MANIFEST.md` — authoritative milestone boundary and prior PTY/tmux spike verdicts.

---
*Feature research for: git-stacks v0.20.0 Native Workspace Client*
*Researched: 2026-07-11*
