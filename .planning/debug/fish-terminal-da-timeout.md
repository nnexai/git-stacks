---
status: resolved
trigger: "On my machine with Fish, opening terminals takes more than 10 seconds because Fish cannot read a response to its Primary Device Attribute query."
created: 2026-07-18
updated: 2026-07-18
---

# Debug Session: Fish Terminal DA Timeout

## Symptoms

- expected: Opening an interactive Fish terminal becomes usable immediately and terminal capability negotiation completes normally.
- actual: Opening the terminal takes more than 10 seconds; Fish eventually disables outstanding optional terminal queries.
- errors: `warning: fish could not read response to Primary Device Attribute query after waiting for 10 seconds. This is often due to a missing feature in your terminal. See 'help terminal-compatibility' or 'man fish-terminal-compatibility'. This fish process will no longer wait for outstanding queries, which disables some optional features.`
- timeline: Reproduced by the user on a separate machine while testing the v0.22.0-rc.1 release candidate after the earlier Fish initialization repair.
- reproduction: Configure Fish as the user shell and open a service-owned interactive terminal from git-stacks.

## Current Focus

- hypothesis: Fish emits `CSI 0 c` immediately after the pre-input `--init-command` bootstrap, but `terminal.create` cannot return the terminal identity and let xterm attach until after initialization; the unanswered DA1 request therefore waits for Fish's full timeout.
- test: Capture a real Fish PTY from spawn through the first prompt, verify the DA1 bytes and startup duration, then add a regression that requires the pre-attachment terminal bridge to answer and consume the query exactly once.
- expecting: A valid `CSI ? ... c` response reaches Fish before browser attachment, the query is not replayed to xterm for a duplicate response, no warning is emitted, and the prompt appears well below 10 seconds.
- next_action: Ship the verified post-rc.1 fixes in the next requested commit/release boundary.
- reasoning_checkpoint: The existing real-Fish test proves only that `terminal.create` returns; it does not wait for Fish's first prompt or assert that capability negotiation completes.
- tdd_checkpoint: false

## Evidence

- timestamp: 2026-07-18T00:00:00+02:00
  observation: The user supplied Fish's exact Primary Device Attribute timeout warning and measured terminal opening at more than 10 seconds.
  implication: The PTY is alive, but no compatible terminal endpoint answers Fish's required DA1 request during startup.
- timestamp: 2026-07-18T00:01:00+02:00
  observation: `ptyInitializationLaunch` uses Fish `--init-command` because the browser cannot attach until `terminal.create` completes; `bufferPty` stores all startup output but does not answer terminal queries.
  implication: The earlier initialization fix breaks the bootstrap deadlock but leaves terminal capability negotiation without a responder in the pre-attachment interval.
- timestamp: 2026-07-18T00:02:00+02:00
  observation: Fish documents `CSI 0 c` as required and requires a `CSI ? ... c` response; xterm.js answers its xterm identity with `CSI ? 1 ; 2 c`.
  implication: A bounded pre-attachment bridge can mirror xterm's DA1 response and consume only that request, preserving the eventual frontend as terminal authority.

## Eliminated

- Fish startup scripts were not the source of the delay: a raw Fish 4.6 PTY emitted the DA1 query in about 13 ms and produced the warning only after waiting about 10 seconds.
- The detached managed service was not the foreground TUI process: real-dashboard PTY coverage proved the outer CLI resumed with terminal state restored while the service remained independent.

## Resolution

- root_cause: Fish sent its Primary Device Attributes query after the pre-input bootstrap but before the browser xterm could attach. The service buffered the query without answering it, so Fish blocked for its full capability timeout. Separately, successful TUI shutdown had no bounded cleanup or explicit executable exit, allowing unrelated asynchronous work to retain the foreground process.
- fix: During Fish's pre-attachment interval, the PTY bridge now consumes split or complete DA1 queries and replies with xterm's `CSI ? 1 ; 2 c`, then hands terminal authority to the browser on attachment. TUI client cleanup is bounded and the executable exits explicitly after renderer/terminal restoration. Safe multi-workspace removal was also restored as serial stable-ID lifecycle mutations with fresh authorization and revision reconciliation per target.
- verification: A raw Fish PTY reached its prompt in about 49 ms when given the same response. Focused real-Fish and split-query tests pass; the serial multi-remove integration passes; the published and real-dashboard PTY launcher tests prove prompt return, alternate-screen restoration, outer CLI exit, detached-service independence, and bounded stuck cleanup. Full `npm test` passed: 172 Vitest files with 2,289 passed and 1 skipped, 123 Node tests, and the complete OpenTUI suite.
- files_changed: `packages/service/src/web/terminal-manager.ts`, `packages/tui/src/App.tsx`, `packages/tui/src/WorkspaceRemovalDialog.tsx`, `packages/tui/src/index.ts`, `packages/tui/src/run.tsx`, `packages/tui/src/types.ts`, and their focused service/TUI tests.
