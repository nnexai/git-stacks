# Phase 98 - Pattern Map

## Files and Existing Analogs

| Target | Role | Closest Analog | Pattern to Reuse |
|--------|------|----------------|------------------|
| `src/tui/dashboard/App.tsx` | Dashboard state, keyboard handling, grouping mode, footer text | Existing tab/cursor/filter/groupedByLabel signals | Keep keyboard routing centralized; preserve per-tab cursor/filter state. |
| `src/tui/dashboard/WorkspaceList.tsx` | Grouped list rendering and list viewport | Existing `GroupedItem` header/entry rendering | Generalize grouped rows without making headers navigable. |
| `src/tui/dashboard/WorkspaceRow.tsx` | Dense workspace row | Existing status/count/ahead/behind/label/message layout | Preserve row structure; refine ordering only where necessary. |
| `src/tui/dashboard/WorkspaceDetail.tsx` | Ordered detail sections, notes, file status, config | Existing repos/messages/integrations/linked issues sections | Split into section helpers if useful; keep one detail pane. |
| `src/tui/dashboard/types.ts` | Dashboard state types | Existing `WorkspaceStatus`, `UIView`, `Action` unions | Add grouping/detail-scroll/file-status state explicitly; avoid `any` growth. |
| `src/tui/dashboard/hooks/useWorkspaceFileStatus.ts` | Lazy file-status detail source | Phase 97 planned hook | Consume directly from detail path; do not load per row. |
| `src/lib/notes.ts` | Notes summary/detail source | Phase 96 shipped helper | Use `getWorkspaceNoteSummary()` and `listWorkspaceNotes()`; do not parse JSONL in UI. |
| `tests/tui/dashboard/WorkspaceDetail.test.tsx` | Detail component coverage | Existing integration/source tests | Extend with ordered sections, notes, file status, long detail content. |
| `tests/tui/dashboard/snapshots/*.snap.test.tsx` | Terminal acceptance snapshots | Existing WorkspaceRow and RepoDetail snapshots | Add focused snapshots for grouped list/detail/footer states. |

## Data Flow

1. `App.tsx` owns selected workspace, grouping mode, detail scroll offset, and footer copy.
2. `WorkspaceList.tsx` receives precomputed grouped rows and renders headers plus `WorkspaceRow`.
3. `WorkspaceRow.tsx` continues to render concrete status tokens, repo counts, labels, branch, and message attention.
4. `WorkspaceDetail.tsx` receives selected `WorkspaceEntry`, messages, notes/file-status states, and scroll offset.
5. Notes come from `src/lib/notes.ts`; file status comes from Phase 97's lazy grouped view model/hook.

## Landmines

- `WorkspaceList.tsx` currently duplicates `GroupedItem` type with `App.tsx`; generalization should either share the type through `types.ts` or keep the duplication narrow and identical.
- `WorkspaceDetail.tsx` currently reads global config synchronously inside render; large new data reads should not follow that pattern if they can be loaded lazily.
- Terminal snapshots freeze time in existing tests; new note/message age snapshots should do the same.
- Existing output uses Unicode symbols. New tests should assert behavior strings and not depend on terminal color escape sequences.
