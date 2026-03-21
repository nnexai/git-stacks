# Phase 8: Dashboard Tab Layout — Research

**Researched:** 2026-03-19
**Updated:** 2026-03-19 (post-UAT revision)
**Domain:** SolidJS + OpenTUI TUI component layout and reactivity
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **Layout structure:** Two bordered boxes — top box for list, bottom box for detail. NOT a single outer box with an internal separator.
- **Help bar:** 1 line outside/below both boxes — context-sensitive to active tab.
- **Batch bar:** Inside the top box as a footer row (only when items are selected).
- **Filter line:** Replaces the help bar (not inside either box).
- **Loading indicator:** Also replaces the help bar: `(loading statuses...)`.
- **Height split:** List box minimum 8 visible content rows; detail box minimum 8 visible content rows; remaining beyond both minimums split 60% list / 40% detail.
- **Detail box as universal action zone:** The detail box content is replaced by the active view (list, action-menu, confirm, progress, inline-input). The list box ALWAYS stays visible. Help overlay is the sole full-screen exception.
- **Action menu layout:** Two-column grid rendered inside the detail box (no own border — detail box border is the container).
- **Esc / q model:** Strict back-chain. `q` exits only from top-level list. Esc never exits TUI.
- **Repos tab:** Read-only — no action menu, Enter is no-op.
- **Batch operations:** Workspaces-only for Phase 8; Templates and Repos are single-select.
- **Tab switching keys:** `1`/`2`/`3` and `[`/`]`.
- **Filter indicator fix:** Show `filter: _` immediately when filtering=true even if filter string is empty; conditioned on `filtering` boolean prop, not on `filter` string.

### Claude's Discretion

- Exact SolidJS signal layout for per-tab state (cursor, filter, filtering) — use three independent signal groups or a single tabbed state object.
- Whether `useKeyboard` remains in `App.tsx` or splits into per-tab sub-components.
- `run` action plumbing — `runWorkspace` from `workspace-ops.ts` if it exists; otherwise call `git-stacks run` via `Bun.spawn` with progress capture.
- Exact OpenTUI props for vertical centering of confirm dialog and inline input within the detail box.

### Deferred Ideas (OUT OF SCOPE)

- **run action plumbing** — if `runWorkspace()` doesn't exist, defer; do not block Phase 8.
- **Batch operations in Templates/Repos tabs** — batch select stays Workspaces-only for Phase 8.
- **Mouse support** — explicitly out of scope (DASH-F02).
- **In-TUI template creation wizard** — deferred (DASH-F01).
- **Repos tab expandable detail** — deferred to a future phase.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| DASH-01 | User can switch between Workspaces, Templates, and Repos tabs using `[`/`]` or `1`/`2`/`3` | Tab signal bug investigation; SolidJS Show re-evaluation |
| DASH-02 | Each tab maintains independent cursor position and filter state when switching | Per-tab signal groups already implemented; must be preserved |
| DASH-03 | Dashboard displays list and detail pane simultaneously in a split layout (~60/~40) | Two-box layout refactor from single outer box |
| DASH-04 | Detail pane auto-updates reactively as cursor moves | Already working per UAT; preserve in refactor |
| DASH-05 | User can perform all workspace actions from action menu | Action flows already wired; action menu centering fix needed |
| DASH-06 | User can edit workspace YAML in `$EDITOR`; TUI suspends and resumes | Already working; preserve suspend/resume pattern |
| DASH-07 | User can view, edit, clone, and remove templates from the Templates tab | Blocked by tab-switching bug; unblock via tab fix |
| DASH-08 | User can browse repo registry with disk-health indicator | Blocked by tab-switching bug; unblock via tab fix |
| DASH-09 | Persistent one-line help bar at the bottom shows context-sensitive key bindings | Help bar must move outside both boxes |
| DASH-10 | Pressing `?` opens scrollable keybinding reference overlay; Esc or `?` closes | HelpOverlay sizing fix needed |
| DASH-11 | Pressing Esc consistently navigates back without unintentionally exiting TUI | Already working per UAT; preserve in refactor |
</phase_requirements>

## Summary

Phase 8 is a post-UAT gap-fix effort. Four plans (08-01 through 08-04) were executed and committed. The UAT exposed 5 specific issues: two major (layout overflow, tab-switching freeze) and three minor (action menu floating, help overlay smushed, filter indicator missing on empty string).

The core problem is architectural: the single outer `<box>` layout cannot handle conditional rows (BatchBar, loading indicator) without stealing height from the flex column and causing overflow. The fix is to switch to two sibling bordered boxes — one for the list, one for the detail — with the help bar rendered as a third sibling below both, outside all boxes.

The tab-switching freeze is a SolidJS + OpenTUI rendering issue. The `setTab()` call succeeds (the signal updates), but the `<Show when={tab() === "templates"}>` blocks do not re-render. Code inspection of `App.tsx:531-555` confirms the root cause: three `<Show>` blocks are nested inside a `<box height={listHeight()}>`. When the tab changes, the reconciler must remove one component and mount another at the same tree position. OpenTUI's reconciler does not reliably handle this swap — it renders stale content. Replacing with `<Switch><Match>` is the idiomatic SolidJS fix.

**Primary recommendation:** Fix the two-box layout and the tab-switching SolidJS reactivity bug. All other gaps are cosmetic and straightforward once the layout is correct.

## Standard Stack

### Core (already installed — no new dependencies needed)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@opentui/solid` | installed | TUI renderer with SolidJS reactivity | Project's chosen TUI stack |
| `@opentui/core` | installed | Box, text, scrollbox primitives, layout engine (Yoga) | Underpins @opentui/solid |
| `solid-js` | installed | Reactive signals, createMemo, Show, For, Switch, Match, createSignal | Reactivity model for the TUI |

### OpenTUI Box Props (verified from `@opentui/core/Renderable.d.ts` and source map)
| Prop | Type | Effect |
|------|------|--------|
| `border` | `boolean \| BorderSides[]` | Draw a border around the box |
| `title` | `string` | Text shown in the top-left of the border |
| `titleAlignment` | `"left" \| "center" \| "right"` | Align the title text |
| `flexDirection` | `"column" \| "row" \| ...` | Child layout direction |
| `height` | `number \| "auto" \| "${n}%"` | Fixed or percentage height |
| `width` | `number \| "auto" \| "${n}%"` | Fixed or percentage width |
| `flexGrow` | `number` | Yoga flexGrow — fills remaining space |
| `minHeight` | `number` | Minimum height constraint |
| `paddingX`, `paddingY`, `padding` | `number` | Inner padding |
| `gap`, `rowGap`, `columnGap` | `number` | Gap between children |
| `justifyContent` | `JustifyString` | Align children on main axis |
| `alignItems` | `AlignString` | Align children on cross axis |

**Key insight:** `flexGrow={1}` on a box makes it fill available space in a flex column. The two-box layout must use `flexGrow` rather than computed pixel heights to avoid overflow when the outer container does not have an exact known height.

### No new packages needed
All required functionality is already present. The fix is structural (JSX layout), not package-dependent.

