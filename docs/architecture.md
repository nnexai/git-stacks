# Architecture

## Runtime split

The production system has one implementation per responsibility:

| Package | Runtime | Owns | May depend on |
|---|---|---|---|
| `@git-stacks/protocol` | neutral | wire schemas and transport types | external validation only |
| `@git-stacks/client` | neutral/browser | event reduction, reconnect and shared presentation semantics | protocol |
| `@git-stacks/core` | Node.js | config, atomic persistence, Git/filesystem and workspace domain behavior | external domain libraries |
| `@git-stacks/cli` | Node.js | command parsing, prompts and local presentation | core; service only in explicit launch commands |
| `@git-stacks/service` | Node.js | interactive authority, operations, events, signals, transport, PTYs, and the official local client adapter | protocol, client, core, web assets |
| `@git-stacks/web` | browser | browser rendering, local interaction and xterm viewport | protocol, client |
| `@git-stacks/tui` | Bun | OpenTUI rendering and explicit foreground handoffs | trusted client/service contract plus pure shared types/presentation |
| `git-stacks` | Node.js | public facade and bin | CLI |

The source graph is enforced by `scripts/check-architecture.mjs`. Default package validation follows the internal dependency graph and fails if it reaches the optional TUI.

## Data flow

Ordinary CLI commands call core directly. Core persists human-editable YAML atomically. If the service is running, its filesystem monitor treats changes as invalidation hints, rebuilds the authoritative state, and emits a new revision. The CLI neither starts the service nor sends a forced-refresh request.

Interactive clients fetch a complete snapshot, retain it locally for rendering, and follow ordered SSE events. A replay gap causes an authoritative snapshot reload. Typed mutations are submitted to the service and tracked through operation events. The browser receives a narrower projection than the trusted TUI.

The trusted TUI reaches the service only through `@git-stacks/service/client`. That Node-side adapter owns local discovery, managed startup, and credential lookup; the service root remains reserved for launchers and server construction. Browser-safe reduction and presentation stay in `@git-stacks/client` and never acquire local-machine authority.

The service is the only terminal owner. WebSocket connections carry terminal control and bytes, but browser visibility controls whether output is actively streamed. A reconnect supplies the last sequence cursor; bounded retained output is replayed or a reset is reported when the cursor is too old.

## Persistence and concurrency

Registry, template, workspace, labels, and priority are user-owned YAML. Writes use same-directory temporary files, file sync, atomic rename, and directory sync. Read-modify-write operations use per-resource cross-process leases so simultaneous CLI/service work does not lose updates. Service descriptors, credentials, journals, operations, and PTYs are runtime state rather than workspace definitions.

## Security boundary

The `0.21.0` service binds loopback only. Official local clients discover a restricted descriptor and authenticate with service credentials. Browser access starts with a one-use pairing URL and receives an HTTP-only browser session; bearer credentials, machine paths, raw environment, and trusted launch data are not part of the browser projection.

Loopback prevents network peers from connecting but is not transport encryption against a compromised host. Remote service support is future work and requires a separately designed authenticated, encrypted pairing transport.

## Runtime dependencies

`node-pty` and `ws` are exact-pinned because they are security- and lifecycle-sensitive. The selected `node-pty` package includes Linux and macOS prebuilds for x64 and arm64, and package validation fails if one is absent. The optional TUI pins OpenTUI exactly and is excluded from the default graph. The package lock is the authoritative dependency record; production licenses and the default runtime audit are release gates.
