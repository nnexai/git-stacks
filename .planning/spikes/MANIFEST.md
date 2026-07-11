# Spike Manifest

## Idea

Determine how far the git-stacks OpenTUI dashboard can evolve toward a workspace activity console without violating the product boundary that external integrations own terminal sessions.

## Requirements

- git-stacks must remain integration-neutral; tmux, cmux, VS Code, and similar tools own persistent sessions.
- The dashboard should gain distinct operational functionality beyond listing configuration and status.
- Named workspace commands remain the command-palette equivalent; the spike should not invent a duplicate palette.
- Phase 105 must produce a real interactive Linux GTK terminal surface, not a synthetic host or test-only seam.
- Maintained Ghostty forks and standalone-process composition are out of scope for the Phase 105 architecture decision.

## Spikes

| # | Name | Type | Validates | Verdict | Tags |
|---|------|------|-----------|---------|------|
| 001 | interactive-pty-surface | standard | A bounded dashboard panel can host a correctly rendered and controllable interactive PTY | PARTIAL | opentui, pty, terminal |
| 002 | multiple-shell-surfaces | standard | Multiple independent PTYs can remain active while the visible surface changes | PARTIAL | opentui, pty, tabs |
| 003 | tmux-control-plane | standard | tmux-owned panes can provide inventory, preview, attention, and attach operations without session ownership | VALIDATED | tmux, integration, dashboard |
| 004a | upstream-linux-embedding-api | comparison | A supported current upstream Ghostty public API can embed a real terminal surface in a Linux GTK host without a project fork | INVALIDATED | ghostty, linux, gtk, embedding |
| 004b | pinned-internal-gtk-integration | comparison | The exact pinned Ghostty GTK modules can be integrated directly while preserving git-stacks ownership and adapter boundaries | INVALIDATED | ghostty, linux, gtk, zig |
