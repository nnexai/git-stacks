---
spike: 018
name: node-core-packages
type: standard
validates: "Given the current source graph, when domain code is targeted at Node and split from CLI, service, web, TUI, and protocol adapters, then representative persisted-state and shared-state behavior runs under Node and the remaining coupling is bounded and identifiable"
verdict: VALIDATED
related: [016, 017]
tags: [node, core, packages, architecture, esm, dependencies]
---

# Spike 018: Node Core and Package Boundaries

## What This Validates

Given the current source graph, when git-stacks is reorganized around a runtime-neutral core, then the local CLI and service can share real domain behavior while UI, transport, process, and runtime dependencies remain outside that core.

## Research

| Build/package approach | Pros | Cons | Status |
|---|---|---|---|
| TypeScript `NodeNext` packages with explicit `.js` relative imports | Standards-only emitted ESM, easy package debugging | Requires a repository-wide import-specifier migration | Good long-term option |
| Bundle each package's project code, keep declared dependencies external | Works with current extensionless imports, small package artifacts, avoids CommonJS-in-ESM bundling traps | Adds a build-time esbuild binary and can obscure module boundaries if overused | Validated transition path |
| Bundle the complete dependency tree into each executable | Single artifact | Broke on `yaml`'s dynamic CommonJS require path and duplicates dependencies across surfaces | Rejected |
| Execute TypeScript source directly in production | Minimal build setup | Couples distribution to runtime type stripping and current module-resolution limitations | Rejected |

The retained probe uses [`esbuild`](https://esbuild.github.io/) 0.28.1, an MIT-licensed, actively maintained build tool, to bundle current git-stacks project modules while keeping packages such as `yaml` and `zod` external. That matches normal npm package semantics and fixed the observed dynamic-require failure from bundling `yaml` into ESM.

Node 24 is the appropriate initial minimum: it is the current LTS line and receives support through April 2028. Node 20 is already end-of-life as of this spike. The representative output targets Node 24 even though the same behavior also passed experimentally on Node 20, 22, and 26.

The current latest `typescript` package, 7.0.2, did not expose the compiler API shape used by the graph analyzer. TypeScript 6.0.3 did. The migration should pin the existing 6.x toolchain initially and treat a TypeScript 7 migration as separate work rather than combining two architectural changes.

## How to Run

```bash
cd .planning/spikes/018-node-core-packages
npm install
npm run check
```

## What to Expect

The analyzer reports direct/transitive Bun and UI coupling plus cross-layer imports. The executable probe then runs current config persistence, priority mutation, labels, signal reduction, protocol validation, and presentation code under Node from a generated ESM artifact.

## Observability

Both stages print structured JSON. The runtime probe uses and removes an isolated temporary configuration root.

## Investigation Trail

- Defined the intended layers from current paths and inspected cross-layer imports instead of estimating migration size from file names.
- The graph contains 148 source files and 76 files under `src/lib`. Twenty-five library files use Bun APIs directly. A conservative transitive analysis marks 47 library files as currently runtime-, Commander-, or TUI-coupled and 29 as already portable.
- Bun usage is concentrated in replaceable capabilities: process execution (`Bun.spawn`, `spawnSync`, and shell templates), delay, executable lookup, globbing, stderr writing, and package-file reading. These should become explicit process, clock, glob, executable, and logging adapters rather than one-off rewrites in every module.
- Seven integration modules import prompt helpers from `src/tui`, and nine carry Commander types. Integration provider behavior must be separated from CLI registration and prompting before calling it core.
- Ten CLI imports point into `src/tui` for prompts and wizards. Those are local CLI presentation concerns and should move with the CLI package; they are not evidence that the local CLI should become a service client.
- `src/lib/service/client.ts` imports the concrete service launcher and uses `Bun.sleep`. Discovery/launch policy must be injected or moved into a client bootstrap adapter so the protocol client remains thin.
- The OpenTUI dashboard still has runtime imports from config, integration, labels, and workspace-command modules in addition to its service client. The package split should finish the Phase 107.4 intention by replacing those residual reads with service projections or client-local pure presentation helpers.
- The full service `contract.ts` is runtime-neutral. The trusted `core-contract.ts` imports persisted config schemas and belongs with the official client/service model unless config schemas are split from filesystem persistence.
- The first executable bundle incorrectly included every dependency and failed in `yaml`'s dynamic CommonJS require path. Keeping declared dependencies external resolved it.
- Current config persistence, YAML schema validation, atomic replacement, priority mutation, label filtering, service signal reduction, and shared presentation all executed under Node 24 from a generated ESM artifact. The same probe also passed on Node 20, 22, and 26 on Linux x64.

## Results

**VALIDATED** — a shared Node-compatible core is feasible, and meaningful current domain code already runs unchanged under Node. The migration is architectural rather than a blind directory move: process/runtime capabilities and presentation registration must first be pulled behind explicit boundaries.

Recommended workspace graph:

```text
@git-stacks/protocol  <──────── web, service, TUI, future clients
         ▲
         │
@git-stacks/core      <──────── local CLI, service
         ▲                         ▲
         │                         │
@git-stacks/cli (Node, local)   @git-stacks/service (Node)
                                   ▲
                          web and optional Bun TUI
```

In practice, pure persisted model schemas may live in a browser-safe `@git-stacks/core/model` export so the trusted service-client contract can validate workspace definitions without importing filesystem persistence. The protocol package must not import the service launcher, terminal implementation, or CLI framework.

The first implementation should use npm workspaces, Node 24 LTS, pinned TypeScript 6.x for typechecking, and per-package ESM builds with runtime dependencies external. Package boundary tests should reject core-to-TUI, core-to-Commander, client-to-concrete-service, and web-to-service-implementation imports.