## UAT Issue Analysis

This section maps each UAT finding to its root cause (from source inspection) and the exact fix required.

### UAT Issue 1: Layout Overflow (MAJOR — Test 1)

**UAT report:** "Selecting something on the workspaces introduces a new line at the bottom which pushes up the details so they overflow into the title of the separator."

**Root cause (confirmed by reading `App.tsx`):**

`App.tsx:511` uses a single outer `<box border>` wrapping the entire layout in a `flexDirection="column"` column. The BatchBar at `App.tsx:629-632` is a direct sibling of the list box, separator text, and detail box inside this flex column:

```tsx
// App.tsx lines 629-632 — current broken pattern
<Show when={view().view === "list" && selected().size > 0}>
  <BatchBar count={selected().size} />
</Show>
```

When BatchBar appears, it consumes one row from the flex column. The column's total height is fixed (`height="100%"`), so Yoga subtracts that row from available space. The list box (`height={listHeight()}`) and detail box (`height={detailHeight()}`) use computed pixel heights that sum to `innerHeight()`. When BatchBar steals a row, the boxes no longer fit, causing content to overflow into the separator line.

The help bar is also a direct sibling at `App.tsx:634-645`, and the loading indicator at `App.tsx:512-517` has the same problem.

**Fix:** Replace the single outer box with two sibling bordered boxes plus a fixed 1-row help bar sibling, all inside an outer full-height column flex wrapper. BatchBar lives INSIDE the top box as a footer row. Loading indicator and filter line live in the help bar sibling (replacing the normal help text). The outer wrapper does NOT have a border — only the two inner boxes do.

**Exact change in `App.tsx`:**

Remove the single `<box border title={tabTitle()}>` wrapper. Replace with:
```
<box flexDirection="column" height="100%">       -- outer, no border
  <Show when={helpOpen()}>...</Show>              -- help overlay branch
  <Show when={!helpOpen()}>
    <box border title={tabTitle()} flexDirection="column" flexGrow={3} minHeight={10}>
      {/* list content + BatchBar inside here */}
    </box>
    <box border title={selectedName()} flexDirection="column" flexGrow={2} minHeight={10}>
      {/* detail/action/confirm/progress/inline-input */}
    </box>
    <box height={1}>
      {/* help bar / filter line / loading indicator */}
    </box>
  </Show>
</box>
```

The `separatorLine` memo and its `<text>` render (`App.tsx:558-559`) are removed entirely. The detail box's `title` prop replaces the separator line.

The `innerHeight`, `listHeight`, and `detailHeight` computed signals in App.tsx can be simplified or removed since flexGrow handles proportional sizing. The list components still receive a `height` prop for their scrolling viewport computation — pass a simplified estimate (`Math.floor(dims().height * 0.6) - 2`) or derive from the existing dims signal.

---

### UAT Issue 2: Tab-Switching Freeze (MAJOR — Test 2)

**UAT report:** "Switching tabs still freezes the UI — it continues to show the workspaces list. It is possible to get back to a working state."

**Root cause (confirmed by reading `App.tsx:530-556`):**

The keyboard handler at `App.tsx:375-387` correctly calls `setTab()` and `setView()`. The bug is in the render tree.

Three `<Show>` blocks render list components inside a `<box height={listHeight()}>`:

```tsx
// App.tsx lines 530-556 — current broken pattern
<box height={listHeight()}>
  <Show when={tab() === "workspaces"}>
    <WorkspaceList ... />
  </Show>
  <Show when={tab() === "templates"}>
    <TemplateList ... />
  </Show>
  <Show when={tab() === "repos"}>
    <RepoList ... />
  </Show>
</box>
```

When `tab()` changes from `"workspaces"` to `"templates"`, the first `Show` must unmount `WorkspaceList` (rendering null) and the second `Show` must mount `TemplateList`. In SolidJS's standard DOM renderer, this works correctly because Show is implemented as a conditional expression tracked by a reactive computation.

In OpenTUI's custom renderer, the reconciler does not correctly handle simultaneous unmount/mount of siblings at the same virtual tree position. The first Show goes to null but the rendered terminal nodes from WorkspaceList remain stale. "Getting back to a working state" (as the user described) likely means pressing a key that forces a cursor update, which triggers a reactive re-render of the visible list rows — making it look temporarily correct.

**Fix:** Replace the three sibling `<Show>` blocks with `<Switch><Match>`:

```tsx
import { Switch, Match } from "solid-js"

<Switch>
  <Match when={tab() === "workspaces"}>
    <WorkspaceList ... />
  </Match>
  <Match when={tab() === "templates"}>
    <TemplateList ... />
  </Match>
  <Match when={tab() === "repos"}>
    <RepoList ... />
  </Match>
</Switch>
```

`Switch/Match` is a single reactive computation that evaluates all conditions and mounts exactly one branch. It signals to the reconciler that the entire subtree should be replaced when the condition changes, not just patched. This eliminates the stale-render problem.

The same `Switch/Match` pattern must also be applied to the detail box's tab-dependent content:

```tsx
// Detail box list view — also uses three Show blocks (App.tsx:564-578)
<Show when={view().view === "list"}>
  <Switch>
    <Match when={tab() === "workspaces"}><WorkspaceDetail ... /></Match>
    <Match when={tab() === "templates"}><TemplateDetail ... /></Match>
    <Match when={tab() === "repos"}><RepoDetail ... /></Match>
  </Switch>
</Show>
```

And the action-menu section:

```tsx
// Currently App.tsx:581-596 uses two separate Show blocks with compound conditions
// Replace with Switch/Match nested inside the view Show:
<Show when={view().view === "action-menu"}>
  <Switch>
    <Match when={tab() === "workspaces"}>
      <box flexDirection="column" paddingTop={1}><ActionMenu ... /></box>
    </Match>
    <Match when={tab() === "templates"}>
      <box flexDirection="column" paddingTop={1}><TemplateActionMenu ... /></box>
    </Match>
  </Switch>
</Show>
```

**Note on `<Switch>` import:** `Switch` and `Match` are in `solid-js`. Add to the import at `App.tsx:2`:
```tsx
import { createSignal, createMemo, Show, Switch, Match } from "solid-js"
```

---

### UAT Issue 3: Action Menu Floating (MINOR — Test 8)

**UAT report:** "The actions menu is floating at the top of the details screen. This feels awkward."

**Root cause (confirmed by reading `ActionMenu.tsx:37` and `TemplateActionMenu.tsx:19`):**

Both action menu components render with `border title width="50%"`:

```tsx
// ActionMenu.tsx line 37 — current code
<box border title={`Actions: ${props.workspaceName}`} flexDirection="column" width="50%">
```

```tsx
// TemplateActionMenu.tsx line 19 — current code
<box border title={`Actions: ${props.templateName}`} flexDirection="column" width="50%">
```

These components are rendered inside the detail box — which already has its own border and title (the selected item name). The inner `border` creates a small box that floats in the upper-left of the detail area. The `width="50%"` makes it visually appear as a dialog, but OpenTUI places it at the top of the container since there is no `paddingTop` or centering.

