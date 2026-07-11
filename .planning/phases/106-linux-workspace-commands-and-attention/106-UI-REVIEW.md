# Phase 106 UI Review: Linux Workspace, Commands, and Attention

**Audited:** 2026-07-11  
**Status:** FAIL — production graphical acceptance is blocked  
**Evidence:** user Supacode reference screenshot, user production screenshot and console trace, Phase 106 context/plan/research, current `native/linux` sources, and `docs/native-workspace-acceptance.md`

## Verdict

The current GTK client is a functional-prototype shell, not the Phase 106 product described by the plan and not a usable Supacode-like workspace. The user's report is corroborated by production source: core interactions are missing or wired to widgets that cannot represent the state, several advertised features exist only as helper/model tests, and both terminal close and window close have unsafe lifetime behavior. The blocking acceptance document correctly remains `NOT YET OBSERVED`; its automated checkmarks are insufficient and some are contradicted by this run.

The Vulkan `VK_SUBOPTIMAL_KHR` messages are incidental compositor warnings. The actionable failures are the missing `GtkStack` children, invalid widget parenting during snapshot, and `std.http.Client.deinit` panic shown in the user's trace.

## Six-pillar score

| Pillar | Score | Assessment |
|---|---:|---|
| Copywriting | 1/4 | Developer/model terminology leaks into primary chrome and the selected repository is mislabeled. |
| Visuals | 1/4 | The shell is a set of default GTK boxes/buttons with no coherent product hierarchy or selected-tab treatment. |
| Color | 2/4 | Terminal colors are sound, but application chrome has almost no semantic styling; attention is reduced to raw text/dot indicators. |
| Typography | 2/4 | Legible defaults, but headings, labels, and controls compete without a deliberate scale or density system. |
| Spacing | 1/4 | Oversized header/sidebar rows, detached overflow controls, and a rigid 240px rail waste space and break visual rhythm. |
| Experience design | 0/4 | New shell, ended-tab recovery/removal, search, configured commands, resizing, close, and navigation are broken or incomplete. |
| **Overall** | **7/24** | **Blocking redesign and integration repair required.** |

## Critical production blockers

### P0-1 — Ended tabs point at terminal pages that do not exist

- `refreshProjection` renders every persisted surface, including ended records, as a clickable tab (`native/linux/app.zig:483-525`).
- `tabClicked` unconditionally asks `GtkStack` to show a child named by that surface ID (`native/linux/app.zig:621-629`). Ended/restored records have no live Ghostty widget in that stack, exactly matching `Child name ... not found in GtkStack`.
- An ended tab therefore appears interactive but clicking it does nothing. There is no ended-state content page with metadata and Relaunch/Remove actions.
- The plan requires ended tabs to remain explicitly usable (`106-CONTEXT.md` D-08; `106-03-PLAN.md` Task 1). The current behavior is a false affordance.

**Required target:** selecting an ended tab must show an intentional ended-session page in the content area, including title, cwd, exit status/time where known, `Relaunch`, and `Remove from history`. Relaunch replaces or links the presentation record only after a new terminal host registers. Removal deletes only presentation metadata and deterministically selects a neighboring tab or the empty state.

### P0-2 — No removal lifecycle exists for ended presentation records

- The tab menu offers only Rename and Relaunch for ended surfaces (`native/linux/app.zig:505-515`).
- `workspace_view.closeTab` only changes live to ended and never removes a surface (`native/linux/workspace_view.zig:31`).
- `close-tab` is deliberately disabled unless the selected surface is live (`native/linux/app.zig:383-386`).

**Required target:** separate `Close terminal` (live process teardown, then ended/removable presentation according to product policy) from `Remove tab`/`Remove from history` (ended presentation deletion). Both must be identity-scoped, not implicitly operate on whatever tab happens to be selected.

### P0-3 — Terminal/window shutdown has unsafe ownership and crashes

