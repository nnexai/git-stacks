# Phase 12: workspace-sync — Research

**Researched:** 2026-03-21 (updated pass — UI-SPEC integrated)
**Domain:** SolidJS TUI (OpenTUI) — dashboard action dispatch, SyncProgressView, async sync integration, git fetch timeout
**Confidence:** HIGH (all findings from direct source inspection)

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

- Exact spinner/indicator characters and colors (resolved by UI-SPEC)
- Whether to enhance existing ProgressView or create a new SyncProgressView component (resolved by UI-SPEC: new SyncProgressView)
- Git fetch timeout implementation detail (signal abort vs git config) (resolved below: `fetch.timeout=30`)
- Line layout spacing in the status table (resolved by UI-SPEC)

### Deferred Ideas (OUT OF SCOPE)

- Batch sync (all workspaces from TUI) — explicitly deferred to CLI `--all` (WS-05)
- Parallel per-repo sync execution — current `syncWorkspace()` is sequential; the live status table UI is ready for it but the backend change is out of scope
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| WS-01 | User can trigger workspace sync from the Workspaces tab action menu without leaving the TUI | Add `"sync"` to `Action` union; add `{ key: "s", action: "sync", label: "Sync" }` to ActionMenu; add sync case in `runAction()` → confirm → `executeSync()` |
| WS-02 | Sync shows per-repo progress in ProgressView while running (repo name + status line per repo) | New `SyncProgressView` component accepts `SyncRow[]` signal; `syncWorkspace()` gains structured `onSyncProgress` callback for row-level updates |
| WS-03 | Sync completes with a result summary (N synced, N skipped/failed) | `SyncResult` already has `synced[]` and `skipped[]` arrays; summary built from counts after `syncWorkspace()` resolves; summary color per UI-SPEC (green/yellow/red) |
| WS-04 | Sync on unreachable remote fails with clear error within 30 seconds (no hang) | `fetchOrigin()` in `git.ts` currently has no timeout; must add `fetch.timeout=30` via `-c` config flag; `syncWorkspace()` must also surface fetch failures (not swallow them) |
</phase_requirements>

---

## Summary

Phase 12 wires workspace sync into the TUI dashboard. The backend — `syncWorkspace()` in `workspace-ops.ts` plus the supporting git primitives in `git.ts` — is fully implemented and already called by the CLI. The TUI work is pure integration: extend the action dispatch pipeline (types → ActionMenu → App.tsx), add a confirm step, call `syncWorkspace()` with a structured per-row callback feeding `SyncProgressView`, and display the `SyncResult` summary when done.

Two required changes before this phase ships: (1) Add a 30-second timeout to `fetchOrigin()` — currently runs with no timeout guard; (2) Change `syncWorkspace()` to collect fetch failures as skipped repos rather than silently swallowing them (the current `.catch(() => {})` on fetches means timeout errors are invisible).

The UI is fully specified in `12-UI-SPEC.md`. New component: `SyncProgressView.tsx`. New type: `SyncRow`. No new library dependencies — everything uses the existing OpenTUI + SolidJS stack.

**Primary recommendation:** Create `SyncProgressView.tsx` (new file), add a structured `onSyncProgress` callback to `syncWorkspace()`, use `executeSync()` as a dedicated function in App.tsx (not merged into `executeConfirmed()`), add `fetch.timeout=30` to `fetchOrigin()`, and add a `"sync-progress"` UIView variant.

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

### Files Changed/Created

```
src/tui/dashboard/
  SyncProgressView.tsx    NEW  — per-repo status table component
  types.ts                MOD  — add "sync" to Action; add "sync-progress" UIView variant
  ActionMenu.tsx          MOD  — add { key: "s", action: "sync", label: "Sync" }
  App.tsx                 MOD  — add executeSync(), syncRows signal, keyboard guard, Show branch
src/lib/
  git.ts                  MOD  — fetchOrigin() gains fetch.timeout=30
  workspace-ops.ts        MOD  — syncWorkspace() gains onSyncProgress callback; surfaces fetch failures
tests/tui/dashboard/
  SyncProgressView.test.tsx  NEW  — component rendering tests (Wave 0 gap)
  ActionMenu.test.tsx        MOD  — add test for "s" key dispatching "sync" (Wave 0 gap)
tests/lib/
  git.test.ts              MOD  — add fetchOrigin timeout test (Wave 0 gap)
```

