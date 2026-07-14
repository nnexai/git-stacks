# git-stacks

## Product

git-stacks is a local-first workspace manager for multi-repository development. One workspace definition coordinates repositories, branches, environment, commands, integrations, and developer-facing status across the CLI, terminal dashboard, and browser client.

## Current Milestone: v0.20.0 Local Web Workspace Client

**Goal:** Make the browser client the full graphical workspace surface while keeping filesystem, Git, process, credential, and terminal authority in the local Bun/TypeScript service.

**Core value:** One command takes a user from feature intent to a running development environment without manual repository setup.

## Supported Product Surfaces

- `git-stacks` CLI for workspace lifecycle, configuration, commands, integrations, and automation.
- OpenTUI dashboard for terminal-based workspace visibility and operations.
- `git-stacks web` for the loopback browser client, multiple service-owned terminal tabs, workspace creation, commands, signals, and repository status.
- Local Bun/TypeScript service for authoritative snapshots, operations, signal persistence, browser pairing, and browser terminal processes.

## Architecture

### Machine authority

The local service owns all machine-sensitive work:

- workspace configuration and stable identity;
- filesystem and Git inspection;
- launch resolution and environment construction;
- workspace operations and progress;
- signal publication, journaling, replay, and dismissal;
- browser PTYs, process groups, output retention, and cleanup.

### Thin browser

The browser receives browser-safe projections and sends stable identities plus user intent. It never receives service credentials, arbitrary launch environments, or direct filesystem access. xterm.js renders terminal output; the service remains the process owner.

### Trust boundary

The web surface is loopback-only and same-origin. A one-use pairing capability creates a scoped HttpOnly browser principal. Host, Origin, Fetch Metadata, quotas, bounded replay, and process cleanup are enforced by the service.

### Continuity

Browser tabs may disconnect and reconnect while their service-owned terminal remains retained. Output replay is cursor-based and bounded. Terminal processes do not survive a managed-service restart or machine reboot; loss of retained history is explicit.

### Signals

Coding-agent activity and notifications use one provider-neutral signal contract. Activity is scoped to exact workspace, repository, terminal surface, and provider session identities. The service owns durable projection and dismissal state; clients own only presentation and per-principal visibility.

## Current Constraints

- Browser terminal execution is enabled only on platforms with verified PTY and process-tree cleanup behavior.
- The web client is local-only; LAN, public hosting, and multi-user collaboration require a separate threat model.
- One browser principal owns one writer per terminal session.
- Browser terminal sessions are process-local, not a durable multiplexer.
- External terminal integrations retain their own session ownership.

## Non-Goals

- Remote hosted workspace access.
- Shared multi-user terminal writing.
- Durable terminal survival across service restart or reboot.
- Built-in source editor, diff browser, merge automation, or agent orchestration policy.
- Maintaining an additional desktop application stack.

## Historical Decisions

Unsupported product experiments are removed from the active branch and preserved through explicit archive tags. See [Native client retirement](./notes/native-client-retirement.md) for the relevant decision and recovery point.

---
*Last updated: 2026-07-14 for the local web workspace client direction.*
