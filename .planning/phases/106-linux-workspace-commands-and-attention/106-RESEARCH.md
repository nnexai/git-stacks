# Phase 106: Linux Workspace, Commands, and Attention - Research

**Researched:** 2026-07-11
**Domain:** GTK4/libadwaita workspace composition, multi-surface terminal lifecycle, resolved launching, and structured attention routing
**Confidence:** HIGH for repository seams and required architecture; MEDIUM for exact GTK composition until the Phase 105 real-session host is complete

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

### Workspace and Repository Navigation
- **D-01:** Use a workspace-first sidebar with expandable repositories. A single-repository workspace collapses the repository level automatically while retaining subtle active-repository context.
- **D-02:** Default to a simple workspace list and provide optional grouping or sorting by labels and repository membership. Persist the selected organization mode across restarts.
- **D-03:** On open or reconnect, restore the last valid workspace and repository; use a predictable fallback when either identity no longer exists.
- **D-04:** Show pinned workspaces in a dedicated expandable section above the grouped or sorted remainder. Pins use persistent manual drag-and-drop order and newly pinned workspaces append.
- **D-05:** Pin and unpin from the workspace-row action menu. If a pinned workspace disappears from an authoritative snapshot, remove it from pins and show a one-time notice.

### Terminal Tabs and Ended Sessions
- **D-06:** Each exact workspace-repository pair owns an independent terminal-tab collection. Changing navigation swaps the visible collection without recreating or terminating live surfaces.
- **D-07:** Tabs use persistent manual order within their workspace-repository pair; new tabs append. Default titles derive from the launched shell or named command, and users may reorder or rename tabs.
- **D-08:** Restored ended tabs retain their original positions, show an explicit `Ended` state, and offer Relaunch. Relaunch follows Phase 105 lineage rules and creates a new surface identity.

### Shell and Named-Command Launching
- **D-09:** Put workspace/repository actions and integrations in a top-right contextual menu, including available actions such as Open in VS Code.
- **D-10:** A new shell can be opened by double-clicking empty tab-bar space, an application-menu action, or a keyboard shortcut.
- **D-11:** Named commands use a focused launcher overlay inspired by Supacode. It searches/autocompletes only existing configured commands valid for the selected workspace-repository pair; it is not a general command palette.
- **D-12:** The launcher shows recently used commands first and the remaining valid commands alphabetically. Commands with duplicate names remain independently selectable with explicit workspace or repository scope labels.
- **D-13:** Selecting a command launches it in a new tab using the authoritative service-resolved context. If resolution or startup fails, create no tab, keep the launcher available, and show a structured error.

### Attention Hierarchy and Focus Routing
- **D-14:** Tabs show direct unread counts. Repositories and workspaces show aggregated counts while retaining state/severity color through the hierarchy.
- **D-15:** Failed and waiting are highest-priority unread attention, completed is secondary unread attention, and working/idle are visible status only.
- **D-16:** Selecting an attention item marks that item read. Directly focusing its exact tab clears that tab's current items once the tab is visibly active. Merely opening a workspace or repository does not clear attention.
- **D-17:** Selecting attention focuses the exact surviving surface. If it is gone, route to the ended predecessor tab, then repository, then workspace, and explain why the live surface could not be focused.
- **D-18:** Attention never changes application focus or navigation automatically; all focus routing follows explicit user selection.

### the agent's Discretion
- Choose the concrete GTK widgets, responsive breakpoints, icons, colors, keyboard bindings, fallback selection order, notices, drag affordances, menu composition, launcher matching algorithm, recent-command retention limit, and structured error presentation while preserving the locked interaction semantics and Phase 105 accessibility contract.

### Deferred Ideas (OUT OF SCOPE)
- General-purpose command palette — explicitly outside the milestone scope; Phase 106 provides only a configured-command launcher.
- Terminal splits, terminal search, and advanced layout persistence — deferred until after the tab-based vertical slice.

