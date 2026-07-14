---
spike: 010-web-terminal-tabs
status: validated
---

# Spike 010: Web Terminal Tabs

This spike validated the architecture used in production: xterm.js renders browser terminals while the local Bun service owns real PTYs and exposes a bounded WebSocket data plane.

## Outcome

- Multiple independent terminal tabs are feasible with `Bun.Terminal` and xterm.js.
- Terminal input, output, resize, tab retention, and close semantics work without an additional addon or sidecar.
- Production required secure pairing, browser-safe projections, cursor acknowledgements, reconnect replay, visibility-aware streaming, pressure limits, process-group ownership, and service-side OSC signal filtering.

The production implementation is documented in `.planning/phases/107.3-web-client-and-local-terminal-bridge/`.
