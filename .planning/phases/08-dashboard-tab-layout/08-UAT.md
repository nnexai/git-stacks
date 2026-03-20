---
status: complete
phase: 08-dashboard-tab-layout
source: 08-01-SUMMARY.md, 08-02-SUMMARY.md, 08-03-SUMMARY.md, 08-04-SUMMARY.md, 08-05-SUMMARY.md
started: 2026-03-20T00:00:00Z
updated: 2026-03-20T00:30:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Dashboard launches with two-box layout
expected: Run `git-stacks manage`. Two separate bordered boxes appear stacked vertically: top box for the list (~60%), bottom box for the detail (~40%). Tab labels show in the top box title bar. Help bar sits below/outside both boxes. No content overflow.
result: pass

### 2. Tab switching with 1/2/3 keys
expected: Press `2` → Templates tab becomes active, list content changes to templates. Press `3` → Repos tab with repo list. Press `1` → back to Workspaces. Content updates immediately with no freeze or stale content.
result: issue
reported: "press 2 does not update the tab - same with press 3 and press 1 does not go back. when going 1 -> 2 -> 1 -> ? (help) -> Esc the ui is usable again, but 2 or 3 do not update the content and basically freeze / break the list and detail page ( same of before the 8-5 fixes"
severity: major

### 3. Tab cycling with [ and ]
expected: Press `]` to cycle forward through tabs (Workspaces → Templates → Repos → Workspaces). Press `[` to cycle backward. Tab label and content update on each press.
result: issue
reported: "same issue as test 2 content does not update. by navigating back to tab 1 and then opening help and closing it the ui works again otherwise broken by pressing ] or ["
severity: major

### 4. Per-tab cursor state preserved
expected: Navigate to a specific workspace (not the first one) in Workspaces tab. Press `2` for Templates, then `1` to return. Cursor is still on the same workspace — position preserved across tab switches.
result: pass

### 5. Workspace detail auto-updates on cursor move
expected: In Workspaces tab, use ↑/↓ or j/k to move through the list. The bottom detail box updates to show the selected workspace's branch, repos, and messages — without pressing Enter.
result: pass

### 6. Templates tab shows real data
expected: Press `2`. List pane shows template names with repo count and description. Moving cursor updates the detail pane showing repos, hooks summary, and per-repo mode rows.
result: skipped
reason: tab switching broken (test 2 issue)

### 7. Repos tab with disk indicator
expected: Press `3`. List shows repos with ✓ (exists on disk) or ✗ (missing) indicator, name, type, and truncated path. Selecting a repo shows path/type/branch/disk status and "Used by" templates/workspaces in the detail pane.
result: skipped
reason: tab switching broken — freeze, no content update (test 2 issue)

### 8. Workspace rename flow
expected: In Workspaces tab, press Enter on a workspace → action menu appears (padded/centered in detail pane, not floating at top). Press `n` → inline input pre-filled with current name. Edit and press Enter → progress view → returns to list with updated name.
result: issue
reported: "almost working - remnants of the rename are visibly merged with the detail page everything else works"
severity: minor

### 9. Template edit flow
expected: Press `2` → Templates tab. Enter on a template → template action menu. Press `e` → $EDITOR opens with the template YAML. Save and exit → returns to Templates list.
result: skipped
reason: tab switching broken — ui freezes (test 2 issue)

### 10. Template clone flow
expected: In Templates tab, Enter on template → action menu → `c` → inline input → type name → Enter → new template appears in list.
result: skipped
reason: tab switching broken — freeze. Note: blindly entering inputs does reach the clone inline input, suggesting events dispatch to frozen tab components

### 11. Template remove flow
expected: In Templates tab, Enter on template → action menu → `r` → confirmation prompt → confirm → template removed from list.
result: skipped
reason: tab switching broken — same freeze problem (test 2 issue)

### 12. Help overlay fills screen
expected: Press `?` from any tab. Keybinding reference overlay fills the screen with clearly formatted content (not smushed). Press Esc or `?` again → overlay closes, returns to previous view.
result: pass

### 13. Filter mode indicator on / press
expected: Press `/`. A filter indicator (e.g. `filter: _`) appears immediately in the help bar — before typing any characters. Typing narrows the list. Esc clears filter and indicator.
result: pass

### 14. Esc back-chain (never exits)
expected: Enter → action menu → Esc → back to list. `/` → type → Esc → filter clears. `?` → Esc → closes. From top-level list view, Esc does nothing — TUI stays open. Only `q` exits.
result: pass

### 15. Action menu positioning in detail pane
expected: Enter on a workspace → action menu renders with padding inside the detail box — not floating at the top-left corner. Visually centered or offset with whitespace.
result: pass

## Summary

total: 15
passed: 7
issues: 3
pending: 0
skipped: 5

## Gaps

- truth: "Pressing 1/2/3 switches the active tab and updates the visible content immediately"
  status: failed
  reason: "User reported: press 2 does not update the tab - same with press 3 and press 1 does not go back. when going 1 -> 2 -> 1 -> ? (help) -> Esc the ui is usable again, but 2 or 3 do not update the content and basically freeze / break the list and detail page ( same of before the 8-5 fixes"
  severity: major
  test: 2
  root_cause: ""
  artifacts: []
  missing: []
  debug_session: ""

- truth: "Pressing [ and ] cycles through tabs and updates the visible content"
  status: failed
  reason: "User reported: same issue as test 2 content does not update. by navigating back to tab 1 and then opening help and closing it the ui works again otherwise broken by pressing ] or ["
  severity: major
  test: 3
  root_cause: ""
  artifacts: []
  missing: []
  debug_session: ""

- truth: "After workspace rename completes, detail pane shows clean workspace detail with no remnants from the rename input"
  status: failed
  reason: "User reported: almost working - remnants of the rename are visibly merged with the detail page everything else works"
  severity: minor
  test: 8
  root_cause: ""
  artifacts: []
  missing: []
  debug_session: ""
