---
phase: 108
status: planned
depends_on: []
requirements: [PKG-01, PKG-02, PKG-03, PKG-04]
---

# Phase 108 Plan: Package and Runtime Foundation

## Objective

Create the target workspace and mechanical dependency rules while preserving current behavior through forwarding-only entrypoints.

## Work packages

### 1. Workspace and toolchain

- Convert the root into a private workspace with directories for protocol, client, core, CLI, service, web, and TUI.
- Pin Node 24 engines, TypeScript 6.x, package manager metadata, and reproducible lockfile behavior.
- Establish package-local `package.json`, export maps, ESM build/typecheck/test scripts, source maps, and clean tasks.
- Use esbuild for transitional project-code output with declared dependencies external; do not bundle dependency trees.
- Keep the public `git-stacks` bin working through one forwarding entrypoint while packages move.

### 2. Contract ownership

- Move browser-safe IDs, requests, responses, events, signals, operation DTOs, and version negotiation into protocol.
- Create client package seams for request transport, SSE/event handling, reconnect/replay-gap state, operation waiting, signal presentation, and priority ordering.
- Define core capability interfaces without moving implementations prematurely.
- Record package ownership in export maps and a short ADR in this phase directory.

### 3. Enforcement and fixtures

- Replace monolithic circular-dependency checks with package-aware import graph checks.
- Fail on forbidden edges listed in the architecture document, including dynamic imports and test-only leaks that enter production bundles.
- Add bundle audits for browser Node built-ins and default-package Bun/OpenTUI dependencies.
- Extract stable conformance fixtures for IDs, Zod validation, priority ordering, signal transitions, operation envelopes, and replay-gap behavior.
- Add a migration-shim manifest; every shim records owner, target export, and removal phase.

## Tests and evidence

- Clean root install followed by build/typecheck/test for each workspace.
- Negative architecture fixtures prove each forbidden edge makes the gate fail.
- Browser bundle audit proves no Node built-ins.
- Node smoke imports each package export map from built output.
- Existing CLI, service, web build, and TUI smoke paths still launch through forwarding-only entrypoints.

## Completion gate

- All target packages exist and build independently.
- Dependency rules are executable and green on the real graph.
- No product behavior has been copied into a second implementation.
- Every temporary shim is listed with a Phase 115 removal target.

## Rollback

Revert the workspace scaffolding and forwarding exports as one phase. No persisted format or runtime behavior changes in this phase.
