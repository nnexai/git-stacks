# Phase 99: Dashboard Actions and Correctness Polish - UI Spec

**Created:** 2026-05-17
**Status:** Approved for planning

## Surface Contract

Phase 99 extends existing dashboard action dialogs. It must preserve the current keyboard-first, centered-dialog model and must not introduce a new full-screen command palette, landing panel, or dashboard redesign.

## Components

| Surface | Contract |
|---------|----------|
| Workspace action menu | Keep existing rows and shortcuts stable. Add visible grouped rows for `Issue...` and `Commands...` with disabled labels when unavailable. |
| Repo action menu | Add `Edit ($EDITOR)` using the same plain row treatment as template edit. Keep `w`, `t`, and `r` shortcuts stable. |
| Picker dialog | Use `CenteredDialog` and the same arrow/Enter/Escape interaction as action menus. Rows are compact text rows, not cards. |
| Progress dialog | Reuse `ProgressView` for manual-command and issue-open progress/error output. Completion and failures stay visible until keypress. |

## Copy And Shortcuts

- Workspace issue row label:
  - Enabled: `Issue...`
  - No linked issue: `Issue... (none linked)`
  - No opener available: `Issue... (no opener)`
- Workspace command row label:
  - Enabled: `Commands...`
  - No visible commands: `Commands... (none configured)`
- Repo edit row label: `Edit ($EDITOR)`.
- Preserve existing shortcuts:
  - Workspace: `o`, `x`, `n`, `e`, `c`, `r`, `m`, `s`, `p`, and existing `u` run behavior.
  - Repos: `w`, `t`, `r`.
  - Templates: `w`, `e`, `c`, `r`.
- New shortcuts must avoid collisions within the same menu. Suggested workspace keys are `i` for Issue and `d` for Commands if `u` remains bound to the existing Run row.

## Disabled State

Disabled rows remain visible, render in muted gray, and cannot be activated by Enter or direct shortcut. The row text carries the reason; no separate help text is required.

## Picker Rows

- Command picker rows show visible command names only, one per row.
- Hidden `pre*` and `post*` command names must not appear as primary picker rows.
- Issue picker rows use tracker title case followed by the issue id, for example `GitHub: ABC-123` and `Jira: ABC-123`.
- Escape returns to the workspace action menu or list without running anything.

## Visual Constraints

- Use the existing `CenteredDialog` sizes. Small is appropriate for action menus; medium is appropriate for picker lists if row count may exceed the small dialog comfortably.
- Do not add cards inside dialogs.
- Do not add explanatory in-app text about how commands, issues, or rollback work.
- Keep line lengths compatible with narrow terminal widths by truncating or choosing compact labels where necessary.

## Non-Targets

- No changes to `CreateProgressView`.
- No dashboard create-flow rollback progress rendering.
- No stale workspace action or cleanup recommendation.
- No broad forge/browser command family beyond opening a linked issue through existing integration behavior.

## UI-SPEC VERIFIED
