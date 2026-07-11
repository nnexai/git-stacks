---
spike: 001
name: interactive-pty-surface
type: standard
validates: "Given the OpenTUI dashboard, when a real shell runs in a bounded panel, then input, ANSI state, resizing, and teardown remain correct"
verdict: PARTIAL
related: []
tags: [opentui, pty, terminal]
---

# Spike 001: Interactive PTY Surface

## What This Validates

Whether the runtime provides the missing pieces beneath OpenTUI: a real PTY and a terminal state engine that can be projected into an OpenTUI renderable.

## Research

OpenTUI 0.1.96 exposes layout, text, scroll, input, and framebuffer primitives but no terminal emulator or PTY renderable. Bun 1.3 provides a cross-platform `Bun.Terminal` PTY with input and resize support. `@xterm/headless` supplies ANSI/VT parsing and a screen buffer, but its buffer still needs a custom OpenTUI projection layer.

| Approach | Pros | Cons | Status |
|---|---|---|---|
| Raw subprocess pipes | Already used by command output | Not a TTY; interactive programs break | Rejected |
| Bun PTY + custom ANSI parser | Few dependencies | Terminal emulation is deceptively large | Rejected |
| Bun PTY + xterm headless | Real PTY and mature VT state | Custom rendering/input bridge remains | Chosen |
| tmux capture-pane | No owned PTY | Snapshot semantics; tmux-specific | Tested in spike 003 |

## How to Run

```bash
cd .planning/spikes/001-interactive-pty-surface
bun install
bun run spike.ts
```

## What to Expect

JSON containing passing checks for TTY sizing, interactive input, cursor movement, and clean exit.

## Observability

The output includes timestamped PTY input, output, resize, and summary events.

## Investigation Trail

- Confirmed the installed OpenTUI surface has no terminal-specific renderable.
- Selected Bun's native PTY rather than adding `node-pty` native build machinery.
- Added xterm's headless emulator to test real screen state rather than stripping ANSI sequences.

## Results

**PARTIAL.** Bun's PTY and xterm's headless buffer passed interactive input, ANSI cursor movement, resize propagation (`stty size` reported `10 55`), and clean teardown. This validates the process and emulator substrate on Linux.

It does not validate a production-quality embedded OpenTUI terminal. OpenTUI has no terminal renderable, so git-stacks would still own a custom bridge for styled cell projection, selection, scrollback, mouse reporting, focus/key arbitration, clipboard, hyperlinks, OSC handling, and alternate-screen behavior. The substrate is feasible; the product-quality integration is a substantial terminal feature.
