# Phase 39: TUI Upstream Staleness - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md -- this log preserves the alternatives considered.

**Date:** 2026-03-26
**Phase:** 39-TUI Upstream Staleness
**Areas discussed:** Badge format & placement, Cache architecture, Fetch trigger behavior

---

## Badge format & placement

### Badge placement

| Option | Description | Selected |
|--------|-------------|----------|
| After mode label | Appended at end of repo line, yellow color | ✓ |
| Replace icon when behind | Count replaces check icon, more compact | |
| You decide | Claude picks based on terminal width | |

**User's choice:** After mode label
**Notes:** Clean extension of current layout. Up-to-date repos show no badge.

### Special states

| Option | Description | Selected |
|--------|-------------|----------|
| Dash/question/spinner | No upstream: nothing. Error: '?' red. Loading: dim '...' | ✓ |
| Explicit labels | 'no remote', 'fetch failed', 'checking...' | |
| You decide | Claude picks based on TUI patterns | |

**User's choice:** Dash/question/spinner
**Notes:** Matches STALE-04 and STALE-05 requirements. Minimal visual noise.

---

## Cache architecture

| Option | Description | Selected |
|--------|-------------|----------|
| In-memory reactive signal | SolidJS signal Map, no file I/O, dies with session | ✓ |
| File-based JSON cache | Persists across TUI restarts | |
| You decide | Claude picks based on dashboard architecture | |

**User's choice:** In-memory reactive signal
**Notes:** Fast, reactive, no file I/O overhead. Fresh data on restart is acceptable.

---

## Fetch trigger behavior

| Option | Description | Selected |
|--------|-------------|----------|
| Cursor enters workspace row | Fetch on cursor move, show cached instantly | ✓ |
| Entering detail pane explicitly | Only fetch on Enter/right | |
| You decide | Claude picks based on responsiveness | |

**User's choice:** Cursor enters workspace row
**Notes:** Minimal user friction. Background fetch only when TTL expired.

---

## Claude's Discretion

- SolidJS hook API design for staleness cache
- Git command for behind count
- Fetch timeout value
- Scope of `r` refresh (focused vs all visible)

## Deferred Ideas

None -- discussion stayed within phase scope
