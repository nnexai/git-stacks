---
phase: 105-shared-native-model-and-terminal-foundation
plan: 06
subsystem: native-terminal-runtime
tags: [pty, posix, ghostty-vt, gtk4]
provides: [product-owned PTY, PTY-VT runtime, production shell roundtrip smoke]
requirements-completed: [CORE-02, CORE-05, TERM-01, TERM-02, TERM-04]
completed: 2026-07-11
status: complete
---

# Phase 105 Plan 06: PTY Runtime Summary

**The production GTK terminal now drives a real isolated PTY child through pinned VT state and proves a deterministic shell command roundtrip.**

## Accomplishments

- Added a close-on-exec, nonblocking POSIX PTY boundary with controlling-terminal child, process-group identity, resize, partial I/O, wait, and termination.
- Added a production runtime that streams PTY bytes into `VtAdapter`, routes input and resize back to the child, invalidates generations on close, and exposes resource counters.
- Added a 45-second fail-closed smoke that uses the production executable/runtime/widget, waits for a unique shell prompt, injects input, observes unique rendered VT output, and quits normally.

## Task Commits

1. `6120d41e` — product-owned PTY boundary
2. `3dc837db` — PTY and pinned VT runtime
3. `0ac708e2` — production shell roundtrip smoke

## Deviations from Plan

**[Rule 3 - Platform API] Used `forkpty` for atomic controlling-terminal acquisition.** The libc PTY primitive performs the open/session/controlling-terminal setup as one platform operation; the parent still applies CLOEXEC/nonblocking policy and owns process-group cleanup.

**Total deviations:** 1 blocking platform implementation adjustment. No public architecture changed.

## Verification

- `bun run native:test:pty` — passed
- `bun run native:test:runtime` — passed
- `bun run native:smoke-terminal` — passed
- `bun run native:test:lifecycle` — passed
- `bun run native:test:quick` — passed
- `git diff --check` — passed

## Next Phase Readiness

The terminal is usable end to end; interaction polish and human evidence can build on the production PTY/runtime path without a parallel test implementation.

## Self-Check: PASSED

- Three atomic task commits exist.
- All plan acceptance commands pass.
- Unrelated Phase 106 planning changes remain unstaged.
