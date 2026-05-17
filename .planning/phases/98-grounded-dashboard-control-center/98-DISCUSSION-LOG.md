# Phase 98: Grounded Dashboard Control Center - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-17
**Phase:** 98-Grounded Dashboard Control Center
**Areas discussed:** Workspace List Density, Grouping Model, Detail Section Order, Notes and File Summaries, Snapshot Coverage, Action Boundary

---

## Workspace List Density

| Option | Description | Selected |
|--------|-------------|----------|
| Mostly as-is | Keep existing row structure and refine density/information ordering. | ✓ |
| Redesign rows | Rework row layout around new attention, note, file, or command indicators. | |
| Summary-panel emphasis | Keep rows very light and move most information into separate panels. | |

**User's choice:** Mostly as-is.
**Notes:** The user said "mostly as is." Phase 98 should not redesign workspace rows from scratch.

---

## Grouping Model

| Option | Description | Selected |
|--------|-------------|----------|
| `none`, `label`, `state`, `template` | Support exactly these general grouping modes. | ✓ |
| Label-only | Preserve the current grouping direction and defer other modes. | |
| Dynamic/custom grouping | Allow broader or configurable grouping. | |

**User's choice:** `none`, `label`, `state`, `template`.
**Notes:** The user said "exactly those generally." Grouping should stay useful without hiding concrete status reasons.

---

## Detail Section Order

| Option | Description | Selected |
|--------|-------------|----------|
| Use roadmap order exactly | `attention/messages -> repos -> file config/status -> source/issue links -> integrations -> notes -> config`. | ✓ |
| Move notes higher | Put notes near attention/messages so operator memory is more visible. | |
| Move file status higher | Put file status before repos when sync drift is present. | |
| Dynamic order | Promote sections with warnings or fresh activity. | |

**User's choice:** Use roadmap order exactly.
**Notes:** The user also added that the plan should think about scrolling when details are too long.

---

## Notes and File Summaries

| Option | Description | Selected |
|--------|-------------|----------|
| Compact summaries only, with command hints | Show latest note/count and file status summary, plus command hints for full detail. | |
| Compact summaries plus expandable detail rows | Show summaries by default and a bounded set of recent notes or file entries. | |
| Full detail in dashboard | Render notes and file status deeply inside the TUI, avoiding command handoff where possible. | ✓ |
| You decide | Let the agent choose. | |

**User's choice:** Full detail in dashboard.
**Notes:** Pair with scrollable details so long notes/file sections stay usable.

---

## Snapshot Coverage

| Option | Description | Selected |
|--------|-------------|----------|
| Roadmap set exactly | Narrow/medium/wide rows, grouped headers, detail ordering, file status display, note summary, contextual footers. | |
| Roadmap set plus long-detail scrolling | Same as roadmap set, plus a long detail panel that proves scrolling works. | ✓ |
| Focus only on changed areas | Avoid broad row/footer snapshots unless touched. | |
| You decide | Let the agent choose. | |

**User's choice:** Roadmap set plus long-detail scrolling.
**Notes:** Long detail scrolling is mandatory acceptance coverage.

---

## Action Boundary

| Item | Decision |
|------|----------|
| Repo edit action | Capture as a Phase 98 consistency concern only; implementation remains Phase 99. |
| Manual command TUI menu | Keep out of Phase 98; treat as Phase 99 action-menu scope. |

## the agent's Discretion

- Exact grouping labels and state buckets.
- Exact component split for scrollable details.
- Exact snapshot fixture names and terminal dimensions, provided the locked coverage states are present.

## Deferred Ideas

- Manual command TUI menu.
- Stale cleanup/advisory view.
- Actual repo edit action implementation.
