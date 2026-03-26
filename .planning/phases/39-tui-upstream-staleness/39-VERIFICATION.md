---
status: passed
phase: 39-tui-upstream-staleness
verified: 2026-03-26
---

# Phase 39: TUI Upstream Staleness - Verification

## Goal
The dashboard workspace detail pane shows how many commits each repo is behind upstream, fetched non-blocking with a TTL cache.

## Must-Have Verification

### Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Focusing a workspace shows "N behind" per repo when upstream has newer commits | PASS | `resolveBadge` returns `"N behind"` (yellow) when `count > 0`; rendered via `<Show when={badge().text}>` in repo loop |
| 2 | Staleness data cached per main_path, no re-fetch within 5-minute TTL | PASS | `STALENESS_TTL = 5 * 60 * 1000`; TTL check at `fetchStaleness` skips repos where `now - cached.fetchedAt < TTL` |
| 3 | `r` on focused workspace force-refreshes staleness bypassing TTL | PASS | `invalidateCache()` sets all `fetchedAt` to 0; followed by explicit `fetchStaleness(entry.workspace)` in r handler |
| 4 | Repos without upstream tracking show no badge | PASS | `hasUpstreamTracking` returns false -> `{ count: null, error: false }` -> `resolveBadge` returns empty text |
| 5 | Network failures show red `?` badge per affected repo without crashing | PASS | `fetchOrigin` wrapped in try/catch -> `{ error: true }` -> `resolveBadge` returns `{ text: "?", fg: "red" }` |

### Artifacts

| Artifact | Status |
|----------|--------|
| `src/tui/dashboard/hooks/useStaleness.ts` | EXISTS - 95 lines, exports `StaleInfo`, `useStaleness` |

### Key Links

| Link | Status | Evidence |
|------|--------|----------|
| useStaleness imported in App.tsx | PASS | Line 9: `import { useStaleness } from "./hooks/useStaleness"` |
| staleness signal passed to WorkspaceDetail as prop | PASS | Line 1313: `staleness={staleness()}` |
| WorkspaceDetail renders badge per repo | PASS | Lines 81-88: `resolveBadge` + `<Show when={badge().text}>` |
| App.tsx createEffect triggers fetchStaleness on cursor move | PASS | Lines 146-151: `createEffect` watches `currentEntry()` |
| App.tsx r keybinding calls invalidateCache | PASS | Line 1050: `invalidateCache()` in r handler |

## Requirements Traceability

| Req ID | Description | Status |
|--------|-------------|--------|
| STALE-01 | "N behind" badge per repo | PASS |
| STALE-02 | Fetch on focus with 5-min TTL cache | PASS |
| STALE-03 | r keybinding bypasses TTL | PASS |
| STALE-04 | No-upstream repos show no badge | PASS |
| STALE-05 | Network failures show ? without crash | PASS |

## Automated Checks

- `bun run typecheck`: PASS (no errors)
- `bun test tests/lib/paths-command.test.ts tests/lib/pull.test.ts`: PASS (16/16 prior-phase regression tests)

## Human Verification

None required - all acceptance criteria verifiable through code inspection and automated checks.

## Score

**5/5 must-haves verified. All requirements satisfied.**