Per the CONTEXT.md decision: "Action menu layout: Two-column grid rendered inside the detail box (no own border — detail box border is the container)."

**Fix for `ActionMenu.tsx`:**

Remove `border`, `title`, and `width="50%"`. Change to a plain flex column with padding:

```tsx
// ActionMenu.tsx — fixed
export function ActionMenu(props: Props) {
  // ... keyboard handler unchanged ...

  return (
    <box flexDirection="column" paddingTop={1} paddingLeft={2}>
      <text fg="white">  [o] Open         [n] Rename</text>
      <text fg="white">  [e] Edit          [c] Clean</text>
      <text fg="white">  [r] Remove        [m] Merge</text>
      <text fg="white">  [u] Run</text>
      <text fg="gray">{"\n"}  [Esc] Back</text>
    </box>
  )
}
```

**Fix for `TemplateActionMenu.tsx`:**

Remove `border`, `title`, and `width="50%"`. Add padding:

```tsx
// TemplateActionMenu.tsx — fixed
export function TemplateActionMenu(props: Props) {
  // ... keyboard handler unchanged ...

  return (
    <box flexDirection="column" paddingTop={1} paddingLeft={2}>
      <text fg="white">  [e] Edit ($EDITOR)</text>
      <text fg="white">  [c] Clone</text>
      <text fg="white">  [r] Remove</text>
      <text fg="gray">{"\n"}  [Esc] Back</text>
    </box>
  )
}
```

**Fix for `ConfirmDialog.tsx` and `ProgressView.tsx`:**

Apply the same treatment — remove `border` and `width` from each, since the detail box is their container:

```tsx
// ConfirmDialog.tsx — remove border and width="60%"
<box flexDirection="column" paddingTop={2} paddingLeft={2}>
  <text fg="yellow">  {props.message}</text>
  <text fg="gray">{"\n"}  [y] Yes  [n/Esc] No</text>
</box>
```

```tsx
// ProgressView.tsx — remove border and width="70%"
<box flexDirection="column">
  ...existing content unchanged...
</box>
```

For ProgressView, the detail box title is already set to the progress message (e.g., "Opening billing-refactor...") via the `detailBoxTitle` memo. The ProgressView's own `border title` is therefore a double border. Removing it aligns with the CONTEXT.md layout diagram.

---

### UAT Issue 4: HelpOverlay Smushed (MINOR — Test 12)

**UAT report:** "Keybindings is smushed into an empty box. Pressing escape works. Pressing ? again works."

**Root cause (confirmed by reading `HelpOverlay.tsx:16` and `App.tsx:647-650`):**

```tsx
// HelpOverlay.tsx line 16 — current code
<box border title="Keybindings" flexDirection="column" width="70%">
```

```tsx
// App.tsx lines 647-650 — current render position
<Show when={helpOpen()}>
  <HelpOverlay tab={tab()} onClose={() => setHelpOpen(false)} />
</Show>
```

HelpOverlay is rendered as the LAST child inside the single outer `<box border>` flex column, after the list box, separator, detail box, batch bar, and help bar. By the time Yoga computes layout, there is zero remaining height — the outer box's fixed-height children have consumed everything. The HelpOverlay box gets 0 or near-0 height, so its `width="70%"` creates a narrow strip with no visible height.

Additionally, `width="70%"` without `height` means the box sizes to its content height in the available space. But since available height is 0, it appears as an empty box.

**Fix:** The CONTEXT.md decision is: "Help overlay is the sole full-screen exception — the ONLY view that replaces both boxes."

In the two-box refactor, HelpOverlay must be rendered OUTSIDE the two-box layout, replacing the entire content of the outer wrapper when `helpOpen()` is true. The structure:

```tsx
<box flexDirection="column" height="100%">
  <Show when={helpOpen()}>
    <HelpOverlay tab={tab()} onClose={() => setHelpOpen(false)} />
  </Show>
  <Show when={!helpOpen()}>
    {/* top box */}
    {/* bottom box */}
    {/* help bar */}
  </Show>
</box>
```

HelpOverlay itself must use `height="100%"` and `width="100%"`:

```tsx
// HelpOverlay.tsx — fixed
export function HelpOverlay(props: Props) {
  useKeyboard((key) => {
    if (key.name === "escape" || key.name === "?") props.onClose()
  })

  return (
    <box border title="Keybindings" flexDirection="column" height="100%" width="100%">
      <text fg="white">{"\n"}  Global:</text>
      <text fg="gray">    1 / 2 / 3   Switch tabs (Workspaces / Templates / Repos)</text>
      <text fg="gray">    [ / ]       Previous / next tab</text>
      <text fg="gray">    R           Refresh current tab</text>
      <text fg="gray">    ?           Toggle this help</text>
      <text fg="gray">    q           Quit (from list view only)</text>
      <text fg="white">{"\n"}  Navigation:</text>
      <text fg="gray">    ↑ ↓ / j k   Move cursor</text>
      <text fg="gray">    /           Start filter</text>
      <text fg="gray">    Esc         Back / clear filter / close overlay</text>
      <text fg="white">{"\n"}  Workspaces tab:</text>
      <text fg="gray">    Enter       Open action menu</text>
      <text fg="gray">    Space       Select for batch operation</text>
      <text fg="gray">    o=Open  e=Edit  n=Rename  u=Run  m=Merge  c=Clean  r=Remove</text>
      <text fg="white">{"\n"}  Templates tab:</text>
      <text fg="gray">    Enter       Open action menu</text>
      <text fg="gray">    e=Edit($EDITOR)  c=Clone  r=Remove</text>
      <text fg="white">{"\n"}  Repos tab:</text>
      <text fg="gray">    (read-only — no actions)</text>
      <text fg="gray">{"\n"}  Press Esc or ? to close</text>
    </box>
  )
}
```

The key change: add `height="100%"` and `width="100%"` to the box.

---

### UAT Issue 5: Filter Indicator Missing (MINOR — Test 13)

**UAT report:** "Pressing filter key / goes into filter mode, but filter line is only displayed when another input is entered. So pressing / once does not tell me I am filtering."

**Root cause (confirmed by reading `WorkspaceList.tsx:29`, `TemplateList.tsx:27`, `RepoList.tsx:32`):**

All three list components use:
```tsx
<Show when={props.filter}>
  <text fg="cyan">  filter: {props.filter}</text>
</Show>
```

`props.filter` is an empty string `""` immediately after `/` is pressed (before any character is typed). Empty string is falsy in JavaScript, so `<Show when="">` renders nothing.

**Fix strategy — move filter display to the help bar in App.tsx:**

Per the CONTEXT.md decision, "Filter line replaces the help bar (not inside either box)." The filter indicator should live in the 1-row help bar sibling, not inside any list component.

1. Remove the filter `<Show>` block from `WorkspaceList.tsx`, `TemplateList.tsx`, and `RepoList.tsx`.
2. In App.tsx's help bar sibling box, use the `filtering()` signal (a boolean) to show the filter line:

