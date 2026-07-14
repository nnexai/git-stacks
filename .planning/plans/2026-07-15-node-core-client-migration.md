# Node Core and Client Migration Architecture

**Milestone:** v0.21.0
**Status:** implementation-ready architecture; formal independent GSD plan-checker not run in this session
**Evidence:** Spikes 016-019 plus the shipped v0.20 service/client architecture

## Outcome

git-stacks becomes a workspace repository with one machine-side domain implementation and separately distributable surfaces:

```text
                         @git-stacks/protocol
                         DTOs, IDs, validation
                            ^           ^
                            |           |
                    @git-stacks/client  |
                  events/reducers/carriers
                      ^             ^
                      |             |
              @git-stacks/web   @git-stacks/tui
               browser only      optional Bun

@git-stacks/cli  ------> @git-stacks/core <------ @git-stacks/service
 local Node CLI         domain + persistence       Node authority
 daemonless                                      HTTP/SSE/WS/PTYS
```

`core` and `protocol` are deliberately different. Core models authoritative local state and use cases. Protocol models versioned client/service projections and requests. The service is the adapter between them. Clients must never import core merely to reuse a convenient type.

## Target workspace layout

```text
packages/
  protocol/     browser-safe schemas, IDs, DTOs, protocol version
  client/       typed client, event/replay reducer, shared presentation semantics
  core/         domain models, use cases, persistence, Git and process capabilities
  cli/          Commander tree, prompts, wizards, local entrypoint
  service/      Node lifecycle, operations, projections, auth, HTTP/SSE/WS, terminals
  web/          Solid/browser application and xterm rendering
  tui/          optional Bun/OpenTUI application
scripts/        repository gates, packaging, release verification
tests/          cross-package conformance and clean-install fixtures
```

The root is private and uses npm-compatible workspaces. Published package names and whether internal packages remain private are decided in Phase 108; package boundaries exist even if the first release publishes one default facade package and one optional TUI package.

## Dependency rules

| Package | May depend on | Must not depend on |
|---|---|---|
| protocol | Zod and browser-safe utilities | core, Node APIs, service, renderers |
| client | protocol | core, concrete service launcher, filesystem, PTY |
| core | domain/runtime-neutral dependencies and injected capabilities | protocol DTOs, Commander, OpenTUI, HTTP, WebSocket, PTY |
| cli | core, CLI presentation dependencies | service/client transport for ordinary commands, TUI |
| service | core, protocol, Node adapters, node-pty, ws | CLI prompts, renderers |
| web | protocol, client, browser/rendering dependencies | core, Node APIs, service implementation |
| TUI | protocol, client, OpenTUI, explicit handoff adapter | core persistence/domain implementations, service implementation |

The service launcher used by explicit `web`, `service`, and TUI startup belongs to a Node-only service bootstrap export. It is not part of the carrier-neutral client package.

## Migration method

Each capability moves once:

1. Define its destination interface and contract test.
2. Move the current implementation, preserving history where practical.
3. Update all callers in the same phase or through a forwarding-only shim.
4. Run parity and boundary tests.
5. Delete the old implementation before the phase closes.

Forwarding shims may preserve import paths temporarily, but may not contain policy, state, branching, transformation, or fallback behavior. Every shim is listed in a removal manifest owned by Phase 115.

## Runtime capabilities

Core receives these capabilities rather than importing Bun or Node process globals throughout the domain:

- `ProcessRunner`: spawn, collect, stream, abort, exit classification, environment policy.
- `Clock`: now, timeout, bounded delay.
- `ExecutableResolver`: PATH lookup and executable validation.
- `FileMatcher`: bounded glob/match behavior where direct traversal is insufficient.
- `Logger`: structured levels and redaction boundary.
- `MutationCoordinator`: per-target semantic mutation lease.
- `ChangeObserver`: service-side invalidation hints; never required by CLI use cases.

Node production adapters live outside core or in explicit `core/node` exports that cannot enter browser/client graphs. Tests use deterministic fakes.

## Persistence contract

`atomicReplace` writes a unique same-directory temporary file with exclusive creation, applies the intended mode, flushes and closes, renames over the target, and cleans up on every failure. Parent-directory sync is attempted where supported and required by the durability level.

Read-modify-write helpers accept field-level intents. They acquire a per-target cross-process lease only around re-read → validate → apply intent → atomic replace. Create, full replace, delete, and read operations do not take a global lock. Lock ownership includes a nonce and process metadata; stale recovery is bounded and tested against crashes and PID reuse assumptions.

The service watches authoritative parents for low latency, debounces bursts, rebuilds complete projections, and compares an aggregate content digest. A bounded periodic reconciliation covers config, registry, templates, workspaces, and future declared definition roots. Watch events are never treated as a complete journal.

## Service and terminal contract

The Node service keeps the v0.20 routes and semantics. `node:http` owns request/SSE sockets; `ws` owns terminal upgrades and frames. Carrier adapters expose drain/pressure/close without moving replay or lifecycle policy out of the terminal manager.

`node-pty` is hidden behind:

```ts
interface PtyProcess {
  readonly pid: number
  write(data: string | Uint8Array): void
  resize(columns: number, rows: number): void
  kill(signal?: string): void
  onData(listener: (chunk: string) => void): Disposable
  onExit(listener: (event: { exitCode: number; signal?: number }) => void): Disposable
}
```

The interface may be refined in Phase 112, but replay buffers, visibility, attachment ownership, signals, and session retention stay above it.

## Dependency exception: node-pty beta

`node-pty@1.2.0-beta.14` is accepted for v0.21 as an exact-pinned temporary dependency. The exception requires:

- package-lock integrity and source/license/provenance review;
- no install-time compiler on supported Linux/macOS architectures;
- actual-host spawn, resize, exit, process-tree cleanup, pressure, and repeated-cycle tests;
- explicit update command/PR rather than a semver range;
- release-note disclosure and re-evaluation when a stable prebuilt release exists;
- immediate ability to disable the web terminal capability with a clear diagnostic on an unsupported host.

This acceptance resolves Spike 016's adoption decision; it does not waive host validation.

## Verification strategy

Four layers prevent a green migration with hidden duplication:

1. Unit tests per package and deterministic capability fakes.
2. Contract/conformance tests shared across CLI/core, service/core, web/client, and TUI/client boundaries.
3. Import and duplicate-behavior gates over the complete source graph.
4. Clean-install, actual-process, browser, PTY, shutdown, and resource tests on Linux/macOS.

Parity is measured against user-visible v0.20 behavior and archived fixtures, not by running two production implementations indefinitely.

## Cutover and rollback

Phase commits should remain revertible at phase boundaries. The package facade may preserve the `git-stacks` command and public npm name while internal packages change. The final release candidate is not tagged until Phase 115 passes. Rollback means reverting to the last v0.20 RC commit/tag, not shipping both service runtimes behind a permanent flag.

## Explicitly deferred

- Remote service delivery and remote CLI.
- WebTransport/helper relay implementation.
- New web feature completeness.
- Durable terminal multiplexing.
- TypeScript 7 and additional runtime support.