- `closeTerminal` marks model state ended and removes the raw terminal pointer before registry close (`native/linux/app.zig:790-805`), while the terminal widget can remain parented in `GtkStack`; this aligns with `gtk_widget_snapshot_child` parent assertion and “closing a shell seems to crash it.”
- Window close calls `cleanup` synchronously from `close-request` (`native/linux/app.zig:1071-1073`). Cleanup calls `transport.cancel()` while an HTTP worker may still own/use the same `std.http.Client` (`native/linux/app.zig:169-176`; `native/linux/service_client.zig:46-64`), matching the panic at `std/http/Client.zig:183`.
- Cleanup also detaches the entire window content and then destroys graph/runtime/state inside the close callback (`native/linux/app.zig:179-210`), creating reentrancy/use-after-free risk while GTK is processing widget disposal.

**Required target:** one idempotent asynchronous shutdown state machine: disable actions, stop accepting replay dispatches, request transport cancellation through a thread-safe mechanism, join worker, explicitly remove/unparent terminal pages, close registry hosts once, then release graph/runtime after GTK callbacks drain. `close-request` must inhibit default destruction until orderly cleanup completes, or defer cleanup to application shutdown with state lifetime guaranteed.

### P0-4 — New-shell/configured-command actions are visibly present but ineffective

- The shell action calls `createTerminal` (`native/linux/app.zig:830-839`), but errors are swallowed into a launcher popover that may not be visible/anchored correctly; the user receives no durable explanation.
- The configured-command UI is a manually parented `GtkPopover` placed as an overlay (`native/linux/app.zig:999-1025`), not attached to the search button or presented as a centered command overlay. `openLauncher` silently returns when not ready (`native/linux/app.zig:742-747`).
- Empty command results have no empty/help state. A service or launch failure is displayed only inside this fragile popover (`native/linux/app.zig:732-740`).
- The search icon and “Configured commands…” route to the same action, so both fail together. The screenshot/user observation proves the production path is not operable despite helper tests around `command_launcher.zig`.

**Required target:** a centered, modal-like launcher overlay with reliable ownership, visible keyboard focus, loading/empty/error states, command scope metadata, recent grouping, Enter activation, Escape close, and structured launch errors. New shell must show an in-context error toast/banner if resolution/startup fails; actions must explain disabled readiness rather than silently no-op.

## Product and interaction gaps

### 1. Information architecture and hierarchy — P1

Current production renders a global header, an extra “Pinned and grouped workspaces” heading, workspace heading rows, repository rows, then a second global tab strip. This creates four competing navigation levels without the compact hierarchy in the reference.

Evidence:

- The obnoxious sidebar title is hard-coded at `native/linux/app.zig:955-960` and adds no information.
- Workspace rows and repository rows are appended as unrelated children of one `GtkListBox` (`native/linux/app.zig:411-480`), not the `GtkTreeListModel`/`GtkTreeExpander` hierarchy specified by research.
- Pinned and unpinned workspaces are not actually separated into dedicated sections; pin only adds a star and heading CSS (`native/linux/app.zig:413-448`), contradicting D-04.
- Organization mode exists in `workspace_view.zig:22` but is not exposed or applied in the production projection. This is a helper-only path.

**Target:** compact left rail with product label, add/import control, and optional collapse control at top; dedicated `Pinned` section only when non-empty; repository/workspace groups below; clear selected-row fill; small secondary branch/path/status text; no explanatory title. A single-repository workspace should be one selectable row showing its actual workspace/repository name, not a nested synthetic child.

### 2. Incorrect user-facing copy — P1

- Single-repository rows are hard-coded as `Workspace terminal` (`native/linux/app.zig:449-458`) despite authoritative names being available. This caused the observed incorrect label.
- `Attention: 0 unread (none)` exposes implementation vocabulary and a null enum (`native/linux/app.zig:528-540`). Zero attention should not consume the most prominent left side of the title bar.
- `Pinned and grouped workspaces` describes implementation features rather than helping the user.
- Default terminal title is the generic `shell` (`native/linux/app.zig:704-710`), producing weak tab identity.

**Target copy:** use authoritative workspace/branch/repository names. Default shell tab title should be the shell/command label with disambiguating ordinal only as needed. Hide attention chrome at zero; when nonzero use a bell badge and concise tooltip/accessibility label such as “3 items need attention.” Use `Run command…`, `New terminal`, `Relaunch`, `Remove`, and concrete error messages.

### 3. Tabs are visually and behaviorally hand-rolled — P1

