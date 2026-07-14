---
spike: 014-terminal-stream-viability
status: validated
date: 2026-07-14
---

# Spike 014: Terminal Stream Viability

## Verdict

**VALIDATED** — the current terminal policy transfers cleanly to WebTransport streams: cursor-based replay, bounded retained output, visible-only bulk streaming, asynchronous backpressure, cancellation, and independent terminal streams all behaved correctly in Chrome over a real pinned WebTransport connection.

This does not change Spike 011's runtime verdict. The retained reference harness runs under Node because the established native transport still crashes Bun on active-session shutdown. It validates the terminal protocol and adapter shape, not a production Bun dependency.

## Critical Protocol Finding

WebSocket messages preserve message boundaries; WebTransport streams do not. The existing WebSocket terminal frame (`type + cursor + payload`) cannot be copied directly onto a WebTransport byte stream.

The spike uses a transport-neutral length-prefixed frame:

```text
1 byte  kind
4 bytes payload length, unsigned big endian
8 bytes terminal cursor, unsigned big endian
N bytes payload
```

The browser parser correctly handled deliberately fragmented headers/payloads and multiple coalesced frames. Production must bound declared lengths before allocation and reject unknown kinds or malformed control payloads.

## Results

Chrome 150 passed all seven scenarios:

1. Fragmented and coalesced byte-stream frames decode exactly.
2. A visible terminal delivered 16 MiB in 249 ms while retaining only 1 MiB.
3. A deliberately slow reader received 48 MiB in 3.45 seconds. The writer awaited backpressure 43 times, with a maximum 190 ms write wait, while application retention remained 1 MiB.
4. A hidden terminal generated 8 MiB, emitted no live bulk output, then returned an explicit history-gap reset and exactly the retained 1 MiB when resumed.
5. Four concurrent terminal streams shared one WebTransport session; the visible stream delivered 2 MiB while each hidden stream delivered zero bulk bytes and retained at most 1 MiB.
6. Reconnect inside retention replayed continuously without reset; reconnect behind retention emitted a reset and only the bounded baseline.
7. Browser cancellation after 2 MiB reached the server as QUIC `STOP_SENDING`; the transport attachment stopped while terminal retention remained bounded.

Three consecutive complete suites transferred roughly 250 MiB across 21 browser checks and 33 logical stream scenarios. The Node reference process's peak RSS stayed near 149 MiB across the three runs. Post-suite RSS moved from roughly 131 MiB to 140 MiB, so a longer production soak remains a release gate even though the short run showed a stable peak rather than linear growth.

The final isolated suite measured approximately 106 MiB RSS after module load, 116 MiB when the HTTP/3 listener was ready, and 148 MiB at peak during the workload. These numbers include the native reference transport and are not an estimate for a future Bun-native implementation.

## Fit With the Current Service

The existing `WebTerminalManager` already owns the correct carrier-independent policy:

- 1 MiB retained output per terminal.
- 64 KiB maximum output chunks.
- Monotonic cursors and browser acknowledgements.
- Explicit `history_unavailable` plus terminal reset when replay falls behind retention.
- Visible-only output streaming while PTY signal parsing and lifecycle tracking stay active.
- Per-principal/global terminal quotas, ended-session retention, process-group cleanup, and diagnostics.

Its attachment is currently typed directly as `Bun.ServerWebSocket`, and its pressure path uses `getBufferedAmount()`, `send()`, and Bun's `drain` callback. Those are adapter details and should move behind a terminal transport interface.

## Recommended Shared Boundary

```text
WebTerminalManager / terminal session core
  owns PTY, cursor, replay ring, visibility, acknowledgement, lifecycle

TerminalAttachment
  sendControl(frame): Promise<void>
  sendOutput(cursor, bytes): Promise<void>
  close(code, reason): void
  pressure/cancel notification

adapters
  WebSocket: bufferedAmount + send/drain
  WebTransport: WritableStream writer.ready/write + STOP_SENDING handling
  local TUI IPC: framed local stream
```

Only one attachment pump may write a given terminal stream at a time. The core continues retaining PTY output while an attachment is blocked; if its acknowledged cursor falls behind the ring, the next writable opportunity sends an explicit reset and retained baseline.

One authenticated WebTransport session can carry independent bidirectional streams for multiple terminals. Snapshot/events, terminal controls, and bulk terminal output should remain logically separate so a slow terminal cannot head-of-line block service state or another terminal.

## Security and Resource Requirements

- Complete the helper-identity and epoch authentication from Spikes 012–013 before accepting any terminal stream.
- Authorize every terminal open against principal, workspace, repository, and scope; never trust a browser-supplied path or process command.
- Bound frame length, streams per session, terminals per principal, retained bytes, unacknowledged cursor distance, input size/rate, resize values, idle time, and close duration.
- Await WebTransport writes. Never enqueue unbounded promises or copy the WebSocket `send()` loop without an asynchronous pump.
- Treat stream cancellation as attachment loss, not automatic PTY termination. Shell durability remains service-owned.
- Keep hidden-terminal bulk output disabled while signal filtering and lifecycle state continue machine-side.
- Do not place credentials in control logs, frame diagnostics, close reasons, or replay metadata.

## Dependency, License, and Portability Review

The real transport probe reuses the established `@fails-components/webtransport` 1.6.6 implementation reviewed in Spike 011, its BSD-3-Clause/Apache-2.0-compatible native notices, and MIT-licensed `@peculiar/x509`. `bun audit` reports no known vulnerabilities, and the full transitive license set is compatible with the project's MIT license when required notices are preserved.

The reference package publishes current native artifacts for macOS arm64 and x64 and runs multi-platform CI. It remains test-only because of the Bun shutdown defect. The wire format, replay policy, browser parser, WebCrypto certificate generation, and asynchronous attachment contract contain no Linux-specific assumptions.

## How to Run

The harness requires Node 22.6 or newer for native TypeScript type stripping. Bun remains the package manager, lockfile owner, typechecker, and auditor.

```bash
cd .planning/spikes/014-terminal-stream-viability
bun install --frozen-lockfile
bun run check
bun run start
```

Opening the printed localhost URL runs the benchmark automatically. The page is an automation surface only; the useful evidence is its structured result plus the server's scenario records.

## Observability

Each server scenario records elapsed time, generated and retained bytes, write count, writes delayed by backpressure, maximum write latency, cursor state, cancellation, and RSS. The browser records byte counts, resets, reconnect behavior, and aggregate pass/fail state. Private terminal contents are synthetic and no credentials are emitted.

## Resulting Architecture Constraint

The secure remote design is feasible if terminal policy remains in the shared service core and WebTransport is only an authenticated asynchronous carrier. Production integration must not fork terminal replay or lifecycle logic into a second WebTransport-specific manager.

The remaining transport risk is implementation maturity under Bun, plus longer resource-soak and real macOS runtime validation—not terminal semantics or browser stream behavior.
