# Phase 39: TUI Upstream Staleness - Research

**Researched:** 2026-03-26
**Status:** Complete

## RESEARCH COMPLETE

## 1. Existing Infrastructure

### Git Operations (src/lib/git.ts)

**`fetchOrigin(repoPath)`** — Already exists. Fetches from origin with 30s timeout using `git -c fetch.timeout=30 fetch origin`. Uses `.quiet()` which throws on non-zero exit. For TUI staleness, callers must use `.nothrow()` to handle network failures gracefully.

**`getCommitsBehind(repoPath, base, head)`** — Already exists. Uses `git rev-list --count ${head}..${base}`. Returns 0 on error. This is the exact function needed for computing "N behind" counts. The parameter order is `(path, base, head)` where `base` is the upstream ref and `head` is the local ref — `git rev-list --count HEAD..origin/branch` gives commits behind.

**`hasUpstreamTracking(repoPath, branch)`** — Already exists. Checks `branch.<name>.remote` git config. Returns false for branches with no upstream — this maps directly to STALE-04 (no badge when no tracking).

**`checkRemoteTrackingRef(repoPath, branch)`** — Already exists. Checks if `origin/<branch>` ref exists locally (no network). Useful after fetch to verify we have the remote ref before counting.

### Dashboard Hooks Pattern (src/tui/dashboard/hooks/)

Four hooks exist: `useWorkspaces`, `useTemplates`, `useRepos`, `useMessages`. All follow the same pattern:
- Return SolidJS signals as reactive data
- Use `createSignal` for state
- Use `onCleanup` for teardown
- Expose a `reload()` function

**`useMessages`** is the closest analog to `useStaleness`:
- In-memory `Map<string, MessageRecord[]>` signal
- Periodic refresh via `setInterval(30_000)`
- Sync `loadAllSync()` for immediate refresh
- Async `loadAll()` for background refresh

### Workspace Detail Rendering (src/tui/dashboard/WorkspaceDetail.tsx)

Repo list renders at lines 56-67. Each repo shows: `{icon}  {name.padEnd(28)} {modeLabel}`. The staleness badge appends after `modeLabel`. Current rendering:

```tsx
<text fg={fg}>    {icon}  {repo.name.padEnd(28)} {modeLabel}</text>
```

Badge integration point: append staleness text after `{modeLabel}` on the same `<text>` element, or add a sibling `<text>` in a `<box flexDirection="row">` (per OpenTUI nested text rule — CLAUDE.md says no nested `<text>`, use sibling `<text>` in `<box flexDirection="row">`).

### Keyboard Handling (src/tui/dashboard/App.tsx)

The `r` key currently does two things:
1. **With batch selection active** (lines 1010-1013): triggers batch remove confirmation
2. **Without selection** (lines 1037-1045): refreshes the current tab

For STALE-03, the `r` keybinding on workspaces tab (no batch) already calls `reload()` — staleness refresh hooks into this same path. The `reload()` call can additionally trigger `invalidateStaleness()` to bypass TTL.

### Data Flow for Staleness

WorkspaceRepo has `main_path` and `task_path`. CONTEXT.md decision D-13 says cache keyed by `main_path` — this deduplicates across worktrees sharing the same repo. The workspace branch is in `workspace.branch`. For each repo:

1. `fetchOrigin(repo.main_path)` — refresh remote refs
2. `hasUpstreamTracking(repo.main_path, branch)` — check if tracking configured
3. `getCommitsBehind(repo.main_path, "origin/" + branch, branch)` — count behind

For trunk repos, the branch is the repo's default/base branch, not the workspace branch. For worktree repos, it's the workspace branch.

## 2. Technical Approach

### New Hook: `useStaleness`

Location: `src/tui/dashboard/hooks/useStaleness.ts`

```typescript
type StaleInfo = {
  count: number | null   // null = loading/error
  error: boolean         // true = network failure (show ?)
  fetchedAt: number      // Date.now() timestamp
}

type StalenessCache = Map<string, StaleInfo>  // keyed by main_path
```

Signal: `createSignal<StalenessCache>(new Map())`

**API:**
- `staleness(): StalenessCache` — reactive signal for current cache
- `fetchStaleness(workspace: Workspace)` — fetches if TTL expired for workspace repos
- `invalidateCache()` — clears all `fetchedAt` so next fetch bypasses TTL

### Fetch Mechanics

1. When `currentEntry()` changes (cursor moves to different workspace), call `fetchStaleness(workspace)`
2. Inside `fetchStaleness`: for each repo, check `cache.get(main_path)?.fetchedAt` against TTL
3. If TTL expired or no entry: set `count: null, error: false` (loading state), then async fetch
4. Use `fetchOrigin` with `.nothrow()` modification — need a new variant or wrap in try/catch
5. After fetch: `getCommitsBehind(main_path, "origin/" + branch, branch)` for the count
6. Update cache signal with result

### fetchOrigin Error Handling

Current `fetchOrigin` uses `.quiet()` which throws on error. For staleness, need non-throwing variant. Two options:
1. Add `fetchOriginSafe(repoPath)` returning `{ ok: boolean }`
2. Wrap call in try/catch in the hook

Option 2 is simpler — just wrap the existing `fetchOrigin` in try/catch within `useStaleness`.

### TTL Cache Logic

