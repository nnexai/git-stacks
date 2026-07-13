# Spike Manifest

## Idea

Determine how far the git-stacks OpenTUI dashboard can evolve toward a workspace activity console without violating the product boundary that external integrations own terminal sessions.

## Requirements

- git-stacks must remain integration-neutral; tmux, cmux, VS Code, and similar tools own persistent sessions.
- The dashboard should gain distinct operational functionality beyond listing configuration and status.
- Named workspace commands remain the command-palette equivalent; the spike should not invent a duplicate palette.
- Phase 105 must produce a real interactive Linux GTK terminal surface, not a synthetic host or test-only seam.
- The former Phase 105 prohibition on a maintained Ghostty fork is superseded when a bounded Linux embedded-surface fork is the only path to fully functional Ghostty-owned panes; standalone-process composition remains out of scope.
- Fully functional embedded terminal panes are the primary requirement; preserving git-stacks-owned PTYs is secondary when it would force terminal emulation, rendering, input, configuration, or compatibility to be reimplemented.
- Prefer Ghostty-owned terminal surfaces and configuration when a viable Linux integration exists; do not treat `ghostty-vt` plus a product renderer as equivalent to libghostty terminal embedding.
- The web client may use a separate git-stacks-managed TypeScript/Bun PTY broker; native Ghostty surfaces and external integrations do not need to share those live terminal sessions in the web MVP.
- The web architecture must keep the workspace control plane separate from the bidirectional terminal data plane, with loopback-only binding, explicit browser pairing, origin validation, bounded scrollback, and backpressure limits.

## Spikes

| # | Name | Type | Validates | Verdict | Tags |
|---|------|------|-----------|---------|------|
| 001 | interactive-pty-surface | standard | A bounded dashboard panel can host a correctly rendered and controllable interactive PTY | PARTIAL | opentui, pty, terminal |
| 002 | multiple-shell-surfaces | standard | Multiple independent PTYs can remain active while the visible surface changes | PARTIAL | opentui, pty, tabs |
| 003 | tmux-control-plane | standard | tmux-owned panes can provide inventory, preview, attention, and attach operations without session ownership | VALIDATED | tmux, integration, dashboard |
| 004a | upstream-linux-embedding-api | comparison | A supported current upstream Ghostty public API can embed a real terminal surface in a Linux GTK host without a project fork | INVALIDATED | ghostty, linux, gtk, embedding |
| 004b | pinned-internal-gtk-integration | comparison | The exact pinned Ghostty GTK modules can be integrated directly while preserving git-stacks ownership and adapter boundaries | INVALIDATED | ghostty, linux, gtk, zig |
| 005 | libghostty-ecosystem-survey | comparison | Current libghostty APIs and downstream embedders reveal a complete Linux surface path beyond a product-owned `ghostty-vt` renderer | VALIDATED | ghostty, linux, embedding, ecosystem |
| 006 | full-ghostty-gtk-runtime | standard | Ghostty's complete embedded runtime can be hosted as a git-stacks pane when Ghostty owns terminal processes, configuration, and rendering | VALIDATED | ghostty, linux, gtk, runtime |
| 007 | reusable-linux-surface-extraction | comparison | A bounded upstreamable adapter can expose Ghostty's Linux surface without a long-lived application-sized fork | PARTIAL | ghostty, linux, api, upstream |
| 008 | multi-pane-ghostty-integration | standard | Multiple full Ghostty surfaces can coexist with correct focus, resize, lifecycle, and pane isolation inside one host | VALIDATED | ghostty, gtk, panes, lifecycle |
| 009 | mature-widget-fallback | comparison | A mature embeddable terminal widget can deliver complete panes if full Ghostty Linux embedding remains unavailable | VALIDATED | terminal, gtk, vte, fallback |
| 010 | web-terminal-tabs | standard | A local Bun service can own independent PTYs and expose input, output, resize, tab retention, and basic close to multiple xterm.js browser tabs; production reconnect/auth/pressure remain unvalidated | PARTIAL | web, browser, websocket, xterm, bun, pty, tabs |
