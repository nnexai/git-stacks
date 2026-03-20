# Phase 8: Dashboard Tab Layout — Context

**Gathered:** 2026-03-19
**Updated:** 2026-03-19 (post-UAT gap analysis)
**Status:** Ready for gap-fix planning

<domain>
## Phase Boundary

Transform the single-view Workspaces-only dashboard into a tabbed management interface with three tabs (Workspaces, Templates, Repos). Two-box layout: list box on top (tab labels in border title), detail box on bottom (selected item name in border title). The detail box is the universal action zone — all overlays (action menu, confirm, progress, inline input) replace its content while the list stays visible. Help overlay is the sole exception (full-screen). Phase 9 wires live messages into the detail pane — this phase pre-wires the placeholder.

</domain>

<decisions>
## Implementation Decisions

### Layout structure (Area A) — REVISED post-UAT

**Two bordered boxes** — top box for list, bottom box for detail. NOT a single outer box with an internal separator (that approach caused overflow when conditional rows appeared).

```
┌─[1 Workspaces]  2 Templates  3 Repos──────────┐
│  my-feature         ✓ clean                    │
│▸ billing-refactor   ~ 2 ahead                  │
│  hotfix-auth        ✗ diverged                 │
│                                                │
└────────────────────────────────────────────────┘
┌── billing-refactor ────────────────────────────┐
│  Branch: billing-refactor                      │
│  Created: 2026-03-15                           │
│                                                │
│  ✓ api-gateway [worktree]                      │
│  ~ billing-service [worktree]  2 ahead         │
│  ✓ shared-lib [trunk]                          │
│                                                │
│  Messages (0)                                  │
└────────────────────────────────────────────────┘
 1/2/3 Tabs  ↑↓ Navigate  Enter Actions  ? Help  q Quit
```

- **Top box**: list pane, `border title` = tab labels (`[1 Workspaces]  2 Templates  3 Repos`)
- **Bottom box**: detail pane, `border title` = selected item name (e.g. `── billing-refactor ──`)
- **Help bar**: 1 line outside/below both boxes — context-sensitive to active tab
- **Batch bar**: inside the top box as a footer row (only when items are selected):
  ```
  │  Selected: 3 — c Clean  r Remove  Esc Clear    │
  ```
- **Filter line**: replaces the help bar (not inside either box):
  ```
   filter: bill_
  ```
- **Loading indicator**: also replaces the help bar: `(loading statuses...)`

### Height split — content-aware with minimums

- List box: minimum 8 visible rows (content rows, excluding borders)
- Detail box: minimum 8 visible rows
- Remaining space beyond both minimums: split 60% to list, 40% to detail
- On small terminals where both minimums can't be met: both shrink proportionally

### Detail box as the universal action zone

The detail box content is replaced by whichever view is active. The list box ALWAYS stays visible. This is the core layout invariant.

| View state | Detail box shows | Detail box title |
|------------|-----------------|-----------------|
| `list` | Tab-specific detail content | Selected item name |
| `action-menu` | Action menu (two-column grid) | Selected item name |
| `confirm` | Confirm dialog (message + y/n) | Selected item name |
| `progress` | Progress lines (scrolling) | Progress message (e.g. "Opening billing-refactor...") |
| `inline-input` | Input field with label | Selected item name |

### Action menu layout — two-column grid

Replaces detail box content. Actions listed in a two-column grid:

**Workspaces:**
```
┌── billing-refactor ──────────────────────────┐
│  [o] Open         [c] Clean                  │
│  [e] Edit         [r] Remove                 │
│  [n] Rename       [m] Merge                  │
│  [u] Run                                     │
│                                              │
│                              [Esc] Back      │
└──────────────────────────────────────────────┘
```

**Templates:**
```
┌── my-template ───────────────────────────────┐
│  [e] Edit ($EDITOR)   [r] Remove             │
│  [c] Clone                                   │
│                                              │
│                              [Esc] Back      │
└──────────────────────────────────────────────┘
```

**Repos:** read-only — no action menu, Enter is no-op.

### Confirm dialog layout

Replaces detail box content:
```
┌── billing-refactor ──────────────────────────┐
│                                              │
│  Remove workspace 'billing-refactor'?        │
│  This will delete all worktrees.             │
│                                              │
│              [y] Yes   [n] No                │
└──────────────────────────────────────────────┘
```

### Inline input layout (rename / clone)

Replaces detail box content:
```
┌── billing-refactor ──────────────────────────┐
│                                              │
│  New name: billing-refactor-v2_              │
│                                              │
│                    [Enter] Confirm  [Esc] Cancel │
└──────────────────────────────────────────────┘
```

### Progress view layout

Replaces detail box content. List stays visible for context:
```
┌─[1 Workspaces]  2 Templates  3 Repos────────┐
│  my-feature         ✓ clean                  │
│▸ billing-refactor   ~ 2 ahead               │
└──────────────────────────────────────────────┘
┌── Opening billing-refactor... ───────────────┐
│  ✓ api-gateway worktree created              │
│  ✓ billing-service worktree created          │
│  ⠋ running post_open hooks...                │
└──────────────────────────────────────────────┘
 Press any key to return
```

