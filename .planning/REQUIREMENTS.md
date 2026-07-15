# Requirements: v0.21.0 Node Core and Client Architecture

**Defined:** 2026-07-15
**Core value:** One command creates a usable multi-repository development workspace while all product surfaces share one machine-side implementation.

## Package and Runtime Foundation

- [x] **PKG-01:** Maintainers can install dependencies, build, typecheck, and test protocol, client, core, CLI, service, web, and TUI workspaces independently from the repository root.
- [x] **PKG-02:** Runtime and import-boundary gates reject core-to-UI, core-to-transport, client-to-service-implementation, web-to-machine, and ordinary CLI-to-service dependencies; explicit `service` and `web` launch commands are the only CLI exceptions.
- [x] **PKG-03:** Production packages emit inspectable ESM for Node 24 with declared third-party dependencies external and reproducible package manifests.
- [x] **PKG-04:** Shared conformance fixtures verify stable identities, validation, signal reduction, ordering, and operation semantics without importing a concrete renderer or runtime.

## Shared Domain Core

- [x] **CORE-01:** The local CLI and service invoke one runtime-neutral implementation of workspace/config/template/registry parsing, resolution, validation, and mutation.
- [x] **CORE-02:** Git, worktree, integration, launch-planning, and command-domain behavior is separated from Commander prompts, OpenTUI rendering, service transport, and concrete process APIs.
- [x] **CORE-03:** Process execution, clocks, executable lookup, globbing, observation, and logging are supplied through narrow capabilities with Node production adapters and deterministic test adapters.
- [x] **CORE-04:** Architecture and duplicate-behavior tests prevent a migrated capability from remaining implemented in both legacy and target paths.

## Filesystem Authority and Coherency

- [x] **DATA-01:** Every shared-core replacement write uses a unique same-directory temporary file, exclusive creation, flush/close, atomic rename, cleanup, intended mode, and supported parent-directory durability.
- [x] **DATA-02:** Semantic workspace, template, registry, and configuration mutations re-read authoritative state and use narrow per-target cross-process coordination so concurrent field-level intents do not silently erase one another.
- [x] **DATA-03:** The service treats watcher events as invalidation hints, debounces rebuilds, rebinds replaced directories, and emits only when the aggregate content revision changes.
- [x] **DATA-04:** Bounded periodic content reconciliation covers every authoritative definition root and recovers dropped or coalesced watcher events without exposing file contents.
- [x] **DATA-05:** Local CLI operations remain correct when no service is running and require no service discovery, lock daemon, refresh RPC, or event acknowledgement.

## Local Node CLI

- [x] **CLI-01:** The existing `git-stacks` command tree, arguments, exit codes, streams, prompts, completions, and local workflows run under Node 24 without Bun.
- [x] **CLI-02:** CLI presentation and interactive wizards live in the CLI package and call shared-core use cases rather than importing TUI or service modules.
- [x] **CLI-03:** CLI-only commands remain daemonless; only explicit `service`, `web`, and trusted-client launch commands start or connect to the service.
- [x] **CLI-04:** CLI compatibility tests prove parity for workspace lifecycle, Git operations, commands, integrations, hooks, notes, labels, templates, repositories, and diagnostics before legacy entrypoints are removed.

## Node Service and Protocol

- [x] **SVC-01:** The Node service preserves the existing authenticated HTTP API, browser-safe and trusted projections, operation registry, event cursors, replay gaps, heartbeat behavior, quotas, and idle lifecycle.
- [x] **SVC-02:** Node `http` plus exact-pinned `ws` replaces Bun transport without changing browser/TUI protocol semantics; WebSocket compression remains disabled unless separately benchmarked.
- [x] **SVC-03:** Managed startup uses race-safe discovery and ownership, removes stale startup artifacts safely, and shuts down after the final managed client without leaving sockets, timers, watchers, or child processes.
- [x] **SVC-04:** Protocol and client packages contain no concrete service launcher or runtime implementation, and carriers remain replaceable for future encrypted remote access.
- [x] **SVC-05:** The service projects external CLI/file changes through normal revisions and SSE events without a special CLI refresh path.

## Node Terminal and Signal Runtime

