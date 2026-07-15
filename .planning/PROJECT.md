# git-stacks

## Product

git-stacks is a local-first workspace manager for multi-repository development. One workspace definition coordinates repositories, branches, environment, commands, integrations, and developer-facing status across the CLI, terminal dashboard, and browser client.

## Current Milestone: v0.21.0 Node Core and Secure Service Architecture

**Goal:** Make Node.js the default runtime and distribution, then use that shared service foundation to deliver one paired local/remote service model with authenticated identities, encrypted transport, ephemeral browser access, and thin web/TUI clients.

**Core value:** One command takes a user from feature intent to a running development environment without manual repository setup.

**Target features:**

- A runtime-neutral, independently testable domain core shared directly by the local CLI and service.
- A daemonless Node.js CLI and a persistent Node.js service with one protocol and one implementation of machine behavior.
- Separate protocol, client, core, CLI, service, web, and optional TUI packages with enforced dependency directions.
- Atomic filesystem authority and watcher reconciliation that keeps local CLI changes and service projections coherent without refresh RPCs.
- Node-owned PTYs and signals behind replaceable service carriers, with Linux and modern macOS distribution parity.
- A local-helper/authority topology where local service use is the zero-configuration default and manually paired remote services use the same protocol and client semantics.
- Packaged browser code with WebTransport browser-to-helper and helper-to-authority connections, plus a TLS 1.3 local TUI adapter, ephemeral browser launches, helper/listener epochs, bounded streams, and adversarial reconnect protection.
- A release cutover that removes obsolete Bun-first runtime paths instead of retaining parallel implementations.

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

## Non-Goals

- A remote CLI client; the existing CLI remains daemonless and machine-local.
- Multi-user terminal collaboration or multiple terminal writers.
- Durable terminal multiplexing across service restart or machine reboot.
- New web or TUI product functionality unrelated to migration parity.
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
*Last updated: 2026-07-15 for the v0.21.0 Node core and client architecture milestone.*