- A horizontal `GtkBox` of ordinary buttons plus a separate menu button is used (`native/linux/app.zig:976-991`, `483-525`) instead of the planned/researched `AdwTabView` + `AdwTabBar`.
- This creates two adjacent controls per tab, weak selected state, excessive width, no overflow behavior, and the repeated `…` clutter reported by the user.
- Selected state is not styled in `refreshProjection`; every tab is rebuilt on every refresh, harming focus continuity and pointer stability.
- There is no visible `+`/new-tab affordance; double-clicking empty space is undiscoverable.

**Target:** use `AdwTabView`/`AdwTabBar` or an equivalently complete identity-backed custom tab component. Each tab is one compact unit with selected state, title, status marker, and close affordance on hover/active. Primary click selects; middle click closes live/removes ended according to policy; secondary click opens a context menu. Include a trailing `+` button and preserve double-click/shortcut activation. Overflow becomes a tab list, not one permanent kebab per tab.

### 4. Context menus are the wrong primary affordance — P1

- Permanent `GtkMenuButton`s are created for every workspace, repository, and tab (`native/linux/app.zig:427-435`, `463-477`, `505-524`).
- There is no secondary-click gesture/context menu on the semantic row/tab itself.
- The tab Close item uses unparameterized `win.close-tab` (`native/linux/app.zig:515`), while the menu press separately mutates selection; this coupling is fragile and can target the wrong tab.

**Target:** right click/secondary click anywhere on a workspace/repository/tab opens an identity-scoped popover menu. Keep a subtle hover-only overflow button only where keyboard/touch discoverability needs it. Every action carries the stable identity parameter directly. Menus: workspace (pin/unpin, open integration); repository (new terminal, run command, integration); live tab (rename, duplicate/relaunch as applicable, close); ended tab (relaunch, rename, remove).

### 5. Sidebar/content divider is not user-resizable — P1

- `AdwNavigationSplitView` is given min/max sidebar widths (`native/linux/app.zig:953-998`) but it is not a draggable desktop pane divider. The `application.Breakpoint` declaration (`native/linux/application.zig:7`) is not wired to production UI, another helper-only path.
- No user width preference is persisted.

**Target:** desktop mode uses a draggable `GtkPaned` or supported resizable split composition, with 180px minimum, sensible maximum (about 40% window), persisted width, keyboard accessibility, and double-click reset. Narrow-window mode may adapt/overlay the sidebar without changing terminal ownership or selected identity.

### 6. Search/launcher affordance and scope are unclear — P1

- The toolbar search icon visually implies global search, but is only a configured-command launcher (`native/linux/app.zig:938-942`). The user reasonably reports “search does nothing.”
- The popover is fixed at 520×360 (`native/linux/app.zig:1003-1005`), with no responsive sizing or anchor.
- No shortcut hints or command metadata are rendered beyond duplicate scope; recent commands are not visually grouped.

**Target:** match the Supacode reference’s centered quick-action overlay. Use a run/command icon or label if scope stays command-only. Placeholder: `Run a configured command…`. Show recent and all-command section labels, command description/argv summary if safe, workspace/repository scope chip, and keyboard hints. At narrow widths use window margins and max width rather than a hard minimum.

### 7. Attention presentation is unfinished — P1

- A raw global label displays enum severity (`native/linux/app.zig:535-540`).
- Tabs show only a bullet, not a count/state; workspace/repository rows show no aggregate badges in production (`native/linux/app.zig:418-479`, `487-490`).
- `attention_view.present` computes icon, label, count, and severity (`native/linux/attention_view.zig:2-4`), but production discards almost all of it. This is a false helper-only implementation.
- No attention list/popover is exposed, so there is no discoverable UI from which to select an attention item and exercise `focus-attention`.
- Fallback reason required by D-17 is not rendered after activation (`native/linux/app.zig:861-873`).

**Target:** hide zero state. Show a bell badge in the header only when unread exists; clicking opens a compact attention list. Render count + non-color icon at workspace, repository, and tab levels. Selecting an item marks it read and navigates explicitly; if fallback occurs, show a toast such as “Terminal ended; showing its workspace.” Working/idle status may be a quiet dot/tooltip, not unread chrome.

### 8. Sidebar row interaction is fragile — P1