### Reviewed Todos (not folded)
- **Improve TUI dashboard experience** — applies to the existing OpenTUI dashboard, not the GTK native client.
- **Add manual workspace commands** — already shipped; Phase 106 consumes the existing command model.
- **Add workspace notes** — separate product capability outside this phase.
- **Add workspace stale view** — separate cleanup/advisory capability outside this phase.
- **Create workspace from forge source** — already shipped and unrelated to the native-client interaction slice.
- **Plan broader code quality improvement run** — separate planning stream unrelated to Phase 106.
- **Improve template composition understanding** — separate template UX capability.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| LNX-01 | Users can browse git-stacks workspaces and their repositories in a GTK4/libadwaita application. | Use an identity-backed `GtkTreeListModel`/`GtkListView` sidebar inside an adaptive split view. |
| LNX-02 | Users see explicit loading, empty, disconnected, incompatible, and failure states. | Project connection states already distinguish these conditions; map them to explicit content pages without coercion. |
| LNX-03 | Users can open multiple independent terminal tabs bound to selected workspace repositories. | Introduce a surface registry and tab collection keyed by exact workspace/repository identity pairs. |
| LNX-04 | Live terminal tabs survive workspace navigation without recreation. | Keep all live hosts owned by the registry; navigation only selects which collection is mounted/visible. |
| LNX-05 | Restarted clients restore tab metadata and clearly distinguish surfaces whose processes are no longer alive. | Extend Phase 105 presentation-only records to multiple entries and always restore them as ended. |
| LNX-06 | Keyboard navigation, focus movement, IME interaction, and native accessibility work across the sidebar and terminal surfaces. | Use standard GTK controls/actions, explicit focus handoff, and retain Ghostty-owned terminal input/IME semantics. |
| ACT-01 | Users can launch a shell using a service-resolved workspace/repository context. | Add an authenticated service resolution request and create a host only after it succeeds. |
| ACT-02 | Users can launch a named workspace command in a new terminal tab using resolved cwd, environment, ports, and configuration. | Treat configured command identity/scope as selection data; execute only the returned structured launch specification. |
| ACT-03 | Agent hooks publish structured working, waiting, completed, failed, and idle states associated with workspace and surface identities. | Extend the current workspace-only message event contract and hook CLI with lifecycle, repository, surface, and event identities. |
| ACT-04 | Users can see unread attention aggregated at workspace, repository, and terminal-tab levels. | Normalize attention items once and derive ancestor counts/severity; never store independent mutable aggregate counters. |
| ACT-05 | Selecting an attention item focuses the exact surviving surface or a documented nearest surviving context. | Implement a pure identity/lineage routing function with explicit fallback reason. |
| ACT-06 | Attention events never steal focus automatically and do not depend on scraping terminal output. | Event reduction updates status/unread only; platform focus is emitted exclusively from explicit selection actions. |
</phase_requirements>

## Summary

