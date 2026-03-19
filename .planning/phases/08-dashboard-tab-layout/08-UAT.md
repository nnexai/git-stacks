---
status: complete
phase: 08-dashboard-tab-layout
source: 08-01-SUMMARY.md, 08-02-SUMMARY.md, 08-03-SUMMARY.md, 08-04-SUMMARY.md
started: 2026-03-19T00:00:00Z
updated: 2026-03-19T00:00:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Dashboard launches with tabbed layout
expected: Run `git-stacks manage`. Single outer box with tab labels in title bar, e.g. `[1 Workspaces]  2 Templates  3 Repos`. List pane (~60%) and detail pane (~40%) render side by side immediately.
result: issue
reported: "selecting something on the workspaces introduces a new line at the bottom which pushes up the details so they overflow into the title of the separator. also if you have trouble designing this thing, two boxes (one for lists and one for details) is fine. moving the shortcut helper below the detail box (outside)."
severity: major

### 2. Tab switching with 1/2/3 keys
expected: Press `2` → Templates tab becomes active (bracket moves to `[2 Templates]`). Press `3` → Repos tab active. Press `1` → back to Workspaces. Press `[` and `]` to cycle tabs in both directions.
result: issue
reported: "switching tabs still freezes the ui - it continues to show the workspaces list. it is possible to get back to a working state."
severity: major

### 3. Per-tab state preserved on tab switch
expected: Navigate to a workspace in Workspaces tab, then press `2` to go to Templates, then press `1` to return. The Workspaces tab cursor is back on the same workspace — position is preserved.
result: skipped
reason: tab switching is broken (test 2 issue)

### 4. Workspace detail pane auto-updates
expected: In the Workspaces tab, use ↑/↓ or j/k to move through the list. The detail pane (lower half) updates to show the selected workspace's branch, created date, and repos list — without pressing Enter.
result: pass

### 5. Esc does not exit from top-level list
expected: In Workspaces tab list view (no action menu open, no filter active), press Esc. The TUI stays open — nothing exits. Only pressing `q` should exit the dashboard.
result: pass

### 6. Templates tab shows real data
expected: Press `2` for Templates tab. The list pane shows your templates with name, repo count, and description. Moving the cursor updates the detail pane showing repos, hooks summary, and per-repo mode rows.
result: skipped
reason: tab switching is broken (test 2 issue)

### 7. Repos tab shows real data with disk indicator
expected: Press `3` for Repos tab. The list pane shows repos with a ✓ (exists on disk) or ✗ (missing) indicator, name, type, and truncated path. Selecting a repo shows path/type/branch/disk status in the detail pane, plus "Used by" templates/workspaces.
result: skipped
reason: tab switching is broken (test 2 issue)

### 8. Workspace rename flow
expected: In Workspaces tab, press Enter on a workspace → action menu appears. Press `n` for Rename → an inline input appears pre-filled with the current name. Edit the name and press Enter → progress view → returns to list with updated name.
result: issue
reported: "the actions menu is floating at the top of the details screen. this feels awkward."
severity: minor

### 9. Template edit flow
expected: Press `2` → Templates tab. Press Enter on a template → template action menu. Press `e` → your $EDITOR opens with the template YAML. Save and exit → returns to the Templates list.
result: skipped
reason: tab switching broken (test 2 issue)

### 10. Template clone flow
expected: In Templates tab, Enter on template → action menu → `c` → inline input → type name → Enter → new template in list.
result: skipped
reason: tab switching broken (test 2 issue)

### 11. Template remove flow
expected: In Templates tab, Enter on template → action menu → `r` → confirmation → confirm → template removed.
result: skipped
reason: tab switching broken (test 2 issue)

### 12. Help overlay
expected: Press `?` from any tab. Keybinding reference overlay appears. Press Esc or `?` again → closes.
result: issue
reported: "keybindings is smushed into an empty box. pressing escape works. pressing ? again works."
severity: minor

### 13. Esc back-chain
expected: Enter → action menu → Esc → back to list. `/` → type → Esc → filter clears. `?` → Esc → closes. Esc never exits TUI.
result: issue
reported: "pressing filter key / goes into filter mode, but filter line is only displayed when another input is entered. so pressing / once does not tell me i am filtering"
severity: minor