### Help overlay — full-screen exception

The ONLY view that replaces both boxes. Covers the entire terminal area:
```
┌── Keybindings ───────────────────────────────┐
│                                              │
│  Global                                      │
│    1/2/3 Tabs  [/] Prev/next  R Refresh      │
│    q Quit                                    │
│                                              │
│  Navigation                                  │
│    ↑↓/jk Move  / Filter  Esc Back            │
│                                              │
│  Workspaces                                  │
│    Enter Actions  Space Select               │
│    o Open  e Edit  n Rename  u Run           │
│    c Clean  r Remove  m Merge                │
│                                              │
│  Templates                                   │
│    e Edit($EDITOR)  c Clone  r Remove        │
│                                              │
│  Repos (read-only)                           │
│                                              │
│                         Esc or ? to close    │
└──────────────────────────────────────────────┘
```

- Shows ALL keybindings always (not tab-filtered)
- Compact inline format (not two-column key/description pairs)
- Blocks all keyboard input except Esc and `?` while open

### Filter indicator fix

When filtering mode is active (`filtering()` is true), the filter line MUST show immediately — even when the filter string is empty. Display `filter: _` with a cursor indicator when empty. The current bug: `<Show when={props.filter}>` is falsy on empty string.

Fix approach: pass a `filtering` boolean prop to list components. Show condition becomes `<Show when={props.filtering}>`. Display `filter: _` when filter is empty, `filter: {value}` when populated. Since the filter line now renders in the help bar area (not inside the list box), this may be handled in App.tsx instead.

### Detail pane content per tab

**Workspaces tab detail:**
- Branch, created date
- Per-repo status: `✓ / ~ / ✗` + repo name + `[branch]` or `[trunk]`
- Empty line separator
- `Messages` section header + message rows (or `(no messages)` placeholder)
- The messages section is pre-wired in Phase 8 as a static placeholder; Phase 9 populates it reactively
- The current `DetailStatus` full-screen pop-over is **retired** — all status info moves inline

**Templates tab detail:**
- Repo count + hook count summary line: `Repos (3)   Hooks: 2 post_create`
- Per-repo rows: name + mode (`worktree` / `trunk`)

**Repos tab detail:**
- Path (full path), Type, default Branch
- Disk check: `✓ exists` or `✗ missing`
- `Used by:` section listing Templates and Workspaces that reference this repo

### Esc / q navigation model

Strict back-chain — Esc always goes one level back, `q` exits only from the top-level list:

| Context | Esc behavior |
|---------|-------------|
| `?` help overlay | Close overlay, return to previous view |
| Action menu | Cancel menu, return to list |
| Inline input (rename/clone) | Cancel input, return to list |
| Filter active | Clear filter, return to list |
| Top-level list (with selection) | Clear selection |
| Top-level list (no selection) | No-op (do not exit) |
| `q` from top-level list | Exit TUI |

`q` does NOT exit from inside an action menu, overlay, or filter — only Esc can navigate out of those.

### Keyboard shortcuts per tab

| Key | Workspaces | Templates | Repos |
|-----|------------|-----------|-------|
| `1`/`2`/`3` | Switch tab | Switch tab | Switch tab |
| `[` / `]` | Prev/next tab | Prev/next tab | Prev/next tab |
| `↑↓`/`jk` | Navigate list | Navigate list | Navigate list |
| `Enter` | Action menu | Action menu | — |
| `/` | Filter | Filter | Filter |
| `e` | Edit YAML | Edit YAML | — |
| `R`/`Ctrl+r` | Reload | Reload | Reload |
| `?` | Help overlay | Help overlay | Help overlay |
| `Esc` | Back-chain | Back-chain | Back-chain |
| `q` | Exit (top only) | Exit (top only) | Exit (top only) |

### Tab switching bug fix

UAT found: pressing 1/2/3 or [/] changes the `tab()` signal but `<Show when={tab() === "templates"}>` does not re-render. Root cause investigation required — likely a SolidJS reactivity issue with `<Show>` blocks not re-evaluating, or `setTab()` call being swallowed. Planner must investigate and plan a fix.

### Claude's Discretion

- Exact SolidJS signal layout for per-tab state (cursor, filter, filtering) — use three independent signal groups or a single tabbed state object
- Whether `useKeyboard` remains in `App.tsx` or splits into per-tab sub-components
- `run` action plumbing — `runWorkspace` from `workspace-ops.ts` if it exists; otherwise call `git-stacks run` via `Bun.spawn` with progress capture
- Exact OpenTUI props for vertical centering of confirm dialog and inline input within the detail box

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Primary files to modify
- `src/tui/dashboard/App.tsx` — main component; two-box layout, keyboard handler, tab switching
- `src/tui/dashboard/types.ts` — `UIView` union (add `inline-input`; remove `detail-status`), `Action` (add `rename`; remove `status`)
- `src/tui/dashboard/WorkspaceList.tsx` — list content (no border — rendered inside top box)
- `src/tui/dashboard/TemplateList.tsx` — list content (no border)
- `src/tui/dashboard/RepoList.tsx` — list content (no border)
- `src/tui/dashboard/ActionMenu.tsx` — two-column grid layout, no border (rendered inside detail box)
- `src/tui/dashboard/TemplateActionMenu.tsx` — same pattern as ActionMenu
- `src/tui/dashboard/ConfirmDialog.tsx` — centered message + y/n, no border
- `src/tui/dashboard/InlineInput.tsx` — input field, no border
- `src/tui/dashboard/HelpOverlay.tsx` — full-screen bordered overlay with compact keybinding list
- `src/tui/dashboard/BatchBar.tsx` — footer row inside top box