- Workspace headings are not selectable rows; only repository list rows carry `git-stacks-pair` (`native/linux/app.zig:436-480`).
- Clicking the repository overflow menu first mutates selected pair (`native/linux/app.zig:604-610`), surprising the user and conflating context action with navigation.
- Rows are destroyed and recreated on every replay/refresh (`native/linux/app.zig:411-482`), losing keyboard focus/selection and undermining the “standard list factories” requirement.

**Target:** identity-backed `GtkSelectionModel` + list/tree factory with stable rows and explicit bind/unbind. Context-menu invocation must not navigate unless the chosen action requires it. Restore focus by identity after model updates.

### 9. Empty, ended, disconnected, and failure states lack product treatment — P2

- Connection states are all one plain label (`native/linux/app.zig:391-409`, `969-975`).
- No-pair/no-tabs/ended-tab content state is defined. `GtkStack` retains whichever child happened to be visible.
- Launch failures use internal Zig error names (`showLauncherError` at `native/linux/app.zig:732-740`).

**Target:** designed state pages with icon, title, concise explanation, and relevant retry/configure/new-terminal action. Never show raw enum/error identifiers as the only user message; retain technical detail in an expandable diagnostics area.

### 10. Visual density, spacing, and responsiveness — P2

- Sidebar is forced to 240px while split constraints allow 220–360px, with no actual resize affordance (`native/linux/app.zig:955-997`).
- Default GTK buttons for tabs and menus create tall, pill-like chrome unlike the dense reference.
- A 6px sidebar box gap plus heading rows and independent repository rows produces loose vertical rhythm; the screenshot shows large controls relative to information density.
- The header title is generic `git-stacks workspace`; no selected workspace/branch context appears in primary chrome.
- The planned 720/1080 breakpoints exist only as a struct constant (`native/linux/application.zig:7`) and are not installed on the window.

**Target tokens:** 32–36px header/tab height; 28–32px sidebar rows; 6/8/12/16px spacing scale; 12–13px secondary labels; restrained corner radii; one selected accent treatment; hover-only secondary actions. Wide mode shows sidebar + terminal; compact mode collapses rail via a toggle without destroying state. Tab bar horizontally scrolls/overflows instead of expanding indefinitely.

### 11. Accessibility claims exceed production evidence — P2

- `setAccessible` ignores its `role` argument and only writes label/description (`native/linux/app.zig:344-347`), so callers do not actually establish the roles they claim.
- Hand-built tab buttons and detached menu buttons do not expose a coherent tab/page relationship.
- The real-session acceptance rows for keyboard, IME, and accessibility remain pending (`docs/native-workspace-acceptance.md:29-41`).

**Target:** use native semantic widgets wherever possible; establish selected/expanded/controls relationships; provide visible focus; test keyboard-only row/tab/context-menu/launcher flow and screen-reader announcements in real Wayland and X11 sessions before checking acceptance.

## False-green and helper-only paths

The following make focused tests pass without proving the visible product:

| Claimed capability | Helper/test seam | Production gap |
|---|---|---|
| Adaptive breakpoint | `native/linux/application.zig:7` | No breakpoint installed; no draggable or adaptive production split. |
| Organization/grouping | `workspace_view.setOrganization` | Production list ignores organization mode and does not form pinned/grouped sections. |
| Attention semantics | `attention_view.present` returns icon/count/severity | Production renders raw global text and tab bullet only; no selectable attention UI. |
| Accessible roles | Call sites pass roles to `setAccessible` | `setAccessible` discards the role parameter. |
| Ended tab selection | Model can select ended surface IDs | Production `GtkStack` has no ended page, producing child-not-found warnings. |
| Configured launcher matching | `command_launcher.Launcher.collect` | Fragile fixed popover/ownership and silent readiness gating make the visible launcher nonfunctional. |
| Tab component | Model supports reorder/cycle/rename | Production uses rebuilt boxes/buttons, not the planned `AdwTabView`/`AdwTabBar`, and lacks complete lifecycle UX. |
| Real graphical acceptance | Automated preflight checkboxes | Acceptance matrix is still pending and this run directly contradicts usability/close claims. |

## Concrete target design: Supacode adapted to git-stacks

Ignore the reference’s GitHub status control as requested. Preserve git-stacks’ workspace-first, multi-repository model.

### Window frame

