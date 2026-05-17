---
phase: 98
slug: grounded-dashboard-control-center
status: approved
shadcn_initialized: false
preset: none
created: 2026-05-17
---

# Phase 98 - UI Design Contract

> Visual and interaction contract for making `git-stacks manage` a denser operator control center without replacing the existing keyboard-first list/detail TUI.

---

## Design System

| Property | Value |
|----------|-------|
| Tool | none |
| Preset | not applicable |
| Component library | OpenTUI/Solid primitives already used in `src/tui/dashboard` |
| Icon library | Existing terminal symbols only; no new icon package |
| Font | Terminal monospace |

---

## Primary Screen Contract

| Area | Contract |
|------|----------|
| Focal point | Selected workspace row remains the primary anchor; detail pane explains the selected row. |
| Navigation | Preserve tabs, list cursor, selection, filter, actions, messages overlay, and keyboard-first operation. |
| Density | Refine existing row ordering and grouping; do not add dashboard cards, KPI panels, or decorative summaries. |
| Detail order | Render `attention/messages -> repos -> file config/status -> source/issue links -> integrations -> notes -> config`. |
| Scrolling | Long workspace detail content must scroll independently of list navigation. |

---

## Spacing Scale

Declared values are terminal-cell equivalents of the existing dashboard spacing.

| Token | Value | Usage |
|-------|-------|-------|
| xs | 4px | Inline status token gaps and compact separators |
| sm | 8px | Row indentation, grouped prefixes, section body indentation |
| md | 16px | Section breaks and detail grouping |
| lg | 24px | Pane interior margin equivalent |
| xl | 32px | Major detail subsection separation when vertical room allows |
| 2xl | 48px | not used in this compact TUI phase |
| 3xl | 64px | not used in this compact TUI phase |

Exceptions: Terminal rows remain 1 cell high for workspace rows and grouped headers.

---

## Typography

| Role | Size | Weight | Line Height |
|------|------|--------|-------------|
| Body | terminal default | regular | 1 terminal row |
| Label | terminal default | regular | 1 terminal row |
| Heading | terminal default | bright/semantic color | 1 terminal row |
| Display | not used | not used | not used |

---

## Color

| Role | Value | Usage |
|------|-------|-------|
| Dominant (60%) | terminal default black/background | Main list/detail surfaces |
| Secondary (30%) | `#333333` or gray terminal text | Focused row background, muted metadata, scroll/status footers |
| Accent (10%) | cyan/yellow/green/red semantic terminal colors | Active branch/link text, warning group/status, success/dirty/error state only |
| Destructive | red | Existing destructive action confirmations and hard error status only |

Accent reserved for: selected/focused status, branch/link identifiers, warning/error/success semantics, scroll/footer hints.

---

## Copywriting Contract

| Element | Copy |
|---------|------|
| Primary CTA | Open Actions |
| Empty state heading | No workspaces found |
| Empty state body | Run `git-stacks new` to create one. |
| Error state | Error: {message} |
| Destructive confirmation | Existing destructive workspace confirmations remain unchanged; Phase 98 adds no new destructive action. |

---

## Snapshot Contract

| Snapshot Area | Required Coverage |
|---------------|-------------------|
| Rows | narrow, medium, and wide row truncation/density, with message attention last |
| Grouping | `none`, `label`, `state`, and `template` headers with navigable rows |
| Details | ordered sections, file-status detail, notes summary/detail, linked issue/source placement |
| Footers | contextual grouping/filter/detail-scroll hints without overflowing narrow widths |
| Long Detail | detail scroll proves content past visible height remains reachable |

---

## Registry Safety

| Registry | Blocks Used | Safety Gate |
|----------|-------------|-------------|
| shadcn official | none | not required |
| third-party registries | none | not applicable |

---

## Checker Sign-Off

- [x] Dimension 1 Copywriting: PASS
- [x] Dimension 2 Visuals: PASS
- [x] Dimension 3 Color: PASS
- [x] Dimension 4 Typography: PASS
- [x] Dimension 5 Spacing: PASS
- [x] Dimension 6 Registry Safety: PASS

**Approval:** approved 2026-05-17
