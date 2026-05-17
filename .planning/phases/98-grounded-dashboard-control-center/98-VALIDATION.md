---
phase: 98
slug: grounded-dashboard-control-center
status: ready
created: 2026-05-17
---

# Phase 98 - Validation Strategy

## Validation Architecture

Phase 98 is a TUI behavior/layout phase. Validation must prove that the dashboard remains keyboard-first while exposing denser grouping and richer details.

## Required Samples

| Sample | Proof |
|--------|-------|
| narrow rows | Snapshot captures row truncation with status tokens and message attention last. |
| medium rows | Snapshot captures balanced name/branch/status/count/message ordering. |
| wide rows | Snapshot captures richer labels/status without shifting message attention. |
| grouped headers | Snapshot covers `label`, `state`, and `template` headers with concrete status context still visible in rows. |
| detail ordering | Component or snapshot test asserts `Messages`, `Repos`, `Files`, `Source/Issues`, `Integrations`, `Notes`, `Config` order. |
| file status display | Test renders Phase 97 loaded/error states without CLI subprocess use. |
| notes display | Test renders count/latest/detail only in workspace detail. |
| contextual footers | Snapshot covers grouping/filter/detail-scroll hints at narrow and wide widths. |
| long-detail scrolling | Interaction test proves detail content beyond viewport is reachable. |

## Commands

- `bun run test tests/tui/dashboard/WorkspaceDetail.test.tsx`
- `bun run test tests/tui/dashboard/snapshots/WorkspaceRow.snap.test.tsx tests/tui/dashboard/snapshots/WorkspaceList.snap.test.tsx tests/tui/dashboard/snapshots/WorkspaceDetail.snap.test.tsx`
- `bun run typecheck`

## Gate Expectations

- No production dashboard path shells out to `git-stacks files status`.
- No notes badges are added to workspace rows.
- No Phase 99 actions become executable from Phase 98.