```tsx
// Help bar sibling — fixed
<box height={1}>
  <Show when={filtering()}>
    <text fg="cyan">  filter: {filter() || "_"}</text>
  </Show>
  <Show when={!filtering() && loading()}>
    <text fg="gray">  (loading statuses...)</text>
  </Show>
  <Show when={!filtering() && !loading()}>
    <text fg="gray">  {helpBarText()}</text>
  </Show>
</box>
```

`filtering()` is the `createMemo` at `App.tsx:72` that reads `tabFiltering[tab()][0]()` — it is `true` from the moment `/` is pressed (before any character), so the filter line appears immediately.

The `filter() || "_"` expression shows `_` as a cursor placeholder when the filter string is empty.

No prop changes needed on the list components if the filter display is moved entirely out of them. However, the list components still receive `filter` as a prop for filtering the data — only the display logic moves.

---

### Summary of All File Changes Required

| File | Change | UAT Issue |
|------|--------|-----------|
| `App.tsx` | Replace single outer `<box border>` with two-box layout; move BatchBar inside top box; move help bar outside as sibling; use `flexGrow` instead of pixel heights; replace Show with Switch/Match for tab content | Issues 1, 2 |
| `App.tsx` | Add `Switch, Match` to solid-js import | Issue 2 |
| `App.tsx` | Remove `separatorLine` memo and its `<text>` render; use detail box `title` instead | Issue 1 |
| `App.tsx` | Move filter indicator to help bar sibling, conditioned on `filtering()` boolean | Issue 5 |
| `App.tsx` | Wrap HelpOverlay in `<Show when={helpOpen()}>` as first child of outer box; wrap two-box layout in `<Show when={!helpOpen()}>` | Issue 4 |
| `ActionMenu.tsx` | Remove `border`, `title`, `width="50%"`; add `paddingTop={1} paddingLeft={2}` | Issue 3 |
| `TemplateActionMenu.tsx` | Remove `border`, `title`, `width="50%"`; add `paddingTop={1} paddingLeft={2}` | Issue 3 |
| `ConfirmDialog.tsx` | Remove `border`, `width="60%"`; add `paddingTop={2} paddingLeft={2}` | Issue 3 (consistency) |
| `ProgressView.tsx` | Remove `border`, `width="70%"` | Issue 3 (consistency); detail box title shows progress message |
| `HelpOverlay.tsx` | Add `height="100%"` and `width="100%"` to the box | Issue 4 |
| `WorkspaceList.tsx` | Remove `<Show when={props.filter}>` filter display block | Issue 5 |
| `TemplateList.tsx` | Remove `<Show when={props.filter}>` filter display block | Issue 5 |
| `RepoList.tsx` | Remove `<Show when={props.filter}>` filter display block | Issue 5 |

### Fix Order (dependency chain)

1. **App.tsx two-box layout refactor** (Issue 1) — this is the foundation; all other layout changes depend on this structure being in place.
2. **Switch/Match for tab content** (Issue 2) — can be done as part of the App.tsx refactor in the same edit.
3. **HelpOverlay placement** (Issue 4) — also part of the App.tsx refactor.
4. **Filter bar move** (Issue 5) — also part of the App.tsx refactor.
5. **ActionMenu, TemplateActionMenu, ConfirmDialog, ProgressView border removal** (Issue 3) — independent; can be done before or after App.tsx.
6. **HelpOverlay sizing** (Issue 4) — independent fix to HelpOverlay.tsx.

The most efficient order: do the full App.tsx rewrite first (fixing Issues 1, 2, 4, 5 simultaneously), then fix the component files (Issues 3, 4).

## Architecture Patterns

### Recommended Project Structure (no change)
```
src/tui/dashboard/
├── App.tsx              — two-box layout, keyboard, tab state (REFACTOR)
├── types.ts             — UIView, Action, Tab unions (final state)
├── hooks/
│   ├── useWorkspaces.ts — workspace data + status fetching
│   ├── useTemplates.ts  — template data
│   └── useRepos.ts      — repo registry data
├── WorkspaceList.tsx    — list content (remove filter display)
├── TemplateList.tsx     — list content (remove filter display)
├── RepoList.tsx         — list content (remove filter display)
├── WorkspaceDetail.tsx  — workspace detail content
├── TemplateDetail.tsx   — template detail content
├── RepoDetail.tsx       — repo detail content
├── ActionMenu.tsx       — workspace action menu (remove border, add padding)
├── TemplateActionMenu.tsx — template action menu (remove border, add padding)
├── ConfirmDialog.tsx    — confirm dialog (remove border, add padding)
├── InlineInput.tsx      — inline text input (no change needed)
├── HelpOverlay.tsx      — full-screen overlay (add height/width 100%)
├── BatchBar.tsx         — selected item count bar (no change needed)
├── ProgressView.tsx     — async operation progress (remove border)
└── run.tsx              — dashboard entry point (no change)
```

### Pattern 1: Two-Box Sibling Layout

**What:** Replace the single outer `<box border>` wrapping list + separator + detail + bars with two sibling bordered boxes plus a help bar sibling outside both. Use `flexGrow` for proportional sizing, not computed pixel heights.

**When to use:** Any time the layout has conditional rows that must not shift other panes' heights.

**Example:**
```tsx
// Source: CONTEXT.md decisions + BoxOptions verified from @opentui/core
return (
  // Outer container — full height, column flex, NO border
  <box flexDirection="column" height="100%">

    {/* Help overlay replaces EVERYTHING */}
    <Show when={helpOpen()}>
      <HelpOverlay tab={tab()} onClose={() => setHelpOpen(false)} />
    </Show>

    <Show when={!helpOpen()}>
      {/* TOP BOX: list pane + optional batch bar inside */}
      <box
        border
        title={tabTitle()}
        flexDirection="column"
        flexGrow={3}
        minHeight={10}
      >
        {/* Tab-specific list via Switch/Match */}
        <Switch>
          <Match when={tab() === "workspaces"}>
            <WorkspaceList ... />
          </Match>
          <Match when={tab() === "templates"}>
            <TemplateList ... />
          </Match>
          <Match when={tab() === "repos"}>
            <RepoList ... />
          </Match>
        </Switch>
        {/* Batch bar INSIDE top box as footer row */}
        <Show when={view().view === "list" && selected().size > 0}>
          <BatchBar count={selected().size} />
        </Show>
      </box>

      {/* BOTTOM BOX: detail / action / confirm / progress / inline-input */}
      <box
        border
        title={detailBoxTitle()}
        flexDirection="column"
        flexGrow={2}
        minHeight={10}
      >
        <Show when={view().view === "list"}>
          <Switch>
            <Match when={tab() === "workspaces"}><WorkspaceDetail entry={currentEntry()} /></Match>
            <Match when={tab() === "templates"}><TemplateDetail template={currentTemplate()} /></Match>
            <Match when={tab() === "repos"}><RepoDetail ... /></Match>
          </Switch>
        </Show>
        <Show when={view().view === "action-menu"}>
          <Switch>
            <Match when={tab() === "workspaces"}>
              <box flexDirection="column" paddingTop={1}><ActionMenu ... /></box>
            </Match>
            <Match when={tab() === "templates"}>
              <box flexDirection="column" paddingTop={1}><TemplateActionMenu ... /></box>
            </Match>
          </Switch>
        </Show>
        <Show when={view().view === "confirm"}>
          <box flexDirection="column" paddingTop={2}><ConfirmDialog ... /></box>
        </Show>
        <Show when={view().view === "inline-input"}>
          <box flexDirection="column" paddingTop={3}><InlineInput ... /></box>
        </Show>
        <Show when={view().view === "progress"}>
          <ProgressView ... />
        </Show>
      </box>

      {/* HELP BAR / FILTER LINE — outside both boxes, fixed 1 row */}
      <box height={1}>
        <Show when={filtering()}>
          <text fg="cyan">  filter: {filter() || "_"}</text>
        </Show>
        <Show when={!filtering() && loading()}>
          <text fg="gray">  (loading statuses...)</text>
        </Show>
        <Show when={!filtering() && !loading()}>
          <text fg="gray">{helpBarText()}</text>
        </Show>
      </box>
    </Show>

  </box>
)
```

