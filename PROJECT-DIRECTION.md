# Project Direction

`git-stacks` is a local platform for multi-repository task environments. The `0.20.0` architecture centers machine-side behavior in one Bun service and keeps interactive clients focused on presentation.

The immediate goal is to harden this foundation through the `0.20.0` release candidates. Additional browser features can arrive incrementally afterward without creating another workspace engine.

## Architectural Direction

### One Shared Machine-Side Core

The local service is authoritative for interactive use. It owns:

- complete workspace, template, repository, integration, file, and note projection
- filesystem and Git inspection
- workspace creation and typed mutations
- durable operation state and progress
- workspace-change monitoring and revision invalidation
- provider-neutral signals and dismissal
- browser terminal processes and replay

The TUI consumes the complete trusted contract in [`src/lib/service/core-contract.ts`](./src/lib/service/core-contract.ts) through the shared client in [`src/lib/service/client.ts`](./src/lib/service/client.ts). It owns navigation, rendering, dialogs, and viewport state, but no independent persistence or Git engine.

The browser uses the narrower projection under [`src/service/web`](./src/service/web). Machine paths, credentials, raw environment values, and trusted launch context stay outside that contract.

### Focused Domain Modules

Workspace behavior is split across focused `src/lib/workspace-*.ts` modules rather than accumulating in a client or monolithic adapter. The service composes those modules into typed operations; one-shot CLI commands reuse the same behavior for scripting.

New functionality should follow this ownership rule:

- Machine state, persistence, Git, processes, operations, and shared policy belong in the domain core or service.
- Client code should contain presentation, interaction, and viewport logic only.
- Browser-safe data must be projected explicitly instead of exposing the trusted core wholesale.
- Durable user choices belong in workspace or global YAML, not client-local storage or service-only preferences.

### Revisioned, Event-Driven Clients

Interactive clients load an authoritative revisioned snapshot, then follow server-sent events for invalidation, operation progress, and signals. Cursor movement, tab switching, and scrolling must not trigger repeated filesystem or Git scans.

Events are durable enough for reconnect replay, bounded for resource safety, and supplemented by authoritative reloads after invalidation. Polling is a recovery path for interrupted operation streams, not the primary synchronization model.

### Explicit Process Ownership

Browser PTYs belong to the service, not the page. This allows reload and temporary browser disconnection without replacing live shells. The boundary is intentionally local and process-scoped: stopping the service or machine ends those sessions.

Only visible terminal views stream output to the browser. Hidden views reconnect with bounded replay when selected. Ordinary shells disappear when their process exits; configured command tabs may retain final output as an execution record.

### Human-Editable Durable State

Repository registry, templates, workspaces, labels, and priority remain YAML source of truth under `~/.config/git-stacks/`. The service may index and cache these files, but it must preserve direct editability, schema compatibility, atomic writes, and external-change detection.

Transient service descriptors, credentials, event journals, operation records, and PTYs stay in the service-owned config area. They are implementation state, not workspace definition.

## Product Surfaces

### CLI

The CLI remains the complete scriptable interface for workspace lifecycle, Git operations, files, environment inspection, notes, manual commands, integrations, hooks, diagnostics, and completion.

### TUI

`git-stacks manage` remains the dense terminal-native control surface. It should retain feature depth while becoming progressively thinner over the shared service contract.

### Browser

`git-stacks web` is the supported graphical interface. It should gain feature completeness incrementally after the core architecture is stable, using existing service operations and projections rather than browser-specific business logic.

### Native Client

The GTK/Zig client and patched Ghostty dependency are retired. Supporting a separate native build system and terminal fork is outside the product direction. The final implementation is archived at tag `native-client-final-2026-07-14` for historical reference only.

## Coding-Agent Integrations

Signals are provider-neutral service state. User-level provider hooks are optional adapters and must remain strictly opt-in:

- `install` changes only providers selected by the user.
- `update` reconciles only integrations already owned by git-stacks.
- `uninstall` removes only selected git-stacks-owned entries.
- Normal service, client, workspace, and terminal startup never modifies provider configuration.

Terminal-local wrappers may provide basic lifecycle signals without installing user configuration, but they must not claim richer provider semantics than they can observe.

## `0.20.0` Release-Candidate Focus

The first `0.20.0` release candidate should establish confidence in the architectural cutover rather than expand scope. Release readiness centers on:

- one coherent service-owned state and mutation path for both interactive clients
- correct TUI load, refresh, scrolling, mutation, and shutdown behavior
- browser terminal resize, focus, reconnect, visibility streaming, exit, and cleanup behavior
- signal lifecycle, acknowledgment, dismissal, deduplication, and stale-surface cleanup
- loopback pairing, credential, projection, and path/secret isolation boundaries
- opt-in and ownership-safe coding-agent hook lifecycle
- complete packaged browser assets and release documentation
- passing type, dependency, test, coverage-inventory, `next`-tagged publish dry-run, and RC checks

## Non-Goals

- A hosted control plane or remote browser service
- Network exposure beyond loopback
- Reintroducing a native graphical client
- Client-specific copies of workspace, Git, operation, or signal policy
- Implicit coding-agent configuration
- Persisting interactive shell processes across service restart or machine reboot

## Bottom Line

The structural rewrite proposed by the older version of this document is now the current architecture: `git-stacks` has a shared local core, typed operations, indexed human-editable state, durable events, and thin interactive clients. The next product work should build on that center instead of adding parallel implementations.
