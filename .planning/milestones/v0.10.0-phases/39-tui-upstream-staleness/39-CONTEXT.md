# Phase 39: TUI Upstream Staleness - Context

**Gathered:** 2026-03-26
**Status:** Ready for planning

<domain>
## Phase Boundary

Add "N behind" badges to the dashboard workspace detail pane showing how many commits each repo is behind upstream. Fetches are triggered on workspace focus with a TTL cache, and users can force-refresh via keybinding.

</domain>

<decisions>
## Implementation Decisions

### Badge format & placement
- **D-01:** Badge appended after mode label on existing repo line: `icon  name (28ch)  [branch]  3 behind` — colored yellow
- **D-02:** Repos up-to-date show no badge (clean line, no clutter)
- **D-03:** No upstream tracking: show nothing (omit badge entirely)
- **D-04:** Network error: show `?` in red
- **D-05:** Loading/fetching: show dim `...` while fetch is in progress

### Cache architecture
- **D-06:** In-memory SolidJS reactive signal — `Map<main_path, {count, fetchedAt}>` — fast, reactive, no file I/O
- **D-07:** TTL checked before each fetch; default 5 minutes (from STATE.md decision)
- **D-08:** Cache dies with TUI session — intentional, fresh data on restart

### Fetch trigger behavior
- **D-09:** Fetch fires when cursor moves to a workspace row in the list (not just detail pane open)
- **D-10:** Shows cached data instantly if available; fetches in background only if TTL expired
- **D-11:** Manual refresh via `r` keybinding bypasses TTL and force-fetches (STALE-03)

### Fetch mechanics (from requirements + STATE.md)
- **D-12:** Fetch-on-focus + 5-minute TTL, no global background poll (STATE.md decision)
- **D-13:** Cache keyed by `main_path` — deduplicates across worktrees of the same repo
- **D-14:** Network failures produce `?` badge per affected repo, do not crash or block TUI (STALE-05)

### Claude's Discretion
- Exact SolidJS hook/signal API design for the staleness cache
- Whether to use `git rev-list --count` or `git log --oneline` for behind count
- Fetch timeout value
- Whether `r` refreshes just the focused workspace or all visible workspaces

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Dashboard components
- `src/tui/dashboard/WorkspaceDetail.tsx` -- Repo list rendering (lines 55-73); badge integrates here after mode label
- `src/tui/dashboard/App.tsx` -- Keyboard handling; `r` keybinding registers here
- `src/tui/dashboard/hooks/useWorkspaces.ts` -- Reactive workspace data hook; staleness cache likely lives here or in a new `useStaleness` hook
- `src/tui/dashboard/types.ts` -- Dashboard-specific types

### Git operations
- `src/lib/git.ts` -- `fetchOrigin()` for remote fetch; new function needed for rev-list behind count

### Requirements
- `.planning/REQUIREMENTS.md` -- STALE-01 through STALE-05 acceptance criteria

### OpenTUI patterns (from CLAUDE.md)
- Dashboard TUI input rules: `useKeyboard` is global broadcast; guard navigation when input focused
- `runHooksCaptured()` must be used instead of `runHooks()` in TUI context

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `fetchOrigin()` in `src/lib/git.ts` -- existing fetch with timeout; reusable for staleness fetch
- `useWorkspaces()` hook -- reactive workspace data pattern to follow for `useStaleness()`
- `WorkspaceDetail.tsx` repo rendering loop -- badge appends to existing `<text>` element per repo
- `formatAge()` in `messageUtils.ts` -- relative time formatting (could inform TTL display if needed)

### Established Patterns
- SolidJS signals for reactive state in dashboard
- `createEffect()` for side effects triggered by signal changes (cursor position → fetch)
- `useKeyboard()` for keybinding registration in `App.tsx`
- Async operations in TUI must not block render — use signals to update after fetch resolves

### Integration Points
- New `useStaleness(focusedWorkspace)` hook providing `Map<main_path, StaleInfo>` signal
- `WorkspaceDetail.tsx` reads staleness data per repo and renders badge
- `App.tsx` registers `r` keybinding that calls `invalidateCache()` from staleness hook
- New git utility function: `getCommitsBehind(repoPath, branch)` in `src/lib/git.ts`

</code_context>

<specifics>
## Specific Ideas

No specific requirements -- open to standard approaches following existing dashboard patterns

</specifics>

<deferred>
## Deferred Ideas

None -- discussion stayed within phase scope

</deferred>

---

*Phase: 39-tui-upstream-staleness*
*Context gathered: 2026-03-26*
