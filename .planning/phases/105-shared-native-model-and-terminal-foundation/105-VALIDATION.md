---
phase: 105
slug: shared-native-model-and-terminal-foundation
status: ready
nyquist_compliant: true
wave_0_complete: false
created: 2026-07-11
updated: 2026-07-11
---

# Phase 105 — Full Ghostty Surface Validation Strategy

## Infrastructure

| Property | Value |
|---|---|
| Framework | Bun orchestration, Zig 0.15.2, GTK graphical harness, real production executable |
| Quick gate | `bun run native:test:quick` |
| Full native gate | `bun run native:verify` |
| Final repository gate | `bun run test && bun run typecheck && bun run test:deps && bun run verify:gates` |

## Task verification map

| Task | Wave | Coverage | Automated command | Producer |
|---|---:|---|---|---|
| 105-01..04 | 1-4 | ABI/model/restore and ownership algorithms | `bun run native:test:model && bun run native:test:restore && bun run native:test:lifecycle` | retained, green |
| 105-05-01 | 5 | exact fork/Zig/tree, surface plus process-control ABI, upstream drift | `bun run native:setup && bun run native:audit-ghostty && bun run native:test:surface-abi` | lock, ABI test, verifier |
| 105-05-02 | 5 | app-runtime=none build/link and no competing production stack | `bun run native:build-app && bun run native:audit-production-graph` | build/verifier |
| 105-06-01 | 6 | Ghostty config/app lifecycle and callbacks | `bun run native:test:surface` | runtime/surface tests |
| 105-06-02 | 6 | GL realize/draw/resize/scale/focus/unrealize and real shell output | `bun run native:test:surface && bun run native:smoke-app` | surface/app smoke |
| 105-07-01 | 7 | rich keys, text, IME, mouse, selection and clipboard | `bun run native:test:interaction && bun run native:smoke-terminal` | interaction suite |
| 105-07-02 | 7 | PID/PGID/birth-token registration, graceful/escalated close, guard crash cleanup, absence/failed_cleanup, two-surface isolation | `bun run native:test:lifecycle && bun run native:smoke-multisurface` | process-control adapter and production tests |
| 105-08-01 | 8 | production single/two-surface lifecycle and bounded resources | `bun run native:test:stress` | stress suite |
| 105-08-02 | 8 | honest GTK/Ghostty accessibility and full gate composition | `bun run native:test:accessibility && bun run native:verify` | accessibility suite/verifier |
| 105-08-03 | 8 | exact-artifact human acceptance and closeout | `bun run native:verify && bun run test && bun run typecheck && bun run test:deps && bun run verify:gates` | evidence matrices |

## Mandatory ownership cases

- Registration occurs before `live` and includes surface identity, PID, PGID and Linux birth token.
- Reject client/guard/self groups, reused PID/PGID with mismatched birth token, wrong surface and post-destroy calls.
- Normal exit, D-09 bounded graceful/escalated close, app quit and host SIGKILL each leave zero registered groups and descendants.
- D-10 confirmation follows Ghostty's foreground activity observation.
- Missing introspection/control is a failing ABI gap, not inferred success.
- Failure to prove absence produces D-11 `failed_cleanup`; guard EOF performs D-12 cleanup.

## Graphical and human lanes

Automated graphical tests must use the exact production app/surface types and fail with environment diagnostics when no display/renderer is available. The human gate records Wayland/X11 availability, Ghostty config/font/cursor comparison, fish query/autosuggestion behavior, rich input, Unicode, IME, selection/clipboards, mouse, resize/reflow, alternate-screen/full-screen TUIs, two-surface isolation, lifecycle cleanup and GTK/AT-SPI accessibility truth.

## Sign-off

- [x] Every replacement task has an automated command or explicit producer.
- [x] TERM-02 and D-09 through D-12 exercise the production Ghostty child, not only the retained product PTY fixture.
- [x] Human validation follows complete production preflight.
- [x] Full verification covers surface ABI/config/GL/input/multisurface/lifecycle/stress/accessibility.

**Approval:** pending execution and final human checkpoint