1. **Compact top bar (36–44px):** sidebar toggle; selected workspace/repository title with optional branch/status subtitle; centered application title only when no selection; attention bell badge when nonzero; `Run command` control; primary menu.
2. **Resizable body:** left workspace rail and right terminal area separated by a visible draggable divider.
3. **Terminal area:** compact tab strip directly above content; selected tab visually continuous with terminal; trailing `+`; overflow tab list only when needed.

### Left rail

- Product wordmark/label and add/import affordance at top.
- `Pinned` section only if populated.
- Remaining workspaces grouped according to persisted organization mode.
- Workspace row: name, branch/worktree cue, compact attention/status badge. Expand only when multiple repositories exist.
- Repository child: authoritative repository name and status; no “Workspace terminal” placeholder.
- Primary click navigates. Secondary click opens context menu. Hover-only overflow is optional, not permanently repeated.

### Tabs and terminal pages

- Live tab: command/shell title, optional activity/unread marker, hover close.
- Ended tab: muted title plus explicit ended glyph; selecting it shows an ended page, never a missing stack child.
- Ended page actions: Relaunch (primary), Remove (secondary), with cwd/exit metadata.
- Empty pair: “No terminals yet” plus New terminal and Run command actions.
- Every pair retains independent tab order and live host ownership across navigation.

### Command launcher

- Centered overlay, max width about 640px and responsive margins.
- Search field autofocus; recent commands then alphabetical valid commands; explicit scope chips for duplicates.
- Keyboard-first navigation with Enter/Escape and visible selected row.
- Failure stays open with human-readable summary and optional diagnostic detail; no phantom tab.

### Attention

- No zero-state sentence in the title bar.
- Bell/count appears only for unread items; row/tab badges aggregate hierarchically.
- Popover/list provides the explicit selection point required by ACT-05.
- Fallback navigation always explains where the user was routed and why.

## Recommended implementation slices

### Slice 1 — Stabilize lifecycle and shutdown (P0)

Repair transport cancellation/worker ownership, terminal page unparenting, registry close ordering, and deferred window teardown. Add a production-path close/reopen/relaunch stress harness, then manually verify window close and terminal close under Wayland and X11.

### Slice 2 — Replace tab/page composition (P0/P1)

Introduce identity-backed live and ended pages using `AdwTabView`/`AdwTabBar` or a complete equivalent. Implement explicit ended selection, Relaunch, Remove, neighbor fallback, `+` new terminal, hover close, right-click menus, overflow, reorder, and pair switching without host destruction.

### Slice 3 — Rebuild workspace rail and resizable layout (P1)

Replace the flat rebuilt `GtkListBox` with stable list/tree models; implement actual pinned/grouped sections, true single-repository collapse, authoritative names, selected styling, right-click actions, draggable persisted divider, and real adaptive breakpoints.

### Slice 4 — Make commands a dependable product flow (P0/P1)

Replace the manually parented popover with a centered owned overlay/dialog. Wire New terminal and configured commands through visible loading/error outcomes, recent grouping, empty states, keyboard operation, and stable pair/command identity. Remove silent no-ops.

### Slice 5 — Complete attention and polish (P1/P2)

Add hierarchical badges and selectable attention list, fallback toasts, zero-state hiding, semantic roles, compact design tokens, responsive sizing, focus preservation, and screen-reader behavior.

### Slice 6 — Honest graphical acceptance

Reset any automated acceptance claims contradicted by the production run. Execute the full checklist using real authoritative data on Wayland and X11. Record screenshots/video or logs for new shell, configured command, pair continuity, ended select/relaunch/remove, right-click menus, divider resizing, launcher/search, attention routing/no-focus-theft, terminal close, and clean window close. Phase 106 cannot pass while any row in `docs/native-workspace-acceptance.md` remains pending or contradicted.

## Acceptance gates for the redesign

- No GTK criticals, missing-stack-child warnings, panic, or nonzero exit during normal launch/use/close.
- A first-time user can create a terminal from visible UI without knowing a shortcut or double-click convention.
- Selecting every visible tab produces a real live page or an intentional ended page.
- Every ended record can be relaunched or removed.
- Right click works on workspace, repository, and tab; permanent overflow buttons are absent or hover-only.
- Sidebar divider is visibly draggable and its width survives restart.
- Search/run control always opens a usable overlay or visibly explains why commands are unavailable.
- Zero attention consumes no header text; nonzero attention is discoverable and selectable.
- Authoritative names replace `Workspace terminal`; internal enum/error strings do not lead user-facing copy.
- Workspace/repository navigation never destroys hidden live terminals.
- Keyboard, IME, accessible semantics, narrow-window adaptation, and no-focus-theft are observed in real sessions.