```typescript
const TTL_MS = 5 * 60 * 1000  // 5 minutes

function isExpired(info: StaleInfo): boolean {
  return Date.now() - info.fetchedAt > TTL_MS
}
```

### Branch Resolution per Repo

- **Worktree repos**: use `workspace.branch`
- **Trunk repos**: use `repo.base_branch ?? defaultBranch` from the workspace YAML

Actually, trunk repos track the default branch. Since `WorkspaceRepo` has `base_branch` optional field, and the repo is in trunk mode pointing at the main clone, the relevant upstream comparison is the default branch. But for staleness in the context of a workspace, what matters is: "is this repo's relevant branch behind upstream?" For trunk repos, that's the default branch of the main clone.

Best approach: use `getCurrentBranch(repo.main_path)` for trunk repos and `workspace.branch` for worktree repos.

### Deduplication

Multiple repos in a workspace might share the same `main_path` (unlikely but possible). The Map key being `main_path` naturally deduplicates. For the fetch step, collect unique `main_path` values before fetching.

### Concurrency

Fetch all repos in parallel using `Promise.allSettled` to avoid one failure blocking others. Each repo's fetch is independent.

## 3. WorkspaceDetail Badge Rendering

Per CONTEXT.md decisions:
- D-01: Badge after mode label: `3 behind` in yellow
- D-02: Up-to-date: no badge
- D-03: No upstream: nothing shown
- D-04: Network error: `?` in red
- D-05: Loading: dim `...`

Need to change the repo line from single `<text>` to `<box flexDirection="row">` with sibling `<text>` elements (per OpenTUI no-nested-text rule).

Current:
```tsx
<text fg={fg}>    {icon}  {repo.name.padEnd(28)} {modeLabel}</text>
```

New:
```tsx
<box flexDirection="row" height={1}>
  <text fg={fg}>    {icon}  {repo.name.padEnd(28)} {modeLabel}</text>
  <text fg={badgeFg}>  {badgeText}</text>
</box>
```

Where `badgeText` resolves from staleness cache:
- Loading (`count === null && !error`): `...` in gray/dim
- Behind (`count > 0`): `{count} behind` in yellow
- Up-to-date (`count === 0`): empty string (no badge)
- Error (`error === true`): `?` in red
- No entry in cache: empty string

## 4. Integration with App.tsx

### Cursor-triggered fetch

`App.tsx` has `currentEntry()` memo (line 137). Add a `createEffect` that watches `currentEntry()` and calls `fetchStaleness()` when it changes:

```typescript
createEffect(() => {
  const entry = currentEntry()
  if (entry && tab() === "workspaces") {
    fetchStaleness(entry.workspace)
  }
})
```

### r keybinding enhancement

The existing `r` handler on workspaces (line 1037) already reloads. Add `invalidateCache()` call before reload:

```typescript
if (key.name === "r") {
  // ... existing code ...
  if (tab() === "workspaces") {
    invalidateCache()  // bypass TTL
    // existing reload() call triggers re-render, createEffect re-fetches
  }
}
```

### Passing staleness to WorkspaceDetail

`WorkspaceDetail` already receives `entry` and `messages`. Add `staleness` prop:

```typescript
<WorkspaceDetail
  entry={currentEntry()}
  messages={...}
  tick={tick()}
  staleness={staleness()}
/>
```

## 5. File Impact Summary

| File | Change |
|------|--------|
| `src/tui/dashboard/hooks/useStaleness.ts` | NEW — staleness cache hook |
| `src/tui/dashboard/WorkspaceDetail.tsx` | MODIFY — add staleness badges to repo lines |
| `src/tui/dashboard/App.tsx` | MODIFY — wire useStaleness, add createEffect, enhance r handler |
| `src/tui/dashboard/types.ts` | MODIFY — add StaleInfo type (or keep in hook file) |
| `src/lib/git.ts` | No change needed — `fetchOrigin`, `getCommitsBehind`, `hasUpstreamTracking` already exist |

## 6. Risk Assessment

**Low risk:**
- All git functions already exist
- Hook pattern is well-established (4 existing hooks)
- Cache is in-memory only — no persistence concerns

**Medium risk:**
- `fetchOrigin` throws on network error — must wrap in try/catch
- OpenTUI rendering: switching from `<text>` to `<box flexDirection="row">` for badge layout — must verify height=1 doesn't break list alignment
- `r` keybinding dual purpose: batch remove vs refresh — must preserve existing batch guard (lines 1010-1013 check `selected().size > 0` before `r` triggers remove)

**Edge cases:**
- Workspace with 0 repos: `fetchStaleness` should no-op
- Rapidly switching cursor: fetches should not pile up — consider a debounce or checking if workspace changed mid-fetch
- Trunk repos: need to determine correct branch for comparison

## Validation Architecture

### Unit-testable boundaries
- `isExpired(info, ttl)` — pure TTL check function
- Badge text resolution: `resolveBadge(staleInfo | undefined)` — pure function returning `{ text: string, fg: string }`
- Branch resolution per repo mode — pure function

### Integration-testable
- `fetchStaleness` with mocked git operations
- Cache deduplication by `main_path`
- TTL bypass on `invalidateCache()`

### Manual verification
- Dashboard shows badges after cursor moves to workspace
- Pressing `r` refreshes badges (bypasses TTL)
- Network-disconnected state shows `?` badges
- Repos without upstream show no badge

---

*Phase: 39-tui-upstream-staleness*
*Research completed: 2026-03-26*