### Pattern 1: SyncRow Type (canonical definition from UI-SPEC)

```typescript
// Source: 12-UI-SPEC.md implementation notes
type SyncRow = {
  repo: string
  status: "pending" | "fetching" | "rebasing" | "synced" | "skipped" | "failed"
  detail: string        // "+3 commits", "conflict: src/lib/git.ts", "fetch failed (timeout)", or ""
  conflicts: string[]   // additional conflict files listed below the skipped row (beyond first)
}
```

Initial state for a workspace with N worktree repos — built in App.tsx before calling `syncWorkspace()`:

```typescript
const ws = readWorkspace(name)
const initialRows: SyncRow[] = ws.repos
  .filter(r => r.mode === "worktree")
  .map(r => ({ repo: r.name, status: "pending", detail: "", conflicts: [] }))
setSyncRows(initialRows)
```

### Pattern 2: Structured Progress Callback Addition to syncWorkspace()

`syncWorkspace()` currently accepts `onProgress?: (msg: string) => void`. For type-safe in-place updates, add an optional second structured callback — **additive, CLI callers unaffected**:

```typescript
// src/lib/workspace-ops.ts — add parameter
export async function syncWorkspace(
  name: string,
  opts: { strategy?: "rebase" | "merge"; bestEffort?: boolean },
  onProgress?: ProgressCallback,
  onSyncProgress?: (update: SyncRow) => void   // NEW: structured per-repo updates
): Promise<SyncResult>
```

The TUI passes `onSyncProgress`. The CLI passes only `onProgress`. Both can be used together.

In App.tsx `executeSync()`:

```typescript
const onSyncProgress = (update: SyncRow) => {
  setSyncRows(prev => prev.map(r => r.repo === update.repo ? { ...r, ...update } : r))
}
```

### Pattern 3: fetchOrigin Timeout (WS-04)

```typescript
// Source: src/lib/git.ts — current (no timeout):
export async function fetchOrigin(repoPath: string): Promise<void> {
  await $`git -C ${repoPath} fetch origin`.quiet()
}

// After change — git -c sets config inline; fetch.timeout is socket-level timeout (git >= 2.26):
export async function fetchOrigin(repoPath: string): Promise<void> {
  await $`git -C ${repoPath} -c fetch.timeout=30 fetch origin`.quiet()
}
```

`fetch.timeout` sets the low-level transport socket timeout in seconds. Unlike `--connect-timeout` (TCP only), `fetch.timeout` covers both the connect and data transfer phases. No AbortSignal needed — git handles process cleanup.

**Also required:** Change `syncWorkspace()` fetch stage from swallowing errors to tracking them:

```typescript
// Current (swallows all fetch failures):
await Promise.all(
  repoInfos.map(({ repo }) => fetchOrigin(repo.task_path).catch(() => {}))
)

// After change (tracks fetch failures per repo):
const fetchFailures = new Map<string, string>()
await Promise.all(
  repoInfos
    .filter(({ repo }) => existsSync(repo.task_path))
    .map(async ({ repo }) => {
      try {
        await fetchOrigin(repo.task_path)
      } catch (e) {
        fetchFailures.set(repo.name, "fetch failed (timeout)")
        onSyncProgress?.({ repo: repo.name, status: "failed", detail: "fetch failed (timeout)", conflicts: [] })
      }
    })
)
// Then skip repos in fetchFailures during the rebase loop
```

### Pattern 4: Action Dispatch Flow