## Remediation status — 2026-07-11

The synthetic button/kebab terminal strip has been replaced by native `AdwTabView`/`AdwTabBar` pages with a visible New terminal affordance. The sidebar now uses a user-draggable `GtkPaned`; the descriptive heading, generic `Workspace terminal` label, permanent workspace/repository ellipsis buttons, and zero-attention header copy are removed. The launcher double-parenting defect was removed so its search action has one GTK owner.

This is an implementation checkpoint, not approval. Native right-click menus, centered dialog treatment for the launcher, responsive narrow-window behavior, and recorded end-to-end interaction evidence remain open for the next UAT pass.

Follow-up remediation `4f9c7cf8` replaces the launcher popover with a centered owned `AdwDialog`, preserving search focus, filtered command rows, activation, and structured error display. Workspace and repository rows now use secondary-click context popovers, and `AdwTabView` supplies the tab context menu for rename/close/relaunch/remove without permanent ellipsis controls. A managed-service GTK lifecycle smoke seam was added for real create/realize/register/page/dialog/window-close evidence; its service-start orchestration still needs hardening before its evidence can be accepted.

## Product UX audit — 2026-07-12

This review is source-backed and read-only with respect to production. The latest UAT remains authoritative: the shell is structurally closer to a desktop terminal, but it still does not communicate a Supacode-like workspace model clearly enough and several visible affordances do not prove or expose their state changes.

### P0 — interaction language and truthful state

1. **The left rail is a flat rebuilt list, not a workspace/repository navigator.** `refreshProjection` destroys and recreates every row on each refresh (`app.zig:471-526`). Workspace headings are plain labels, repositories are plain text prefixed with a Unicode dot, and hierarchy is expressed only through iteration order (`app.zig:478-523`). There are no stable row models, icons, disclosure, branch/worktree metadata, status badges, hover/selected treatment, or pinned/unpinned sections. Target: a compact stable rail with explicit workspace groups, repository/worktree rows, selected-row styling, branch/status metadata, and pinned ordering comparable to the reference—content hierarchy first, decoration second.

2. **Pinning has no legible product outcome.** The context action mutates `state.pins` and saves it (`workspace_view.zig:23-25`, `app.zig:596-605`, `app.zig:1052-1074`), but rendering merely prepends `★` and changes a generic CSS class (`app.zig:474-483`). All workspaces remain in the same flat order; there is no pinned section, no immediate explanatory feedback, and drag/drop exists only after a row is already pinned (`app.zig:494-502`). Target: a visible Pinned section followed by Workspaces, immediate row movement, checked/contextual pin state, persisted order, and a toast or equivalent confirmation on failure.

3. **There is no user refresh/reconnect affordance.** Connection states include stale, refresh-required, and failure copy (`app.zig:451-469`), but the registered action set contains no refresh action (`application.zig:2-5`) and the header/menu exposes only New shell, Configured commands, and VS Code (`app.zig:1108-1128`). Target: contextual Refresh/Reconnect in the rail/header and in connection empty states, backed by the authoritative snapshot refresh path with loading, success, and structured failure feedback.

4. **Ended-page controls can appear inert without explaining why.** Ended pages always render Relaunch and Remove buttons (`app.zig:541-556`), while action enablement is global and Relaunch additionally requires connection `.ready` (`application.zig:4-5`, `app.zig:436-449`). Thus a stale/disconnected restored page can present a disabled-looking or nonfunctional Relaunch without inline cause. Remove should remain available offline, while Relaunch should state “Reconnect to relaunch” or expose recovery. The ended page should include terminal title, working directory, exit status/time, and a compact primary Relaunch / secondary Remove hierarchy rather than a generic sentence.

