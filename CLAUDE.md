# CLAUDE.md

Contributor guidance for this repository.

## Runtime and commands

Node.js 24 and npm are the default toolchain. Bun is required only to build and test the optional OpenTUI package.

```bash
npm install
npm run build:packages          # protocol/client/core/web/service/CLI
npm run typecheck               # every workspace
npm run test:architecture       # package/import boundaries
npm run test:vitest             # isolated Node unit/integration suite
npm run test:node               # native Node runtime/conformance tests
npm run test:tui                # optional Bun/OpenTUI tests, isolated per file
npm run coverage                # Vitest V8 coverage for Node packages
npm test                        # complete Node and optional TUI suite
npm run tui:build               # optional Bun/OpenTUI package
npm run audit:licenses          # production lockfile license policy
npm run audit:runtime           # default Node production graph
npm run check:packages          # dry-run all package tarballs
npm run release:check           # verify RC; never tags by default
```

Use `npx vitest run <focused-file>` for focused core, CLI, service, and browser-support tests. OpenTUI component tests remain under `tests/tui/dashboard`; `npm run test:tui` launches each file in its own Bun process because Bun module mocks are not file-isolated.

## Package architecture

```text
protocol <- client <- web
    ^          ^
    |          |
   core ---- service <- explicit CLI launch commands
     ^          ^
     +--- CLI   +--- optional TUI trusted client
```

- `packages/protocol`: transport-neutral Zod schemas and wire types; no runtime/platform imports.
- `packages/client`: encrypted-carrier/session/RPC primitives plus shared event/signal/presentation semantics; browser-safe.
- `packages/core`: the only config, persistence, Git, workspace, integration, and hook implementation.
- `packages/cli`: Node Commander adapters. Ordinary commands use core directly and must not require service startup.
- `packages/service`: Node encrypted local/remote authority, projections, operation/event state, watchers, pairing/targets, relay, and `node-pty` terminals.
- `packages/web`: browser-only Solid/xterm client; no Node, filesystem, core, service, process, or secret imports.
- `packages/tui`: optional Bun/OpenTUI renderer and explicit editor/terminal handoffs. Machine state and mutations come from the trusted service contract.

The root `git-stacks` package is a facade over `@git-stacks/cli`. Internal package dependency versions are exact during RC publication. Default installation must not pull in the TUI, Bun, or OpenTUI.

## Architectural invariants

- YAML entities remain schema-version-1 compatible, indexed by in-file `name`, and atomically written with temp file, fsync, and rename. Cross-process read-modify-write operations use core leases.
- The CLI is local and daemonless. A running service observes CLI/editor writes through bounded filesystem invalidation and authoritative reload.
- Interactive clients fetch a revisioned snapshot once and follow ordered secure-session events. Cursor movement, selection, tab changes, and scrolling must not trigger filesystem or Git scans.
- The browser projection is narrower than trusted core state. Never expose machine paths, credentials, raw environment values, bearer material, or unapproved launch context.
- Browser PTYs are service-owned. Only visible terminals stream bytes; hidden terminals use bounded replay. Ordinary shell exit removes the tab; configured commands may retain ended output.
- Product data must not use HTTP, SSE, WebSocket, cookies, or browser storage. Browser traffic uses pinned loopback WebTransport; TUI traffic directly trusts the service's self-signed leaf over TLS 1.3 plus application authentication; remote traffic uses paired pinned WebTransport.
- Agent configuration is never modified implicitly. `git-stacks hooks install|update|uninstall|status` is the only owned lifecycle.
- Durable user choices belong in workspace/global YAML, not client-local storage or service-only preferences.
- Expected operation failures use structured outcomes. Destructive Git/worktree behavior must fail closed and retain recovery context.

## Testing and release

Production behavior needs Node tests with Bun absent from `PATH`; Bun tests cover only the optional TUI. Native PTY behavior requires real-process resize, replay, process-tree cleanup, and shutdown coverage. Browser-safe packages are statically rejected when they import Node or Bun built-ins. Node coverage uses Vitest's V8 provider directly; do not reintroduce copied/instrumented source trees or the former Istanbul/Bun runners.

`npm run release:check` requires a matching `-rc.N` package version and changelog heading. It builds, type-checks, runs Vitest, native Node, architecture, optional TUI, coverage, and verification gates, audits licenses/security, and dry-runs every package tarball. It does not publish and does not tag unless the operator explicitly passes `--tag`.

Do not tag, push, publish packages, or create a release without explicit user authorization.
