# Phase 9: IPC Push + Message Display — Context

**Gathered:** 2026-03-20
**Status:** Ready for planning

<domain>
## Phase Boundary

Wire live Unix socket delivery into the dashboard and build message display UI. Workspace list rows show a message preview; pressing `m` opens a full-screen message overlay with grouped sender sections and per-sender clear. Phase 6's JSONL store and IPC socket are the foundation — this phase is purely TUI integration.

</domain>

<decisions>
## Implementation Decisions

### Already decided (from Phase 6 + Phase 8)

- JSONL at `~/.config/git-stacks/messages/{workspace}.jsonl` — one file per workspace
- `MessageRecord`: `{ workspace, text, from?, timestamp }`
- Unix socket at `/tmp/git-stacks.sock` — already implemented in `run.tsx`
- `onIpcMessage` callback exported from `run.tsx` — Phase 9 wires it into reactive state
- IPC is best-effort; file write is ground truth
- MSG-09: sent message appears within 1 second without manual `R` refresh
- Socket server lifecycle (stale detection, cleanup) already implemented

### List row message preview (Area A)

- **Placement**: Replace the `created` date column when the workspace has messages; show created date when no messages
- **Style**: Sender + text in dim/gray, age in yellow
- **Truncation**: Fill remaining terminal width dynamically (after name, branch, wt/tr columns); ellipsis when text overflows
- **No sender**: Show just text + age, no prefix (skip `sender:` entirely)
- **Format**: `sender: truncated text  age` or `truncated text  age` (no sender)

### Detail pane message section (Area B — inline preview)

- **Layout**: Flat chronological list with sender prefix, newest first
- **Density**: Show last 10 messages in the inline detail pane; indicate count when more exist (`Messages (showing 10 of 24):`)
- **Staleness**: Auto-dim messages older than 30 minutes (dim/gray text)
- **No sender messages**: Show without prefix, same as list row

### Message overlay (Area B — full view via `m` key)

- **Trigger**: Press `m` in Workspaces tab list view to open message overlay
- **Structure**: Full-screen overlay (like help overlay — replaces both list and detail boxes)
- **Title**: `{workspace_name} — Messages ({count})`
- **Grouping**: Messages grouped by sender with headers; each header shows sender name + count
- **Group cursor**: `j`/`k` or arrows navigate between sender groups; focused group has `▸` indicator
- **Messages within groups**: Newest first; all messages shown (no truncation in overlay)
- **Staleness**: Same 30-minute auto-dim rule applies
- **No sender group**: Grouped under `(system)` label
- **Help**: External help bar updates to show overlay keys (not inline footer)

### Clear action (Area C)

- **Key**: `c` within the message overlay clears the focused sender group's messages
- **Scope**: `c` is only available inside the message overlay, NOT from list view directly
- **`m` key**: Only available in Workspaces tab list view; does not conflict with any existing key
- **After clear**: Overlay stays open with updated message list; group removed if all its messages were cleared
- **Clear all**: No separate "clear all" shortcut — user can `c` each group, or use CLI `git-stacks message clear`

### New UIView state

Add `| { view: "messages"; workspaceName: string }` to the UIView union. This view:
- Takes over both boxes (like help overlay — controlled via `helpOpen`-style boolean or the view signal)
- Blocks normal keyboard input; only `j`/`k`, `c`, `Esc` are active
- `Esc` returns to previous view (list)

### Claude's Discretion

- Reactive state shape for messages (signal per workspace, or single Map signal, or store)
- How `onIpcMessage` wires into reactive state (callback assignment in App.tsx or via a `useMessages` hook)
- Initial message load strategy (eager load all on dashboard start, or lazy per-workspace)
- Relative age formatting implementation (`2m`, `1h`, `3d` etc.)
- Scroll viewport math for the message overlay
- Whether message overlay uses its own component file or extends HelpOverlay pattern

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements
- `.planning/REQUIREMENTS.md` MSG-11, MSG-12 — message display in workspace list and detail pane

### Primary files to modify
- `src/tui/dashboard/App.tsx` — wire `onIpcMessage`, add `m` key handler, render message overlay
- `src/tui/dashboard/WorkspaceRow.tsx` — add message preview column (replaces created date)
- `src/tui/dashboard/WorkspaceDetail.tsx` — replace static placeholder with live message list (last 10)
- `src/tui/dashboard/types.ts` — add `messages` UIView variant
- `src/tui/dashboard/run.tsx` — `onIpcMessage` already exported; Phase 9 assigns the callback

### New files expected
- `src/tui/dashboard/MessageOverlay.tsx` — full-screen grouped message view with sender cursor and clear action
- `src/tui/dashboard/hooks/useMessages.ts` — reactive message state: load from JSONL, accept IPC push, expose per-workspace accessor

### Existing code to integrate
- `src/lib/messages.ts` — `listMessages()`, `clearMessages()`, `MessageRecord` type
- `src/lib/paths.ts` — `MESSAGES_DIR` constant
- `src/tui/dashboard/HelpOverlay.tsx` — full-screen overlay pattern to follow
- `src/tui/dashboard/hooks/useWorkspaces.ts` — data hook pattern to follow

### Prior phase patterns
- Phase 8 `08-CONTEXT.md` — two-box layout, height-based visibility, UIView union, keyboard routing
- Phase 6 `06-CONTEXT.md` — message store decisions, IPC behavior

</canonical_refs>

<code_context>
## Existing Code Insights

### IPC callback hook point (run.tsx:14)
```ts
export let onIpcMessage: ((record: MessageRecord) => void) | null = null
```
Phase 9 assigns this to push records into the reactive message store. Must be set before `render()` returns or immediately after.

### WorkspaceRow current layout (WorkspaceRow.tsx:28-44)
```tsx
<box height={1} flexDirection="row">
  <text>{prefix()} </text>
  <StatusIndicator status={...} />
  <text fg="white"> {ws().name.padEnd(22)}</text>
  <text fg="cyan"> {ws().branch.padEnd(32)}</text>
  <text fg="gray">{` ${wtCount()}wt ${trCount()}tr`}{dirtyCount()}{`  ${ws().created}`}</text>
</box>
```
The last `<text>` element contains wt/tr counts and created date. When messages exist, replace `ws().created` with dim sender+text + yellow age.

### WorkspaceDetail placeholder (WorkspaceDetail.tsx:43-44)
```tsx
<text fg="white">  Messages:</text>
<text fg="gray">  (no messages)</text>
```
Replace with reactive message list from `useMessages` hook.

### Help overlay pattern (App.tsx:524-526)
```tsx
<Show when={helpOpen()}>
  <HelpOverlay tab={tab()} onClose={() => setHelpOpen(false)} />
</Show>
```
Message overlay follows this same pattern: `<Show when={messagesOpen()}>`.

### Keyboard routing (App.tsx:374)
`m` key handler goes in the list-view block (App.tsx:447-518), after the `R`/refresh handler. Only active when `tab() === "workspaces"`.

</code_context>

<deferred>
## Deferred Ideas

- **Message retention / TTL** — auto-expire old messages; deferred to MSG-F03
- **Auto-clear on workspace open** — deferred to MSG-F02
- **Clear all shortcut in overlay** — user can clear groups one by one or use CLI `git-stacks message clear`; if needed, add later
- **Message count badge in tab title** — e.g. `[1 Workspaces (3)]` — could be a fast follow-up but not in Phase 9 scope

</deferred>

---

*Phase: 09-ipc-push-message-display*
*Context gathered: 2026-03-20*