Sync follows the existing confirm → progress pattern. Uses a **dedicated `executeSync()` function** in App.tsx rather than adding to `executeConfirmed()` — avoids `SyncResult` vs `{ ok, error? }` type mismatch:

```
ActionMenu "s" key → props.onAction("sync")
  → runAction("sync", index)
    → setView({ view: "confirm", index, action: "sync" })
      ConfirmDialog: "Sync {name}? (rebase from upstream)"  [y / n/Esc]
        [y] → executeSync(name)
               setSyncRows(initialPendingRows)
               setSyncDone(false)
               setSyncSummary("")
               setView({ view: "sync-progress", message: `Syncing ${name}...` })
               const result = await syncWorkspace(name, { strategy: "rebase", bestEffort: true }, undefined, onSyncProgress)
               setSyncSummary(buildSummary(result))
               setSyncDone(true)
               // [any key] → reload() + setView({ view: "list" })
        [n/Esc] → setView({ view: "list" })
```

### Pattern 5: UIView Extensions

```typescript
// Source: types.ts — add to Action and UIView unions

export type Action = "open" | "edit" | "rename" | "clean" | "remove" | "merge" | "sync"

export type UIView =
  | { view: "list" }
  | { view: "action-menu"; index: number }
  | { view: "confirm"; index: number; action: Action; batch?: boolean }
  | { view: "progress"; message: string }
  | { view: "sync-progress"; message: string }   // NEW
  | { view: "inline-input"; index: number; purpose: "rename" | "clone-template"; prefill: string }
  | { view: "messages"; workspaceName: string }
```

### Pattern 6: Keyboard Guard in App.tsx

Add the sync-progress guard **above all navigation handlers**, mirroring the existing `"progress"` guard (currently lines 430–437):

```typescript
// Add these two lines immediately after/alongside the existing "progress" guards:
if (v.view === "sync-progress" && syncDone()) {
  reload()
  setView({ view: "list" })
  clampCursor()
  return
}
if (v.view === "sync-progress") return  // block ALL keys during sync (D-11)
```

### Pattern 7: SyncProgressView Render Structure (from UI-SPEC)

```tsx
/** @jsxImportSource @opentui/solid */
import "opentui-spinner/solid"
import { For, Show } from "solid-js"

// Glyph/color lookup per status (per UI-SPEC status glyphs table)
function glyphFor(status: SyncRow["status"]): string {
  if (status === "pending")  return "·"
  if (status === "synced")   return "✓"
  if (status === "skipped")  return "⚠"
  if (status === "failed")   return "✗"
  return ""  // fetching/rebasing → render <spinner> instead
}
function colorFor(status: SyncRow["status"]): string {
  if (status === "pending")  return "gray"
  if (status === "synced")   return "green"
  if (status === "skipped")  return "yellow"
  if (status === "failed")   return "red"
  return "cyan"  // fetching/rebasing (spinner color handled separately)
}

type Props = {
  rows: SyncRow[]
  done: boolean
  summary: string
}

export function SyncProgressView(props: Props) {
  return (
    <box flexDirection="column">
      <Show when={!props.done}>
        <box flexDirection="row" height={1}>
          <spinner name="dots" color="cyan" />
          <text fg="white"> Syncing...</text>
        </box>
      </Show>
      <For each={props.rows}>
        {(row) => (
          <>
            <box flexDirection="row" height={1} paddingLeft={2}>
              <Show when={row.status === "fetching" || row.status === "rebasing"}
                fallback={<text fg={colorFor(row.status)}>{glyphFor(row.status)} </text>}
              >
                <spinner name="dots" color="cyan" />
                <text> </text>
              </Show>
              <text fg="white">{row.repo}</text>
              <text fg="gray">  {row.detail}</text>
            </box>
            <For each={row.conflicts}>
              {(f) => <text fg="gray">{"     "}{f}</text>}
            </For>
          </>
        )}
      </For>
      <Show when={props.done}>
        <text fg="green">{"\n"}  {props.summary}</text>
      </Show>
    </box>
  )
}
```

