# Phase 8: Dashboard Tab Layout — Research

**Researched:** 2026-03-19
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

The tab-switching freeze is a SolidJS + OpenTUI rendering issue. The `setTab()` call succeeds (the signal updates), but the `<Show when={tab() === "templates"}>` blocks do not re-render. This is the most critical bug and must be resolved before any other work is useful.

**Primary recommendation:** Fix the two-box layout and the tab-switching SolidJS reactivity bug. All other gaps are cosmetic and straightforward once the layout is correct.

## Standard Stack

### Core (already installed — no new dependencies needed)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@opentui/solid` | installed | TUI renderer with SolidJS reactivity | Project's chosen TUI stack |
| `@opentui/core` | installed | Box, text, scrollbox primitives, layout engine (Yoga) | Underpins @opentui/solid |
| `solid-js` | installed | Reactive signals, createMemo, Show, For, createSignal | Reactivity model for the TUI |

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
├── WorkspaceList.tsx    — list content (filtering prop fix)
├── TemplateList.tsx     — list content (filtering prop fix)
├── RepoList.tsx         — list content (filtering prop fix)
├── WorkspaceDetail.tsx  — workspace detail content (messages placeholder)
├── TemplateDetail.tsx   — template detail content
├── RepoDetail.tsx       — repo detail content
├── ActionMenu.tsx       — workspace action menu (center fix)
├── TemplateActionMenu.tsx — template action menu (center fix)
├── ConfirmDialog.tsx    — confirm dialog
├── InlineInput.tsx      — inline text input
├── HelpOverlay.tsx      — full-screen keybinding reference (sizing fix)
├── BatchBar.tsx         — selected item count bar
├── ProgressView.tsx     — async operation progress
└── run.tsx              — dashboard entry point
```

### Pattern 1: Two-Box Sibling Layout

**What:** Replace the single outer `<box>` wrapping list + separator + detail + bars with two sibling bordered boxes plus a help bar sibling outside both. Use `flexGrow` for proportional sizing, not computed pixel heights.

**When to use:** Any time the layout has conditional rows that must not shift other panes' heights.

**Example:**
```tsx
// Source: CONTEXT.md decisions + BoxOptions verified from @opentui/core
return (
  // Outer container — full height, column flex
  <box flexDirection="column" height="100%">

    {/* Help overlay replaces EVERYTHING — rendered first with absolute position
        OR conditionally render the two-box layout vs overlay */}
    <Show when={helpOpen()}>
      <HelpOverlay tab={tab()} onClose={() => setHelpOpen(false)} />
    </Show>

    <Show when={!helpOpen()}>
      {/* TOP BOX: list pane + optional batch bar inside */}
      <box
        border
        title={tabTitle()}
        flexDirection="column"
        flexGrow={listFlexGrow()}   /* e.g. 3 for 60% */
        minHeight={10}              /* 8 content rows + 2 border rows */
      >
        {/* Tab-specific list */}
        <Show when={tab() === "workspaces"}>
          <WorkspaceList ... />
        </Show>
        <Show when={tab() === "templates"}>
          <TemplateList ... />
        </Show>
        <Show when={tab() === "repos"}>
          <RepoList ... />
        </Show>
        {/* Batch bar INSIDE top box as footer row */}
        <Show when={view().view === "list" && selected().size > 0}>
          <BatchBar count={selected().size} />
        </Show>
      </box>

      {/* BOTTOM BOX: detail / action / confirm / progress / inline-input */}
      <box
        border
        title={detailTitle()}
        flexDirection="column"
        flexGrow={detailFlexGrow()}  /* e.g. 2 for 40% */
        minHeight={10}               /* 8 content rows + 2 border rows */
      >
        {/* Show conditions for each view state */}
        <Show when={view().view === "list"}>...</Show>
        <Show when={view().view === "action-menu"}>...</Show>
        {/* etc */}
      </box>

      {/* HELP BAR / FILTER LINE — outside both boxes, below detail */}
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

**Key insight:** `flexGrow` values (3 and 2) achieve a 60/40 split without computing pixel heights. This is more robust than `Math.floor(height * 0.6)` because it doesn't require `useTerminalDimensions` at all for the split — Yoga handles it. However, if `minHeight` must be enforced, compute available height and clamp; otherwise use flexGrow only.

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

This approach means the `listHeight` and `detailHeight` computed signals in App.tsx can be simplified or removed.

### Pattern 3: SolidJS Show — Tab Switch Bug Fix

**What:** The tab-switching bug where `<Show when={tab() === "templates"}>` does not re-render when `tab()` changes. This is an OpenTUI + SolidJS reconciler issue with `Show` blocks keyed to the same position in the tree.

**Root cause (from CONTEXT.md):** The bug is downstream from signal update — `setTab()` is called correctly, but re-rendering does not fire. This is a known SolidJS + custom renderer issue: when a `Show` condition changes, the reconciler must reconcile the virtual DOM against the terminal renderer tree. If the Show block renders `null` vs a component of the same type at the same tree position, some renderers fail to update the output node.

**Fix approach — two options:**

Option A: Use a keyed `Switch/Match` pattern instead of multiple `Show` blocks:
```tsx
// Source: SolidJS docs — Switch/Match is more explicit about exclusivity
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

Option B: Use `Dynamic` component or a factory function to ensure a new element is created:
```tsx
// Explicit key forces reconciler to tear down and rebuild
const listComponent = createMemo(() => {
  const t = tab()
  if (t === "workspaces") return <WorkspaceList ... />
  if (t === "templates") return <TemplateList ... />
  return <RepoList ... />
})
// ... render {listComponent()}
```

Option C: Investigate whether `useRenderer()` refresh/invalidate API exists in OpenTUI:
```tsx
// If OpenTUI exposes renderer.markDirty() or similar, call it after setTab()
const renderer = useRenderer()
function switchTab(t: Tab) {
  setTab(t)
  setView({ view: "list" })
  // Force a re-render cycle if needed
  // renderer.forceUpdate?.() — check if this API exists
}
```

**Recommended approach:** Try `Switch/Match` first (Option A) — it is the idiomatic SolidJS way to express mutually exclusive conditions and is more explicit to the reconciler that only one branch is active. If that does not fix the freeze, add a forced re-render (Option C).

### Pattern 4: Filter Line Immediate Visibility

**What:** Show `filter: _` immediately when filtering mode starts, even before any characters are typed.

**Fix:** Change the condition from `when={props.filter}` (falsy on empty string) to `when={props.filtering}` (a boolean prop).

**Example:**
```tsx
// WorkspaceList.tsx — current broken code:
<Show when={props.filter}>
  <text fg="cyan">  filter: {props.filter}</text>
</Show>

// Fixed — filtering boolean prop controls visibility:
<Show when={props.filtering}>
  <text fg="cyan">  filter: {props.filter || "_"}</text>
</Show>
```

Props type change required:
```tsx
// Add `filtering: boolean` to props of WorkspaceList, TemplateList, RepoList
type Props = {
  entries: ...
  cursor: number
  filter: string
  filtering: boolean   // NEW
  height: number
}
```

However, with the CONTEXT.md decision that "filter line renders in the help bar area (not inside the list box)", this fix may be handled entirely in App.tsx's help bar — the list components may not need the filtering prop at all. The recommended approach is: move the filter line display OUT of list components and INTO the help bar sibling box in App.tsx.

### Pattern 5: ActionMenu / ConfirmDialog Centering

**What:** Center the action menu and confirm dialog vertically within the detail box.

**Fix approach:** Wrap the content with `paddingTop` or use `justifyContent="center"` on the containing box. Since the detail box itself is the container (no inner border on ActionMenu), add top padding:

```tsx
// In ActionMenu.tsx — remove own border; add top padding inside detail box
// In App.tsx, the detail box renders ActionMenu with padding:
<box flexDirection="column" paddingTop={2}>
  <ActionMenu ... />
</box>
```

Or simplify: remove the `border` and `width="50%"` from ActionMenu and TemplateActionMenu (they are inside the already-bordered detail box), and add `paddingTop` to the action menu JSX.

### Anti-Patterns to Avoid

- **Putting conditional rows inside the flex column alongside fixed-height boxes**: BatchBar and loading indicator must be inside the top box as footer rows (inside its flex children), not as siblings to the two main boxes. This was the root cause of the original overflow bug.
- **Computing pixel heights for list/detail split**: `Math.floor(height * 0.6)` breaks when conditional content appears. Use `flexGrow` instead.
- **Relying on `<Show when={props.filter}>` for filter visibility**: falsy on empty string; use a separate boolean `filtering` prop.
- **Multiple `Show` blocks for tab content at the same tree position**: May confuse the OpenTUI reconciler. Use `Switch/Match` for exclusivity.
- **ActionMenu and TemplateActionMenu with their own `border`**: These components render inside the already-bordered detail box. Double borders look wrong. Remove borders from action menu components.
- **ProgressView rendering in the detail box**: The CONTEXT.md shows progress view replaces the detail box content. ProgressView's own `border` and `width="70%"` should be removed — the detail box is the container. However, verify that ProgressView is rendered as-is in the detail box slot (not as a sibling to it).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Proportional height splitting | `Math.floor(height * 0.6)` | `flexGrow={3}` / `flexGrow={2}` on sibling boxes | Yoga layout handles it; pixel math breaks on resize or conditional content |
| Keyboard routing to inactive panels | Per-panel `useKeyboard` hooks | Single `useKeyboard` in App.tsx with `if (view() === ...)` guards | Multiple concurrent keyboard listeners in OpenTUI cause double-dispatch |
| Tab-exclusive rendering | Multiple `<Show>` guards | `<Switch><Match>` | Idiomatic SolidJS; clearer reconciler hints |
| Filter visibility state | Checking string truthiness | Separate `filtering: boolean` prop or move to App.tsx | Empty string is falsy in JS |
| Editor suspend/resume | Custom stdin manipulation | `renderer.suspend()` / `renderer.resume()` (existing pattern) | Already proven; do not replace |

**Key insight:** OpenTUI's layout model (Yoga flexbox) handles proportional splits far more reliably than computed pixel math. Trust the layout engine.

## Common Pitfalls

### Pitfall 1: Show Blocks with Tab-Dependent Conditions Not Re-Rendering

**What goes wrong:** `<Show when={tab() === "templates"}>` renders stale content when `tab()` changes.
**Why it happens:** The OpenTUI SolidJS reconciler may not correctly diff `Show` blocks that swap between `null` and a component at the same logical tree position, particularly when multiple sibling `Show` blocks exist.
**How to avoid:** Use `<Switch><Match>` for mutually exclusive tab content. This gives the reconciler an unambiguous signal that only one branch is active.
**Warning signs:** Tab label updates in the title but list content does not change.

### Pitfall 2: Single Outer Box Height Overflow

**What goes wrong:** BatchBar or loading indicator appears, stealing a flex row from the list/detail split, causing the detail pane title to overlap with the last list row.
**Why it happens:** In a flex column, every child competes for height. Adding a conditional child to a flex column that has fixed-height siblings reduces space available to the siblings.
**How to avoid:** Two-box layout where the outer wrapper is `height="100%"` with `flexDirection="column"`, and conditional footer rows live INSIDE the top box as flex children of the top box (not as siblings to the top box).
**Warning signs:** Layout looks fine with no items selected, breaks when batch selection happens.

### Pitfall 3: Empty String Filter Condition

**What goes wrong:** Pressing `/` starts filter mode, but the `filter: _` indicator does not appear until a character is typed.
**Why it happens:** `<Show when={props.filter}>` — empty string is falsy in JavaScript.
**How to avoid:** Use a separate `filtering: boolean` prop. Alternatively, move the filter indicator to App.tsx's help bar sibling, conditioned on the `filtering()` signal directly.
**Warning signs:** Filter indicator absent immediately after `/` press.

### Pitfall 4: Component Border Duplication in the Detail Box

**What goes wrong:** ActionMenu, ConfirmDialog, TemplateActionMenu each have their own `border` — when rendered inside the already-bordered detail box, they appear as nested boxes which wastes space and looks wrong.
**Why it happens:** Components were originally designed as standalone views; now they render inside the detail box container.
**How to avoid:** Remove `border` from ActionMenu, TemplateActionMenu, ConfirmDialog when they render as children of the bordered detail box. The detail box provides the border. Add `paddingTop` for vertical separation.
**Warning signs:** Double borders visible in the detail area; action menu floating in the top-left corner.

### Pitfall 5: HelpOverlay Sizing

**What goes wrong:** HelpOverlay shows keybindings smushed into a small box.
**Why it happens:** `width="70%"` on HelpOverlay box when rendered inside the parent layout may result in a narrow box if the parent constraints it. Also, the help overlay is currently rendered as a child of the outer single box, inheriting its flex layout.
**How to avoid:** HelpOverlay should replace the entire visible area. Options:
  1. Render HelpOverlay as a sibling to the two main boxes (when `helpOpen()` is true, render only HelpOverlay; when false, render the two boxes). Use `height="100%"` on HelpOverlay.
  2. Use `<Portal mount={renderer.root}>` to render HelpOverlay at the root level, bypassing the flex layout entirely.

  Given the two-box layout refactor, option 1 is simpler: `<Show when={helpOpen()}><HelpOverlay /></Show>` before the two-box layout, with `<Show when={!helpOpen()}>` wrapping the two boxes.
**Warning signs:** Keybinding text truncated; box height appears as minimum (wrapping content).

### Pitfall 6: `useKeyboard` in Child Components Creating Double-Dispatch

**What goes wrong:** Both App.tsx's `useKeyboard` and a child component's `useKeyboard` (e.g. ActionMenu) fire for the same keypress, executing both handlers.
**Why it happens:** OpenTUI broadcasts keyboard events to all registered handlers simultaneously, not in a propagation chain. There is no `stopPropagation` equivalent.
**How to avoid:** App.tsx's keyboard handler must guard with `if (v.view === "action-menu") return` to bail out and let ActionMenu's handler take over. This is already implemented in the existing code and must be preserved.
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
      <box border title={tabTitle()} flexDirection="column" flexGrow={3}>
        <Switch>
          <Match when={tab() === "workspaces"}>
            <WorkspaceList
              entries={filteredEntries()}
              cursor={cursor()}
              selected={selected()}
              filtering={tabFiltering.workspaces[0]()}
              filter={filter()}
              height={listHeight()}
            />
          </Match>
          <Match when={tab() === "templates"}>
            <TemplateList
              entries={filteredTemplates()}
              cursor={tabCursor.templates[0]()}
              filtering={tabFiltering.templates[0]()}
              filter={tabFilter.templates[0]()}
              height={listHeight()}
            />
          </Match>
          <Match when={tab() === "repos"}>
            <RepoList
              entries={filteredRepos()}
              cursor={tabCursor.repos[0]()}
              filtering={tabFiltering.repos[0]()}
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
      <box border title={detailBoxTitle()} flexDirection="column" flexGrow={2}>
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
          <Show when={tab() === "workspaces"}>
            <box flexDirection="column" paddingTop={1}>
              <ActionMenu ... />
            </box>
          </Show>
          <Show when={tab() === "templates"}>
            <box flexDirection="column" paddingTop={1}>
              <TemplateActionMenu ... />
            </box>
          </Show>
        </Show>
        <Show when={view().view === "confirm"}>
          <box flexDirection="column" paddingTop={2}>
            <ConfirmDialog ... />
          </box>
        </Show>
        <Show when={view().view === "inline-input"}>
          <box flexDirection="column" paddingTop={3}>
            <InlineInput ... />
          </box>
        </Show>
        <Show when={view().view === "progress"}>
          <ProgressView ... />
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
// Source: existing App.tsx selectedName() memo — extend for detail box title
const detailBoxTitle = createMemo(() => {
  const name = selectedName()
  if (!name) return ""
  return ` ${name} `
})
```

### HelpOverlay Full-Screen

```tsx
// Source: CONTEXT.md decisions
// HelpOverlay should fill the entire terminal area when open.
// In the refactored layout, render it as the sole child of the outer box when helpOpen().
// height="100%" on HelpOverlay box ensures it fills the outer column box.
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
// Source: SolidJS docs (createSignal, Show, For are verified SolidJS 1.x APIs)
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

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Single outer `<box>` with separator text | Two sibling bordered boxes | Phase 8 gap fix | Eliminates overflow from conditional rows |
| Computed `listHeight` / `detailHeight` pixel math | `flexGrow={3}` / `flexGrow={2}` | Phase 8 gap fix | More robust to terminal resize and conditional content |
| `<Show when={props.filter}>` for filter indicator | `<Show when={props.filtering}>` or App.tsx help bar | Phase 8 gap fix | Shows `filter: _` immediately on `/` press |
| Multiple `<Show>` for tab content | `<Switch><Match>` | Phase 8 gap fix | Clearer reconciler signal for exclusive branches |
| ActionMenu with own `border` and `width="50%"` | No border (detail box is container) + `paddingTop` | Phase 8 gap fix | No double borders; cleaner visual |

**Deprecated/outdated:**
- `DetailStatus.tsx`: retired in 08-02-PLAN execution; status info moved inline to WorkspaceDetail.
- Single-box layout with separator line: replaced by two-box layout.
- `detail-status` UIView variant: removed from `UIView` union.

## Open Questions

1. **FlexGrow vs pixel heights for 60/40 split**
   - What we know: OpenTUI uses Yoga flexbox. `flexGrow` is a valid prop per `Renderable.d.ts`.
   - What's unclear: Whether OpenTUI respects `flexGrow` correctly when one sibling has `height={1}` (the help bar). Need to verify that `flexGrow` distributes remaining space after the fixed help bar row.
   - Recommendation: Use `flexGrow` and test. If Yoga does not subtract the fixed-height bar from the available pool, fall back to computed heights (`dims().height - 1` for the two boxes' total, then split 60/40).

2. **Tab-switching reconciler bug — exact root cause**
   - What we know: `setTab()` is called (signal updates); rendered content does not switch; user can "get back to a working state" (suggesting state is correct, rendering is stale).
   - What's unclear: Whether the OpenTUI Solid reconciler has a known bug with `<Show>` on signal-dependent conditions at the same tree position. No official bug tracker entry found.
   - Recommendation: Implement `Switch/Match` pattern. If still broken, add `key` prop (if OpenTUI supports it) or use a factory memo.

3. **ActionMenu border removal vs keeping**
   - What we know: Removing borders from ActionMenu eliminates double-border visual. But CONTEXT.md says "detail box content is replaced by" action menu — the detail box's own border + title is preserved.
   - What's unclear: Whether ActionMenu needs any border at all, or just `paddingTop` for vertical positioning.
   - Recommendation: Remove `border` from ActionMenu and TemplateActionMenu. Add `paddingTop={1}` or `paddingTop={2}`. Verify visually.

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

### Sampling Rate
- **Per task commit:** `bun test tests/` (regression guard on lib code unchanged by this phase)
- **Per wave merge:** `bun test tests/`
- **Phase gate:** Manual UAT via `git-stacks manage` must pass all 13 test cases in 08-UAT.md before `/gsd:verify-work`

### Wave 0 Gaps
None — existing test infrastructure covers all automated requirements. Phase 8 gaps are TUI visual/interaction tests that require manual validation.

## Sources

### Primary (HIGH confidence)
- `node_modules/@opentui/core/Renderable.d.ts` — BoxOptions, LayoutOptions, flexGrow, minHeight, padding props verified
- `node_modules/@opentui/solid/src/types/elements.d.ts` — BoxProps, ScrollBoxProps, confirmed props mapping
- `node_modules/@opentui/solid/README.md` — render(), useKeyboard(), Portal, useRenderer() hooks
- `node_modules/@opentui/solid/src/elements/hooks.d.ts` — useKeyboard, useRenderer, useTerminalDimensions signatures
- `node_modules/@opentui/core/index.js.map` (source excerpt) — BoxOptions interface with gap, rowGap, columnGap, title, titleAlignment confirmed
- `src/tui/dashboard/App.tsx` (current implementation) — tab signal structure, existing keyboard handler, layout bugs confirmed
- `.planning/phases/08-dashboard-tab-layout/08-CONTEXT.md` — locked decisions, layout diagrams, UAT gap analysis
- `.planning/phases/08-dashboard-tab-layout/08-UAT.md` — 5 confirmed gap items with root causes

### Secondary (MEDIUM confidence)
- SolidJS `Switch/Match` documentation pattern — standard SolidJS API, verified against solid-js package usage in codebase
- `@opentui/solid/README.md` Portal section — Portal exists and mounts to renderer.root; useful for overlays if needed

### Tertiary (LOW confidence)
- Assumption that `flexGrow` distributes space correctly after a fixed-height sibling in OpenTUI's Yoga integration — needs empirical verification at runtime

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — OpenTUI types read directly from installed package
- Architecture (two-box layout): HIGH — locked in CONTEXT.md decisions; BoxOptions confirmed in types
- Tab-switching bug fix (Switch/Match): MEDIUM — idiomatic SolidJS fix; OpenTUI reconciler behavior with Switch vs Show not independently verified against OpenTUI source
- FlexGrow split: MEDIUM — props exist in Renderable.d.ts; runtime Yoga behavior with mixed fixed+flex siblings unverified
- Pitfalls: HIGH — root causes confirmed in UAT + code analysis

**Research date:** 2026-03-19
**Valid until:** 2026-04-19 (OpenTUI is actively developed; verify package version before significant new work)
