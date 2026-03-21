# Phase 12: workspace-sync — Research

**Researched:** 2026-03-21
**Domain:** SolidJS TUI (OpenTUI) — dashboard action dispatch, progress display, async sync integration
**Confidence:** HIGH (all findings from direct source inspection, no external library research needed)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Live status table — one line per repo that updates in-place as status changes (pending → fetching → rebasing → done/skipped)
- **D-02:** Each repo line shows: repo name, current status indicator (spinner while active, checkmark on success, warning on skip/fail), and result detail (commit count or skip reason)
- **D-03:** This requires a new component (or ProgressView enhancement) that supports in-place line updates rather than append-only — future-proofs for parallel sync
- **D-04:** Always use best-effort mode (`bestEffort: true`) — skip conflicting repos automatically, do not abort the entire sync
- **D-05:** Skipped repos are visually prominent: warning indicator + conflict file list shown beneath the repo line
- **D-06:** No pre-check dialog — conflicts surface during execution and are displayed inline
- **D-07:** Show a confirm dialog before starting sync (e.g., "Sync workspace-name? (rebase from upstream)")
- **D-08:** Follow the existing confirm → progress pattern used by clean/remove/merge actions
- **D-09:** Strategy is always `rebase` in TUI — no strategy selection UI (per REQUIREMENTS Out of Scope)
- **D-10:** Timeout: unreachable remote must fail within 30 seconds (WS-04) — use git fetch timeout mechanism
- **D-11:** All keybindings blocked during sync progress (no double-dispatch)

### Claude's Discretion

- Exact spinner/indicator characters and colors
- Whether to enhance existing ProgressView or create a new SyncProgressView component
- Git fetch timeout implementation detail (signal abort vs git config)
- Line layout spacing in the status table

### Deferred Ideas (OUT OF SCOPE)

- Batch sync (all workspaces from TUI) — explicitly deferred to CLI `--all` (WS-05)
- Parallel per-repo sync execution — current `syncWorkspace()` is sequential; the live status table UI is ready for it but the backend change is out of scope
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| WS-01 | User can trigger workspace sync from the Workspaces tab action menu without leaving the TUI | Add `"sync"` to `Action` union, add `s` key to `ActionMenu`, add sync case in `runAction()` → confirm → `executeConfirmed()` |
| WS-02 | Sync shows per-repo progress in ProgressView while running (repo name + status line per repo) | `syncWorkspace()` already calls `onProgress()` per repo; new `SyncProgressView` or enhanced `ProgressView` accepts structured per-repo state for in-place updates |
| WS-03 | Sync completes with a result summary (N synced, N skipped/failed) | `SyncResult` already returns `synced[]` and `skipped[]` arrays; summary built from them after `syncWorkspace()` resolves |
| WS-04 | Sync on unreachable remote fails with clear error within 30 seconds (no hang) | `fetchOrigin()` in `git.ts` currently has no timeout; must add a 30-second `AbortSignal` using `Promise.race()` or `git fetch --timeout` — this is a required backend change before the TUI ships |
</phase_requirements>

---

## Summary

Phase 12 wires workspace sync into the TUI dashboard. The backend — `syncWorkspace()` in `workspace-ops.ts` plus the supporting git primitives in `git.ts` — is fully implemented and already called by the CLI. The TUI work is pure integration: extend the action dispatch pipeline (types → ActionMenu → App.tsx), add the confirm step, call `syncWorkspace()` with the existing `onProgress` callback feeding a progress view, and display the `SyncResult` summary when done.

The one required backend change before this phase ships is adding a 30-second timeout to `fetchOrigin()` in `git.ts`. Currently `git fetch origin` runs without any timeout guard; an unreachable remote will hang indefinitely. This must be fixed to satisfy WS-04. The fix is small: wrap the Bun `$` shell invocation with a `Promise.race()` against a timeout signal, or pass `--connect-timeout 30` as a git flag.