Note: Summary line color should reflect outcome (green/yellow/red per UI-SPEC). The summary string is pre-built by `executeSync()` in App.tsx from `SyncResult` counts; color is a prop or derived from the string content.

### Pattern 8: Summary Line Building

```typescript
// In App.tsx executeSync() — after syncWorkspace() resolves
function buildSummary(result: SyncResult): { text: string; color: "green" | "yellow" | "red" } {
  const ns = result.synced.length
  const nsk = result.skipped.filter(s => s.reason.includes("conflict")).length
  const nf = result.skipped.filter(s => !s.reason.includes("conflict")).length

  if (ns === 0 && nsk === 0 && nf === 0) {
    return { text: "Nothing to sync. Press any key to continue.", color: "green" }
  }
  if (nf > 0) {
    return { text: `${ns} synced, ${nsk} skipped, ${nf} failed. Press any key to continue.`, color: "red" }
  }
  if (nsk > 0) {
    return { text: `${ns} synced, ${nsk} skipped. Press any key to continue.`, color: "yellow" }
  }
  return { text: `${ns} synced. Press any key to continue.`, color: "green" }
}
```

Note: UI-SPEC distinguishes "skipped" (conflict) from "failed" (fetch error / hard error). The `SyncResult.skipped[]` array contains both. The distinction can be inferred from the `reason` field or tracked separately in App.tsx.

### Anti-Patterns to Avoid

- **Adding sync to executeConfirmed():** `executeConfirmed()` expects `{ ok: boolean; error?: string }`. `syncWorkspace()` returns `SyncResult` with extra fields. Forcing sync into the existing loop discards `synced[]` and `skipped[]` data needed for the summary. Use a dedicated `executeSync()` instead.
- **Using `Promise.race()` for fetch timeout:** This rejects the promise but does not kill the git subprocess. The orphaned `git fetch` process continues hanging. Use `git -c fetch.timeout=30` instead.
- **Using `createStore` for SyncRow[]:** Not needed for sequential sync. Simple `createSignal<SyncRow[]>` with array replacement is sufficient and matches existing patterns.
- **Calling syncWorkspace with bestEffort omitted:** Default is strict mode — first conflict aborts entire sync. Always pass `{ bestEffort: true }` from TUI (D-04).
- **Placing sync-progress keyboard guard after navigation handlers:** The guard must be at the top of the useKeyboard callback, above tab switching, before cursor movement — same as the existing `"progress"` guard.
- **Not adding a `<Show when={view().view === "sync-progress"}>` branch:** App.tsx currently has no render branch for `"sync-progress"`. Without it, the SyncProgressView never mounts and the user sees a blank detail pane during sync.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Git fetch timeout | AbortSignal + setTimeout, custom process killer | `git -c fetch.timeout=30 fetch origin` | Git handles subprocess cleanup; no orphan processes |
| Per-repo spinners | Custom animation loop | `opentui-spinner/solid` `<spinner>` | Already installed, same as ProgressView |
| Keyboard blocking during progress | Global lock flags, boolean semaphore | `if (v.view === "sync-progress") return` guard | Established OpenTUI pattern already in App.tsx |
| Structured result accumulation | Custom class | `SyncResult` type in workspace-ops.ts | Already defined with `synced[]` and `skipped[]` |
| Conflict detection pre-check | Custom git diff parsing | `getMergeConflicts()` in git.ts | Already called by syncWorkspace; in-execution with bestEffort=true |

---

## Common Pitfalls

### Pitfall 1: SyncResult vs `{ ok, error? }` mismatch in executeConfirmed()

**What goes wrong:** `executeConfirmed()` accumulates `{ ok, error? }` results. `syncWorkspace()` returns `SyncResult { ok, synced[], skipped[], error? }`. Wedging sync into the existing loop compiles (SyncResult is a superset) but `synced[]` and `skipped[]` are unreachable — the summary can never be built.