### Files to retire or repurpose
- `src/tui/dashboard/DetailStatus.tsx` — retire; its content moves into WorkspaceDetail inline

### Lib integration points
- `src/lib/workspace-ops.ts` — `renameWorkspace(oldName, newName, opts?)`, `editWorkspaceYaml(name)`
- `src/lib/config.ts` — `readTemplate(name)`, `writeTemplate(template)`, `listTemplates()`, `readRegistry()`, `listRegistryEntries()`, `listWorkspaces()`
- `src/lib/messages.ts` — `MessageRecord` type; read messages for the placeholder
- `src/lib/paths.ts` — `MESSAGES_DIR` for message file path

### Requirements
- `.planning/REQUIREMENTS.md` DASH-01 through DASH-11

### UAT gaps being fixed
- `.planning/phases/08-dashboard-tab-layout/08-UAT.md` — 5 gaps (2 major, 3 minor)

### Prior phase patterns to follow
- `src/tui/dashboard/hooks/useWorkspaces.ts` — data hook pattern; replicate for `useTemplates` and `useRepos`

</canonical_refs>

<code_context>
## Existing Code Insights

### Current UIView union (types.ts)
```ts
type UIView =
  | { view: "list" }
  | { view: "action-menu"; index: number }
  | { view: "confirm"; index: number; action: Action; batch?: boolean }
  | { view: "progress"; message: string }
  | { view: "detail-status"; index: number }   // ← RETIRE this
```
Add: `| { view: "inline-input"; index: number; purpose: "rename" | "clone-template"; prefill: string }`
Remove: `detail-status`

### Current Action union
```ts
type Action = "open" | "status" | "edit" | "clean" | "remove" | "merge"
```
Add: `"rename"` (workspaces), `"clone"` (templates), `"remove"` (templates)
Remove: `"status"` (replaced by reactive detail pane)

### Existing keyboard pattern (App.tsx)
`useKeyboard` is centralized in `App.tsx`. Filter bar pattern is the model for inline-input handling — intercept printable chars, backspace, Enter, Esc.

### Existing suspend/resume pattern (App.tsx)
`launchEditor()` uses `renderer.suspend()` / `renderer.resume()`. Template edit follows the same pattern.

### Tab switching — current code (App.tsx:375-387)
```ts
if (key.name === "1") { setTab("workspaces"); setView({ view: "list" }); return }
if (key.name === "2") { setTab("templates"); setView({ view: "list" }); return }
if (key.name === "3") { setTab("repos"); setView({ view: "list" }); return }
```
This code DOES call `setTab()` and `setView()` — the bug is downstream in rendering, not in the signal update.

### Filter display — current bug (WorkspaceList.tsx:29, TemplateList.tsx:27, RepoList.tsx:32)
```tsx
<Show when={props.filter}>  // ← falsy on empty string ""
  <text fg="cyan">  filter: {props.filter}</text>
</Show>
```
When `filtering=true` but `filter=""`, nothing shows. With the new layout, filter line moves to the help bar area in App.tsx.

### Current layout — single outer box (App.tsx:511)
```tsx
<box border title={tabTitle()} flexDirection="column" height="100%">
```
This wraps everything (list, separator, detail, batch bar, help bar) in one box. Conditional rows (BatchBar, loading) steal height from the flex column causing overflow. MUST be replaced with two separate bordered boxes.

### Reusable data functions
- `listWorkspaces()` — already used in `useWorkspaces` hook
- `listTemplates()` — ready; `useTemplates` hook exists (new file)
- `listRegistryEntries()` / `readRegistry()` — ready; `useRepos` hook exists (new file)

</code_context>

<deferred>
## Deferred Ideas

- **run action plumbing** — `run` is listed in DASH-05; if `runWorkspace()` doesn't exist in `workspace-ops.ts`, defer to a follow-up or implement as a shell passthrough. Do not block Phase 8 on it.
- **Batch operations in Templates/Repos tabs** — batch select (Space) stays Workspaces-only for Phase 8; Templates and Repos are single-select
- **Mouse support** — explicitly out of scope (DASH-F02 in REQUIREMENTS.md)
- **In-TUI template creation wizard** — deferred (DASH-F01)
- **Repos tab expandable detail** — Enter could toggle expanded "Used by" list if truncated; deferred to a future phase

</deferred>

---

*Phase: 08-dashboard-tab-layout*
*Context gathered: 2026-03-19*
*Updated: 2026-03-19 (post-UAT gap analysis — layout, action menu, help overlay, filter decisions revised)*
