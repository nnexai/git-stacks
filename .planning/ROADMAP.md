# Roadmap: git-stacks

## Overview

v0.20.0 establishes a secure, engine-owned native-client boundary, proves the shared native model and embedded-terminal lifecycle, composes those foundations into a usable Linux workspace client, and finishes with installable Linux acceptance plus a macOS-hosted architectural proof. Phase numbering continues from the previous milestone.

## Phases

- [x] **Phase 104: Workspace Service and Event Contract** - Native clients can securely query authoritative workspace state, launch context, operations, and replayable events without changing existing CLI or OpenTUI behavior. (completed 2026-07-11)
- [x] **Phase 105: Shared Native Model and Terminal Foundation** - Platform shells share stable state semantics while Linux proves one correct, leak-free libghostty terminal surface. (completed 2026-07-11)
- [x] **Phase 106: Linux Workspace, Commands, and Attention** - Users can navigate workspaces, keep multiple terminal tabs alive, launch resolved shells and commands, and act on structured attention. (completed 2026-07-12)
- [ ] **Phase 107: Beautify Native Workspace UI and Finalize UX** - Reopened to finish workspace creation, external synchronization, Codex attention, and release-quality interaction polish before delivery work.
- [ ] **Phase 108: Native Delivery and Cross-Platform Proof** - The finished Linux client installs and passes platform acceptance, and the same architecture is compiled and exercised on an actual macOS environment.

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

**Plans**: 9/9 plans complete

- [x] 105-01-PLAN.md
- [x] 105-02-PLAN.md
- [x] 105-03-PLAN.md
- [x] 105-04-PLAN.md
- [x] 105-05-PLAN.md
- [x] 105-06-PLAN.md
- [x] 105-07-PLAN.md
- [x] 105-08-PLAN.md
- [x] 105-09-PLAN.md

Wave 1:

- [x] 105-01 — Prove exact-pin feasibility and freeze native provenance

Wave 2 *(blocked on Wave 1 completion)*:

- [x] 105-02 — Establish the portable opaque ABI and Linux golden parity harness

Wave 3 *(blocked on Wave 2 completion)*:

- [x] 105-03 — Build the deterministic shared reducer and truthful session persistence

Wave 4 *(blocked on Wave 3 completion)*:

- [x] 105-04 — Enforce exclusive PTY/process-group ownership and crash cleanup

Wave 5 *(blocked on Wave 4 completion)*:

- [x] 105-05 — Pin, build, and drift-audit the validated full Linux Ghostty surface runtime

Wave 6 *(blocked on Wave 5 completion)*:

- [x] 105-06 — Bind Ghostty-owned children to exclusive cleanup and crash-guard truth

Wave 7 *(blocked on Wave 6 completion)*:

- [x] 105-07 — Host a Ghostty-owned rendered terminal leaf in GtkGLArea with delegated configuration

Wave 8 *(blocked on Wave 7 completion)*:

- [x] 105-08 — Complete Ghostty-native interaction and multi-surface isolation

Wave 9 *(blocked on Wave 8 completion; final human evidence)*:

- [x] 105-09 — Prove production full-surface stress, accessibility, and real-session acceptance

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

**Plans**: 3/3 plans complete — full-featured Supacode-style workspace interaction on the git-stacks/Limux/Ghostty architecture (not MVP)

- [x] 106-01-PLAN.md — Freeze authoritative native launch and structured attention contracts
- [x] 106-02-PLAN.md — Build normalized pair tabs, authenticated service synchronization, attention routing, and navigation-independent host ownership
- [x] 106-03-PLAN.md — Compose the GTK workspace client and prove real-session interaction

Wave 1:

- [x] 106-01 — Extend stable command/attention identities, fresh launch resolution, and structured hooks

Wave 2 *(blocked on Wave 1 completion)*:

- [x] 106-02 — Extend native state/persistence/ABI, synchronize the authenticated service, and own multiple live hosts outside navigation

Wave 3 *(blocked on Wave 2 completion)*:

- [x] 106-03 — Build the adaptive GTK UI, scoped actions, launcher, attention presentation, and acceptance evidence

**UI hint**: yes

### Phase 107: Beautify Native Workspace UI and Finalize Sidebar, Tab, and Terminal UX

**Goal:** Deliver a coherent Supacode-quality native workspace interface after lifecycle stability is complete.
**Requirements**: LNX-07, LNX-08, LNX-09, ACT-07
**Depends on:** Phase 106
**Plans:** 5/13 plans executed