**Key insight:** `flexGrow` values (3 and 2) achieve a 60/40 split without computing pixel heights. This is more robust than `Math.floor(height * 0.6)` because it doesn't require `useTerminalDimensions` at all for the split — Yoga handles it. However, the list components still receive a `height` prop for their scroll viewport computation — use `createMemo(() => Math.floor(dims().height * 0.6) - 2)` as a reasonable estimate.

### Pattern 2: FlexGrow-Based Proportional Split

**What:** Instead of computing pixel heights, use `flexGrow={3}` and `flexGrow={2}` on sibling boxes to achieve 60/40 split.

**When to use:** When exact pixel heights are unknown or when conditional content (batch bar, loading) must not affect sibling pane sizes.

**Example:**
```tsx
// The outer container has flexDirection="column" height="100%"
// Child boxes use flexGrow to divide space proportionally
<box border flexDirection="column" flexGrow={3} minHeight={10}>
  {/* list content — takes ~60% */}
</box>
<box border flexDirection="column" flexGrow={2} minHeight={10}>
  {/* detail content — takes ~40% */}
</box>
<box height={1}>
  {/* help bar — fixed 1 row */}
</box>
```

This approach means the `listHeight` and `detailHeight` computed signals in App.tsx can be simplified. The `innerHeight` signal can also be removed. The `listHeight` is still needed as a prop for list component scroll viewport height — estimate it as `Math.floor(dims().height * 0.6) - 2`.

### Pattern 3: SolidJS Switch/Match — Tab Switch Fix

**What:** Replace multiple sibling `<Show when={tab() === "...">` blocks with `<Switch><Match>` to fix the tab-switching rendering freeze.

**Root cause confirmed:** `App.tsx:531-555` has three `<Show>` blocks as siblings inside `<box height={listHeight()}>`. OpenTUI's reconciler does not correctly handle the simultaneous unmount/mount of sibling Show branches when their conditions change together. `Switch/Match` uses a single reactive computation for all branches, giving the reconciler one unified update.

**Example:**
```tsx
// Source: SolidJS docs — Switch/Match is the idiomatic way for mutually exclusive conditions
import { Switch, Match } from "solid-js"

<Switch fallback={<text fg="gray">  No tab selected</text>}>
  <Match when={tab() === "workspaces"}>
    <WorkspaceList ... />
  </Match>
  <Match when={tab() === "templates"}>
    <TemplateList ... />
  </Match>
  <Match when={tab() === "repos"}>
    <RepoList ... />
  </Match>
</Switch>
```

### Pattern 4: Filter Line Immediate Visibility

**What:** Show `filter: _` immediately when filtering mode starts, even before any characters are typed.

**Root cause confirmed:** All three list components use `<Show when={props.filter}>` (falsy on empty string `""`). The App.tsx keyboard handler at line 494-498 sets `filtering=true` and `filter=""` when `/` is pressed.

**Fix:** Move the filter display entirely out of the list components and into App.tsx's help bar sibling, conditioned on the `filtering()` boolean signal:

```tsx
// App.tsx help bar — the filtering() signal is true from the moment / is pressed
<box height={1}>
  <Show when={filtering()}>
    <text fg="cyan">  filter: {filter() || "_"}</text>
  </Show>
  ...
</box>
```

Remove the filter `<Show>` blocks from `WorkspaceList.tsx`, `TemplateList.tsx`, and `RepoList.tsx`.

### Pattern 5: ActionMenu / ConfirmDialog — No Double Borders

**What:** Remove `border`, `title`, and `width` from components rendered inside the detail box. Add `paddingTop` for vertical positioning.

**Root cause confirmed:** `ActionMenu.tsx:37` has `border title width="50%"`. `TemplateActionMenu.tsx:19` has the same. `ConfirmDialog.tsx:17` has `border width="60%"`. `ProgressView.tsx:13` has `border width="70%"`. All of these render inside the already-bordered detail box.

**Fix for each component:** Remove `border` and `width`. Replace with padding wrapper.

The detail box's `title` prop serves as the label for ActionMenu/ConfirmDialog/ProgressView — the selected item name or progress message is already shown in the detail box border. No inner border needed.

### Anti-Patterns to Avoid

- **Putting conditional rows inside the flex column alongside fixed-height boxes**: BatchBar and loading indicator must live inside the top box (BatchBar) or in the help bar sibling (loading), not as siblings to the two main boxes.
- **Computing pixel heights for list/detail split**: `Math.floor(height * 0.6)` breaks when conditional content appears. Use `flexGrow` for the split; only use pixel heights for the scroll viewport estimate passed to list components.
- **Relying on `<Show when={props.filter}>` for filter visibility**: falsy on empty string; move filter display to App.tsx's help bar sibling conditioned on `filtering()` boolean.
- **Multiple `Show` blocks for tab content at the same tree position**: Use `Switch/Match` for exclusivity.
- **ActionMenu, TemplateActionMenu, ConfirmDialog, ProgressView with their own `border`**: These render inside the already-bordered detail box. Remove all borders from these components.
- **HelpOverlay without `height="100%"`**: Renders with zero available height when inside a flex column with other content. Always render HelpOverlay as the sole child of the outer wrapper (when `helpOpen()` is true).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Proportional height splitting | `Math.floor(height * 0.6)` | `flexGrow={3}` / `flexGrow={2}` on sibling boxes | Yoga layout handles it; pixel math breaks on resize or conditional content |
| Keyboard routing to inactive panels | Per-panel `useKeyboard` hooks | Single `useKeyboard` in App.tsx with `if (view() === ...)` guards | Multiple concurrent keyboard listeners in OpenTUI cause double-dispatch |
| Tab-exclusive rendering | Multiple `<Show>` guards | `<Switch><Match>` | Idiomatic SolidJS; clearer reconciler hints |
| Filter visibility state | Checking string truthiness | Move to App.tsx help bar, conditioned on `filtering()` boolean | Empty string is falsy in JS |
| Editor suspend/resume | Custom stdin manipulation | `renderer.suspend()` / `renderer.resume()` (existing pattern) | Already proven; do not replace |