**How to avoid:** Add a dedicated `executeSync(name: string)` function in App.tsx. `runAction("sync", index)` goes to the confirm view; on confirm, call `executeSync()` not `executeConfirmed()`. This is the same approach as `"open"` and `"rename"` — both bypass `executeConfirmed()` and have their own handlers in `runAction()`.

### Pitfall 2: fetch timeout doesn't kill the subprocess (Promise.race trap)

**What goes wrong:** `Promise.race([fetchPromise, timeoutPromise])` rejects after 30 seconds, but the Bun `$` subprocess for `git fetch` continues running in the background. The next sync on the same repo overlaps with the previous hanging fetch.

**How to avoid:** Use `git -c fetch.timeout=30 fetch origin`. The git flag is enforced at the TCP socket level and git kills the connection itself. No orphan process risk.

### Pitfall 3: Silent fetch failure swallowing (existing bug, WS-04 blocker)

**What goes wrong:** `syncWorkspace()` has `.catch(() => {})` on every `fetchOrigin()` call. After adding `fetch.timeout=30`, a timeout after 30 seconds throws an error — which is silently swallowed. The sync "succeeds" with stale local data and 0 new commits. No error message appears. WS-04 is not satisfied.

**How to avoid:** Replace `.catch(() => {})` with a per-repo failure tracker (see Pattern 3). Call `onSyncProgress` with `{ status: "failed", detail: "fetch failed (timeout)" }` for each failed fetch. These repos are then skipped in the rebase loop.

### Pitfall 4: "s" key conflicts

**What goes wrong:** Adding `s` to ActionMenu's `actions` array could clash if `s` is already used elsewhere in App.tsx keyboard handler. In the list view, `s` is not currently bound. In batch selection mode, only `c` (clean) and `r` (remove) are bound. No conflict.

**How to avoid:** Grep confirms no existing `key.name === "s"` handler in App.tsx. The letter-key shortcut in ActionMenu is dispatched only when the `"action-menu"` view is active — the App.tsx keyboard guard `if (v.view === "action-menu") return` ensures ActionMenu's own `useKeyboard` handler fires while App.tsx ignores inputs in that view state.

### Pitfall 5: Double-dispatch from keypress during sync

**What goes wrong:** If the user presses `s` again during sync (e.g., impatient), the sync could be triggered a second time, starting a second `syncWorkspace()` call on the same workspace while the first is still running.

**How to avoid:** The `if (v.view === "sync-progress") return` keyboard guard in App.tsx ensures all keys are blocked while sync is in progress (D-11). No additional semaphore needed.

### Pitfall 6: onProgress callback fires after component unmounts

**What goes wrong:** If `setSyncRows` is called after the user has somehow navigated away from the sync-progress view, it updates a signal that isn't rendered. In SolidJS this is a no-op with no error — but the guard (Pitfall 5) prevents this scenario entirely.

**How to avoid:** No action needed — the keyboard guard prevents leaving the sync-progress view before `syncDone()`. Document the guard's role.

### Pitfall 7: Missing Show branch for "sync-progress" in App.tsx render tree

**What goes wrong:** App.tsx renders `<Show when={view().view === "progress"}>` for ProgressView. A separate `<Show when={view().view === "sync-progress"}>` for SyncProgressView must be added or it never renders. The planner must include this as an explicit task.

**How to avoid:** Add `<Show when={view().view === "sync-progress"}><SyncProgressView rows={syncRows()} done={syncDone()} summary={syncSummary()} /></Show>` in the detail pane section of App.tsx, alongside the existing ProgressView Show block.

---

## Code Examples

### Confirmed pattern: ActionMenu action list extension

