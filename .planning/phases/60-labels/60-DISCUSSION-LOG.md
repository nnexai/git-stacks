# Phase 60: Labels - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-03
**Phase:** 60-labels
**Areas discussed:** TUI label placement, Group-by-label UX, Label subcommand structure, Filter syntax

---

## TUI Label Placement

### Q1: Where should label tags render in WorkspaceRow?

| Option | Description | Selected |
|--------|-------------|----------|
| After ahead/behind | Labels after ↑N ↓N, before counts. Labels are metadata, placed after branch-distance group. | ✓ |
| After branch, before ↑N ↓N | As spec suggests. Groups labels with branch context. | |
| Replace message preview | Show labels INSTEAD of message preview when labels exist. | |

**User's choice:** After ahead/behind (Recommended)

### Q2: How should label tags be styled?

| Option | Description | Selected |
|--------|-------------|----------|
| Dim brackets | Dim gray brackets with white text: [backend] [sprint:14]. Subtle. | ✓ |
| Colored by hash | Each label gets stable color from name hash. More visible but noisy. | |
| No brackets, just dim text | Minimal but may blend with other columns. | |

**User's choice:** Dim brackets (Recommended)

### Q3: Max labels before truncation?

| Option | Description | Selected |
|--------|-------------|----------|
| 2 labels + overflow | First 2 labels, then '+N' if more. Keeps row manageable. | ✓ |
| Fit to available width | As many as fit. Responsive but inconsistent. | |
| 1 label + overflow | Ultra-compact. Minimal space but loses info. | |

**User's choice:** 2 labels + overflow (Recommended)

---

## Group-by-label UX

### Q4: Cursor navigation in grouped view?

| Option | Description | Selected |
|--------|-------------|----------|
| Flat cursor | Up/down through all rows linearly, group headers skipped. Simple, consistent. | ✓ |
| Group-aware navigation | Within-group movement, keypress to jump between headers. | |
| Collapse/expand groups | Groups start collapsed. Most compact but complex interaction. | |

**User's choice:** Flat cursor across all items (Recommended)

### Q5: Multi-group workspace actions?

| Option | Description | Selected |
|--------|-------------|----------|
| All groups update | Actions affect the workspace itself. All appearances refresh immediately. | ✓ |
| Only current group | Other appearances refresh on next data reload. | |

**User's choice:** Yes, all groups update (Recommended)

---

## Label Subcommand Structure

### Q6: Where should label subcommand live?

| Option | Description | Selected |
|--------|-------------|----------|
| New src/commands/label.ts | Separate file, registered in index.ts. Keeps workspace.ts from growing. | ✓ |
| Extend workspace.ts | One file but workspace.ts already 1019 lines. | |
| New workspace-ops functions + thin command | Maximum separation. | |

**User's choice:** New src/commands/label.ts (Recommended)

### Q7: Wizard labels prompt placement?

| Option | Description | Selected |
|--------|-------------|----------|
| After repos, before hooks | Name → branch → repos → labels → hooks/integrations. | ✓ |
| At the end with optional extras | Keeps core flow fast. | |
| You decide | Claude's discretion. | |

**User's choice:** After repos, before hooks (Recommended)

---

## Filter Syntax

### Q8: TUI filter matching?

| Option | Description | Selected |
|--------|-------------|----------|
| Auto-match both | '/backend' matches name OR label. No prefix needed. Optional 'label:' prefix for label-only. | ✓ |
| Require label: prefix | '/backend' name only, '/label:backend' for labels. | |
| Full-text search | Match name, labels, branch, description. | |

**User's choice:** Auto-match both (Recommended)

### Q9: Multi-term AND logic in TUI?

| Option | Description | Selected |
|--------|-------------|----------|
| Single filter term | TUI is single term. AND logic CLI-only. | ✓ |
| Space-separated AND | '/backend sprint' means both must match. | |

**User's choice:** Single filter term (Recommended)

---

## Claude's Discretion

- Responsive width calculation for label tags
- Group header styling
- `label:` prefix match behavior (substring vs exact)
- `label clear` confirmation
- Test structure

## Deferred Ideas

None — discussion stayed within phase scope
