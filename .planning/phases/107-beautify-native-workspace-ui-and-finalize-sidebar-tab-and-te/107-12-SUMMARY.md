---
phase: 107-beautify-native-workspace-ui-and-finalize-sidebar-tab-and-te
plan: 12
subsystem: native-linux-client
tags: [gtk, libadwaita, responsive, accessibility, visual-polish]
requires: [107-11]
provides: [adaptive-workspace-shell, actionable-status-pages, native-accessible-state, keyboard-pin-actions, coherent-native-theme]
affects: [107-13, native-linux-client]
tech-stack:
  added: []
  patterns: [adw-overlay-split-breakpoint, status-action-projection, gtk-accessible-state, semantic-theme-colors]
key-files:
  created: []
  modified: [native/linux/app.zig, native/linux/application.zig, native/linux/workspace_view.zig, native/linux/attention_view.zig, native/linux/app_contract_test.zig, native/tests/workspace_ui_test.zig, native/tests/application_actions_test.zig]
decisions:
  - The native shell collapses below 720px through AdwOverlaySplitView and an active AdwBreakpoint; 1080px remains the wide-content threshold.
  - Stale workspace content remains mounted and read-only with an explicit refresh banner rather than becoming a blank status page.
  - GTK widget classes own immutable accessible roles while projection updates selected and checked states through GtkAccessible APIs.
  - Native smoke mode creates an isolated Ghostty surface when the authoritative snapshot has not arrived, removing a startup-order race from renderer evidence.
metrics:
  duration: 28m
  completed: 2026-07-12
status: complete
---

# Phase 107 Plan 12: Adaptive and Accessible Native Polish Summary

The Linux native client now has an adaptive libadwaita workspace shell, safe actionable connection states, real accessible selected/checked semantics, keyboard pin controls, and one compact semantic visual language.

## Tasks Completed

1. Replaced the fixed nonshrinking workspace paned with `AdwOverlaySplitView`, activated the 720px breakpoint, clamped launcher sizing, added recovery actions for every connection state, and retained stale terminal content read-only.
2. Published GTK accessible selected/checked state, labels, descriptions, and tooltips for workspace, grouping, attention, creation, launcher, and menu controls; added Alt+P and Alt+Shift+Up/Down pin actions.
3. Consolidated spacing and semantic theme styling, scoped expander weight, distinguished workspace/repository glyphs, grouped organization toggles, added title-reset guidance, and replaced internal severity language with user-facing status copy.

## Verification

- `bun run native:test:workspace-ui` — passed
- `bun run native:test:application-actions` — passed
- `bun run native:test:accessibility` — passed
- `bun run native:test:interaction` — passed
- `bun run native:audit-production-graph` — passed
- `bun run native:smoke-app` — passed
- `bun run native:smoke-workspace` — passed, including renamed live-terminal confirmation and clean shutdown

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Made renderer smoke independent of snapshot startup order**
- **Found during:** Final graphical verification
- **Issue:** A renderer-only smoke could exit successfully without evidence when its authoritative snapshot had not arrived before the fixed quit timer.
- **Fix:** In isolated renderer-smoke mode only, create a bare Ghostty surface when no authoritative launch spec is available.
- **Commit:** `f2f6ce5e`

## Known Stubs

None.

## Self-Check: PASSED

All task commits exist, focused and graphical gates pass, the reported close-renamed-terminal modal is resolved deterministically in automation, and no native or verification process remains active.