```typescript
// Source: src/tui/dashboard/ActionMenu.tsx line 13-20
// The existing loop at line 41 (actions.find) handles new entries automatically:
const actions: { key: string; action: Action; label: string }[] = [
  { key: "o", action: "open",   label: "Open" },
  { key: "n", action: "rename", label: "Rename" },
  { key: "e", action: "edit",   label: "Edit ($EDITOR)" },
  { key: "c", action: "clean",  label: "Clean" },
  { key: "r", action: "remove", label: "Remove" },
  { key: "m", action: "merge",  label: "Merge" },
  { key: "s", action: "sync",   label: "Sync" },  // ADD THIS LINE
]
```

### Confirmed pattern: testRender with kittyKeyboard (for SyncProgressView tests)

```typescript
// Source: tests/tui/dashboard/ActionMenu.test.tsx — established test pattern
const renderOpts = { kittyKeyboard: true }
const { renderOnce, captureCharFrame } = await testRender(
  () => <SyncProgressView rows={[
    { repo: "repo-a", status: "synced", detail: "+3 commits", conflicts: [] },
    { repo: "repo-b", status: "skipped", detail: "conflict: src/lib/git.ts", conflicts: ["src/index.ts"] },
  ]} done={true} summary="1 synced, 1 skipped. Press any key to continue." />,
  renderOpts
)
await renderOnce()
const frame = captureCharFrame()
expect(frame).toContain("repo-a")
expect(frame).toContain("+3 commits")
expect(frame).toContain("⚠")
```

### Confirmed SyncResult structure

```typescript
// Source: src/lib/workspace-ops.ts lines 670-675
export type SyncResult = {
  ok: boolean
  synced: Array<{ repo: string; commits: number }>
  skipped: Array<{ repo: string; reason: string }>
  error?: string
}
```

### Confirmed ConfirmDialog pattern

```typescript
// Source: src/tui/dashboard/ConfirmDialog.tsx
// message prop: "Sync {workspaceName}? (rebase from upstream)"
// Keys: [y] Yes  [n/Esc] No
// Color: fg="yellow" for message
```

---

## Validation Architecture

Nyquist validation is enabled (`workflow.nyquist_validation: true` in `.planning/config.json`).

### Test Framework

| Property | Value |
|----------|-------|
| Framework | `bun:test` (Jest-compatible) + `testRender` from `@opentui/solid` |
| Config file | `bunfig.toml` with `[test]` preload for Babel solid transform (already configured) |
| Quick run command | `bun test tests/tui/dashboard/SyncProgressView.test.tsx tests/tui/dashboard/ActionMenu.test.tsx` |
| Full suite command | `bun test tests/` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|--------------|
| WS-01 | `s` key in ActionMenu dispatches `"sync"` action | unit | `bun test tests/tui/dashboard/ActionMenu.test.tsx` | ✅ (add test to existing file) |
| WS-01 | `"Sync"` label visible in rendered ActionMenu | unit | `bun test tests/tui/dashboard/ActionMenu.test.tsx` | ✅ (add assertion to existing label test) |
| WS-02 | SyncProgressView renders pending rows with `·` glyph | unit | `bun test tests/tui/dashboard/SyncProgressView.test.tsx` | ❌ Wave 0 |
| WS-02 | SyncProgressView shows spinner row for fetching/rebasing status | unit | `bun test tests/tui/dashboard/SyncProgressView.test.tsx` | ❌ Wave 0 |
| WS-02 | SyncProgressView shows `✓` and detail for synced row | unit | `bun test tests/tui/dashboard/SyncProgressView.test.tsx` | ❌ Wave 0 |
| WS-02 | SyncProgressView shows `⚠` and conflict files for skipped row | unit | `bun test tests/tui/dashboard/SyncProgressView.test.tsx` | ❌ Wave 0 |
| WS-03 | Summary line appears when done=true with correct text | unit | `bun test tests/tui/dashboard/SyncProgressView.test.tsx` | ❌ Wave 0 |
| WS-04 | fetchOrigin command includes `fetch.timeout=30` | unit | `bun test tests/lib/git.test.ts` | ✅ (add test to existing file) |

Note: App-level integration test covering the full confirm → SyncProgressView → dismiss flow is mapped to Phase 15 (T-05). Phase 12 tests cover components only.