Plan this phase as composition around two completed boundaries: the authenticated TypeScript `/v1` service and the Phase 105 Zig reducer/terminal host. The GTK application must remain a projection of product state, while a native surface registry owns live terminal hosts independently from navigation. [VERIFIED: `.planning/phases/104-*`, `native/core/*`, and `native/linux/terminal_host.zig`] Use standard GTK/libadwaita model, action, list, split-view, tab, overlay, and accessibility primitives; do not turn toolkit widgets into a second source of truth. [CITED: https://docs.gtk.org/gtk4/actions.html] [CITED: https://docs.gtk.org/gtk4/class.TreeListModel.html] [CITED: https://gnome.pages.gitlab.gnome.org/libadwaita/doc/main/class.TabView.html]

The most important prerequisite is contract work. Today `ServiceEventSchema` carries attention as only `{ workspace_id, code, message }`, and the installed Claude/Copilot hooks translate completion/waiting into free-form `message send` calls. There is no attention event identity, lifecycle state, repository identity, surface identity, unread/read state, or structured focus target. [VERIFIED: `src/lib/service/contract.ts`, `src/lib/messages.ts`, and `src/lib/agent-hooks/*`] ACT-03 through ACT-06 cannot be truthfully implemented by terminal-output scraping or by interpreting those messages. The first plan must define and test a backward-conscious structured attention publication seam before native aggregation work begins.

The second prerequisite is launch semantics. The aggregate snapshot already exposes resolved environment, cwd, ports, commands, and named steps, but the current service has no explicit per-selection shell/command launch-resolution endpoint and snapshot command entries are display strings rather than stable command identities. [VERIFIED: `src/lib/service/contract.ts`, `src/lib/service/snapshot.ts`, and `src/service/server.ts`] Plan a request/response contract that takes stable workspace/repository plus configured-command identity and returns validated argv/steps and redacted execution context. Only after successful resolution and process startup should the UI append a live tab; failure leaves the launcher open and creates no persisted tab.

**Primary recommendation:** use five dependency-ordered slices: (1) extend resolved-launch and attention contracts/hooks; (2) expand the shared reducer/persistence into normalized navigation, tab collections, attention, and explicit effects; (3) build the adaptive GTK workspace shell; (4) compose multi-host terminal tabs and the command launcher; (5) add attention presentation/routing plus automated and real-session acceptance.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|--------------|----------------|-----------|
| Authoritative workspace/repository/command data | Bun service | Zig shared model | Service resolves engine data; core validates/reduces it. [VERIFIED: Phase 104 boundary] |
| Agent lifecycle publication | Hook CLI + Bun service | Durable event journal | Hooks provide structured state; journal orders/replays it. [VERIFIED: existing event architecture] |
| Navigation, tab, unread, and routing semantics | Zig shared model | GTK adapter | Deterministic product behavior must remain platform-neutral. [VERIFIED: Phase 105 ABI decision] |
| Live terminal ownership | Linux surface registry | Phase 105 terminal host/guard | Registry groups hosts; each host retains exclusive process ownership. [VERIFIED: native host architecture] |
| Rendering, focus, IME, accessibility presentation | GTK/libadwaita shell | libghostty adapter | Platform widgets own native interaction while terminal input stays at the host boundary. [CITED: https://docs.gtk.org/gtk4/input-handling.html] |
| Presentation preferences and ended metadata | Versioned native persistence | GTK adapter | Stable IDs/order/labels persist; process liveness never does. [VERIFIED: `native/core/persistence.zig`] |

## Standard Stack

No new external package is required. Continue the exact Phase 105 native stack and system libraries. [VERIFIED: `native/deps/ghostty.lock` and `native/build.zig`]

| Technology | Version/pin | Purpose | Why standard here |
|------------|-------------|---------|-------------------|
| Zig | exact `0.15.2` via repo setup cache | Shared reducer, persistence, ABI, native shell | Already locked by Phase 105/Ghostty compatibility. [VERIFIED: `native/deps/ghostty.lock`] |
| Ghostty/libghostty | peeled `v1.3.1` commit `332b2aefc6e72d363aa93ab6ecfc86eeeeb5ed28` | Terminal surfaces and PTYs | Already isolated behind the Phase 105 adapter. [VERIFIED: `native/deps/ghostty.lock`] |
| GTK4 | support floor `>=4.14,<5`; host `4.22.4` | Lists, focus, actions, DnD, accessibility | Standard controls provide native keyboard/accessibility behavior. [CITED: https://docs.gtk.org/gtk4/class.ListView.html] |
| libadwaita | support floor `>=1.5,<2`; host `1.9.2` | Adaptive shell, split view, tabs, toasts/overlays | Matches established Linux native stack. [CITED: https://gnome.pages.gitlab.gnome.org/libadwaita/doc/main/] |
| Bun/TypeScript/Zod | existing repository versions | Service contract, hook CLI, launch resolution | Engine and trust-boundary validation remain authoritative. [VERIFIED: `package.json`] |

## Package Legitimacy Audit

Not applicable: the phase should install no new npm, crates, or system package names. It consumes the Phase 105 exact pins and existing GTK/libadwaita development dependencies. [VERIFIED: repository and environment inspection]

## Architecture Patterns

### System Architecture Diagram

```text
agent hook / explicit user action
            |
            v
validated CLI + authenticated /v1 service
  | resolved launch response       | ordered structured attention event
  v                                v
shared Zig action decoder -> pure reducer -> normalized state + explicit effects
                                       |              |
                          create/close/focus host      | render navigation/unread
                                       v              v
                         Linux surface registry    GTK/libadwaita shell
                              | exact pair key          |
                              v                         | explicit selection only
                    Phase 105 terminal host <-----------+
                              |
                              v
                      libghostty + owned PTY
```

### Recommended Project Structure

```text
src/lib/service/                 # extended v1 launch + structured attention schemas/adapters
src/lib/agent-hooks/             # hook-to-structured-state publication
native/core/                     # normalized state, reducer, routing, persistence, ABI
native/linux/application.zig     # AdwApplication/window/action composition
native/linux/workspace_view.zig  # sidebar and explicit connection pages
native/linux/tab_registry.zig    # pair-keyed tab collections and host ownership
native/linux/command_launcher.zig# configured-command-only overlay
native/linux/attention_view.zig  # badges, statuses, explicit focus route presentation
native/tests/                    # reducer, persistence, contract, host-registry, UI harnesses
```

### Pattern 1: Normalized product state, derived GTK models

Store authoritative entities by stable identity; store ordered workspace IDs, repository IDs, pair keys, surface IDs, and attention IDs separately. Derive sidebar rows, selected tab view, unread counts, and severity from normalized state. [VERIFIED: project stable-ID contract] `GtkTreeListModel` can create child list models lazily and `GtkListView` renders dynamic model items through factories. [CITED: https://docs.gtk.org/gtk4/class.TreeListModel.html] [CITED: https://docs.gtk.org/gtk4/class.ListItemFactory.html]

Do not put product identity or liveness only in `GObject`/widget instances. GTK list factories recycle row widgets, so bind/unbind handlers must clear previous labels, counts, CSS classes, signals, and drag state. [CITED: https://docs.gtk.org/gtk4/class.ListItemFactory.html]

### Pattern 2: Registry-owned hosts, view-selected collections

Use `PairKey{workspace_id, repository_id}` → ordered `SurfaceId[]`, plus `SurfaceId` → `TerminalHost`/ended presentation. Selecting a repository changes the selected pair and visible pages only. It must not destroy, recreate, or re-resolve other hosts. [VERIFIED: D-06 and Phase 105 exclusive ownership]

Use `AdwTabView` as visible-page composition and `AdwTabBar` as its switcher, but keep canonical order/lifecycle in shared state. `AdwTabView` is specifically intended for dynamic terminal/editor-style tabs and exposes page reorder/select APIs. [CITED: https://gnome.pages.gitlab.gnome.org/libadwaita/doc/main/class.TabView.html]

### Pattern 3: Intent -> service resolution -> startup -> state commit

For shell/command launch, reducer emits a request effect carrying stable identities, not cwd/env/command strings. The service returns a structured validated specification. Start the process through the terminal adapter; only after registration-before-live succeeds dispatch `surface_started` and append the tab. [VERIFIED: Phase 104 redaction and Phase 105 ownership ordering] Never reconstruct a shell command from display labels or invoke a shell merely to interpolate service data. [CITED: https://owasp.org/www-project-application-security-verification-standard/]

### Pattern 4: Attention as identity-addressed events and derived aggregates

Define at minimum: `attention_id`, lifecycle `state`, `workspace_id`, optional `repository_id`, optional `surface_id`, source/agent identity, timestamp/sequence, and a safe presentation message/code. Validate identity nesting against the current snapshot; preserve unresolved events diagnostically rather than assigning them to the current selection. [VERIFIED: ACT-03 through ACT-06 and project explicit-invalid-state convention]

Reducer actions update items/status only. `select_attention(attention_id)` is the sole action allowed to emit a platform navigation/focus effect. Route in order: exact live surface → ended predecessor/presentation → repository → workspace, returning a machine-readable fallback reason used by a toast/banner. Direct terminal focus clears only current items for that visibly active surface; navigation alone does not. [VERIFIED: D-16 through D-18]

### Pattern 5: One GAction path for menus and shortcuts

Define app/window actions such as `win.new-shell`, `win.launch-command`, `win.rename-tab`, and `win.focus-attention`; connect menus/buttons and accelerators to the same actions. GTK documents application/window/widget action scopes and `gtk_application_set_accels_for_action()`. [CITED: https://docs.gtk.org/gtk4/actions.html] Disable launch actions whenever the shared connection state is stale, refresh-required, incompatible, or failed instead of letting each widget improvise availability. [VERIFIED: Phase 105 mutation-freeze semantics]

### Pattern 6: Adaptive shell without focus destruction

Use `AdwOverlaySplitView` for sidebar/content composition and an `AdwBreakpoint` to collapse the sidebar at a tested width. [CITED: https://gnome.pages.gitlab.gnome.org/libadwaita/doc/main/class.OverlaySplitView.html] [CITED: https://gnome.pages.gitlab.gnome.org/libadwaita/doc/main/class.Breakpoint.html] A breakpoint changes presentation, not selected identity or host ownership. When the launcher closes, restore focus to the previously focused terminal only if it still exists and the close was user-driven; incoming attention never calls present/focus/navigation APIs.

### Anti-Patterns to Avoid

- **One `State.surface` field:** the current Phase 105 model is deliberately a one-surface foundation; Phase 106 must replace/extend it with collections rather than bolting tabs onto widgets. [VERIFIED: `native/core/model.zig`]
- **Widget-owned truth:** recycled list rows and selected pages cannot be canonical persistence or unread state. [CITED: https://docs.gtk.org/gtk4/class.ListItemFactory.html]
- **Create tab before launch succeeds:** leaves phantom/live-looking records and violates D-13.
- **Parse terminal output for attention:** directly violates ACT-06 and creates an unbounded spoofing boundary.
- **Interpret free-form messages as lifecycle state:** current messages are insufficiently typed and cannot supply reliable identities. [VERIFIED: `src/lib/messages.ts`]
- **Global terminal shortcut interception:** application shortcuts must arbitrate narrowly, with ordinary keys/IME preserved for Ghostty. [VERIFIED: `native/linux/terminal_host.zig`]
- **Persist launch environment/argv or liveness:** preserve only presentation metadata allowed by Phase 105. [VERIFIED: `native/core/persistence.zig`]

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Dynamic list virtualization | Manual row widget cache | `GtkListView` + list model/factory | GTK owns recycling, keyboard selection, and accessibility. [CITED: https://docs.gtk.org/gtk4/class.ListView.html] |
| Hierarchical sidebar | Nested ad hoc boxes | `GtkTreeListModel` + `GtkTreeExpander` | Maintains tree/list semantics and expandable children. [CITED: https://docs.gtk.org/gtk4/] |
| Dynamic terminal tabs | Custom notebook bookkeeping | `AdwTabView` + `AdwTabBar`, projected from product state | Provides terminal/editor tab behavior and reorder APIs. [CITED: https://gnome.pages.gitlab.gnome.org/libadwaita/doc/main/class.TabView.html] |
| App shortcuts/menu routing | Independent key handlers per widget | GAction/GMenu plus application accelerators | One enabled-state and activation path. [CITED: https://docs.gtk.org/gtk4/actions.html] |
| Drag transport | Raw pointer globals | `GtkDragSource` + `GtkDropTarget` carrying stable IDs | GTK owns DnD lifecycle; IDs avoid stale row references. [CITED: https://docs.gtk.org/gtk4/class.DragSource.html] |
| Command/environment resolution | YAML parsing or shell interpolation in native UI | Authenticated service resolved-launch response | Preserves engine authority, redaction, validation, and compatibility. [VERIFIED: milestone architecture] |
| Aggregate unread counters | Three independently mutated counters | Derived fold/index over normalized attention items | Prevents drift after read, replay, removal, and fallback. |
| Terminal lifecycle | New PTY/process manager | Phase 105 `TerminalHost`/ownership guard per surface | Already proves registration, teardown, and crash cleanup. [VERIFIED: native host code] |

## Common Pitfalls

### Pitfall 1: Phase 104 contract is treated as already sufficient
**What goes wrong:** hooks still publish workspace-only messages, so repository/tab badges and exact routing are guessed.
**How to avoid:** contract-first plan with strict schemas, fixtures, journal/replay tests, hook adapter tests, and compatibility behavior before UI tasks. [VERIFIED: current schema gap]

### Pitfall 2: Snapshot launch data becomes stale execution authority
**What goes wrong:** a command launches with old cwd/env/ports after configuration or revision changes.
**How to avoid:** issue a fresh resolution request tied to stable identities/current revision; reject stale or missing identities with a structured error and create no tab.

### Pitfall 3: Switching pair collections tears down hidden terminals
**What goes wrong:** GTK page removal triggers `unrealize`, destroying a process during navigation.
**How to avoid:** distinguish view detachment/hiding from terminal-host destruction; only explicit close, child exit, quit, or crash invokes ownership teardown. Add navigation-churn tests with invariant host generations/PGIDs.

### Pitfall 4: Read state is coupled to navigation
**What goes wrong:** entering a workspace clears descendant unread items that were never inspected.
**How to avoid:** only `select_attention` and confirmed visible exact-surface focus produce read actions; test workspace/repository navigation as read-neutral.

### Pitfall 5: GTK factory handler leakage
**What goes wrong:** a recycled row activates or drags a prior workspace identity.
**How to avoid:** disconnect/reset every binding on unbind and transport stable IDs, never row pointers. [CITED: https://docs.gtk.org/gtk4/class.ListItemFactory.html]

### Pitfall 6: Shortcut/IME regressions
**What goes wrong:** global key controllers consume terminal input, Tab focus traversal breaks, or launcher preedit is forwarded to Ghostty.
**How to avoid:** use GActions for explicit application shortcuts, preserve GTK Tab/Shift-Tab focus semantics, and test IME preedit/commit independently in launcher and terminal. [CITED: https://docs.gtk.org/gtk4/input-handling.html]

### Pitfall 7: Restored order or pin state references vanished identities
**What goes wrong:** selection becomes null, duplicate, or points to stale workspace/repository records.
**How to avoid:** reconcile persisted IDs against each authoritative snapshot, remove vanished pins with one notice, preserve valid entries independently, and use a deterministic fallback (last valid pair, first valid pinned pair, then first valid workspace/repository).

### Pitfall 8: Severity color is the only status signal
**What goes wrong:** status becomes inaccessible and indistinguishable for color-impaired users.
**How to avoid:** pair color with icon/text/count and accessible labels/descriptions. Standard GTK widgets expose accessibility by default but application-specific semantics still need explicit attributes. [CITED: https://docs.gtk.org/gtk4/section-accessibility.html]

## Code Examples

### Pure focus routing shape

```zig
// Project pattern derived from D-17/D-18; product core, no GTK types.
pub const FocusRoute = union(enum) {
    live_surface: SurfaceId,
    ended_surface: struct { id: SurfaceId, reason: FallbackReason },
    repository: struct { id: RepositoryId, reason: FallbackReason },
    workspace: struct { id: WorkspaceId, reason: FallbackReason },
    unavailable: FallbackReason,
};
```

### Action-scoped UI behavior

```text
win.new-shell          -> reduce(request_shell(selected_pair))
win.launch-command     -> open configured-command overlay
win.activate-command   -> reduce(request_named_launch(command_id))
win.focus-attention    -> reduce(select_attention(attention_id))
```

GTK recommends connecting menus/widgets and accelerators to scoped actions instead of separate callbacks. [CITED: https://docs.gtk.org/gtk4/actions.html]

## State of the Art

| Old/current local approach | Required Phase 106 approach | Impact |
|----------------------------|-----------------------------|--------|
| GTK `GtkTreeView` family | GTK4 `GtkListView` + `GtkTreeListModel` | Old tree model/view APIs are deprecated in GTK 4.10; use list-model architecture. [CITED: https://docs.gtk.org/gtk4/] |
| Workspace-only `{code,message}` attention | Typed lifecycle event with stable target identities | Enables reliable aggregation/replay/focus without scraping. [VERIFIED: current gap + ACT requirements] |
| Single optional surface in shared state | Pair-keyed ordered surface collections | Enables independent live tab sets and truthful restoration. [VERIFIED: current model + D-06] |
| Hook message send/clear | Structured hook state publication | Working/waiting/completed/failed/idle become machine state, not prose interpretation. [VERIFIED: current hooks] |
| Snapshot-only launch specification | Fresh identity/revision-bound resolution before startup | Prevents stale execution and gives structured failure semantics. |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `AdwTabView` pages can remain attached for every live pair while only the selected pair's tab view is visible without unacceptable resource cost. | Architecture Patterns | If measured cost is high, keep hosts in the registry and reparent only lightweight host containers without unrealizing surfaces; verify lifecycle behavior before choosing. |
| A2 | A backward-compatible optional extension of the `/v1` attention payload is preferable to a `/v2` contract. | Summary | Strict older schemas may reject fields; planner must decide from the compatibility fixtures/capability negotiation and may need a new negotiated capability/schema. |
| A3 | A recent-command limit of 10 per selected pair is sufficient. | Launcher UX | This is discretion; keep configurable/testable and do not let it affect command validity. |

## Open Questions

1. **How should the structured attention schema version?**
   - What we know: current Zod schemas are strict and current payload lacks required identities/state. [VERIFIED: `src/lib/service/contract.ts`]
   - Recommendation: make Plan 1 explicitly test old/new fixture behavior and capability negotiation; choose additive `/v1` only if older official clients safely ignore or negotiate it, otherwise introduce a clearly versioned capability/event shape.

2. **What is the stable identity for duplicate named commands?**
   - What we know: snapshots expose command names and named step arrays, but not a dedicated command ID/scope identity. [VERIFIED: `LaunchSpecificationSchema`]
   - Recommendation: derive/persist an authoritative opaque command identity in the service contract; do not use display name as identity.

3. **How do hooks learn the exact surface identity?**
   - What we know: hooks are installed per repository/worktree before a particular terminal surface necessarily exists. [VERIFIED: hook installers]
   - Recommendation: inject workspace/repository/surface IDs into the launched terminal environment and make the structured hook CLI validate them; events from sessions without a surface ID remain workspace/repository status, never guessed onto a tab.

4. **Can Phase 105's GTK host be safely hidden/reparented without unrealize?**
   - What we know: current `TerminalHost.unrealize()` owns teardown. [VERIFIED: `native/linux/terminal_host.zig`]
   - Recommendation: retire this risk with a small multi-host navigation spike/test before full tab UI; prove navigation does not call teardown or change host generation/PGID.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|-------------|-----------|---------|----------|
| Repo-controlled Zig | native builds | Via `bun run native:setup` | exact `0.15.2` required | Ambient `/usr/bin/zig` is `0.16.0` and must not be used. [VERIFIED: local probe] |
| GTK4 | Linux UI | Yes | `4.22.4` | CI must also cover declared `>=4.14` floor. [VERIFIED: `pkg-config`] |
| libadwaita-1 | Linux UI | Yes | `1.9.2` | CI must also cover declared `>=1.5` floor. [VERIFIED: `pkg-config`] |
| D-Bus session | GTK application tests | Yes | `dbus-run-session` present | Use injected/model tests for non-UI behavior. [VERIFIED: local probe] |
| Xvfb/Weston | compositor integration | No | — | Real Wayland/X11 session checkpoint; do not claim compositor behavior from headless-only tests. [VERIFIED: local probe] |

**Missing dependencies with no automated fallback:** a graphical Wayland/X11 session remains required for final focus, IME, drag, terminal, and accessibility acceptance.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Bun test runner for TypeScript; Zig `std.testing` through `scripts/verify-native.ts` |
| Config file | `scripts/test-runner.ts`, `scripts/verify-native.ts`, `native/build.zig` |
| Quick run command | `bun run native:test:quick` plus focused `bun test <file>` |
| Full suite command | `bun run native:verify && bun run test && bun run typecheck && bun run test:deps && bun run verify:gates` |

### Phase Requirements -> Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|--------------|
| LNX-01/02 | identity-backed navigation and explicit states | reducer + GTK harness | `bun run native:test:workspace-ui` | No - Wave 0 |
| LNX-03/04 | multiple independent live pair collections survive navigation | Zig integration/real host | `bun run native:test:tabs` | No - Wave 0 |
| LNX-05 | multi-entry ended-only restore, order, rename, lineage | Zig persistence | `bun run native:test:restore` | Exists but needs expansion |
| LNX-06 | keyboard/focus/IME/accessibility across shell | automated semantics + human UAT | `bun run native:test:accessibility` | Exists but needs Phase 106 matrix |
| ACT-01/02 | fresh resolved shell/command and no phantom tab on failure | TypeScript contract + native effect integration | `bun test tests/lib/service/native-launch.test.ts && bun run native:test:tabs` | No - Wave 0 |
| ACT-03 | structured hook lifecycle and identities | TypeScript unit/integration | `bun test tests/lib/agent-hooks/structured-attention.test.ts tests/lib/service/event-journal.test.ts` | No - Wave 0 |
| ACT-04 | exact derived counts/severity through replay/read | Zig reducer | `bun run native:test:attention` | No - Wave 0 |
| ACT-05/06 | exact/fallback routes; event receipt never focuses | Zig reducer + GTK effect harness | `bun run native:test:attention` | No - Wave 0 |

### Sampling Rate

- **Per task commit:** focused Bun/Zig target under 30 seconds.
- **Per wave merge:** `bun run native:test:quick` plus affected TypeScript service/hook tests.
- **Phase gate:** full suite above, then documented real-session UAT on the exact native stack.

### Wave 0 Gaps

- [ ] Add service contract fixtures/tests for structured attention and fresh resolved launch.
- [ ] Add native fixture export/decoder cases for navigation entities, command identities, tab collections, and attention.
- [ ] Add `workspace-ui`, `tabs`, and `attention` native build/test targets and script wrappers.
- [ ] Add a fake terminal-host registry backend so multi-host navigation/close/failure can be deterministic.
- [ ] Extend real-session acceptance and accessibility documents for sidebar/tab/launcher focus, DnD, IME, badges, and no-focus-theft.

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|------------------|
| V2 Authentication | Yes | Reuse exact Bearer admission and per-client credential from Phase 104; native UI never bypasses it. [VERIFIED: service boundary] |
| V3 Session Management | Yes (local service session/replay) | Capability negotiation, cursor ordering, replay-gap rebuild, bounded queues. [VERIFIED: Phase 104] |
| V4 Access Control | Yes | Service resolves only authenticated requested stable identities; hooks cannot target arbitrary filesystem paths. |
| V5 Input Validation | Yes | Strict Zod service/hook schemas and Zig decoder validation at ABI boundary. [VERIFIED: project pattern] |
| V6 Cryptography | No new crypto | Reuse Phase 104 credentials; do not hand-roll. |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Command injection from configured strings/labels | Elevation/Tampering | No native shell interpolation; use service-validated structured argv/steps and fixed launch APIs. [CITED: https://owasp.org/www-project-application-security-verification-standard/] |
| Attention spoofing of another surface/workspace | Spoofing | Validate stable identity nesting/source context; unresolved events stay diagnostic. |
| Terminal escape/output spoofing UI attention | Spoofing | Never derive status or focus targets from terminal output (ACT-06). |
| Secret leakage through persistence/errors | Information Disclosure | Persist presentation only; redact env/argv/credentials and use structured safe diagnostics. [VERIFIED: Phase 104/105 constraints] |
| Focus theft from asynchronous events | Denial/Spoofing | Reducer event path cannot emit focus effects; only explicit user-selection action can. |
| Replayed/duplicate attention inflates counts | Tampering | Stable attention ID plus journal sequence deduplication and derived aggregates. |
| Stale widget callbacks target recycled identity | Tampering | Generation/binding cleanup and stable-ID action parameters; no row pointers. |

## Sources

### Primary (HIGH confidence)

- Repository Phase 104/105 contexts, contracts, implementation, fixtures, and native tests - current service/model/host boundaries and concrete gaps.
- `src/lib/service/contract.ts`, `src/lib/service/snapshot.ts`, `src/lib/messages.ts`, `src/lib/agent-hooks/*` - current launch and attention shapes.
- `native/core/*`, `native/linux/terminal_host.zig`, `native/deps/ghostty.lock` - exact native state, persistence, ownership, and versions.

### Secondary (MEDIUM confidence)

- https://docs.gtk.org/gtk4/actions.html - scoped actions, menu integration, accelerators.
- https://docs.gtk.org/gtk4/class.ListView.html - model-backed dynamic lists.
- https://docs.gtk.org/gtk4/class.TreeListModel.html - expandable hierarchical list model.
- https://docs.gtk.org/gtk4/class.ListItemFactory.html - recycled list-item factory lifecycle.
- https://docs.gtk.org/gtk4/input-handling.html - focus traversal and input handling.
- https://docs.gtk.org/gtk4/section-accessibility.html - standard accessible widgets and app-specific semantics.
- https://docs.gtk.org/gtk4/class.DragSource.html and https://docs.gtk.org/gtk4/class.DropTarget.html - GTK4 DnD controllers.
- https://gnome.pages.gitlab.gnome.org/libadwaita/doc/main/class.TabView.html - dynamic terminal/editor tab container.
- https://gnome.pages.gitlab.gnome.org/libadwaita/doc/main/class.OverlaySplitView.html - adaptive sidebar/content shell.
- https://gnome.pages.gitlab.gnome.org/libadwaita/doc/main/class.Breakpoint.html - adaptive property thresholds.
- https://owasp.org/www-project-application-security-verification-standard/ - command-injection and trust-boundary verification guidance.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - exact versions and boundaries are already pinned/implemented.
- Architecture: HIGH - follows locked service authority, pure shared model, and exclusive terminal ownership.
- GTK widget composition: MEDIUM - official APIs are verified, but multi-host hide/reparent behavior needs an implementation spike on the pinned host.
- Attention/launch contract: HIGH for the identified gap; MEDIUM for exact versioning until compatibility fixtures decide additive v1 versus negotiated new shape.
- Pitfalls: HIGH - derived from current code gaps, locked requirements, and official GTK lifecycle semantics.

**Research date:** 2026-07-11
**Valid until:** 2026-08-10 for stable GTK/project architecture; re-check current Phase 105 completion evidence before execution.
