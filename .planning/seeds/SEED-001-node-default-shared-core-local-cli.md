---
id: SEED-001
status: dormant
planted: 2026-07-14
planted_during: v0.20.0 / post-Phase 107.4
trigger_when: when planning the next architectural milestone after v0.20.0-rc.1
scope: large
---

# SEED-001: Make Node the default runtime around a shared core while keeping the CLI local-only

## Why This Matters

The current Bun-first package combines the local CLI, service, web client, TUI, and shared domain behavior. Moving the broadly distributed surfaces to Node.js should make git-stacks available to more users, while a deliberate package boundary prevents the CLI, service, web UI, and TUI from growing duplicate implementations.

The intended architecture keeps machine and domain behavior centralized without making ordinary CLI commands depend on a daemon or network connection.

## When to Surface

**Trigger:** when planning the next architectural milestone after v0.20.0-rc.1.

Surface this seed before adding substantial web feature parity or remote-client behavior so those additions are built against the intended package and protocol boundaries.

## Intended Boundary

- A runtime-neutral shared core owns local domain operations and durable data behavior.
- The existing CLI remains a local-only, daemonless Node.js tool that invokes the core directly.
- The Node.js service invokes the same core and additionally owns persistent terminals, signals, event streams, authentication, and future remote access.
- The web UI stays a thin browser client of the service.
- The OpenTUI client remains an optional Bun package and becomes a thin service client.
- A future dedicated CLI client may target local or remote services; this does not change the local-only contract of the existing CLI.
- Service protocol contracts remain separate from the domain core and can be shared by the service, web UI, TUI, and future clients.

## Synchronization Intention

- Workspace definitions and related files remain authoritative persisted state.
- The service watches relevant parent directories, reconciles changes into its snapshot, and emits normal events; local CLI mutations do not need a refresh RPC.
- Shared core mutations should use atomic replacement so observers never see partially written definitions.
- Global locking is not an architectural requirement. Narrow concurrency protection is reserved for demonstrated read-modify-write races where atomic replacement alone cannot prevent a lost update.
- Git's own locking remains responsible for low-level index and reference integrity; higher-level workflows should detect semantic conflicts where necessary.

## Scope Estimate

**Large** — this is a package and runtime architecture migration affecting the build, distribution, process layer, service transport, PTY implementation, tests, and release pipeline. It should be planned only after the risky runtime assumptions have been spiked.

## Breadcrumbs

- `package.json` — current single-package Bun distribution and build scripts.
- `src/lib/` — candidate shared domain core, including concentrated Bun dependencies that need adapters.
- `src/commands/` — local CLI surface that should remain daemonless.
- `src/service/` — service runtime, HTTP/SSE/WebSocket, lifecycle, and terminal authority.
- `src/web-client/` — thin service-backed browser client.
- `src/tui/` — Bun/OpenTUI client to isolate as an optional package.
- `.planning/phases/107.4-core-centred-client-architecture/` — current service-centred client boundary to preserve.
- `.planning/spikes/011-webtransport-certificate-pinning/` through `.planning/spikes/015-pinned-tls-helper-relay/` — transport and remote-security findings that the runtime migration must not invalidate.

## Notes

This is an architectural intention, not an implementation commitment. Spike the Node process/PTY/server replacements, package boundaries, filesystem coherency, and cross-platform distribution before promoting it into a milestone.
