# Phase 9: IPC Push + Message Display — Research

**Researched:** 2026-03-20
**Domain:** SolidJS reactive state, OpenTUI TUI rendering, Unix socket IPC, JSONL message store
**Confidence:** HIGH — all findings verified directly against current codebase source files

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**From Phase 6 + Phase 8:**
- JSONL at `~/.config/git-stacks/messages/{workspace}.jsonl` — one file per workspace
- `MessageRecord`: `{ workspace, text, from?, timestamp }` (ISO-8601 timestamp)
- Unix socket at `/tmp/git-stacks.sock` — already implemented in `run.tsx`
- `onIpcMessage` callback exported from `run.tsx` — Phase 9 wires it into reactive state
- IPC is best-effort; file write is ground truth
- MSG-09: sent message appears within 1 second without manual `R` refresh
- Socket server lifecycle (stale detection, cleanup) already implemented

**List row message preview (Area A):**
- Replace the `created` date column when the workspace has messages; show created date when no messages
- Style: Sender + text in dim/gray, age in yellow
- Truncation: Fill remaining terminal width dynamically; ellipsis when text overflows
- No sender: Show just text + age, skip `sender:` prefix entirely
- Format: `sender: truncated text  age` or `truncated text  age`

**Detail pane message section (Area B — inline preview):**
- Flat chronological list with sender prefix, newest first
- Show last 10 messages in the inline detail pane; indicate count when more exist (`Messages (showing 10 of 24):`)
- Auto-dim messages older than 30 minutes (dim/gray text)
- No sender messages: show without prefix

**Message overlay (Area B — full view via `m` key):**
- Trigger: press `m` in Workspaces tab list view
- Full-screen overlay (like help overlay — replaces both list and detail boxes)
- Title: `{workspace_name} — Messages ({count})`
- Grouping: Messages grouped by sender with headers; each header shows sender name + count
- Group cursor: `j`/`k` or arrows navigate between sender groups; focused group has `▸` indicator
- Messages within groups: Newest first; all messages shown (no truncation in overlay)
- Staleness: Same 30-minute auto-dim rule applies
- No sender group: Grouped under `(system)` label
- Help: External help bar updates to show overlay keys

**Clear action (Area C):**
- `c` within the message overlay clears the focused sender group's messages
- `c` only available inside the message overlay, NOT from list view directly
- `m` key only available in Workspaces tab list view; does not conflict with existing keys
- After clear: Overlay stays open with updated message list; group removed if all messages cleared
- No separate "clear all" shortcut

**New UIView state:**
- Add `| { view: "messages"; workspaceName: string }` to the UIView union
- Takes over both boxes (like help overlay — controlled via signal)
- Blocks normal keyboard input; only `j`/`k`, `c`, `Esc` are active
- `Esc` returns to previous view (list)

### Claude's Discretion

- Reactive state shape for messages (signal per workspace, or single Map signal, or store)
- How `onIpcMessage` wires into reactive state (callback assignment in App.tsx or via a `useMessages` hook)
- Initial message load strategy (eager load all on dashboard start, or lazy per-workspace)
- Relative age formatting implementation (`2m`, `1h`, `3d` etc.)
- Scroll viewport math for the message overlay
- Whether message overlay uses its own component file or extends HelpOverlay pattern

### Deferred Ideas (OUT OF SCOPE)

- Message retention / TTL — auto-expire old messages; deferred to MSG-F03
- Auto-clear on workspace open — deferred to MSG-F02
- Clear all shortcut in overlay — user can clear groups one by one or use CLI `git-stacks message clear`; if needed, add later
- Message count badge in tab title — e.g. `[1 Workspaces (3)]` — could be a fast follow-up but not in Phase 9 scope
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| MSG-11 | Workspaces tab list row shows a notification indicator per workspace that has active messages: most recent sender (if set), truncated text, and relative age (e.g., "2m ago") | WorkspaceRow.tsx last `<text>` element holds created date — replace with message preview when messages exist; dynamic width via terminal dims |
| MSG-12 | Workspaces tab detail pane shows all active notifications for the selected workspace grouped by sender, with a per-sender `c` clear action | WorkspaceDetail.tsx has static `(no messages)` placeholder; replaces with reactive list from useMessages hook; `c` key only active in MessageOverlay |
</phase_requirements>