**Success Criteria** (what must be TRUE):

  1. Pinned workspaces appear in a separate, always-expanded section; all remaining workspaces are grouped by the selected label-or-repository organization and those groups are collapsible.
  2. A workspace containing exactly one repository behaves like Supacode's direct workspace entry, while a multi-repository workspace exposes an unambiguous repository target before opening a terminal or running a command.
  3. Live terminal tabs use shortened Ghostty-provided titles, never internal surface IDs; configured commands have meaningful names, and manual rename pins an override until explicitly cleared.
  4. Sidebar, tab strip, split layout, context menus, launcher, empty/error states, spacing, typography, icons, and interaction language receive a cohesive visual and accessibility pass against the Supacode reference.
  5. Representative single-repository, multi-repository, pinned, grouped, collapsed, title-update, and manual-title flows pass automated interaction checks plus final human visual UAT.
  6. From an empty or populated client, a user can create a workspace by supplying a name, branch, and either one template or selected registered repositories; progress and failures remain actionable.
  7. Workspace additions, updates, renames, and removals made outside the native client reconcile automatically through the authoritative service while live terminals, presentation state, and unread attention remain coherent.
  8. Codex hooks are installable and publish truthful lifecycle attention that the native client identifies by provider and routes to the exact surviving context.
  9. The Phase 107 UI review's priority keyboard, accessibility, live-close safety, adaptive-layout, and actionable-state findings are closed with automated interaction evidence and final native visual UAT.

Plans:

- [x] 107-01-PLAN.md
- [x] 107-02-PLAN.md
- [x] 107-03-PLAN.md
- [x] 107-04-PLAN.md
- [ ] 107-05-PLAN.md
- [x] 107-06-PLAN.md
- [ ] 107-07-PLAN.md
- [ ] 107-08-PLAN.md
- [ ] 107-09-PLAN.md
- [ ] 107-10-PLAN.md
- [ ] 107-11-PLAN.md
- [ ] 107-12-PLAN.md
- [ ] 107-13-PLAN.md

Wave 1 *(completed baseline)*:

- [x] 107-01 — Beautify workspace navigation, repository targeting, terminal titles, and native interaction language

Wave 2 *(independent engine/monitor/provider contracts; blocked on completed baseline)*:

- [x] 107-02 — Extract prompt-free, race-safe workspace creation and migrate the TUI adapter
- [x] 107-04 — Make snapshots uncached/empty-revisioned and build the watched/fingerprint monitor
- [x] 107-06 — Install merge-safe Codex hooks and add quiet best-effort publication

Wave 3 *(creation service contract; blocked on Wave 2)*:

- [ ] 107-03 — Expose authenticated catalog and idempotent capacity-safe workspace creation

Wave 4 *(durable monitor plus native model contract; blocked on Wave 3)*:

- [ ] 107-05 — Publish durable replayable snapshot invalidations and own monitor lifecycle
- [ ] 107-07 — Preserve provider-aware attention and enforce truthful native capacity behavior

Wave 5 *(blocked on durable service and shared native contracts)*:

- [ ] 107-08 — Decode creation/invalidation/gap contracts and build the GTK-free creation controller

Wave 6 *(blocked on native protocol/controller)*:

- [ ] 107-09 — Reconcile authoritative snapshots, retain live orphans, and coalesce refresh/cursor recovery

Wave 7 *(blocked on reconciliation and refresh coordination)*:

- [ ] 107-10 — Compose empty-start workspace creation and worker-owned synchronization in GTK

Wave 8 *(blocked on feature-complete GTK composition)*:

- [ ] 107-11 — Render actionable provider attention, complete launcher keyboard flow, and guard live close

Wave 9 *(blocked on interaction safety)*:

- [ ] 107-12 — Apply adaptive, actionable, accessible, and coherent native visual polish

Wave 10 *(blocked on all implementation; final production and human evidence)*:

- [ ] 107-13 — Prove empty creation, external sync, Codex, capacity, themes, keyboard, and AT in production UAT

### Phase 108: Native Delivery and Cross-Platform Proof

**Goal**: Users can install and trust the Linux vertical slice, while an actual macOS build proves the shared protocol, model, and libghostty host are portable.
**Depends on**: Phase 107
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

**Execution Order:** Phases execute in numeric order: 104 → 105 → 106 → 107 → 108.

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 104. Workspace Service and Event Contract | 9/9 | Complete    | 2026-07-11 |
| 105. Shared Native Model and Terminal Foundation | 9/9 | Complete    | 2026-07-11 |
| 106. Linux Workspace, Commands, and Attention | 3/3 | Complete | 2026-07-12 |
| 107. Native workspace UI beautification and UX finalization | 5/13 | In Progress|  |
| 108. Native Delivery and Cross-Platform Proof | 0/TBD | Not started | - |
