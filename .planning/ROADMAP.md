# Roadmap: git-stacks

## Overview

v0.20.0 establishes a secure, engine-owned native-client boundary, proves the shared native model and embedded-terminal lifecycle, composes those foundations into a usable Linux workspace client, and finishes with installable Linux acceptance plus a macOS-hosted architectural proof. Phase numbering continues from the previous milestone.

## Phases

- [x] **Phase 104: Workspace Service and Event Contract** - Native clients can securely query authoritative workspace state, launch context, operations, and replayable events without changing existing CLI or OpenTUI behavior. (completed 2026-07-11)
- [ ] **Phase 105: Shared Native Model and Terminal Foundation** - Platform shells share stable state semantics while Linux proves one correct, leak-free libghostty terminal surface.
- [ ] **Phase 106: Linux Workspace, Commands, and Attention** - Users can navigate workspaces, keep multiple terminal tabs alive, launch resolved shells and commands, and act on structured attention.
- [ ] **Phase 107: Native Delivery and Cross-Platform Proof** - The Linux client installs and passes platform acceptance, and the same architecture is compiled and exercised on an actual macOS environment.

## Phase Details

### Phase 104: Workspace Service and Event Contract

**Goal**: Native clients can securely consume authoritative workspace state, resolved execution context, asynchronous operations, and structured events through a versioned local contract.
**Depends on**: Nothing (first phase of v0.20.0)
**Requirements**: SVC-01, SVC-02, SVC-03, SVC-04, SVC-05, EVT-01, EVT-02, EVT-03, EVT-04, EVT-05
**Success Criteria** (what must be TRUE):

  1. A paired native client can negotiate `/v1`, discover capabilities, and query stable workspace, repository, command, and resolved-launch snapshots without reading workspace YAML.
  2. Unauthenticated, malformed, oversized, over-rate, and timed-out local requests are rejected while valid paired requests continue to work.
  3. A long-running mutation returns promptly with an operation identity, reports structured progress, and a retry with the same idempotency key does not repeat destructive work.
  4. A reconnecting client receives ordered operation and attention events from retained history, or detects a replay gap and rebuilds from an authoritative snapshot.
  5. Existing CLI and OpenTUI workflows remain compatible, and slow or disconnected event consumers cannot grow service memory without bound.

**Plans**: 9/9 plans complete

- [x] 104-01-PLAN.md
- [x] 104-02-PLAN.md
- [x] 104-03-PLAN.md
- [x] 104-04-PLAN.md
- [x] 104-05-PLAN.md
- [x] 104-06-PLAN.md
- [x] 104-07-PLAN.md
- [x] 104-08-PLAN.md
- [x] 104-09-PLAN.md

Wave 1:

- [x] 104-01 — Freeze the v1 contract and stable identity migration
- [x] 104-03 — Establish protected per-client credential admission

Wave 2 *(blocked on Wave 1 completion)*:

- [x] 104-02 — Build authoritative snapshots and redacted launch contexts
- [x] 104-05 — Build the durable ordered journal and bounded live broker

Wave 3 *(blocked on Wave 2 completion)*:

- [x] 104-04 — Build durable operations, cancellation, and idempotency

Wave 4 *(blocked on Wave 3 completion)*:

- [x] 104-06 — Compose authenticated HTTP/SSE transport and service lifecycle

Wave 5 *(verification gap closure)*:

- [x] 104-07 — Compose attention publication and authoritative replay revisions
- [x] 104-08 — Enforce bounded SSE transport backpressure
- [x] 104-09 — Enforce ordinary request execution deadlines

### Phase 105: Shared Native Model and Terminal Foundation

**Goal**: Native shells share deterministic product state while Linux users can operate one correct, exclusively owned embedded terminal surface.
**Depends on**: Phase 104
**Requirements**: CORE-01, CORE-02, CORE-03, CORE-04, CORE-05, TERM-01, TERM-02, TERM-03, TERM-04, TERM-05
**Success Criteria** (what must be TRUE):

  1. Linux and macOS harnesses decode the same golden contract fixtures and produce the same connection, loading, failure, operation, tab, and attention transitions through a versioned opaque ABI.
  2. Restoring saved session metadata preserves identities and presentation context but never presents a terminated process as running.
  3. A Linux user can interact with one embedded libghostty terminal using keyboard, mouse, Unicode, resize/reflow, alternate screen, clipboard, and IME behavior.
  4. Closing, exiting, quitting, or crashing a terminal surface cleans up its exclusive PTY and process group, and repeated create/resize/destroy cycles leave no orphaned processes or leaked surfaces.
  5. The pinned libghostty/Zig pair is reproducible behind the product adapter, upgrade smoke tests detect incompatibility, and the terminal exposes an honest documented native accessibility contract.