---

## Summary

Phase 9 is a pure TUI integration phase. The plumbing (JSONL store, IPC socket, `onIpcMessage` callback slot) is complete from Phase 6. Phase 8 delivered the two-box layout, UIView union, and keyboard routing infrastructure. Phase 9 has three well-bounded deliverables: (1) a `useMessages` reactive hook that loads JSONL on startup and accepts IPC push, (2) message preview in `WorkspaceRow` replacing the created date when messages exist, and (3) a `MessageOverlay` full-screen component triggered by `m` that shows grouped sender sections with per-sender `c` clear.

The critical integration point is `onIpcMessage` in `run.tsx` (currently `null`). Phase 9 must assign this callback early enough that it fires during IPC delivery. The safest pattern is assigning it inside `App()` using a stable function reference — not a closure that captures stale state. The SolidJS reactive store approach (using a `Map<workspaceName, MessageRecord[]>` signal) is the correct choice because it allows IPC push to update a single workspace's messages without re-computing all workspaces.

The message overlay mirrors `HelpOverlay` structurally — it is rendered at the `App` level with a `<Show when={messagesOpen()}>` gate that replaces both boxes. It uses its own `useKeyboard` handler (matching the HelpOverlay pattern) to consume `j`/`k`/`c`/`Esc` and block all other keys from reaching the parent App handler.

**Primary recommendation:** Implement as three sequential plans: (1) `useMessages` hook + IPC wiring, (2) WorkspaceRow preview + WorkspaceDetail inline list, (3) MessageOverlay full-screen component with group cursor and clear action.

---

## Standard Stack

### Core (all already in project — no new installs needed)

| Library | Version | Purpose | Notes |
|---------|---------|---------|-------|
| `solid-js` | ^1.9.11 | Reactive signals, `createSignal`, `createMemo`, `For`, `Show` | All reactive state patterns already established |
| `@opentui/solid` | ^0.1.87 | OpenTUI JSX renderer, `useKeyboard`, `useTerminalDimensions` | Full-screen overlay pattern confirmed from HelpOverlay |
| `@opentui/core` | ^0.1.87 | Terminal rendering engine | No direct use from Phase 9 code |
| Bun built-ins | runtime | `Bun.listen` Unix socket, `Bun.connect` | Already used in `run.tsx` |
| Node built-ins | runtime | `node:fs/promises` for JSONL read/write | Already used in `messages.ts` |

**No new dependencies required for Phase 9.**

### Patterns Already Established (verify before use)

| Pattern | Location | Phase 9 Use |
|---------|----------|-------------|
| Data hook | `hooks/useWorkspaces.ts` | Template for `useMessages.ts` |
| Full-screen overlay | `HelpOverlay.tsx` | Template for `MessageOverlay.tsx` |
| `<Show when={helpOpen()}>` gate in App | `App.tsx:524` | Same pattern for `messagesOpen()` |
| `useKeyboard` in child component | `HelpOverlay.tsx:11` | Same for MessageOverlay |
| `useTerminalDimensions` | `App.tsx:35` | Needed for truncation math in WorkspaceRow |
| `listMessages` / `clearMessages` | `src/lib/messages.ts` | Called by useMessages hook |
| `onIpcMessage` export | `run.tsx:14` | Must be assigned in App() or useMessages |

---

## Architecture Patterns

### Recommended Project Structure (additions only)

```
src/tui/dashboard/
├── hooks/
│   └── useMessages.ts       # NEW — reactive message state + IPC wiring
├── MessageOverlay.tsx        # NEW — full-screen grouped message view
├── WorkspaceRow.tsx          # MODIFY — add message preview column
├── WorkspaceDetail.tsx       # MODIFY — replace placeholder with live list
├── App.tsx                   # MODIFY — wire useMessages, m key, messagesOpen signal
└── types.ts                  # MODIFY — add messages UIView variant
```

### Pattern 1: useMessages Hook

