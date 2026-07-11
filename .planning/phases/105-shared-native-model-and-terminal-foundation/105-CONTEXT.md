# Phase 105: Shared Native Model and Terminal Foundation - Context

**Gathered:** 2026-07-11
**Status:** Ready for planning

<domain>
## Phase Boundary

Define deterministic, platform-neutral native-client state semantics and prove one correct, exclusively owned Linux libghostty terminal surface. This phase establishes shared identities, reducer behavior, restoration truth, the opaque product ABI, terminal ownership and teardown, pinned native dependencies, interaction fidelity, leak resistance, and an honest accessibility contract. Workspace browsing, multiple terminal tabs, named-command UX, attention UI, packaging, and the macOS terminal proof remain later-phase work.

</domain>

<decisions>
## Implementation Decisions

### Shared State Semantics
- **D-01:** When the live event connection is interrupted, retain the last valid snapshot for context but mark it explicitly stale.
- **D-02:** When an event indicates a newer authoritative revision, keep navigation available during refresh but freeze mutations against affected state.
- **D-03:** If the service protocol is reachable but incompatible, preserve local presentation and session metadata only; prior service data is not usable state.
- **D-04:** Preserve unknown, unnegotiated optional items as inert diagnostic data and surface degraded compatibility. Never invent behavior for them or ignore contract drift silently.

### Restored Terminal Truth
- **D-05:** After restart, restore terminal identity and presentation context only: surface identity, workspace/repository binding, title, ordering, cwd label, and last known exit status. Do not persist or infer process liveness or retain sensitive launch details.
- **D-06:** A restored surface whose process cannot be proven alive remains visible as explicitly ended and offers an explicit relaunch action.
- **D-07:** Relaunch creates a new surface identity linked to the ended predecessor; a new process lifetime never masquerades as the old surface.
- **D-08:** Restore valid session entries independently. Quarantine corrupt entries or entries with missing identities and expose diagnostics rather than rejecting the entire session or silently dropping them.

### Terminal Ownership and Teardown
- **D-09:** Closing a live surface requests graceful shutdown, waits for a bounded interval, then terminates the entire owned process group.
- **D-10:** Require close confirmation only when meaningful foreground activity is detected; idle shells and ended surfaces do not prompt.
- **D-11:** If cleanup cannot prove all owned processes are gone, retain a visible failed-cleanup state and diagnostics. Do not silently dispose of the surface record.
- **D-12:** A separate ownership guard terminates all client-owned process groups after a native-client crash; do not rely only on ordinary parent-death behavior or preserve processes for reconnection.

### Terminal Proof Standard
- **D-13:** Terminal acceptance requires automated lifecycle tests plus a documented real-session run covering keyboard, mouse, Unicode, resize/reflow, alternate screen, clipboard, and IME behavior.
- **D-14:** Repeated create/resize/destroy stress cycles must leave zero surviving owned processes or surfaces, with resource use returning to a bounded baseline and no cycle-over-cycle growth. Exact byte equality is not required across GTK/GPU/allocator behavior.
- **D-15:** libghostty and its compatible Zig toolchain use immutable exact pins. Advancing either is dedicated compatibility work that reruns the full terminal smoke suite.
- **D-16:** Expose only verified native accessibility semantics, document upstream gaps, and fail acceptance for misleading or broken core focus/input behavior. Complete upstream screen-reader parity is not an unconditional Phase 105 blocker.

### the agent's Discretion
- Choose concrete reducer representation, ABI encoding, persistence format, timeout values, activity-detection mechanism, ownership-guard implementation, stress-cycle count, bounded resource thresholds, and test harnesses while preserving the locked semantics above.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Milestone Scope and Phase Contract
- `.planning/PROJECT.md` — Defines the v0.20.0 native-client architecture, platform roles, terminal ownership boundary, and deferred breadth.
- `.planning/REQUIREMENTS.md` — Defines CORE-01 through CORE-05 and TERM-01 through TERM-05, plus milestone-wide exclusions.
- `.planning/ROADMAP.md` — Defines the Phase 105 goal, dependency on Phase 104, fixed boundary, and five success criteria.
- `.planning/phases/104-workspace-service-and-event-contract/104-CONTEXT.md` — Locks service identities, snapshot revision, compatibility, operation, and replay semantics that the shared native model consumes.

### Existing Architecture Maps
- `.planning/codebase/STACK.md` — Documents the current Bun/TypeScript stack and the absence of an established native-client toolchain.
- `.planning/codebase/ARCHITECTURE.md` — Documents the authoritative engine boundary and current service-facing integration points.
- `.planning/codebase/CONVENTIONS.md` — Defines type, module, validation, error, and testing conventions relevant to the TypeScript contract side.

No external libghostty embedding specification or project ADR was referenced during discussion. Research must identify the exact upstream embedding API, supported revision, compatible Zig version, and known accessibility constraints before planning.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/lib/config.ts`, `src/lib/workspace-status.ts`, and `src/lib/workspace-file-status.ts`: authoritative workspace-facing schemas and view models; the native model adapts the service contract rather than these YAML-backed internals directly.
- `src/lib/workspace-env.ts` and `src/lib/ports.ts`: authoritative launch-context inputs already designated for service-side resolution.
- Phase 104 service contract artifacts: stable opaque identities, aggregate snapshot revisions, structured errors, operations, and ordered events form the input vocabulary for the shared reducer and golden fixtures.

### Established Patterns
- Business logic belongs behind shared product-owned boundaries; CLI, OpenTUI, and native clients remain adapters rather than parallel workspace engines.
- Trust boundaries use explicit runtime validation, fallible operations use discriminated outcomes, and unknown or invalid data is surfaced rather than silently coerced.
- Subprocess ownership and cleanup require injectable/testable seams and explicit bounded behavior.
- The current repository has no native-client or embedded-libghostty foundation, so Phase 105 must establish rather than imitate a repo-native layout.

### Integration Points
- Consume the Phase 104 `/v1` snapshots, operations, capability negotiation, and event/replay semantics through golden fixtures shared with native harnesses.
- Add a product-owned opaque ABI between platform shells and the shared reducer without exposing platform UI types or libghostty embedding details.
- Put libghostty behind a narrow adapter so terminal surface, PTY/process-group ownership, input, resize, rendering, accessibility, and teardown can be tested independently of the later workspace UI.
- Persist presentation-only session metadata separately from process ownership and runtime liveness.

</code_context>

<specifics>
## Specific Ideas

- Prefer truthful degraded states over apparent continuity: stale, incompatible, ended, quarantined, and failed-cleanup states must remain explicit.
- Preserve useful context during failures while freezing only actions whose correctness depends on refreshed authoritative state.
- Model relaunch as lineage between distinct surface lifetimes rather than identity reuse.
- Treat crash cleanup as a structural ownership guarantee, not a best-effort shutdown callback.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within the Phase 105 boundary.

### Reviewed Todos (not folded)
- **Improve TUI dashboard experience** — existing OpenTUI product work, unrelated to the native model and single-terminal foundation.
- **Add manual workspace commands** — command authoring/product breadth is outside this phase; later clients consume the existing command model.
- **Create workspace from forge source** — workspace creation breadth is outside this foundation phase.
- **Improve template composition understanding** — template UX and documentation are outside the native foundation.
- **Add workspace notes** — separate product capability unrelated to shared reducer and terminal ownership.
- **Plan broader code quality improvement run** — prior planning stream unrelated to the v0.20.0 Phase 105 boundary.

</deferred>

---

*Phase: 105-shared-native-model-and-terminal-foundation*
*Context gathered: 2026-07-11*
