---
spike: 010
name: web-terminal-tabs
type: standard
validates: "A local Bun service can own independent PTYs while a browser renders multiple xterm.js tabs with input, resize, tab retention, and basic close behavior"
verdict: PARTIAL
related: [001, 002, 003]
tags: [web, browser, websocket, xterm, bun, pty, tabs, local-service]
---

# Spike 010: Web Terminal Tabs

## What This Validates

This spike tests the clarified architecture for a lightweight web client: the browser renders terminals, while the local git-stacks TypeScript/Bun service owns PTYs and exposes a terminal data plane. Native Ghostty surfaces are intentionally out of scope for this experiment; the web path is allowed to have a separate machine-side session owner.

Given a local service and a browser, when several terminal tabs are opened, each tab should retain independent shell state while hidden, accept keyboard input, receive VT output, propagate resize, and terminate when closed. Reconnect was explored, but the audit found that the current implementation duplicates retained output and therefore does not validate production replay.

## Research

| Approach | Tool | Pros | Cons | Status |
|---|---|---|---|---|
| Browser emulator + local PTY relay | `@xterm/xterm` + Bun `Bun.Terminal` + WebSocket | Uses the existing Bun/TypeScript stack, real PTY semantics, browser-friendly bidirectional transport, no native addon build | Browser renderer is not Ghostty; service must own lifecycle/backpressure/security | Chosen |
| Browser emulator + `node-pty` relay | `@xterm/xterm` + `node-pty` | Mature ecosystem and established VS Code precedent | Native addon/toolchain and cross-platform packaging burden; unnecessary on Bun where `Bun.Terminal` is available | Rejected for MVP |
| Browser emulator + `libghostty-vt` renderer | xterm replacement over Ghostty VT state | Potential terminal compatibility reuse | Browser delivery and rendering would become a new product renderer; contradicts the native Ghostty boundary and multiplies complexity | Rejected |
| Browser-only terminal | xterm.js without a local PTY | Easy static demo | Cannot run or attach to local sessions; does not answer the hard problem | Rejected |

Primary documentation checked:

- Bun PTY support: `Bun.spawn(..., { terminal })`, terminal data callback, `write`, `resize`, and lifecycle methods.
- Bun WebSockets: browser clients cannot provide custom headers through the standard WebSocket constructor; server-side upgrade, origin checks, payload limits, backpressure, and idle settings are available.
- xterm.js: browser terminal rendering, FitAddon, AttachAddon, headless mode, accessibility, and security guidance.
- Browser security: browsers send `Origin` on WebSocket handshakes; the server must validate it to reduce cross-site WebSocket hijacking.

The POC serves the page and WebSocket endpoint from one loopback origin and uses an HttpOnly, SameSite capability cookie. The production design should exchange a one-time local pairing capability for a scoped session credential rather than placing a long-lived bearer token in a WebSocket URL.

## How to Run

```bash
cd .planning/spikes/010-web-terminal-tabs
bun install
bun run check
bun run build
bun server.ts
```

Open the URL printed by the server, normally `http://127.0.0.1:<port>/`.

The build emits xterm's required stylesheet as `public/client.css`; the page links that stylesheet before the POC overrides. Omitting it makes xterm's hidden measurement helpers visible as a comma stream and also prevents the FitAddon from measuring the terminal correctly.

## What to Expect

- Three independent terminal tabs appear immediately.
- Each tab is backed by a separate Bun PTY running an interactive Bash process.
- Type a command in one tab, switch tabs, then return: its shell state and scrollback remain.
- Use `stty size` after resizing the browser window to verify resize propagation.
- `＋ New terminal` creates another local PTY; closing a tab sends a termination request.
- A WebSocket reconnect keeps the process alive, but the current POC replays the whole retained buffer into the existing xterm and duplicates prior output.

## Observability

The server logs the loopback URL and reports when `send()` returns a backpressure signal. The UI exposes per-tab `connecting`, `connected`, `reconnecting`, `connection error`, and `exited` status. The service keeps a bounded 128 KiB raw-output buffer per session, but the socket queue, session count, ended-session retention, and reconnect behavior are not production-bounded.

## Investigation Trail

1. Reused the repo's Bun-first convention and confirmed that current Bun exposes a real PTY on Linux/macOS and ConPTY on Windows.
2. Chose one WebSocket per terminal session rather than one multiplexed socket for the POC. This keeps the browser implementation obvious and lets the production design decide later whether multiplexing is needed for connection-count or mobile constraints.
3. Kept terminal instances mounted but hidden when a tab is inactive. Switching is therefore a DOM projection change, not a process teardown or emulator reset.
4. Added raw output retention, resize messages, transient reconnect, and explicit close. The later audit established that raw retention is not sufficient terminal state and that reconnect needs cursor/ACK or a serialized baseline.

## Results

**PARTIAL.** The runnable browser check passed on Linux with Bun 1.3.14 for three xterm.js tabs, separate Bun PTYs, shell input, `stty size` resize propagation, tab switching, required xterm CSS, and basic close. Headless Chrome rendered the human-facing multi-tab surface without the earlier comma-like helper text or stray measurement artifact.

The reconnect probe did **not** validate correct replay: forcing a reconnect doubled previously applied output because the server sends its complete retained buffer into an existing xterm. The POC HTTP bootstrap also grants a global cookie from the root page, HTTP API routes lack Host/Origin/Fetch-Metadata checks, sessions are global/unbounded, slow-client handling only logs, inactive xterms open while hidden, and authenticated agent OSC signals are not filtered or published.

The service-owned-web-PTY architecture remains feasible and independent from native Ghostty. Production must replace these shortcuts with principal pairing, browser-safe projections, cursor/ACK plus headless restoration, explicit pressure limits, lazy visible xterm opening, process-tree ownership, and service-side OSC signal filtering.
