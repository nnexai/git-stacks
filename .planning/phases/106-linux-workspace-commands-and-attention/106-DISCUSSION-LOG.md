# Phase 106: Linux Workspace, Commands, and Attention - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-11
**Phase:** 106-linux-workspace-commands-and-attention
**Areas discussed:** Workspace and repository navigation, terminal tabs and ended sessions, shell and named-command launching, attention hierarchy and focus routing

---

## Workspace and Repository Navigation

| Decision | Alternatives considered | Selected |
|----------|-------------------------|----------|
| Sidebar hierarchy | Workspace-first expandable repositories; flat list with detail pane; two-level sidebar | Workspace-first expandable repositories |
| Organization | Optional grouping/sorting; persistent sections; filter-only | Optional grouping/sorting by label or repository |
| Persistence | Across restarts; session-only; per-window | Across restarts |
| Startup selection | Restore last valid context; first item; no selection | Restore last valid context |
| Pin presentation | Dedicated section; sort boost; compact strip; exact external imitation | Dedicated expandable section |
| Pin ordering | Manual; recency; global sort | Persistent manual drag-and-drop |
| Missing pin | Remove with notice; disabled placeholder; unavailable section | Remove with one-time notice |

**User's choice:** A workspace-first hierarchy with optional organization plus Supacode-like workspace pinning.
**Notes:** Pinned workspaces remain outside grouping/sorting and use row actions plus drag-and-drop. Single-repository workspaces should remain visually shallow.

---

## Terminal Tabs and Ended Sessions

| Decision | Alternatives considered | Selected |
|----------|-------------------------|----------|
| Collection scope | Global; workspace-only; repository-only; exact workspace-repository pair | Exact workspace-repository pair |
| Single-repository display | Auto-collapse; always show; collapsed with explicit launcher selector | Auto-collapse |
| Ordering and titles | Manual persistent; MRU; fixed creation order | Manual persistent with command-derived titles and rename |
| Restored ended tabs | Original position; previous-tabs section; most recent only | Original position with Ended and Relaunch |

**User's choice:** Each workspace-repository pair has distinct tabs, including different worktrees of the same registered repository.
**Notes:** Navigation swaps visible collections without terminating live terminals.

---

## Shell and Named-Command Launching

| Decision | Alternatives considered | Selected |
|----------|-------------------------|----------|
| Primary actions | Beside selection; global palette; persistent panel; contextual top-right split | Top-right contextual menu plus dedicated shell entry points |
| Command launcher | General palette; persistent list; configured-command-only overlay | Configured-command-only overlay inspired by Supacode |
| Command ordering | Recent then alphabetical; configuration order; alphabetical | Recent then alphabetical |
| Duplicate names | Show both with scope; repository override; workspace override; error | Show both with scope labels |
| Startup failure | No tab and structured error; failed diagnostic tab; transient notice | No tab, launcher remains, structured error |

**User's choice:** Put integrations/actions such as Open in VS Code in a top-right menu. Open shells via empty-tab-bar double-click, application menu, or shortcut. Search configured commands through a focused overlay.
**Notes:** The overlay is not a general command palette and launches only service-resolved commands valid for the selected context.

---

## Attention Hierarchy and Focus Routing

| Decision | Alternatives considered | Selected |
|----------|-------------------------|----------|
| Aggregation | Counts at all levels; sidebar dots; global-only count | Direct tab counts plus repository/workspace aggregates |
| Prominence | Failed/waiting first; every state unread; failed only | Failed/waiting first, completed secondary, working/idle status-only |
| Read behavior | Explicit only; focus-only; hybrid; configurable | Hybrid exact-item/exact-tab acknowledgement |
| Missing-surface fallback | Ended predecessor/repository/workspace; repository only; workspace only; no navigation | Ended predecessor, then repository, then workspace |

**User's choice:** Preserve precise attention location while allowing exact-tab focus to acknowledge current items.
**Notes:** Workspace/repository navigation alone never clears unread attention, and events never steal focus automatically.

---

## the agent's Discretion

- Concrete GTK widgets, visual styling, shortcuts, matching details, numeric limits, and error presentation may be chosen during research and planning within the locked behavior.

## Deferred Ideas

- General-purpose command palette.
- Terminal splits, search, and advanced layout persistence.