**Plans**: 5 plans

Wave 1:

- [ ] 105-01 — Prove exact-pin feasibility and freeze native provenance

Wave 2 *(blocked on Wave 1 completion)*:

- [ ] 105-02 — Establish the portable opaque ABI and Linux golden parity harness

Wave 3 *(blocked on Wave 2 completion)*:

- [ ] 105-03 — Build the deterministic shared reducer and truthful session persistence

Wave 4 *(blocked on Wave 3 completion)*:

- [ ] 105-04 — Enforce exclusive PTY/process-group ownership and crash cleanup

Wave 5 *(blocked on Wave 4 completion)*:

- [ ] 105-05 — Host the full Linux libghostty surface and prove interaction, stress, and accessibility

**UI hint**: yes

### Phase 106: Linux Workspace, Commands, and Attention

**Goal**: Linux users can navigate git-stacks workspaces, maintain independent terminal tabs, launch authoritative contexts, and respond to agent attention without losing focus unexpectedly.
**Depends on**: Phase 105
**Requirements**: LNX-01, LNX-02, LNX-03, LNX-04, LNX-05, LNX-06, ACT-01, ACT-02, ACT-03, ACT-04, ACT-05, ACT-06
**Success Criteria** (what must be TRUE):

  1. A user can browse workspaces and repositories in the GTK4/libadwaita client and sees distinct loading, empty, disconnected, incompatible, and failure states.
  2. A user can open multiple independent repository-bound terminal tabs, navigate elsewhere without recreating live surfaces, and restart the client with restored metadata that clearly marks dead processes.
  3. A user can launch a shell or named command in a new tab with service-resolved cwd, environment, ports, and configuration for the selected workspace and repository.
  4. Structured agent hooks report working, waiting, completed, failed, and idle states; unread attention is visible at workspace, repository, and tab levels.
  5. Selecting attention focuses the exact surviving surface or documented nearest context, never steals focus automatically, and keyboard, focus, IME, and accessibility navigation remain usable across sidebar and terminals.

**Plans**: TBD
**UI hint**: yes

### Phase 107: Native Delivery and Cross-Platform Proof

**Goal**: Users can install and trust the Linux vertical slice, while an actual macOS build proves the shared protocol, model, and libghostty host are portable.
**Depends on**: Phase 106
**Requirements**: PKG-01, PKG-02, PKG-03, PKG-04, MAC-01, MAC-02, MAC-03, MAC-04, MAC-05, MAC-06
**Success Criteria** (what must be TRUE):

  1. A user can install and launch the Linux client outside the source checkout on the supported GTK/libadwaita distro floor, with service, native, and libghostty assets discovered correctly.
  2. Installed Linux artifacts record pinned native provenance, fail clearly on incompatible runtime dependencies, and pass Wayland and X11 input, lifecycle, shutdown, and crash-cleanup acceptance.
  3. On a macOS CI runner or physical macOS host, the SwiftUI proof compiles, connects to the authenticated service, consumes the shared model, and lets a user select a repository and launch one service-resolved terminal.
  4. The AppKit/Metal libghostty surface passes macOS keyboard, IME, resize, exit, attention, and teardown checks rather than relying on Linux-only source inspection.
  5. Protocol and shared-model conformance fixtures pass for both Linux and macOS clients.

**Plans**: TBD
**UI hint**: yes

## Progress

**Execution Order:** Phases execute in numeric order: 104 → 105 → 106 → 107.

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 104. Workspace Service and Event Contract | 9/9 | Complete    | 2026-07-11 |
| 105. Shared Native Model and Terminal Foundation | 0/TBD | Not started | - |
| 106. Linux Workspace, Commands, and Attention | 0/TBD | Not started | - |
| 107. Native Delivery and Cross-Platform Proof | 0/TBD | Not started | - |