### Sampling Rate

- **Per task commit:** `bun test tests/tui/dashboard/SyncProgressView.test.tsx tests/tui/dashboard/ActionMenu.test.tsx`
- **Per wave merge:** `bun test tests/`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `tests/tui/dashboard/SyncProgressView.test.tsx` — NEW file; covers WS-02 and WS-03
- [ ] Extend `tests/tui/dashboard/ActionMenu.test.tsx` — add `"s key dispatches sync"` test (WS-01)
- [ ] Extend `tests/lib/git.test.ts` — add test verifying `fetchOrigin` uses timeout flag (WS-04); requires checking command string or mocking git subprocess

---

## Open Questions

1. **Distinguishing "skipped" (conflict) vs "failed" (fetch error) in summary**
   - What we know: `SyncResult.skipped[]` contains both conflict-skipped repos (reason includes "conflict") and fetch-failed repos (reason is "fetch failed"). UI-SPEC summary shows distinct skipped and failed counts.
   - What's unclear: Whether `SyncResult` should be extended with a separate `failed[]` array, or whether App.tsx infers the distinction from `reason` string content.
   - Recommendation: App.tsx infers from reason string (`includes("conflict")` → skipped, else → failed). This avoids a backend schema change and is sufficient for the summary display.

2. **`fetch.timeout` git config minimum version**
   - What we know: `fetch.timeout` was added in git 2.26 (March 2020). On git < 2.26, unknown `-c` config keys are silently ignored — no error, but no timeout enforcement either.
   - What's unclear: The minimum git version for this project's users.
   - Recommendation: Use `fetch.timeout=30` as primary. It degrades gracefully on older git (no enforcement, but no crash). Document the requirement in CLAUDE.md if needed.

---

## Sources

### Primary (HIGH confidence — direct source inspection)

- `src/tui/dashboard/App.tsx` — full action dispatch pipeline (`runAction`, `executeConfirmed`, keyboard handler, progress view Show blocks)
- `src/tui/dashboard/types.ts` — exact current `Action` and `UIView` union definitions
- `src/tui/dashboard/ActionMenu.tsx` — action list array, `useKeyboard` handler, letter-shortcut pattern
- `src/tui/dashboard/ProgressView.tsx` — existing append-only component (confirmed pattern to diverge from)
- `src/tui/dashboard/ConfirmDialog.tsx` — confirm dialog pattern (message, key bindings, colors)
- `src/lib/workspace-ops.ts` lines 670–771 — `SyncResult` type, `syncWorkspace()` full implementation including fetch swallowing bug
- `src/lib/git.ts` lines 111–113 — `fetchOrigin()` current implementation (confirmed: no timeout)
- `tests/tui/dashboard/ActionMenu.test.tsx` — established test patterns: `testRender`, `kittyKeyboard`, `mockInput.pressKey()`, `captureCharFrame()`
- `.planning/phases/12-workspace-sync/12-UI-SPEC.md` — complete design contract: SyncRow type, layout rules, status glyphs, copy, summary logic, component inventory

### Secondary (MEDIUM confidence)

- git documentation: `fetch.timeout` config key — available since git 2.26 (March 2020). Standard git transport config. Not verified against live docs in this session; knowledge-based claim at MEDIUM confidence.
- git documentation: `-c key=value` inline config flag — widely used, stable feature. HIGH confidence.

---

## Metadata

**Confidence breakdown:**
- Action dispatch extension: HIGH — full pipeline code read, all patterns confirmed
- SyncProgressView design: HIGH — OpenTUI component patterns confirmed from existing components + UI-SPEC
- fetchOrigin timeout fix: HIGH (fetch.timeout approach) / MEDIUM (exact git version support)
- Test patterns: HIGH — confirmed from existing `.test.tsx` files

**Research date:** 2026-03-21
**Valid until:** 2026-04-21 (stable dependencies, no fast-moving ecosystem)