**What:** A SolidJS hook that owns a `Map<workspaceName, MessageRecord[]>` signal, loads initial messages from JSONL files, and exposes a push function that gets assigned to `onIpcMessage`.

**When to use:** Called once from `App()` at initialization. The hook returns an accessor function `messagesFor(workspaceName)` and a `clearSender(workspaceName, sender)` async action.

**Design choice (Claude's discretion):** Single `createSignal<Map<string, MessageRecord[]>>` is the right reactive shape for this use case. A Map signal allows O(1) per-workspace lookup and means IPC push only needs to update one entry without scanning all workspaces.

**Eager vs. lazy loading:** Eager load all workspaces on startup is the correct choice. The list of workspaces is already loaded synchronously in `useWorkspaces`. Loading all message files in parallel on startup is cheap (files are small JSONL, most workspaces will have 0 messages). Lazy load adds complexity for marginal benefit.

**Example:**
```typescript
// Source: pattern derived from hooks/useWorkspaces.ts
import { createSignal, onCleanup } from "solid-js"
import { listWorkspaces } from "../../../lib/config"
import { listMessages, clearMessages, type MessageRecord } from "../../../lib/messages"
import { onIpcMessage } from "../run"  // assigning to this exported let

export function useMessages() {
  const [msgMap, setMsgMap] = createSignal<Map<string, MessageRecord[]>>(new Map())

  // Eager load all workspaces
  async function loadAll() {
    const workspaces = listWorkspaces()
    const results = await Promise.all(
      workspaces.map(async (ws) => {
        const msgs = await listMessages(ws.name)
        return [ws.name, msgs] as const
      })
    )
    const m = new Map<string, MessageRecord[]>()
    for (const [name, msgs] of results) m.set(name, msgs)
    setMsgMap(m)
  }

  // Wire IPC callback — newest first (prepend)
  // IMPORTANT: assign outside reactive scope to avoid stale closure
  const handleIpc = (record: MessageRecord) => {
    setMsgMap(prev => {
      const next = new Map(prev)
      const existing = next.get(record.workspace) ?? []
      next.set(record.workspace, [record, ...existing])
      return next
    })
  }
  // Assign to the mutable export slot
  // Import as a namespace to allow reassignment: import * as runModule from "../run"
  // then runModule.onIpcMessage = handleIpc
  // See Pattern 2 for the exact import form.

  loadAll()
  onCleanup(() => {
    // Nullify on unmount so stale TUI instances don't keep the callback
  })

  const messagesFor = (workspaceName: string): MessageRecord[] =>
    msgMap().get(workspaceName) ?? []

  async function clearSender(workspaceName: string, sender: string | undefined) {
    await clearMessages(workspaceName, sender)
    // Refresh this workspace's messages from disk after clear
    const refreshed = await listMessages(workspaceName)
    setMsgMap(prev => {
      const next = new Map(prev)
      next.set(workspaceName, refreshed)
      return next
    })
  }

  return { messagesFor, clearSender }
}
```

### Pattern 2: Assigning `onIpcMessage`

**Critical:** `onIpcMessage` is an exported `let` (mutable module binding). You cannot import it as a destructured value and reassign it — the reassignment won't affect the original module binding.

**Correct import form:**
```typescript
// In App.tsx or useMessages.ts:
import * as runModule from "../run"   // namespace import preserves the live binding
// Then assign:
runModule.onIpcMessage = (record) => { /* push to reactive store */ }
```

**Alternative (also correct):** Import a dedicated setter function from `run.tsx`:
```typescript
// Add to run.tsx:
export function setIpcCallback(fn: ((record: MessageRecord) => void) | null) {
  onIpcMessage = fn
}
// In App.tsx:
import { setIpcCallback } from "./run"
setIpcCallback((record) => pushToStore(record))
```

The setter function approach is cleaner and avoids exposing the mutable binding to callers. Either approach is valid — the planner should pick one and be consistent.

### Pattern 3: MessageOverlay Component

**What:** Full-screen overlay replacing both boxes, following HelpOverlay exactly.

**Structure:**
```tsx
// Source: pattern derived from HelpOverlay.tsx
export function MessageOverlay(props: {
  workspaceName: string
  messages: MessageRecord[]
  onClose: () => void
  onClearSender: (sender: string | undefined) => Promise<void>
}) {
  const [groupCursor, setGroupCursor] = createSignal(0)

  // Group messages by sender — undefined sender -> "(system)"
  const groups = createMemo(() => groupBySender(props.messages))

  useKeyboard((key) => {
    const len = groups().length
    if (key.name === "escape") { props.onClose(); return }
    if (key.name === "up" || key.name === "k") {
      setGroupCursor(c => Math.max(0, c - 1)); return
    }
    if (key.name === "down" || key.name === "j") {
      setGroupCursor(c => Math.min(len - 1, c + 1)); return
    }
    if (key.name === "c") {
      const focused = groups()[groupCursor()]
      if (focused) props.onClearSender(focused.sender)
      return
    }
  })

  return (
    <box border title={` ${props.workspaceName} — Messages (${props.messages.length}) `}
         flexDirection="column" height="100%" width="100%">
      {/* render groups */}
    </box>
  )
}
```

**App.tsx integration (mirrors helpOpen pattern exactly):**
```tsx
const [messagesOpen, setMessagesOpen] = createSignal(false)
const [messagesWorkspace, setMessagesWorkspace] = createSignal("")

// In useKeyboard, list view, workspaces tab:
if (key.name === "m" && tab() === "workspaces") {
  const name = currentEntry()?.workspace.name
  if (name) {
    setMessagesWorkspace(name)
    setMessagesOpen(true)
  }
  return
}
if (messagesOpen()) return  // block all other keys

// In JSX, before the helpOpen Show:
<Show when={messagesOpen()}>
  <MessageOverlay
    workspaceName={messagesWorkspace()}
    messages={messagesFor(messagesWorkspace())}
    onClose={() => setMessagesOpen(false)}
    onClearSender={(sender) => clearSender(messagesWorkspace(), sender)}
  />
</Show>
```

### Pattern 4: WorkspaceRow Message Preview

**What:** Replace the trailing `ws().created` text with message preview when messages exist.

**Key constraint from CONTEXT.md:** The last `<text>` element in WorkspaceRow currently contains `wt/tr counts + created date`. The approach is to keep wt/tr counts always, and replace only the created date portion with the message preview.

**Terminal width truncation:** `useTerminalDimensions` is already called in App.tsx but NOT in WorkspaceRow. The row receives its entry as props. Two approaches:

1. Pass `terminalWidth` as a prop from App.tsx down through WorkspaceList → WorkspaceRow (safe, no hook needed in row)
2. Call `useTerminalDimensions` directly in WorkspaceRow (also valid — OpenTUI hooks work anywhere in the component tree)

Approach 2 is simpler (no prop drilling). The column widths are: prefix(5) + status(2) + name(23) + branch(33) + wt/tr counts(~14) = ~77 chars fixed. Remaining = `terminalWidth - 77`. Truncate the preview text to fit, append ellipsis.

**Example:**
```tsx
// In WorkspaceRow.tsx
const dims = useTerminalDimensions()
const preview = createMemo(() => {
  const msgs = props.messages  // passed as prop from parent
  if (!msgs || msgs.length === 0) return null
  return msgs[0]  // most recent (listMessages returns newest-first)
})
const previewText = createMemo(() => {
  const msg = preview()
  if (!msg) return `  ${ws().created}`
  const age = formatAge(msg.timestamp)
  const prefix = msg.from ? `${msg.from}: ` : ""
  const available = Math.max(10, dims().width - 77 - age.length - 3)
  const text = prefix + msg.text
  const truncated = text.length > available ? text.slice(0, available - 1) + "…" : text
  return `  ${truncated}  `
})
```

### Pattern 5: Relative Age Formatting

**No library needed.** Simple pure function, <10 lines:

```typescript
// Source: standard relative time implementation
export function formatAge(isoTimestamp: string): string {
  const diffMs = Date.now() - new Date(isoTimestamp).getTime()
  const diffSecs = Math.floor(diffMs / 1000)
  if (diffSecs < 60) return `${diffSecs}s`
  const diffMins = Math.floor(diffSecs / 60)
  if (diffMins < 60) return `${diffMins}m`
  const diffHours = Math.floor(diffMins / 60)
  if (diffHours < 24) return `${diffHours}h`
  const diffDays = Math.floor(diffHours / 24)
  return `${diffDays}d`
}

export function isStale(isoTimestamp: string, thresholdMs = 30 * 60 * 1000): boolean {
  return Date.now() - new Date(isoTimestamp).getTime() > thresholdMs
}
```

Place these in `useMessages.ts` or a new `src/tui/dashboard/messageUtils.ts`. Both are fine; the planner should pick one location.

### Pattern 6: Grouping Messages by Sender

**No library needed.** Pure function operating on `MessageRecord[]`:

```typescript
export type SenderGroup = {
  sender: string | undefined   // undefined = "(system)"
  label: string                // "(system)" or sender name
  messages: MessageRecord[]    // newest first within group
}

export function groupBySender(messages: MessageRecord[]): SenderGroup[] {
  const map = new Map<string | undefined, MessageRecord[]>()
  for (const msg of messages) {
    const key = msg.from ?? undefined
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(msg)
  }
  // Return groups sorted by most recent message across all groups
  return Array.from(map.entries()).map(([sender, msgs]) => ({
    sender,
    label: sender ?? "(system)",
    messages: msgs,  // already newest-first from listMessages
  }))
}
```

### Anti-Patterns to Avoid

- **Importing `onIpcMessage` as a destructured value and reassigning:** `import { onIpcMessage } from "./run"; onIpcMessage = fn` — this reassigns the local binding only; the `run.tsx` module's binding remains `null`. Use namespace import or a setter function.
- **Putting `useKeyboard` in MessageOverlay but not returning early from App's keyboard handler:** App.tsx must check `messagesOpen()` and return early (just like `helpOpen()` on line 383), otherwise both handlers fire on the same keypress.
- **Using `createEffect` to call `onIpcMessage` assignment inside reactive scope:** The assignment must happen once during initialization, not inside a reactive effect that may re-run.
- **Calling `clearMessages` without refreshing the reactive state:** After clearing, the hook must re-read the JSONL file and update the signal, otherwise the overlay shows stale data.
- **Nested `<text>` elements:** The OpenTUI renderer crashes on nested `<text>` elements (documented in project memory). In WorkspaceRow, keep the message preview as a sibling `<text>` in the `<box flexDirection="row">`, not nested inside another `<text>`.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Message persistence | Custom file format | `listMessages()` / `clearMessages()` in `src/lib/messages.ts` | Already handles JSONL parse, reverse sort, per-sender filter, edge cases |
| IPC delivery | Socket listener | `run.tsx` socket server + `onIpcMessage` callback slot | Already implemented; stale detection, unref, cleanup all handled |
| Reactive signals | Custom pub-sub | SolidJS `createSignal` / `createMemo` | OpenTUI renders are driven by SolidJS reactivity; custom state won't trigger re-renders |
| Age formatting | date-fns / moment | 10-line pure function | No date library is in the project; adding one for 2 functions is wasteful |

**Key insight:** Phase 9 is purely wiring — connecting existing `messages.ts` data layer to existing `run.tsx` IPC slot into existing SolidJS reactive infrastructure. Every "complex" sub-problem is already solved.

---

## Common Pitfalls

### Pitfall 1: Stale `onIpcMessage` Closure

**What goes wrong:** IPC message arrives after the component re-renders; the callback holds a stale reference to `setMsgMap` from an old render cycle.

**Why it happens:** If `onIpcMessage` is assigned inside a reactive effect that closes over local variables, SolidJS may re-run the effect and create a new function — but the `run.tsx` binding still points to the old one.

**How to avoid:** Assign `onIpcMessage` exactly once during component initialization (not inside `createEffect`). Since `setMsgMap` from `createSignal` is a stable reference in SolidJS (does not change between renders), the closure is safe.

**Warning signs:** IPC messages stop updating after any state change in the dashboard.

### Pitfall 2: `m` Key Conflict with Existing Bindings

**What goes wrong:** `m` key fires when in batch-select mode or other sub-views.

**Why it happens:** Looking at App.tsx, the batch operation block (lines 493-502) checks `selected().size > 0` before `c` and `r` batch keys. The `m` key is not currently used in any tab, but the keyboard guard must be in the right position.

**How to avoid:** Place the `m` key handler inside the `if (v.view === "list")` block, after the existing tab check `if (tab() === "workspaces")`. Specifically, it must be after the batch-operation block (lines 493-502) to avoid accidental triggering when items are selected. Or make it conditional: `if (key.name === "m" && tab() === "workspaces" && selected().size === 0)`.

**Warning signs:** `m` opens message overlay while batch items are selected, or `m` fires in Templates tab.

### Pitfall 3: `messagesOpen` Must Block App Keyboard Handler

**What goes wrong:** Pressing `j`/`k` in the message overlay also moves the workspace list cursor.

**Why it happens:** App.tsx keyboard handler and MessageOverlay's `useKeyboard` both fire for the same keypress. Without an early-return guard in App.tsx, both handle `j`/`k`.

**How to avoid:** Add to App.tsx keyboard handler (immediately after the `helpOpen` guard on line 383):
```typescript
if (messagesOpen()) return  // MessageOverlay handles its own keys
```

**Warning signs:** Cursor moves in the background list while message overlay is open.

### Pitfall 4: WorkspaceRow Receives Messages as Prop vs. Hook Inside Row

**What goes wrong:** If messages are loaded via a hook call inside WorkspaceRow (e.g., `createMemo(() => listMessages(ws.name))`), each row triggers async I/O on every render, causing flicker and race conditions.

**Why it happens:** `listMessages` is async. Calling it inside a row component without proper async handling causes undefined intermediate state.

**How to avoid:** Messages MUST be loaded once in the `useMessages` hook and passed down as props to WorkspaceRow. The row accesses `props.messages[0]` synchronously — no async in the row itself.

**Warning signs:** Flicker in the workspace list during message display, or TypeScript errors about `Promise` vs. `MessageRecord[]`.

### Pitfall 5: Map Signal Referential Equality

**What goes wrong:** `setMsgMap(prev => { prev.set(...); return prev })` — mutating the Map in place and returning the same reference. SolidJS signal setter does an identity check; returning the same reference means no re-render fires.

**Why it happens:** JavaScript Map is mutable; `prev.set()` mutates in place and returns the same object.

**How to avoid:** Always create a new Map: `setMsgMap(prev => { const next = new Map(prev); next.set(...); return next })`.

**Warning signs:** IPC messages arrive (visible in console logs) but the UI does not update.

### Pitfall 6: Nested `<text>` Elements in OpenTUI

**What goes wrong:** OpenTUI crashes or produces garbled output when `<text>` elements are nested inside other `<text>` elements.

**Why it happens:** OpenTUI terminal renderer does not support nested text nodes (documented in project memory `feedback_opentui_no_nested_text.md`).

**How to avoid:** For inline styled spans, use sibling `<text>` elements inside a `<box flexDirection="row">`. Never nest `<text>` inside `<text>`.

---

## Code Examples

### Verified Pattern: useWorkspaces Hook (model to follow)

```typescript
// Source: src/tui/dashboard/hooks/useWorkspaces.ts (current codebase)
import { createSignal, onCleanup } from "solid-js"
// Uses: createSignal for state, onCleanup for teardown
// Pattern: synchronous initial setup, async background loading
// Phase 9 follows this exact pattern
```

### Verified Pattern: Help Overlay Gate in App.tsx

```tsx
// Source: App.tsx:377-383 (current codebase)
if (key.name === "?" && !filtering()) {
  if (helpOpen()) { setHelpOpen(false); return }
  setHelpOpen(true)
  return
}
if (helpOpen()) return  // block all other keys when help is open

// MessageOverlay gate follows this pattern exactly:
if (key.name === "m" && tab() === "workspaces" && v.view === "list") {
  // ... set messagesOpen(true)
  return
}
if (messagesOpen()) return
```

### Verified Pattern: HelpOverlay `useKeyboard` (model for MessageOverlay)

```tsx
// Source: HelpOverlay.tsx:11-13 (current codebase)
useKeyboard((key) => {
  if (key.name === "escape" || key.name === "?") props.onClose()
})
```

### Verified Pattern: WorkspaceRow Last Column (current)

```tsx
// Source: WorkspaceRow.tsx:38-42 (current codebase)
<text fg="gray">
  {` ${wtCount()}wt ${trCount()}tr`}
  {dirtyCount() > 0 ? ` ~${dirtyCount()}` : ""}
  {`  ${ws().created}`}
</text>
```

Phase 9 adds a `messages` prop and replaces `ws().created` conditionally within this same `<text>` element. The wt/tr counts always appear. The created date is replaced only when `props.messages.length > 0`.

### Verified Pattern: messages.ts API (ground truth)

```typescript
// Source: src/lib/messages.ts (current codebase)
export async function listMessages(workspace: string): Promise<MessageRecord[]>
// Returns: newest-first array; empty array if file doesn't exist

export async function clearMessages(workspace: string, fromSender?: string): Promise<void>
// No sender = clear all for workspace; with sender = filter that sender out and rewrite

export interface MessageRecord {
  workspace: string
  text: string
  from?: string
  timestamp: string  // ISO-8601
}
```

### Verified Pattern: onIpcMessage Slot (run.tsx)

```typescript
// Source: run.tsx:14 (current codebase)
export let onIpcMessage: ((record: MessageRecord) => void) | null = null
// Called in the socket data handler: onIpcMessage?.(record)
// Phase 9 sets this once during App initialization
```

---

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|------------------|--------|
| Phase 6 left `onIpcMessage = null` | Phase 9 assigns the callback | Without this, IPC push is silently discarded even though socket is open |
| WorkspaceDetail shows static `(no messages)` | Phase 9 renders live message list | MSG-12 fulfilled |
| WorkspaceRow shows only created date | Phase 9 replaces with message preview when messages exist | MSG-11 fulfilled |

---

## Open Questions

1. **Where to define `formatAge` and `groupBySender` utilities**
   - What we know: Both are pure functions needed by WorkspaceRow, WorkspaceDetail, and MessageOverlay
   - What's unclear: Single `messageUtils.ts` vs. inside `useMessages.ts`
   - Recommendation: Create `src/tui/dashboard/messageUtils.ts` — keeps the hook focused on reactive state, makes utilities independently testable

2. **Whether to pass `messages` as a prop to WorkspaceRow or derive it inside WorkspaceList**
   - What we know: WorkspaceList already receives `entries` as props; WorkspaceRow is rendered per entry
   - What's unclear: Whether WorkspaceList should call `messagesFor(entry.workspace.name)` and pass result down, or whether a different data path is cleaner
   - Recommendation: WorkspaceList receives `messagesFor` accessor as a prop from App.tsx; WorkspaceList calls it per row — keeps WorkspaceRow a pure display component

3. **Scroll viewport for MessageOverlay**
   - What we know: The overlay is full-screen; number of messages per sender can be large; `useTerminalDimensions` is available
   - What's unclear: Whether OpenTUI supports scroll natively, or whether Phase 9 must implement offset-based slicing (like WorkspaceList does)
   - Recommendation: Use offset-based slicing following the WorkspaceList pattern (lines 17-21 in WorkspaceList.tsx) — this is proven to work in OpenTUI

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | bun:test (Jest-compatible) |
| Config file | none — `bun test tests/` |
| Quick run command | `bun test tests/lib/messages.test.ts` |
| Full suite command | `bun test tests/` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| MSG-11 | WorkspaceRow shows message preview (sender, text, age) when messages exist | unit | `bun test tests/tui/messageUtils.test.ts` | Wave 0 |
| MSG-11 | WorkspaceRow shows created date when no messages | unit | `bun test tests/tui/messageUtils.test.ts` | Wave 0 |
| MSG-11 | Message preview truncates text to fit terminal width | unit | `bun test tests/tui/messageUtils.test.ts` | Wave 0 |
| MSG-12 | Detail pane shows last 10 messages, newest first | unit | `bun test tests/tui/messageUtils.test.ts` | Wave 0 |
| MSG-12 | Messages older than 30 minutes are flagged as stale | unit | `bun test tests/tui/messageUtils.test.ts` | Wave 0 |
| MSG-12 | clearSender removes correct sender's messages and refreshes state | unit | `bun test tests/tui/useMessages.test.ts` | Wave 0 |
| MSG-09 | IPC push updates reactive state within 1s | manual-only | — | Manual — requires live TUI + socket |
| MSG-12 | `c` key in overlay clears focused sender group, others remain | manual-only | — | Manual — TUI keyboard interaction |

### Notes on Test Scope

TUI component rendering (WorkspaceRow, MessageOverlay) cannot be unit-tested without an OpenTUI test renderer — none exists in the project. Tests focus on the pure logic extracted from components:
- `formatAge()` and `isStale()` from messageUtils
- `groupBySender()` from messageUtils
- `useMessages` hook's load/push/clear behavior (tested against real JSONL files, following `messages.test.ts` pattern)

The existing `tests/lib/messages.test.ts` already covers `listMessages` and `clearMessages` thoroughly. Phase 9 tests extend that coverage to the reactive layer.

### Sampling Rate

- Per task commit: `bun test tests/lib/messages.test.ts tests/tui/`
- Per wave merge: `bun test tests/`
- Phase gate: Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `tests/tui/messageUtils.test.ts` — covers `formatAge`, `isStale`, `groupBySender`, truncation math (MSG-11, MSG-12)
- [ ] `tests/tui/useMessages.test.ts` — covers load-from-JSONL, IPC push, clearSender refresh (MSG-12)
- [ ] `tests/tui/` directory — does not exist; create it

*(Note: `tests/lib/messages.test.ts` already covers the underlying JSONL store — no gaps there)*

---

## Sources

### Primary (HIGH confidence — verified directly against codebase)

- `src/tui/dashboard/run.tsx` — `onIpcMessage` export, socket lifecycle
- `src/tui/dashboard/App.tsx` — keyboard handler structure, helpOpen pattern, tab signal, UIView usage
- `src/tui/dashboard/HelpOverlay.tsx` — full-screen overlay pattern with `useKeyboard`
- `src/tui/dashboard/WorkspaceRow.tsx` — exact column layout, `<text>` structure
- `src/tui/dashboard/WorkspaceDetail.tsx` — static placeholder location
- `src/tui/dashboard/WorkspaceList.tsx` — scroll viewport pattern (offset-based slicing)
- `src/tui/dashboard/hooks/useWorkspaces.ts` — data hook pattern (signal, onCleanup, reload)
- `src/tui/dashboard/types.ts` — UIView union, Action union, Tab type
- `src/lib/messages.ts` — `MessageRecord`, `listMessages`, `clearMessages`, `pushToSocket`
- `src/lib/paths.ts` — `MESSAGES_DIR` constant
- `tests/lib/messages.test.ts` — existing test coverage, pattern for new tests
- `.planning/phases/09-ipc-push-message-display/09-CONTEXT.md` — locked decisions
- `.planning/REQUIREMENTS.md` — MSG-11, MSG-12 specifications

### Secondary (MEDIUM confidence)

- `.planning/phases/08-dashboard-tab-layout/08-CONTEXT.md` — two-box layout decisions, UIView history
- Project memory `feedback_opentui_no_nested_text.md` — OpenTUI nested `<text>` crash constraint

---

## Metadata

**Confidence breakdown:**
- Standard Stack: HIGH — no new dependencies; all existing packages verified in package.json
- Architecture: HIGH — all patterns verified against current source files
- Pitfalls: HIGH — each pitfall derived from actual codebase constraints (mutable export, Map identity, nested text elements)
- Validation: HIGH — test framework and existing test file patterns confirmed

**Research date:** 2026-03-20
**Valid until:** 2026-04-20 (stable — no external dependencies changing)