**Key insight:** OpenTUI's layout model (Yoga flexbox) handles proportional splits far more reliably than computed pixel math. Trust the layout engine.

## Common Pitfalls

### Pitfall 1: Show Blocks with Tab-Dependent Conditions Not Re-Rendering

**What goes wrong:** `<Show when={tab() === "templates"}>` renders stale content when `tab()` changes.
**Why it happens:** OpenTUI's SolidJS reconciler does not correctly diff simultaneous unmount/mount of sibling `Show` blocks when conditions swap together. Confirmed by UAT: the tab signal updates (keyboard handler is correct) but the rendered list does not change.
**How to avoid:** Use `<Switch><Match>` for mutually exclusive tab content. This gives the reconciler a single reactive computation for all branches instead of N separate computations.
**Warning signs:** Tab label in the border title updates but list content does not change. User can "get back to a working state" by pressing another key.

### Pitfall 2: Single Outer Box Height Overflow

**What goes wrong:** BatchBar or loading indicator appears, stealing a flex row from the list/detail split, causing the detail pane title to overlap with the last list row.
**Why it happens:** In a flex column, every child competes for height. Adding a conditional child (BatchBar) to a flex column that has fixed-height siblings reduces space available to the siblings. Confirmed by UAT: "selecting something introduces a new line at the bottom which pushes up the details so they overflow into the title of the separator."
**How to avoid:** Two-box layout where the outer wrapper has `flexDirection="column" height="100%"` with NO border, and BatchBar lives INSIDE the top box as a flex child of the top box (not as a sibling to the top box).
**Warning signs:** Layout looks fine with no items selected, breaks when batch selection happens.

### Pitfall 3: Empty String Filter Condition

**What goes wrong:** Pressing `/` starts filter mode, but the `filter: _` indicator does not appear until a character is typed.
**Why it happens:** `<Show when={props.filter}>` — empty string is falsy in JavaScript. Confirmed by UAT.
**How to avoid:** Move the filter indicator to App.tsx's help bar sibling, conditioned on the `filtering()` boolean signal directly.
**Warning signs:** Filter indicator absent immediately after `/` press.

### Pitfall 4: Component Border Duplication in the Detail Box

**What goes wrong:** ActionMenu, ConfirmDialog, TemplateActionMenu, ProgressView each have their own `border` — when rendered inside the already-bordered detail box, they appear as nested boxes which wastes space and looks wrong. Confirmed by UAT: "the actions menu is floating at the top of the details screen."
**Why it happens:** Components were originally designed as standalone views; now they render inside the detail box container.
**How to avoid:** Remove `border`, `title`, and `width` from ActionMenu, TemplateActionMenu, ConfirmDialog, ProgressView. The detail box provides the border. Add `paddingTop` for vertical separation.
**Warning signs:** Double borders visible in the detail area; action menu floating in the top-left corner.

### Pitfall 5: HelpOverlay Sizing — Zero Available Height

**What goes wrong:** HelpOverlay shows keybindings smushed into a small box (confirmed by UAT: "keybindings is smushed into an empty box").
**Why it happens:** HelpOverlay is rendered as the last child inside the single outer `<box border>` flex column. After all other fixed-height children consume available space, HelpOverlay gets zero (or near-zero) remaining height. `width="70%"` with no `height` means the box sizes to content height, but content height is limited to the near-zero available space.
**How to avoid:** HelpOverlay must replace the entire content of the outer wrapper. Use `<Show when={helpOpen()}>` as the first branch inside the outer box, and `<Show when={!helpOpen()}>` wrapping the two-box layout. Set `height="100%"` and `width="100%"` on the HelpOverlay box.
**Warning signs:** Keybinding text truncated or invisible; box appears as minimum height.

### Pitfall 6: `useKeyboard` in Child Components Creating Double-Dispatch

**What goes wrong:** Both App.tsx's `useKeyboard` and a child component's `useKeyboard` (e.g. ActionMenu) fire for the same keypress, executing both handlers.
**Why it happens:** OpenTUI broadcasts keyboard events to all registered handlers simultaneously, not in a propagation chain. There is no `stopPropagation` equivalent.
**How to avoid:** App.tsx's keyboard handler must guard with `if (v.view === "action-menu") return` to bail out and let ActionMenu's handler take over. This is already implemented in the existing code (`App.tsx:430`) and must be preserved.
**Warning signs:** Actions execute twice; unexpected state transitions.

## Code Examples

Verified patterns from the existing codebase and OpenTUI type definitions:

### Two-Box Layout with FlexGrow

```tsx
// Source: OpenTUI BoxOptions from @opentui/core source map — flexGrow is a valid LayoutOptions prop
// Pattern: two sibling bordered boxes inside a full-height column flex outer box

return (
  <box flexDirection="column" height="100%">
    <Show when={helpOpen()}>
      <HelpOverlay tab={tab()} onClose={() => setHelpOpen(false)} />
    </Show>
    <Show when={!helpOpen()}>
      {/* List box */}
      <box border title={tabTitle()} flexDirection="column" flexGrow={3} minHeight={10}>
        <Switch>
          <Match when={tab() === "workspaces"}>
            <WorkspaceList
              entries={filteredEntries()}
              cursor={cursor()}
              selected={selected()}
              filter={filter()}
              height={listHeight()}
            />
          </Match>
          <Match when={tab() === "templates"}>
            <TemplateList
              entries={filteredTemplates()}
              cursor={tabCursor.templates[0]()}
              filter={tabFilter.templates[0]()}
              height={listHeight()}
            />
          </Match>
          <Match when={tab() === "repos"}>
            <RepoList
              entries={filteredRepos()}
              cursor={tabCursor.repos[0]()}
              filter={tabFilter.repos[0]()}
              height={listHeight()}
            />
          </Match>
        </Switch>
        {/* Batch bar INSIDE top box */}
        <Show when={view().view === "list" && selected().size > 0}>
          <BatchBar count={selected().size} />
        </Show>
      </box>

      {/* Detail box */}
      <box border title={detailBoxTitle()} flexDirection="column" flexGrow={2} minHeight={10}>
        <Show when={view().view === "list"}>
          <Switch>
            <Match when={tab() === "workspaces"}>
              <WorkspaceDetail entry={currentEntry()} />
            </Match>
            <Match when={tab() === "templates"}>
              <TemplateDetail template={currentTemplate()} />
            </Match>
            <Match when={tab() === "repos"}>
              <RepoDetail
                entry={currentRepo()}
                allTemplates={templateEntries()}
                allWorkspaces={allWorkspaces()}
              />
            </Match>
          </Switch>
        </Show>
        <Show when={view().view === "action-menu"}>
          <Switch>
            <Match when={tab() === "workspaces"}>
              <box flexDirection="column" paddingTop={1}>
                <ActionMenu
                  workspaceName={currentEntry()?.workspace.name ?? ""}
                  onAction={(action) => runAction(action, (view() as any).index)}
                  onCancel={() => setView({ view: "list" })}
                  onRun={() => handleRun(selectedName())}
                />
              </box>
            </Match>
            <Match when={tab() === "templates"}>
              <box flexDirection="column" paddingTop={1}>
                <TemplateActionMenu
                  templateName={currentTemplate()?.name ?? ""}
                  onAction={handleTemplateAction}
                  onCancel={() => setView({ view: "list" })}
                />
              </box>
            </Match>
          </Switch>
        </Show>
        <Show when={view().view === "confirm"}>
          {(() => {
            const v = view() as { view: "confirm"; index: number; action: Action; batch?: boolean }
            const label = confirmContext() === "template"
              ? `${v.action} template '${filteredTemplates()[v.index]?.name}'?`
              : v.batch
              ? `${v.action} ${selected().size} workspace(s)?`
              : `${v.action} '${filteredEntries()[v.index]?.workspace.name}'?`
            return (
              <box flexDirection="column" paddingTop={2}>
                <ConfirmDialog
                  message={label}
                  onConfirm={() => executeConfirmed(v.action, v.index, v.batch)}
                  onCancel={() => setView({ view: "list" })}
                />
              </box>
            )
          })()}
        </Show>
        <Show when={view().view === "inline-input"}>
          <box flexDirection="column" paddingTop={3}>
            <InlineInput
              label={inlineInputLabel()}
              prefill={(view() as any).prefill ?? ""}
              onConfirm={handleInlineInputConfirm}
              onCancel={handleInlineInputCancel}
            />
          </box>
        </Show>
        <Show when={view().view === "progress"}>
          <ProgressView
            title={(view() as any).message}
            lines={progressLines()}
            done={progressDone()}
          />
        </Show>
      </box>

      {/* Help bar / filter line — OUTSIDE both boxes, fixed 1 row */}
      <box height={1}>
        <Show when={filtering()}>
          <text fg="cyan">  filter: {filter() || "_"}</text>
        </Show>
        <Show when={!filtering() && loading()}>
          <text fg="gray">  (loading statuses...)</text>
        </Show>
        <Show when={!filtering() && !loading()}>
          <text fg="gray">{helpBarText()}</text>
        </Show>
      </box>
    </Show>
  </box>
)
```