- [x] **TERM-01:** A narrow PTY adapter lets the existing terminal manager own lifecycle, replay, visibility, backpressure, title, resize, process-group cleanup, and signal filtering independently of `node-pty`.
- [x] **TERM-02:** Exact-pinned `node-pty` `1.2.0-beta.14` passes interactive shell, command shell, exit, resize, Unicode, title, hidden-stream, reconnect, replay, pressure, cleanup, and resource tests on supported hosts.
- [ ] **TERM-03:** Linux x64/arm64 and macOS x64/arm64 installs use trusted prebuilt PTY artifacts without a compiler; unsupported or missing artifacts fail clearly rather than silently building or degrading.
- [x] **SIG-01:** Signal ingestion, coalescing, exact-surface state, dismissal, stale cleanup, and provider deduplication retain the v0.20 service-owned semantics under Node.
- [x] **SIG-02:** Closing, exiting, hiding, reconnecting, or acknowledging terminals cannot leave stale agent activity or clear unrelated activity.

## Thin Web and TUI Clients

- [x] **WEB-01:** The web package builds as browser-only static assets against protocol/client contracts and imports no core, filesystem, process, service implementation, or Node-only module.
- [x] **WEB-02:** `git-stacks web` serves the packaged client from the Node service with v0.20 pairing, workspace, command, signal, terminal, reconnect, focus, sizing, and context-menu parity.
- [x] **TUI-01:** The optional Bun/OpenTUI package consumes the trusted service projection, operations, and SSE stream through the public service/client API, uses core only for pure shared types and presentation helpers, and contains no independent domain or persistence authority.
- [x] **TUI-02:** TUI startup, shutdown, rendering, viewport ownership, dismissals, commands, and foreground handoffs retain parity while closing the TUI reliably releases its managed-service client.
- [x] **CLIENT-01:** Web and TUI reuse shared client reducers for revision/event handling, signal presentation, priority ordering, operation progress, reconnect, and replay-gap recovery while owning their own rendering.

## Distribution and Cutover

- [ ] **DIST-01:** The default npm package installs and runs the CLI/service/web stack on Node 24 for Linux x64/arm64 and modern macOS x64/arm64 without Bun or a native compiler.
- [x] **DIST-02:** The optional TUI is packaged explicitly with its Bun/OpenTUI runtime requirement and cannot pull Bun-only dependencies into default CLI/service installs.
- [ ] **DIST-03:** Release CI verifies package contents, licenses, clean-install smoke tests, CLI/service/web behavior, PTY lifecycle, shutdown, and resource bounds on the supported platform matrix.
- [x] **DIST-04:** Final cutover deletes obsolete Bun CLI/service adapters, duplicate source paths, temporary compatibility shims, and stale documentation in the same milestone.
- [x] **DIST-05:** The release notes disclose the Node 24 minimum, optional Bun TUI, exact `node-pty` beta exception, platform matrix, migration behavior, and rollback boundary before v0.21.0-rc.1 is tagged.

## Future Requirements

- A dedicated local/remote CLI client over the service protocol.
- Encrypted helper-to-remote transport and manually paired remote services.
- Durable terminal multiplexing across service restarts.
- Additional web feature completeness after the runtime/package foundation ships.

## Out of Scope

- Remote server delivery or public/LAN hosting in v0.21.0.
- New product features unrelated to migration parity.
- Multi-user terminal writing.
- TypeScript 7 migration.
- Reintroduction of the retired native client.
- Keeping Bun and Node implementations of the same CLI or service behavior after cutover.

## Traceability

| Requirement group | Phase | Status |
|---|---|---|
| PKG-01..04 | 108 | Complete |
| CORE-01..04, DATA-01..02 | 109 | Complete |
| DATA-03..05, CLI-01..04 | 110 | Complete |
| SVC-01..05 | 111 | Complete |
| TERM-01..03, SIG-01..02 | 112 | Host complete; supported-platform install proof pending |
| WEB-01..02, CLIENT-01 | 113 | Complete |
| TUI-01..02 | 114 | Complete |
| DIST-01..05 | 115 | Local release checks complete; hosted platform matrix pending |

---
*Last updated: 2026-07-15 after the Node package cutover and local verification; hosted Linux ARM and macOS matrix proof remains pending.*
