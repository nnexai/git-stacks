# Phase 58: Ahead/Behind Tracking - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-03
**Phase:** 58-ahead-behind-tracking
**Areas discussed:** Staleness UX, CLI column layout, TUI row density, Zero-count display

---

## Staleness UX

### Q1: How should the existing useStaleness hook relate to the new ahead/behind tracking?

| Option | Description | Selected |
|--------|-------------|----------|
| Replace useStaleness | Remove the existing fetch-based hook. Ahead/behind computes from local refs only. A separate 'Refresh' action can trigger fetches. | ✓ |
| Keep both systems | useStaleness continues fetching for its 'N behind' badge. New ahead/behind is separate local-only computation. Two sources of truth. | |
| Merge into one | Refactor useStaleness to do local-only computation with optional fetch step. Single source of truth. | |

**User's choice:** Replace useStaleness (Recommended)
**Notes:** Clean break — remove network calls from render path entirely.

### Q2: How should stale ahead/behind data be rendered in the TUI?

| Option | Description | Selected |
|--------|-------------|----------|
| Dim + suffix | Show counts in dim/gray when stale, append '?' suffix: '↓3?' | ✓ |
| Yellow warning icon | Show '⚠' or '!' before stale counts | |
| Hide stale counts | Don't show ahead/behind when stale — show '~' or '—' instead | |

**User's choice:** Dim + suffix (Recommended)
**Notes:** Minimal visual noise, still informative.

---

## CLI Column Layout

### Q3: How should AHEAD/BEHIND fit into the list output?

| Option | Description | Selected |
|--------|-------------|----------|
| Compact inline | Keep headerless format. Add ↑N ↓N after branch, before repo count. | ✓ |
| Add column headers | Switch to proper table with headers: NAME, BRANCH, AHEAD, BEHIND, etc. | |
| Right-aligned columns | Keep current format, add right-aligned AHEAD BEHIND at end of line. | |

**User's choice:** Compact inline (Recommended)
**Notes:** Consistent with current CLI style.

### Q4: Should `git-stacks list` also support --fetch?

| Option | Description | Selected |
|--------|-------------|----------|
| Status only | list stays fast (local-only). status --fetch does the network call. | ✓ |
| Both commands | Add --fetch to both list and status. | |

**User's choice:** Status only (Recommended)
**Notes:** list must stay fast across many workspaces.

---

## TUI Row Density

### Q5: Where should ↑N ↓N indicators go in WorkspaceRow?

| Option | Description | Selected |
|--------|-------------|----------|
| After branch | Place after branch name, before counts column. Visually grouped with branch context. | ✓ |
| After counts column | Place after '3wt 1tr' section. Groups all numeric info together. | |
| Replace message preview | Show ahead/behind INSTEAD of message preview when non-zero. | |

**User's choice:** After branch (Recommended)
**Notes:** Natural position — branch context first, then its distance from base.

### Q6: Should ahead/behind indicators have color in TUI?

| Option | Description | Selected |
|--------|-------------|----------|
| Color-coded | ↑N in green (ahead = ready to push), ↓N in yellow (behind = needs sync). | ✓ |
| Uniform dim | Both in gray/dim. Just informational. | |
| Only color non-zero | Non-zero counts get color, zeros stay dim. | |

**User's choice:** Color-coded (Recommended)
**Notes:** Matches existing color conventions (dirty=yellow, clean=green).

---

## Zero-count Display

### Q7: How should zero counts display in TUI WorkspaceRow?

| Option | Description | Selected |
|--------|-------------|----------|
| Hide zeros | Only show non-zero values. Clean — only actionable info shows. | ✓ |
| Dim zeros | Show '↑0 ↓0' in dim gray always. Scannable but noisy. | |
| Checkmark when synced | Show '✓' when both zero. Communicates 'up to date' explicitly. | |

**User's choice:** Hide zeros (Recommended)
**Notes:** Consistent with dirty indicator pattern (hidden when clean).

### Q8: Same rule for CLI list output?

| Option | Description | Selected |
|--------|-------------|----------|
| Same rule — hide zeros | Consistent behavior across CLI and TUI. | ✓ |
| Always show in CLI | Always show '↑0 ↓0' for column alignment and scripting. | |

**User's choice:** Same rule — hide zeros
**Notes:** JSON output (`--json`) always includes full numeric fields regardless.

---

## Claude's Discretion

- Exact responsive width allocation for the new column in WorkspaceRow
- How to handle "Refresh" action in TUI (keybinding or action menu)
- Stale indicator detail level (timestamp vs just `?` suffix)
- Test structure and mock patterns for new git primitives

## Deferred Ideas

None — discussion stayed within phase scope