### Detail Box Title Computation

```tsx
// Replaces separatorLine memo — used as detail box title prop
const detailBoxTitle = createMemo(() => {
  const v = view()
  if (v.view === "progress") return ` ${(v as any).message} `
  const name = selectedName()
  return name ? ` ${name} ` : ""
})
```

### HelpOverlay Full-Screen

```tsx
// HelpOverlay.tsx — fixed with height="100%" width="100%"
export function HelpOverlay(props: Props) {
  useKeyboard((key) => {
    if (key.name === "escape" || key.name === "?") props.onClose()
  })
  return (
    <box border title="Keybindings" flexDirection="column" height="100%" width="100%">
      {/* ... keybinding text rows ... */}
    </box>
  )
}
```

### Switch/Match for Tab Content (SolidJS)

```tsx
// Source: SolidJS docs (Switch/Match verified SolidJS 1.x API)
// Switch/Match is the idiomatic way to express mutually exclusive conditions
import { Switch, Match } from "solid-js"

<Switch fallback={<text fg="gray">  No tab selected</text>}>
  <Match when={tab() === "workspaces"}>
    <WorkspaceList ... />
  </Match>
  <Match when={tab() === "templates"}>
    <TemplateList ... />
  </Match>
  <Match when={tab() === "repos"}>
    <RepoList ... />
  </Match>
</Switch>
```

### listHeight Estimation for Scroll Viewport

