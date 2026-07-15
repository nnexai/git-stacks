# git-stacks

## Product

git-stacks is a local-first workspace manager for multi-repository development. One workspace definition coordinates repositories, branches, environment, commands, integrations, and developer-facing status across the CLI, terminal dashboard, and browser client.

## Current Milestone: v0.22.0 Workspace Productivity

**Goal:** Turn the shared service-backed clients into a keyboard-first daily workspace tool with safe lifecycle controls, user-compatible shell execution, fast navigation, and actionable workspace cleanup.

**Core value:** One command takes a user from feature intent to a running development environment without manual repository setup.

**Target features:**

- Archived workspace state persisted in workspace YAML, hidden from normal views, and recoverable from a minimal recency-sorted archive view in web and TUI.
- Confirmed workspace removal in web and TUI that closes owned terminals before applying the existing dirty-worktree guard and deleting worktrees, workspace files, and the workspace directory.
- Commands and hooks executed through the user's actual configured shell initialization so runtime managers, shell functions, aliases, `PATH`, and `SSH_AUTH_SOCK` behave like the user's terminal.
- A singleton web workspace switcher on `Ctrl+K`, configured commands on `Ctrl+Shift+P`, fuzzy top-result execution, terminal/workspace shortcuts, next-attention navigation, and discoverable keyboard help.
- Browser parity for high-value workspace lifecycle and Git actions, including creation from a PR/MR URL.
- A conservative stale-workspace view that explains cleanup candidates without automatically archiving or removing anything.
- Release-candidate preparation beginning at `v0.22.0-rc.1`; final tagging, pushing, publishing, and release remain separately approved actions.

## Supported Product Surfaces

- `git-stacks` local CLI for workspace lifecycle, configuration, commands, integrations, and automation.
- `git-stacks service` for persistent snapshots, operations, events, signals, authentication, and terminal sessions.
- `git-stacks web` for the loopback browser client and service-owned terminal tabs.
- Optional OpenTUI dashboard as a thin trusted service client.

## Target Architecture

### Shared domain core

The core owns persisted schemas, workspace resolution, domain validation, Git/worktree workflows, integration behavior, launch planning, and atomic mutation primitives. It receives process, clock, filesystem-observation, executable-resolution, and logging capabilities through narrow adapters. It does not import Commander, OpenTUI, HTTP, WebSocket, PTY, or service-launch code.

### Local CLI

The existing CLI remains local-only and daemonless. It invokes the shared core directly and writes authoritative files atomically. It does not require, discover, notify, or refresh a running service. A future remote CLI would be a separate client surface.

### Machine service

The Node.js service invokes the same core and additionally owns long-lived snapshots, operations, events, authentication, signals, PTYs, replay buffers, and network carriers. Files remain authoritative; watchers and bounded reconciliation turn external changes into normal service revisions and events.

### Thin clients

The browser and optional TUI consume typed service contracts and shared client-side state semantics. They own rendering, navigation, and explicit foreground handoffs only. They do not read workspace definitions, inspect Git, calculate domain status, or execute machine mutations independently.

### Package boundaries

The target workspace contains separately buildable protocol, client, core, CLI, service, web, and TUI packages. Import and conformance gates enforce dependency direction and prohibit duplicate domain implementations.

### Paired service security

Every client starts from a local git-stacks helper. In default local mode that process is also the authority and provisions trust automatically. `git-stacks web` opens a self-contained browser client from the installed package; browser API, events, signals, and terminals then use pinned WebTransport, with no executable HTTP bootstrap. The browser has no durable identity or state and talks only to the local helper. The optional Bun TUI uses pinned TLS 1.3 to that helper. For a remote target, the Node helper is the paired principal and relays typed channels over WebTransport. Remote trust is established once through explicit out-of-band pairing. Workspace, operation, signal, event, terminal, target, and persistence policy remain in the helper/selected authoritative service.

## Current Constraints

- Node 24 LTS is the initial minimum runtime for default packages.
- TypeScript remains on 6.x during the migration; TypeScript 7 is separate work.
- `node-pty` `1.2.0-beta.14` is accepted as a temporary exact-pinned dependency because it supplies the required Linux x64/arm64 and macOS x64/arm64 prebuilds. Actual-host lifecycle tests and an explicit beta upgrade review remain release gates.
- Bun remains only for the optional OpenTUI package while OpenTUI requires it.
- Filesystem notifications are hints; bounded content reconciliation is the correctness fallback.
- Only narrow per-target coordination may serialize semantic read-modify-write operations. No global lock or service dependency is introduced for normal CLI use.
- User commands and hooks favor compatibility with the configured shell over portable `/bin/sh` semantics; shell-specific failures must remain explicit and diagnosable.
- The browser may request allowlisted environment refresh through trusted local launchers, but raw host environment values are never projected to browser code.

## Non-Goals

- A remote CLI client; the existing CLI remains daemonless and machine-local.
- Multi-user terminal collaboration or multiple terminal writers.
- Durable terminal multiplexing across service restart or machine reboot.
- Duplicate terminal tabs or cloned terminal sessions; terminals are stateful service-owned processes.
- Showing archived workspaces in normal lists, counts, switchers, attention navigation, or default searches.
- Automatic archival or removal based on stale-workspace detection.
- A generic application command palette unrelated to configured workspace commands and named product actions.
- Portable POSIX-shell behavior that bypasses the user's configured shell initialization.
- TypeScript 7 adoption, a general plugin architecture, or a second domain model.
- Supporting the retired native GTK/libghostty client.

## Historical Decisions

Unsupported product experiments are removed from the active branch and preserved through explicit archive tags. See [Native client retirement](./notes/native-client-retirement.md) for the relevant decision and recovery point.

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition:**

1. Move invalidated requirements to Out of Scope with a reason.
2. Mark validated requirements with their phase evidence.
3. Capture newly discovered requirements and decisions.
4. Re-check that package authority and the local-only CLI boundary still hold.

**After each milestone:**

1. Review all active, validated, deferred, and excluded requirements.
2. Re-check the core value and supported product surfaces.
3. Update architecture and constraints to match shipped behavior.

---
*Last updated: 2026-07-15 for the v0.22.0 Workspace Productivity milestone.*