The progress display decision (D-03) introduces the only design fork: whether to enhance the existing `ProgressView` (append-only log) with per-repo structured state, or create a new `SyncProgressView` component that accepts an array of per-repo status objects and renders them with in-place updates. Either works with SolidJS reactive signals. The new component path is cleaner — it keeps `ProgressView` simple and gives the planner a discrete unit of work.

**Primary recommendation:** Create `SyncProgressView.tsx` as a distinct component accepting a `SyncRow[]` signal; keep `ProgressView.tsx` unchanged. This is simpler than parameterizing `ProgressView` with a conditional render mode.

---

## Standard Stack

This phase uses no new libraries. All dependencies are already installed.

### Core (all already present)

| Library | Purpose | Reference |
|---------|---------|-----------|
| `@opentui/solid` | TUI renderer, `testRender`, `useKeyboard`, `For`, `Show` | all existing dashboard components |
| `opentui-spinner/solid` | `<spinner name="dots" color="cyan" />` for in-progress indicator | `ProgressView.tsx` line 2 |
| `solid-js` | `createSignal`, `For`, `Show`, `Switch`, `Match` | all TSX files |
| `bun` (`$` shell) | git subprocess calls in `git.ts` | `git.ts` |
| `bun:test` | test framework | all `*.test.tsx` files |

**Installation:** Nothing new needed.

---

## Architecture Patterns

### Existing Action Dispatch Pipeline

The complete flow for `clean`, `remove`, `merge` is:

```
ActionMenu [key shortcut] → props.onAction(action)
  → App.tsx: runAction(action, index)
    → setView({ view: "confirm", index, action })
      → ConfirmDialog [y/n]
        → executeConfirmed(action, index)
          → setView({ view: "progress", message: "..." })
          → await workspaceOp(name, opts, onProgress)
            → onProgress callbacks → setProgressLines(prev => [...prev, msg])
          → setProgressDone(true)
            → [any key] → reload() + setView({ view: "list" })
```

Sync follows exactly this pipeline. The only divergence is:
1. The progress view displays **per-repo structured state** (in-place updates) rather than the append-only log pattern
2. After `syncWorkspace()` resolves, a **summary line** is appended from the `SyncResult` return value

### Pattern 1: Extending the Action Type Union

**File:** `src/tui/dashboard/types.ts`

```typescript
// Add "sync" to the Action union — current definition:
export type Action = "open" | "edit" | "rename" | "clean" | "remove" | "merge"
// After change:
export type Action = "open" | "edit" | "rename" | "clean" | "remove" | "merge" | "sync"
```

No other type changes are strictly required — `UIView` already has `{ view: "progress"; message: string }`. The SyncProgressView can be shown under this view variant if it receives its data via separate signals, or a new variant `{ view: "sync-progress"; message: string }` can be added if the planner prefers discriminated dispatch. Either is valid.

### Pattern 2: ActionMenu Extension

**File:** `src/tui/dashboard/ActionMenu.tsx`

The `actions` array is module-level (static). Add sync at the end:

```typescript
const actions: { key: string; action: Action; label: string }[] = [
  { key: "o", action: "open",   label: "Open" },
  { key: "n", action: "rename", label: "Rename" },
  { key: "e", action: "edit",   label: "Edit ($EDITOR)" },
  { key: "c", action: "clean",  label: "Clean" },
  { key: "r", action: "remove", label: "Remove" },
  { key: "m", action: "merge",  label: "Merge" },
  { key: "s", action: "sync",   label: "Sync" },   // NEW
]
```

The existing letter-shortcut handler loop already covers new entries — no handler changes needed.

### Pattern 3: App.tsx runAction and executeConfirmed

**File:** `src/tui/dashboard/App.tsx`

In `runAction()`: add a case for `"sync"` that sets `view({ view: "confirm", index, action: "sync" })`.

In `executeConfirmed()`: add a `case "sync":` in the switch:

```typescript
case "sync":
  result = await syncWorkspace(wsName, { strategy: "rebase", bestEffort: true }, onProgress)
  // after loop, build summary from SyncResult
  break
```

`syncWorkspace` returns `SyncResult` not `{ ok, error? }` — the switch must handle this difference. After the loop, append the summary line to `progressLines`.

### Pattern 4: SyncProgressView Component (new file)

**File:** `src/tui/dashboard/SyncProgressView.tsx`

The existing `ProgressView` renders an append-only log. For in-place per-repo updates, a `SyncProgressView` accepts:

```typescript
type SyncRow = {
  repo: string
  status: "pending" | "fetching" | "synced" | "skipped" | "failed"
  detail: string        // commit count or skip reason or empty
}

type Props = {
  rows: SyncRow[]
  done: boolean
  summary?: string
}
```

SolidJS `For` over `rows` re-renders each row reactively as signals change. Because `rows` is a signal containing an array of plain objects, updating the array (replacing it with a new array) triggers re-render of all rows. For true in-place updates without full list re-render, use `createStore` from `solid-js/store` — but for sequential sync (one repo at a time), a simple signal with array replacement is fine and matches existing patterns.

**Render structure:**

```tsx
<box flexDirection="column">
  <Show when={!props.done}>
    <box flexDirection="row" height={1}>
      <spinner name="dots" color="cyan" />
      <text fg="white"> Syncing...</text>
    </box>
  </Show>
  <For each={props.rows}>
    {(row) => (
      <box flexDirection="row" height={1}>
        <text fg={indicatorColor(row.status)}>{indicatorChar(row.status)} </text>
        <text fg="white">{row.repo}</text>
        <text fg="gray">  {row.detail}</text>
      </box>
    )}
  </For>
  <Show when={props.done}>
    <text fg="green">{"\n"}  {props.summary}. Press any key to continue.</text>
  </Show>
</box>
```

### Pattern 5: fetchOrigin Timeout (required backend change)

**File:** `src/lib/git.ts`

Current implementation has no timeout:
```typescript
export async function fetchOrigin(repoPath: string): Promise<void> {
  await $`git -C ${repoPath} fetch origin`.quiet()
}
```

**Option A — git flag (simplest, recommended):**
```typescript
export async function fetchOrigin(repoPath: string, timeoutSeconds = 30): Promise<void> {
  await $`git -C ${repoPath} fetch origin --connect-timeout ${timeoutSeconds}`.quiet()
}
```
`git fetch --connect-timeout N` applies to the TCP connection phase. This is a standard git option available in git >=2.3. Confidence: HIGH (standard git CLI flag).

**Option B — Promise.race with timeout:**
```typescript
export async function fetchOrigin(repoPath: string): Promise<void> {
  const fetch = $`git -C ${repoPath} fetch origin`.quiet()
  const timer = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error("fetch timeout")), 30_000)
  )
  await Promise.race([fetch, timer])
}
```
This does NOT kill the git subprocess — it only rejects the promise. The git process continues running in the background. Use Option A.

**Recommended:** Option A (`--connect-timeout 30`). Clean, kills at the OS level, no orphan process risk.

Note: `syncWorkspace()` currently calls `fetchOrigin()` with `.catch(() => {})` which silently ignores fetch failures. For WS-04 (error within 30 seconds), the catch must be removed or errors must be collected and surfaced. The timeout flag alone satisfies "no hang within 30 seconds"; surfacing the error as a skipped repo satisfies "clear error message."

### Pattern 6: Keyboard Isolation During Sync Progress

The `v.view === "progress"` guard in App.tsx already blocks all navigation:

```typescript
if (v.view === "progress") return   // line 437 in App.tsx
```

This same guard covers the sync progress view — no additional guard needed if sync uses the existing `view: "progress"` variant. If a new `view: "sync-progress"` variant is added, add an equivalent guard in the keyboard handler.

