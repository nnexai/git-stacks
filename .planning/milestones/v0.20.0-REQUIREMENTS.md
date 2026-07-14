# Requirements: git-stacks Local Web Client

**Defined:** 2026-07-14
**Core value:** One command creates a usable multi-repository development workspace and exposes it through local CLI, dashboard, and browser workflows.

## Local Service

- [x] **SVC-01:** The service binds to loopback, authenticates before routing, and publishes no bearer secret in discovery metadata.
- [x] **SVC-02:** Clients consume authoritative workspace snapshots with stable workspace, repository, command, revision, and operation identities.
- [x] **SVC-03:** Workspace mutations are idempotent, report structured progress, and are bounded by explicit capacity and timeout policies.
- [x] **SVC-04:** Ordered events support replay, replay-gap recovery, bounded subscribers, and idle service shutdown.
- [x] **SVC-05:** Workspace configuration changes invalidate snapshots without tearing down retained browser terminals.

## Browser Security and Projection

- [x] **WEB-01:** `git-stacks web` issues a one-use pairing capability and exchanges it for a scoped HttpOnly browser principal.
- [x] **WEB-02:** Web routes enforce same-origin Host, Origin, and Fetch Metadata rules and never expose service credentials.
- [x] **WEB-03:** Browser DTOs omit raw launch environments, secret references, and unnecessary machine paths.
- [x] **WEB-04:** Workspace, repository, command, operation, Git, label, priority, and signal state are projected through stable browser-safe identities.
- [x] **WEB-05:** The web client provides workspace-first navigation, creation, command launching, context actions, responsive layout, and keyboard-accessible terminal focus.

## Browser Terminals

- [x] **TERM-01:** The service creates multiple independent PTYs from trusted terminal launch resolution using only workspace, repository, command, revision, and dimensions supplied by the browser.
- [x] **TERM-02:** Input, output, resize, title updates, close, exit, process-group cleanup, and command-shell retention have explicit lifecycle semantics.
- [x] **TERM-03:** Hidden terminals pause bulk output streaming while lifecycle controls and signal capture remain live.
- [x] **TERM-04:** Reattachment uses cursor-based bounded replay and reports explicit history loss instead of silently returning partial output.
- [x] **TERM-05:** Sessions remain reconnectable after browser closure while retained by the running service, but do not claim survival across service restart or reboot.
- [x] **TERM-06:** Terminal counts, replay bytes, socket pressure, and ended-session retention are bounded and observable.

## Workspace Signals

- [x] **SIG-01:** Hooks, terminal OSC, and automation publish one strict provider-neutral signal envelope.
- [x] **SIG-02:** Activity coalesces by provider session and exact terminal surface while notifications remain independently dismissible.
- [x] **SIG-03:** Sidebar provider presence is deduplicated and terminal tabs retain exact provider and lifecycle state.
- [x] **SIG-04:** Closing a terminal removes its activity projection and publishes durable idle tombstones for future cleanup.
- [x] **SIG-05:** Selecting the exact terminal tab acknowledges its signal without clearing unrelated principals or notifications.

## Compatibility

- [x] **COMP-01:** Existing CLI and OpenTUI behavior remains supported alongside the service and browser client.
- [x] **COMP-02:** External terminal integrations continue to own their sessions independently.
- [x] **COMP-03:** Default build, test, and publish workflows require no unsupported desktop toolchain.

## Shared Client Core

- [x] **CORE-01:** First-party trusted clients consume one typed core projection containing workspace definitions, authoritative status, templates, repository registrations, and global configuration.
- [x] **CORE-02:** OpenTUI workspace lifecycle, Git, command, issue, label, template, and repository mutations execute through the service operation registry with structured progress.
- [x] **CORE-03:** OpenTUI status, file status, notes, signals, and external invalidation updates are service-backed and event-driven rather than independently polled or inspected.
- [x] **CORE-04:** Browser and OpenTUI clients share transport types, signal presentation semantics, and priority ordering while retaining separate rendering and browser security projections.
- [x] **CORE-05:** Architecture tests prevent first-party renderers from regaining direct filesystem, Git, configuration-persistence, or process authority outside explicit foreground handoffs.

## Out of Scope

- Remote or LAN hosting.
- Multi-user collaboration and concurrent terminal writers.
- Durable terminal multiplexing across service restart or machine reboot.
- Browser PTYs on platforms without actual-host lifecycle verification.
- Additional desktop application clients.

## Traceability

| Requirement group | Phase | Status |
|---|---|---|
| SVC-01..05 | 104 | Complete |
| SIG-01..05 | 107.1, 107.3 | Complete |
| WEB-01..05 | 107.3 | Complete |
| TERM-01..06 | 107.3 | Complete |
| COMP-01..03 | 104, 107.3 | Complete |
| CORE-01..05 | 107.4 | Complete |

---
*Last updated: 2026-07-14 after the shared-core centralization.*
