---
phase: 107-beautify-native-workspace-ui-and-finalize-sidebar-tab-and-te
plan: 11
subsystem: native-linux-client
tags: [gtk, attention, command-launcher, terminal-safety, accessibility]
requires: [107-10]
provides: [actionable-attention-inbox, keyboard-complete-launcher, live-close-confirmation]
affects: [107-12, native-linux-client]
tech-stack:
  added: []
  patterns: [stable-id-action-routing, selection-by-command-id, deferred-generation-validated-close]
key-files:
  created: []
  modified: [native/linux/app.zig, native/linux/attention_view.zig, native/linux/command_launcher.zig, native/linux/app_contract_test.zig, native/tests/attention_test.zig, native/tests/application_actions_test.zig, native/tests/accessibility_test.zig, native/build.zig]
decisions:
  - Attention receipt and refresh remain non-presenting; only explicit stable-ID row activation routes and marks an item read.
  - Live tab closure uses AdwTabView's deferred transaction and revalidates surface generation before one-shot teardown.
  - The graphical smoke resolves its synthetic close modal deterministically while production keeps the human confirmation.
metrics:
  duration: 38m
  completed: 2026-07-12
status: complete
---

# Phase 107 Plan 11: Native Attention and Interaction Safety Summary

The native client now exposes provider-aware attention rows, supports the configured-command launcher entirely from the keyboard, and prevents an accidental close from immediately terminating live terminal work.

## Tasks Completed

1. Added bounded provider/title/detail/location/time/fallback attention projection, a visible attention inbox bound to `win.focus-attention`, and exact-tab visibility read clearing.
2. Added stable command-ID launcher selection, Up/Down/Enter handling from focused search, and distinct non-activatable empty-catalog/no-match explanations.
3. Added one deferred live-terminal close transaction with destructive confirmation, cancel preservation, generation revalidation, and deterministic graphical-smoke resolution; ended tabs remain immediate.

## Verification

- `bun run native:test:attention` — passed
- `bun run native:test:application-actions` — passed
- `bun run native:test:accessibility` — passed
- `bun run native:test:workspace-ui` — passed
- `bun run native:test:tabs` — passed
- `bun run native:audit-production-graph` — passed
- `bun run native:smoke-workspace` — passed

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Wired attention projection into the attention test build graph**
- **Found during:** Task 1 TDD verification
- **Issue:** The attention test target did not import the Linux attention projection module.
- **Fix:** Added the shared model/reducer-backed module import to `native/build.zig`.
- **Commit:** `c0c3d91f`

**2. [Rule 3 - Blocking] Resolved the close modal in graphical automation**
- **Found during:** Task 3 workspace smoke
- **Issue:** The real production confirmation correctly waited for user input, blocking a fully automated graphical gate.
- **Fix:** The workspace-smoke environment sets the dialog close response to affirmative and closes it; ordinary production execution remains interactive.
- **Commit:** `47ece684`

## Known Stubs

None.

## Self-Check: PASSED

All three task commits exist, no test process remains active, and every focused model, production-contract, accessibility, graph-ownership, and graphical workspace gate passes.