```tsx
// The list components still need a height for their scrolling viewport computation.
// With flexGrow, exact pixel height is unknown at render time.
// Use a conservative estimate: 60% of terminal height minus border rows.
const listHeight = createMemo(() => Math.max(6, Math.floor(dims().height * 0.6) - 2))
// detailHeight and innerHeight signals can be removed.
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Single outer `<box border>` with separator text | Two sibling bordered boxes (no outer border) | Phase 8 gap fix | Eliminates overflow from conditional rows |
| Computed `listHeight` / `detailHeight` pixel math for layout split | `flexGrow={3}` / `flexGrow={2}` | Phase 8 gap fix | More robust to terminal resize and conditional content |
| `<Show when={props.filter}>` for filter indicator | Filter display moved to App.tsx help bar, conditioned on `filtering()` boolean | Phase 8 gap fix | Shows `filter: _` immediately on `/` press |
| Multiple `<Show>` for tab content | `<Switch><Match>` | Phase 8 gap fix | Fixes rendering freeze on tab switch |
| ActionMenu/TemplateActionMenu/ConfirmDialog/ProgressView with own `border` and `width` | No border, no width, use `paddingTop` | Phase 8 gap fix | No double borders; proper layout inside detail box |
| HelpOverlay rendered last in flex column | HelpOverlay rendered as sole child when `helpOpen()` is true, with `height="100%"` | Phase 8 gap fix | Full-screen overlay; no content squeeze |

**Deprecated/outdated:**
- `DetailStatus.tsx`: retired in 08-02-PLAN execution; status info moved inline to WorkspaceDetail.
- Single-box layout with separator line: replaced by two-box layout.
- `detail-status` UIView variant: removed from `UIView` union.
- `separatorLine` createMemo: replaced by `detailBoxTitle` using the detail box's `title` prop.
- `innerHeight` and `detailHeight` computed signals: can be removed (flexGrow handles the split).

## Open Questions

1. **FlexGrow vs pixel heights for 60/40 split — Yoga behavior with mixed children**
   - What we know: OpenTUI uses Yoga flexbox. `flexGrow` is a valid prop per `Renderable.d.ts`. A `<box height={1}>` sibling (the help bar) mixes fixed and flex sizing.
   - What's unclear: Whether Yoga in OpenTUI correctly subtracts fixed-height children from the available pool before distributing flexGrow. If not, the help bar row may overlap with the detail box.
   - Recommendation: Use `flexGrow` and test. If the help bar overlaps, fall back to: `<box border flexDirection="column" height={listHeight()}>` and `<box border flexDirection="column" height={detailHeight()}>` where `listHeight = Math.floor((dims().height - 1) * 0.6)` and `detailHeight = dims().height - 1 - listHeight`. The `-1` accounts for the 1-row help bar.

2. **Switch/Match — confirmed fix for OpenTUI reconciler?**
   - What we know: The keyboard handler is correct; the bug is downstream in rendering. `Switch/Match` is the idiomatic SolidJS fix for mutually exclusive rendering.
   - What's unclear: Whether OpenTUI's reconciler has a bug specifically with `Show` blocks or with all conditional rendering patterns. `Switch/Match` may not be sufficient if the reconciler has a deeper issue.
   - Recommendation: Implement `Switch/Match` first. If tab switching still freezes after the refactor, add a `key` prop to the Switch (if OpenTUI supports it) or use a factory memo that forces recreation: `const listContent = createMemo(() => tab() === "workspaces" ? <WorkspaceList /> : tab() === "templates" ? <TemplateList /> : <RepoList />)`.

3. **ProgressView detail box title**
   - What we know: The CONTEXT.md layout shows the detail box title changes to the progress message (e.g., "Opening billing-refactor...") during progress view.
   - What's unclear: Whether `detailBoxTitle()` should read `(view() as any).message` when `view().view === "progress"`, or whether a separate `progressTitle` signal is cleaner.
   - Recommendation: Use a `detailBoxTitle` memo that reads `view()` and returns the appropriate title for all view states. This is cleaner than a separate signal and ensures the title always reflects the current view.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | bun:test (Jest-compatible) |
| Config file | none — `bun test tests/` discovers automatically |
| Quick run command | `bun test tests/` |
| Full suite command | `bun test tests/` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DASH-01 | Tab switching with 1/2/3 and [/] keys | manual-only | N/A — TUI keyboard interaction requires terminal | N/A |
| DASH-02 | Per-tab cursor/filter state preserved | manual-only | N/A — TUI state requires running renderer | N/A |
| DASH-03 | Two-box split layout renders correctly | manual-only | N/A — visual layout requires terminal | N/A |
| DASH-04 | Detail pane auto-updates on cursor move | manual-only | N/A — reactive TUI requires terminal | N/A |
| DASH-05 | Workspace action menu launches correctly | manual-only | N/A — keyboard flow requires terminal | N/A |
| DASH-06 | Editor suspend/resume works | manual-only | N/A — requires $EDITOR and terminal | N/A |
| DASH-07 | Template actions (edit/clone/remove) work | manual-only | N/A — requires terminal | N/A |
| DASH-08 | Repo list with disk indicator | manual-only | N/A — requires terminal | N/A |
| DASH-09 | Context-sensitive help bar visible | manual-only | N/A — visual layout | N/A |
| DASH-10 | Help overlay opens/closes | manual-only | N/A — keyboard flow | N/A |
| DASH-11 | Esc back-chain correct | manual-only | N/A — keyboard flow | N/A |

**Note:** All Phase 8 requirements are TUI interaction tests. The existing test suite (`tests/`) covers lib-level logic (config, detect, etc.) not TUI rendering. No automated test coverage is possible for these requirements without OpenTUI's `testRender` test harness — which would require new test infrastructure. For this phase, validation is via `git-stacks manage` manual UAT following the 08-UAT.md test cases.

### UAT Re-Verification Checklist

After applying all fixes, re-run these specific UAT tests:

| Test | Fix Applied | Pass Condition |
|------|-------------|----------------|
| 1 | Two-box layout + BatchBar inside top box | Selecting items does NOT cause overflow; two visible bordered boxes |
| 2 | Switch/Match for tab content | Pressing 2/3/1 switches visible list content immediately |
| 3 | (depends on test 2 passing) | Per-tab cursor preserved across tab switches |
| 6 | (depends on test 2 passing) | Templates tab shows real data |
| 7 | (depends on test 2 passing) | Repos tab shows data with disk indicator |
| 8 | ActionMenu border removed + padding added | Action menu appears with padding inside detail box, not floating in corner |
| 9 | (depends on test 2 passing) | Template edit opens $EDITOR |
| 10 | (depends on test 2 passing) | Template clone flow works |
| 11 | (depends on test 2 passing) | Template remove flow works |
| 12 | HelpOverlay height/width 100% + placement | Keybindings fill the overlay; not smushed |
| 13 | Filter display moved to help bar + filtering() boolean | Pressing / immediately shows "filter: _" |

### Sampling Rate
- **Per task commit:** `bun test tests/` (regression guard on lib code unchanged by this phase)
- **Per wave merge:** `bun test tests/`
- **Phase gate:** Manual UAT via `git-stacks manage` must pass all 13 test cases in 08-UAT.md before `/gsd:verify-work`

### Wave 0 Gaps
None — existing test infrastructure covers all automated requirements. Phase 8 gaps are TUI visual/interaction tests that require manual validation.

## Sources

### Primary (HIGH confidence)
- `src/tui/dashboard/App.tsx` — full source read; confirmed keyboard handler is correct; confirmed three-Show-block bug; confirmed BatchBar placement; confirmed single-outer-box layout
- `src/tui/dashboard/HelpOverlay.tsx` — confirmed `width="70%"` with no height; confirmed rendered as last flex child
- `src/tui/dashboard/ActionMenu.tsx` — confirmed `border title width="50%"` present
- `src/tui/dashboard/TemplateActionMenu.tsx` — confirmed `border title width="50%"` present
- `src/tui/dashboard/ConfirmDialog.tsx` — confirmed `border width="60%"` present
- `src/tui/dashboard/ProgressView.tsx` — confirmed `border width="70%"` present
- `src/tui/dashboard/WorkspaceList.tsx` — confirmed `<Show when={props.filter}>` bug
- `src/tui/dashboard/TemplateList.tsx` — confirmed `<Show when={props.filter}>` bug
- `src/tui/dashboard/RepoList.tsx` — confirmed `<Show when={props.filter}>` bug
- `node_modules/@opentui/core/Renderable.d.ts` — BoxOptions, LayoutOptions, flexGrow, minHeight, padding props verified
- `node_modules/@opentui/solid/src/types/elements.d.ts` — BoxProps, ScrollBoxProps, confirmed props mapping
- `.planning/phases/08-dashboard-tab-layout/08-UAT.md` — 5 confirmed gap items with UAT verbatim reports
- `.planning/phases/08-dashboard-tab-layout/08-CONTEXT.md` — locked decisions, layout diagrams, UAT gap analysis

### Secondary (MEDIUM confidence)
- SolidJS `Switch/Match` documentation pattern — standard SolidJS API, verified against solid-js package usage in codebase
- `@opentui/solid/README.md` Portal section — Portal exists and mounts to renderer.root; useful for overlays if needed (not required for this fix)

### Tertiary (LOW confidence)
- Assumption that `flexGrow` distributes space correctly after a fixed-height sibling in OpenTUI's Yoga integration — needs empirical verification at runtime. Open Question 1 has the fallback strategy.
- Assumption that `Switch/Match` is sufficient to fix the OpenTUI reconciler's tab-switching issue — credible based on SolidJS internals but unconfirmed against OpenTUI source. Open Question 2 has the fallback strategy.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — OpenTUI types read directly from installed package
- Architecture (two-box layout): HIGH — locked in CONTEXT.md decisions; BoxOptions confirmed in types; root cause confirmed in source code
- Tab-switching bug fix (Switch/Match): MEDIUM — idiomatic SolidJS fix confirmed; OpenTUI reconciler behavior with Switch vs Show not independently verified against OpenTUI source
- FlexGrow split: MEDIUM — props exist in Renderable.d.ts; runtime Yoga behavior with mixed fixed+flex siblings unverified
- ActionMenu/HelpOverlay/filter fixes: HIGH — root causes confirmed by direct source reading; fixes are straightforward JSX property changes
- Pitfalls: HIGH — all root causes confirmed in UAT + direct source code inspection

**Research date:** 2026-03-19
**Valid until:** 2026-04-19 (OpenTUI is actively developed; verify package version before significant new work)
