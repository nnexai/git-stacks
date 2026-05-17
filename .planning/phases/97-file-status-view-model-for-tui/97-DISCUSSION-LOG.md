# Phase 97: File Status View Model for TUI - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-17
**Phase:** 97-File Status View Model for TUI
**Areas discussed:** Model Shape, Status Language, Loading Cost, Error Surface

---

## Model Shape

| Option | Description | Selected |
|--------|-------------|----------|
| Grouped view model | Return workspace-level and repo-level sections, each with entries plus a compact summary. Best fit for later `WorkspaceDetail` rendering. | ✓ |
| Raw status passthrough | Return the existing `FileEntryStatus[]` mostly unchanged. Smallest implementation, but pushes grouping/summarizing into Phase 98. | |
| Summary-first object | Return only totals and attention states by default, with optional details. Good for list rows, but may under-serve the detail panel. | |
| You decide | Let the agent choose the model shape. | |

**User's choice:** Grouped view model.
**Notes:** The user selected grouped workspace/repo sections with entries plus compact summaries.

---

## Status Language

| Option | Description | Selected |
|--------|-------------|----------|
| Preserve CLI states plus severity | Keep states like `missing`, `pullable`, `pushable`, `diverged`, `error`, and add a TUI severity/attention field. Best for parity and rendering. | ✓ |
| Translate to TUI-only labels | Expose labels like `ok`, `warning`, `action_needed`, `blocked`, hiding CLI-specific terms from the dashboard. | |
| Preserve CLI states only | No extra severity layer; Phase 98 derives visual emphasis from raw states. | |
| You decide | Let the agent choose the status language. | |

**User's choice:** Preserve CLI states plus severity.
**Notes:** Parity with `git-stacks files status` stays visible, while TUI consumers get an explicit attention/severity signal.

---

## Loading Cost

| Option | Description | Selected |
|--------|-------------|----------|
| Detail-selected lazy load | Phase 97 exposes a helper that can run when a workspace detail is selected. Avoids scanning every workspace up front. | ✓ |
| Include in workspace status loading | Extend `useWorkspaces()` / `WorkspaceStatus` so every loaded workspace has file status ready. Simpler for rendering, heavier on startup. | |
| Separate scheduler-ready helper | Expose the helper only; Phase 98 decides whether to lazy-load, batch, cache, or refresh it. | |
| You decide | Let the agent choose the loading pattern. | |

**User's choice:** Detail-selected lazy load.
**Notes:** File status should not become part of every workspace row's eager status scan.

---

## Error Surface

| Option | Description | Selected |
|--------|-------------|----------|
| Summary plus detail buckets | Return a compact warning summary for the dashboard and per-entry error/detail buckets for expanded rendering or tests. | ✓ |
| Compact summary only | Keep errors collapsed to counts and a short warning string. Simpler, but loses inspection detail. | |
| Per-entry details only | Let Phase 98 build summaries from entry-level errors. More flexible, more work for dashboard consumers. | |
| You decide | Let the agent choose the error surface. | |

**User's choice:** Summary plus detail buckets.
**Notes:** The model should support both concise dashboard display and inspectable detailed states.

---

## the agent's Discretion

- Exact type names, module boundaries, and summary field names.

## Deferred Ideas

- All matched pending todos were reviewed and not folded into Phase 97.