## Summary

total: 13
passed: 2
issues: 5
pending: 0
skipped: 6

## Gaps

- truth: "Two separate bordered boxes (list box on top, detail box below); help bar sits outside/below the detail box; batch select bar does not push detail content up"
  status: failed
  reason: "User reported: selecting something introduces a new line at the bottom pushing up details so they overflow into the separator title. User clarified: two boxes (one for lists, one for details) is acceptable. Help bar should move below the detail box."
  severity: major
  test: 1
  root_cause: "BatchBar rendered inside the flex column alongside list+separator+detail, so it consumes a row from the available space and causes overflow. Single-box layout with separator is too fragile for dynamic content. Help bar is inside the layout, not pinned outside."
  artifacts:
    - path: "src/tui/dashboard/App.tsx"
      issue: "layout uses a single outer box with height math that breaks when conditional rows (BatchBar, loading indicator) appear; help bar inside the layout"
  missing:
    - "Switch to two-box layout: top bordered box for list, bottom bordered box for detail"
    - "Move help bar (and batch bar) outside/below both boxes, not inside the flex column"
    - "Remove inner borders from WorkspaceList/TemplateList/RepoList (already done in current code)"

- truth: "Pressing 1/2/3 or [/] switches the active tab and updates the visible content"
  status: failed
  reason: "User reported: switching tabs freezes the UI — it continues to show the workspaces list. Possible to get back to a working state."
  severity: major
  test: 2
  root_cause: "Unknown — tab signal updates but rendered content does not switch. Likely a SolidJS reactivity issue: Show conditions or tab-dependent memos may not be re-evaluating correctly when tab() changes."
  artifacts:
    - path: "src/tui/dashboard/App.tsx"
      issue: "tab() signal changes but Show blocks gated on tab() do not re-render; or setTab() call is being swallowed before reaching the signal"
  missing:
    - "Investigate why Show conditions on tab() do not trigger re-render on tab change"
    - "Verify setTab() is reached in the keyboard handler when 1/2/3 pressed"

- truth: "Action menu appears centered/prominent in the detail area, not floating at the top corner"
  status: failed
  reason: "User reported: the actions menu is floating at the top of the details screen. this feels awkward."
  severity: minor
  test: 8
  root_cause: "ActionMenu box renders at top of the detail pane box with no centering or padding; it floats in the upper-left of the detail area"
  artifacts:
    - path: "src/tui/dashboard/ActionMenu.tsx"
      issue: "no vertical centering or top padding; floats at top of container"
    - path: "src/tui/dashboard/App.tsx"
      issue: "detail pane box renders ActionMenu without any centering wrapper"
  missing:
    - "Add top padding or center ActionMenu vertically within the detail pane"

- truth: "HelpOverlay displays keybindings clearly formatted, not smushed"
  status: failed
  reason: "User reported: keybindings is smushed into an empty box"
  severity: minor
  test: 12
  root_cause: "HelpOverlay box renders without enough width/height or text wraps incorrectly; content compressed into corner"
  artifacts:
    - path: "src/tui/dashboard/HelpOverlay.tsx"
      issue: "box sizing insufficient or text nodes rendering without spacing"
  missing:
    - "Fix HelpOverlay box dimensions or padding so keybindings render clearly"

- truth: "Pressing / immediately shows a filter mode indicator (e.g. 'filter: _') even before any characters are typed"
  status: failed
  reason: "User reported: pressing / once does not tell me i am filtering — filter line only appears when another input is entered"
  severity: minor
  test: 13
  root_cause: "filter display is conditioned on props.filter being non-empty; when filtering=true but filter='', nothing shows"
  artifacts:
    - path: "src/tui/dashboard/WorkspaceList.tsx"
      issue: "<Show when={props.filter}> hides the filter line when filter is empty string"
    - path: "src/tui/dashboard/TemplateList.tsx"
      issue: "same condition"
    - path: "src/tui/dashboard/RepoList.tsx"
      issue: "same condition"
  missing:
    - "Show filter line whenever filtering prop is true, not just when filter string is non-empty; display 'filter: _' cursor when empty"
