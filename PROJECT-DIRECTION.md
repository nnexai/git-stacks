# Project Direction

`git-stacks` is a local platform for multi-repository task environments. The `0.21.0` architecture has one Node.js machine core, a daemonless local CLI, a Node.js interactive service, a thin browser client, and an independently optional Bun TUI.

The migration centralizes now so later browser feature work extends one implementation instead of creating another workspace engine.

## Package Ownership

- `@git-stacks/protocol` owns versioned wire schemas and transport-neutral types.
- `@git-stacks/client` owns transport-neutral event, reconnect, priority, and signal presentation semantics shared by interactive clients.
- `@git-stacks/core` owns config schemas, atomic persistence, filesystem/Git behavior, workspace lifecycle, integrations, commands, files, notes, labels, priorities, and opt-in agent-hook management.
- `@git-stacks/cli` is the Node.js command surface. Ordinary commands call core directly and do not require or start the service.
- `@git-stacks/service` is the Node.js interactive authority. It owns revisioned projections, operations, event journals, signals, monitoring, pairing, SSE/WebSocket transport, and PTYs.
- `@git-stacks/web` is a browser-only renderer over the narrow web projection.
- `@git-stacks/tui` is an optional Bun/OpenTUI renderer over the trusted service contract.
- `git-stacks` is the small public facade that installs the Node CLI and its service/browser graph.

Package boundaries are enforced by a source import graph and Node-only runtime tests. The default install graph must not include Bun, OpenTUI, or TUI source.

## State and Process Ownership

Repository registry, templates, workspaces, labels, and priority remain human-editable YAML under `~/.config/git-stacks/`. Core writes are atomic and use cross-process leases where read-modify-write operations need coordination. A running service watches those files and reconciles direct CLI or editor changes; CLI commands do not need a refresh RPC.

Interactive clients load one authoritative revisioned snapshot and then follow server-sent events. Navigation, selection, dialogs, and ordinary viewport changes remain client-local. Stream visibility matters only for terminal bytes: hidden terminals stop sending output and reconnect with bounded replay when selected again.

Browser PTYs belong to the service rather than the page. Reloading or closing a browser can reconnect while the service process and retention policy keep the PTY alive. Service shutdown or machine reboot ends those sessions. Ordinary exited shells are removed; configured command tabs may retain final output.

## Product Surfaces

The local CLI remains the complete scriptable interface and works without a daemon. Explicit `service`, `web`, and `manage` commands are the only service/client launch boundaries.

`git-stacks web` is the supported graphical client and should gain functionality incrementally through shared protocol/client/service capabilities. It must never receive machine paths, credentials, raw environment values, or trusted launch context that are not part of its explicit projection.

`git-stacks manage` launches the separately installed `@git-stacks/tui`. The TUI owns rendering and foreground handoffs, not authoritative workspace reads, writes, Git inspection, or command execution.

The retired GTK/Zig client and patched Ghostty dependency remain archived at `native-client-final-2026-07-14`; they are not part of the supported architecture.

## Runtime and Platform Policy

Node.js 24 is the minimum runtime for the CLI, core, service, browser build, verification scripts, and the main test/coverage suite. Bun is confined to the optional TUI build and its per-file OpenTUI tests. Native dependencies are exact-pinned and must ship trusted prebuilds for Linux and macOS on x64 and arm64. Runtime dependencies require a license compatible with this MIT project and pass the production audit before an RC is prepared.

The service remains loopback-only in `0.21.0`. A future remote client/server mode must extend the authenticated protocol and pairing model deliberately; it must not expose the current local bearer channel directly to an untrusted network.

## Coding-Agent Integrations

Signals are provider-neutral service state. User-level Codex, Claude Code, GitHub Copilot, and OpenCode hooks remain strictly opt-in:

- `install` changes only providers selected by the user.
- `update` reconciles only integrations already owned by git-stacks.
- `uninstall` removes only selected git-stacks-owned entries.
- Ordinary CLI, service, browser, TUI, workspace, and terminal startup never modifies provider configuration.

## `0.21.0-rc.1` Boundary

The first release candidate proves the architecture rather than adding product scope: Node-only default execution, package artifacts, CLI parity, service transport and PTY lifecycle, browser reconnect behavior, optional TUI lifecycle, external-file reconciliation, license/security audits, and Linux/macOS x64/arm64 CI.

Tagging, publishing, and release creation remain explicit actions after those checks. The RC check validates by default and creates a tag only with `--tag`; publishing is separate.