### Anti-Patterns to Avoid

- **Using `createStore` for SyncRow state:** Simple signal with array replacement is sufficient for sequential sync. Store is only needed if rows must update individually without full list re-render AND the list is long. Not the case here.
- **Calling `syncWorkspace()` without `bestEffort: true`:** In strict mode, any conflict aborts the entire sync and returns early. TUI must always pass `bestEffort: true` (D-04).
- **Silently swallowing fetch timeout errors:** `syncWorkspace()` currently does `.catch(() => {})` on fetches. After adding `--connect-timeout`, errors should propagate as skipped repos with reason "fetch failed" rather than being swallowed.
- **Appending sync case to batch selection loop:** The existing `executeConfirmed` loops over `indicesToProcess` (supports multi-select). Sync is single-workspace only — adding `case "sync"` inside the loop works but the batch path should be gated out (sync doesn't appear in batch selection UX).

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead |
|---------|-------------|-------------|
| Git fetch timeout | Custom process manager, SIGKILL timer | `git fetch --connect-timeout 30` flag |
| Per-repo status rendering | Custom terminal escape codes | OpenTUI `<box>` + `<text>` reactive signals |
| Async progress streaming | EventEmitter, custom pub-sub | Existing `onProgress: (msg: string) => void` callback pattern |
| Keyboard blocking during progress | Global lock flags | Existing `v.view === "progress"` guard already in App.tsx |
| Structured result accumulation | Custom class | `SyncResult` type already defined in workspace-ops.ts |

---

## Common Pitfalls

### Pitfall 1: SyncResult vs { ok, error? } mismatch

**What goes wrong:** `executeConfirmed()` currently expects `{ ok: boolean; error?: string }` from all actions. `syncWorkspace()` returns `SyncResult { ok, synced[], skipped[], error? }`. If the sync case is added to the existing loop without handling this difference, TypeScript will catch it — but the summary data (`synced`, `skipped` arrays) will be discarded.

**How to avoid:** Assign the `SyncResult` to a typed variable outside the switch, then build the summary line after the loop using `result.synced.length` and `result.skipped.length`. Alternatively, handle sync entirely outside the `executeConfirmed()` loop in a dedicated `handleSync()` function.

**Recommendation:** Add a dedicated `handleSync()` function in App.tsx rather than folding into `executeConfirmed()`. This keeps the function clean and avoids the type mismatch entirely.

### Pitfall 2: fetch timeout doesn't kill the subprocess (Option B trap)

**What goes wrong:** Using `Promise.race` against a timeout rejects the outer promise after 30 seconds, but the `git fetch` subprocess continues running in the background. The next sync attempt may overlap with the previous hanging fetch.

**How to avoid:** Use `git fetch --connect-timeout 30` (Option A). The git flag handles timeout at the TCP/connection level and cleans up the process automatically.

### Pitfall 3: Double-dispatch from keypress during sync

**What goes wrong:** If the progress view allows any keypress to dismiss before `progressDone()` is true, a user might press a key during sync, dismiss the view, and then trigger another action on the same workspace while sync is still running in the background.

**How to avoid:** The existing keyboard guard structure already handles this:
```typescript
if (v.view === "progress" && progressDone()) { /* dismiss */ return }
if (v.view === "progress") return   // blocks all keys during sync
```
This is already correct. Just ensure sync uses the `view: "progress"` variant (or add an equivalent guard for any new view variant).

### Pitfall 4: onProgress callback fired after view unmounts

**What goes wrong:** If the user somehow exits the progress view before sync completes (shouldn't happen with D-11, but defensive coding matters), `setProgressLines()` or the SyncRow state setter will be called on an unmounted signal — in SolidJS this is a no-op, but it's worth structuring the async function to handle early cancellation gracefully.

**How to avoid:** The existing pattern (no cancellation, `v.view === "progress"` blocks all navigation) is sufficient. No additional work needed.

### Pitfall 5: `fetchOrigin` called with `.catch(() => {})` in syncWorkspace hides timeout errors

**What goes wrong:** Even after adding `--connect-timeout 30`, the error is silently swallowed in `syncWorkspace()` because of:
```typescript
.map(({ repo }) => fetchOrigin(repo.task_path).catch(() => {}))
```
The sync proceeds as if fetch succeeded. Repos that couldn't be fetched will then rebase on stale local state and appear to "succeed" with 0 new commits.

**How to avoid:** Track fetch failures and mark affected repos as skipped with reason "fetch failed (timeout)". Either change `syncWorkspace()` to collect fetch errors, or add the tracking logic in the TUI handler.

---

## Code Examples

### Confirmed pattern: ActionMenu adding a new entry

```typescript
// Source: src/tui/dashboard/ActionMenu.tsx — existing pattern
const actions: { key: string; action: Action; label: string }[] = [
  { key: "o", action: "open",   label: "Open" },
  // ... existing entries ...
  { key: "s", action: "sync",   label: "Sync" },   // add this
]
// The useKeyboard loop at line 41 handles it automatically:
const match = actions.find((a) => a.key === key.name)
if (match) props.onAction(match.action)
```

### Confirmed pattern: progress callback feeding reactive state

```typescript
// Source: src/tui/dashboard/App.tsx — existing pattern in executeConfirmed()
const onProgress = (msg: string) =>
  setProgressLines((prev) => [...prev, msg])
// For SyncProgressView, replace with structured row updates:
const onSyncProgress = (msg: string) => {
  // parse msg or use structured callback instead
}
```

### Confirmed pattern: git fetch with timeout

```typescript
// Source: git.ts (current — no timeout)
export async function fetchOrigin(repoPath: string): Promise<void> {
  await $`git -C ${repoPath} fetch origin`.quiet()
}
// After change (add optional param with default):
export async function fetchOrigin(repoPath: string, timeoutSeconds = 30): Promise<void> {
  await $`git -C ${repoPath} fetch origin --connect-timeout ${timeoutSeconds}`.quiet()
}
```

### Confirmed pattern: testRender with kittyKeyboard

```typescript
// Source: tests/tui/dashboard/ActionMenu.test.tsx — established test pattern
const renderOpts = { kittyKeyboard: true }
const { mockInput, renderOnce, captureCharFrame } = await testRender(
  () => <ComponentUnderTest ... />,
  renderOpts
)
await renderOnce()
mockInput.pressKey("s")
await renderOnce()
expect(received).toBe("sync")
```

### Confirmed SyncResult structure

```typescript
// Source: src/lib/workspace-ops.ts — already defined
export type SyncResult = {
  ok: boolean
  synced: Array<{ repo: string; commits: number }>
  skipped: Array<{ repo: string; reason: string }>
  error?: string
}
```

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | `bun:test` (Jest-compatible) + `testRender` from `@opentui/solid` |
| Config file | `bunfig.toml` with `[test]` preload for Babel solid transform |
| Quick run command | `bun test tests/tui/dashboard/` |
| Full suite command | `bun test tests/` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|--------------|
| WS-01 | `s` key in ActionMenu dispatches `"sync"` action | unit | `bun test tests/tui/dashboard/ActionMenu.test.tsx` | ✅ (extend existing) |
| WS-01 | Confirm dialog appears for sync action (confirm → progress flow) | unit | `bun test tests/tui/dashboard/SyncProgressView.test.tsx` | ❌ Wave 0 |
| WS-02 | SyncProgressView renders per-repo rows with correct status indicators | unit | `bun test tests/tui/dashboard/SyncProgressView.test.tsx` | ❌ Wave 0 |
| WS-03 | Result summary shows N synced / N skipped after completion | unit | `bun test tests/tui/dashboard/SyncProgressView.test.tsx` | ❌ Wave 0 |
| WS-04 | fetchOrigin uses `--connect-timeout 30` | unit (mock git) | `bun test tests/lib/git.test.ts` | ✅ (extend existing) |

### Sampling Rate

- **Per task commit:** `bun test tests/tui/dashboard/ActionMenu.test.tsx tests/tui/dashboard/SyncProgressView.test.tsx`
- **Per wave merge:** `bun test tests/`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `tests/tui/dashboard/SyncProgressView.test.tsx` — covers WS-02 and WS-03 (render rows, summary)
- [ ] Extend `tests/tui/dashboard/ActionMenu.test.tsx` — add test for `s` key dispatching `"sync"` action (WS-01)
- [ ] Extend `tests/lib/git.test.ts` — verify `fetchOrigin` signature accepts optional timeout (WS-04)

---

## Open Questions

1. **Handling fetch failures in syncWorkspace — backend change scope**
   - What we know: `syncWorkspace()` swallows all fetch errors with `.catch(() => {})`. After adding `--connect-timeout`, timeout errors are also swallowed.
   - What's unclear: Should the planner treat this as a `git.ts` change only (add timeout flag) or also modify `syncWorkspace()` to track fetch failures as skipped repos?
   - Recommendation: Modify both. Add `--connect-timeout` to `fetchOrigin()`, AND change `syncWorkspace()` to collect fetch failures into the `skipped[]` array with reason `"fetch failed"`. This is a small change and is required for WS-04 to show a "clear error message."

2. **New UIView variant vs reusing `view: "progress"`**
   - What we know: `SyncProgressView` needs structured `SyncRow[]` data, not string lines. The existing `view: "progress"` variant only carries `{ view: "progress"; message: string }`.
   - What's unclear: Whether to add `| { view: "sync-progress"; message: string }` to `UIView` or use the existing variant with the row data living in separate signals.
   - Recommendation: Add `{ view: "sync-progress"; message: string }` to `UIView`. It keeps the discriminated union clean and makes the App.tsx `<Show>` rendering explicit. The row data stays in separate `createSignal` at App level.

---

## Sources

### Primary (HIGH confidence — direct source inspection)

- `src/tui/dashboard/App.tsx` — full action dispatch pipeline, keyboard isolation patterns, progress view integration
- `src/tui/dashboard/types.ts` — `Action` and `UIView` unions (exact current definitions)
- `src/tui/dashboard/ActionMenu.tsx` — action list, keyboard handler, shortcut dispatch pattern
- `src/tui/dashboard/ProgressView.tsx` — existing progress component (append-only log)
- `src/tui/dashboard/ConfirmDialog.tsx` — confirm pattern
- `src/lib/workspace-ops.ts` (lines 670–771) — `SyncResult` type, `syncWorkspace()` full implementation
- `src/lib/git.ts` (lines 111–113) — `fetchOrigin()` current implementation (no timeout)
- `tests/tui/dashboard/ActionMenu.test.tsx` — established test patterns with `kittyKeyboard`
- `tests/tui/dashboard/InlineInput.test.tsx` — `testRender` patterns

### Secondary (MEDIUM confidence)

- git CLI docs: `git fetch --connect-timeout N` — standard flag, available since git 2.3, widely documented. No direct verification against an authoritative URL in this session, but `--connect-timeout` is part of `git fetch`'s documented option set.

---

## Metadata

**Confidence breakdown:**
- Action dispatch extension: HIGH — full pipeline code read, patterns confirmed
- SyncProgressView design: HIGH — OpenTUI component patterns confirmed from existing components
- fetchOrigin timeout fix: HIGH (Option A) / MEDIUM (git flag exact behavior) — standard git flag, but not verified against live git docs in this session
- Test patterns: HIGH — confirmed from existing `.test.tsx` files

**Research date:** 2026-03-21
**Valid until:** 2026-04-21 (stable dependencies, no fast-moving ecosystem involved)
