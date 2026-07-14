---
phase: 110
status: planned
depends_on: [109]
requirements: [DATA-03, DATA-04, DATA-05, CLI-01, CLI-02, CLI-03, CLI-04]
---

# Phase 110 Plan: Node Local CLI Cutover

## Objective

Make `git-stacks` a complete Node 24 local tool and prove that a separately running service observes its authoritative writes without CLI/service coupling.

## Work packages

### 1. CLI runtime and presentation

- Move Commander registration, prompts, selectors, wizards, output formatting, completion generation, and local diagnostics into the CLI package.
- Replace Bun entrypoint/process helpers with Node adapters and preserve signal handling, exit codes, stdout/stderr separation, colors, and non-interactive behavior.
- Preserve the command tree and completion inventory from the live Commander graph.
- Keep explicit `service`, `web`, and TUI launch commands as service-aware commands; prohibit service imports in all ordinary command modules.

### 2. Compatibility cutover

- Run every command integration fixture through built Node output with Bun removed from PATH.
- Cover workspace/template/repository lifecycle, Git operations, sync/push, commands, integrations, hooks, notes, labels, files, completion, diagnostics, and invalid inputs.
- Move all remaining CLI imports from `src/tui` or legacy Bun helpers to CLI-owned presentation or core use cases.
- Switch the public bin to the Node CLI only after parity passes; remove the Bun CLI entrypoint in the same change.

### 3. Service reconciliation

- Implement service-side parent/root watchers as invalidation hints with bounded debounce and watcher rebinding.
- Define the authoritative-root registry: global config, repository registry, templates, workspaces, and future declared roots.
- Compute an aggregate content digest with bounded file count/size/error policy and no secret logging.
- Reconcile periodically, rebuild once per changed aggregate revision, and publish normal snapshot/events only on semantic change.
- Prove the CLI performs no discovery, refresh RPC, or acknowledgement after writes.

## Tests and evidence

- Node CLI parity matrix with Bun unavailable and no service running.
- Static gate rejects service/client imports from ordinary command modules.
- Separate-process tests run a service, mutate via CLI and external atomic writer, drop/coalesce watch hints, and observe one correct eventual revision.
- Same-size/same-mtime content replacement is detected by reconciliation.
- Idle watcher/reconciliation CPU, file descriptors, and I/O remain within an explicit baseline budget.

## Completion gate

- Public `git-stacks` bin is Node-only and complete.
- No ordinary CLI command needs the service.
- A running service eventually reflects every authoritative CLI write without duplicate event storms.
- Legacy Bun CLI code is deleted rather than retained as fallback.

## Rollback

Revert the bin and watcher changes together. Files written by the Node CLI remain compatible because Phase 109 preserved schemas and formats.
