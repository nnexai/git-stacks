---
status: resolved
trigger: "looks quite good, but i still see reconnect pop up ever so often on the web ui"
created: 2026-07-13
updated: 2026-07-13
---

# Intermittent Web Reconnect

## Symptoms

- expected: A healthy local web session remains visually stable and does not surface transient reconnect state.
- actual: The web UI intermittently displays the service-events reconnect message during ordinary use.
- errors: No console or service error was reported; the visible reconnect status is the observed symptom.
- timeline: Present in the current Phase 107.3 web UI build after the latest visual polish.
- reproduction: Keep the paired web UI open during normal use and wait; the reconnect status appears occasionally.

## Current Focus

- hypothesis: Confirmed: the Bun direct SSE source returns from `pull` after one heartbeat or event, ending the browser stream and forcing the client reconnect path.
- test: Keep one browser SSE response open across a heartbeat and then publish an event on the same response.
- expecting: The same response yields both frames without closing.
- next_action: resolved
- reasoning_checkpoint:
- tdd_checkpoint:

## Evidence

- timestamp: 2026-07-13T21:31:27Z
  observation: A live authenticated curl stream returned exactly one heartbeat and then completed successfully after 15.001 seconds with 13 bytes.
  implication: The recurring UI reconnect is server-driven at the heartbeat interval, not random local network loss.
- timestamp: 2026-07-13T21:33:00Z
  observation: `BrowserEventStream.pull` returned immediately after flushing either a heartbeat or an event, unlike the durable shared `SseTransportBridge`, which continues its pull loop.
  implication: Every idle heartbeat and every delivered event terminates the browser event stream.
- timestamp: 2026-07-13T21:40:00Z
  observation: The regression test received a heartbeat and a subsequently published event from the same response; all 15 web tests, both typechecks, web build, diff check, and the sanitized full repository suite passed.
  implication: The stream now remains durable and the change introduces no detected regression.

## Eliminated


## Resolution

- root_cause: The browser `Bun.DirectUnderlyingSource` returned from `pull` after each heartbeat or event, completing the HTTP response every 15 seconds while idle and after every event.
- fix: Keep the direct SSE pull loop running after flushed heartbeats and events, with an injectable heartbeat interval for fast deterministic coverage.
- verification: Live curl reproduced the old 15.001-second close; the new integration regression crosses a heartbeat and receives the next event on the same stream. Web tests 15/15 and full repository tests 83/83 integration files passed.
- files_changed: src/service/web/routes.ts, tests/service/web-security.test.ts
