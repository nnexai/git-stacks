---
phase: 109
status: planned
depends_on: [108]
requirements: [CORE-01, CORE-02, CORE-03, CORE-04, DATA-01, DATA-02]
---

# Phase 109 Plan: Shared Core and Filesystem Authority

## Objective

Move domain behavior into one Node-compatible core and repair persistence before the CLI and service run concurrently under Node.

## Work packages

### 1. Runtime-neutral domain extraction

- Classify current `src/lib` modules as domain, persisted model, Node adapter, CLI presentation, service policy, or client presentation.
- Move persisted schemas, workspace resolution, templates, registry, labels, notes, Git/worktree workflows, integration domain behavior, launch planning, and operation use cases into core.
- Split Commander registration and prompts from provider behavior; move prompt/wizard helpers to CLI ownership.
- Replace direct Bun process, sleep, executable lookup, glob, stderr, and package-file APIs with the Phase 108 capabilities.
- Provide Node adapters and deterministic test adapters. Do not add Bun adapters unless the optional TUI foreground handoff requires one outside core.

### 2. Atomic persistence

- Implement `atomicReplace` with unique same-directory exclusive temp files, cleanup, mode handling, flush/close, rename, and supported directory sync.
- Inventory every writer and route it through core persistence primitives.
- Replace full-object read/modify/write call sites with typed field-level intents.
- Implement narrow per-target cross-process mutation coordination with bounded acquisition, ownership nonce, crash/stale handling, and actionable diagnostics.
- Keep read, create, complete replace, and delete paths free of a global lock.

### 3. Single implementation cutover

- Update current CLI and service callers to core exports as each capability moves.
- Delete the original implementation in the same work package; retain only forwarding exports where import-path compatibility is temporarily necessary.
- Add semantic duplicate detection for high-risk concepts: workspace mutation, priority/labels, launch resolution, integration execution, signal reduction, and operation status.

## Tests and evidence

- Core tests execute with Node and fail if Bun, Commander, OpenTUI, service, or browser modules are resolvable in its graph.
- Fault injection covers open/write/flush/close/rename/directory-sync failure cleanup.
- Multi-process tests repeat concurrent label/priority/registry/template intents and require merged valid output.
- Crash tests terminate a lock holder and prove bounded safe recovery.
- Existing domain fixtures pass through core exports with unchanged public behavior.

## Completion gate

- CLI and service use the same core implementation for every migrated capability.
- No fixed `${path}.tmp` writer remains.
- No uncoordinated semantic read-modify-write writer remains.
- Core built output runs under Node 24 and package architecture gates pass.

## Rollback

Because persisted file formats do not change, revert the phase as a unit. Remove abandoned lock artifacts only through the tested ownership/staleness rules.