5. **Persistence flattens every saved surface into ended history.** `recordsFromState` serializes all live and ended surfaces as `.ended` (`persistence.zig:174-183`), and restore appends them back as ended records (`persistence.zig:186-203`). This is safe for process ownership, but the UI must call them previous sessions/history—not imply that live terminals can be resumed. Target: bounded, deduplicated “Previous terminals” history separated from current tabs, with clear relaunch lineage and bulk clear; current tab presentation should not be polluted by every historical record.

### P1 — actual tab and command affordances

6. **The content uses real `AdwTabView`/`AdwTabBar`, but the product contract is incomplete.** The native tab bar, page selection, close-page signal, context menu, and plus button now exist (`app.zig:1149-1181`). However reorder persistence is still wired through legacy custom drag callbacks rather than the tab view’s page-reorder signal, and the visible tab context menu lists mutually exclusive Close, Relaunch, and Remove together then relies on global action disabling (`app.zig:1153-1159`, `app.zig:442-448`). Target: native reorder -> model order -> persistence, hover close for live pages, lifecycle-specific context menus, overflow behavior, and selected-tab actions that never depend on stale global `state.surface`.

7. **Repository labels can collapse to duplicate workspace names.** When repository metadata lacks a name, every repository falls back to the workspace name (`app.zig:504-508`). This makes multiple rows indistinguishable and does not match the reference’s repo/worktree language. Target: authoritative repository/worktree display name, branch beneath or alongside it, path only as tooltip/secondary copy, and short identity only as a last-resort diagnostic fallback.

8. **The command launcher is a real owned dialog, but its states are underspecified.** The `AdwDialog` correctly owns search focus and a result list (`app.zig:1189-1220`); search filtering and activation use the production command path (`app.zig:888-920`). Yet `openLauncher` silently returns unless connection is ready (`app.zig:888-896`), the list has no explicit loading/empty/recent sections, keyboard selection/default activation is not configured, and failures are raw `@errorName` strings prefixed “Launch failed” (`app.zig:875-886`). Target: always open the launcher; show Loading, No configured commands, Reconnect required, and structured launch failure states; preselect the first result, support arrows/Enter/Escape, group Recent and workspace/repository commands, and keep technical error identifiers behind expandable details.

9. **Secondary-click menus exist but are not discoverable or complete.** Workspace context offers only Pin/Unpin (`app.zig:596-605`); repository context offers New terminal, Run command, and VS Code (`app.zig:607-614`). There is no refresh, reveal/copy path, rename, close-all, or keyboard/menu-key equivalent, and no hover cue. Target: concise lifecycle-aware menus available through right click and keyboard, with the most common action also present visibly where appropriate; avoid restoring permanent ellipsis buttons.

### P2 — Supacode-like composition target

10. **The frame still reads as a toolkit scaffold.** The composition is one generic `AdwHeaderBar`, a fixed-minimum `GtkPaned`, a bare list, and tabs (`app.zig:1108-1188`). The divider is draggable, but its 220 px position is not persisted and no breakpoint/adaptive behavior is applied. Target: narrow dark rail with persisted width, compact workspace title/branch context, low-height native tab strip integrated with the content edge, content-first terminal canvas, restrained plus/search controls, and a narrow-window mode that collapses the rail without hiding terminal actions.

11. **Attention copy still exposes internal severity language when nonzero.** Zero state is hidden, but nonzero text remains `Attention: N unread (severity-enum)` (`app.zig:562-575`). Target: a subtle bell/badge with accessible count; selecting it opens actionable items. Never render internal enum names in primary UI.

### Acceptance required before visual sign-off

- Pin and unpin visibly move a workspace between persisted sections without restarting.
- Refresh/reconnect is available in every recoverable connection state and reports a visible outcome.
- Every visible tab selects a real page; native reorder survives restart; live and ended context menus contain only relevant actions.
- Ended pages explain title/cwd/exit and keep Remove usable offline; Relaunch gives a recovery explanation when unavailable.
- Launcher always opens and demonstrates loading, empty, results, keyboard activation, command failure, and reconnect-required states.
- Rail hierarchy remains understandable with one workspace/one repo and with multiple workspaces/repos; no duplicate fallback labels.
- Divider width persists and narrow layouts provide an intentional collapsed rail.
- Nonzero attention uses product copy and routes to an actionable item without focus theft.

Until these observations pass against the actual app, the sidebar and top-level product UX should be treated as functionally incomplete rather than cosmetically unfinished.
