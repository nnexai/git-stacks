# Project Research Summary

**Project:** git-stacks v0.12.0 — Multi-Workspace AeroSpace Configuration
**Domain:** CLI integration plugin — extending single-workspace AeroSpace support to multi-workspace arrays
**Researched:** 2026-03-29
**Confidence:** HIGH

## Executive Summary

This milestone extends the already-complete v0.11.1 AeroSpace integration plugin to support a `workspaces` array, enabling a single git-stacks `open` to distribute windows across multiple named AeroSpace workspaces (e.g., editor on "2", browser on "3", terminal on "1"). The change is narrowly scoped: exactly one production file changes (`src/lib/integrations/aerospace.ts`), one test file is extended, and no other integrations, runner, or type contracts are touched. The scope is small because the architecture is already sound — the multi-workspace loop lives entirely inside the existing `open()` method, preserving the Integration interface contract that `runner.ts` expects.

The recommended approach is a `z.preprocess`-based migration shim at the config parse boundary that normalizes old flat `workspace: "dev"` configs into a single-element `workspaces` array at parse time. This is a **breaking change** — ARCHITECTURE.md recommends against maintaining the flat format in the new schema — so the CHANGELOG must be clear and the implementation must detect the old format and emit an actionable warning rather than silently no-oping. Schema-level validations (at most one `focus: true` entry, no duplicate `workspace` names) should be enforced as post-parse checks in `open()` with plain-English log messages rather than Zod `.superRefine` refinements, which produce unfriendly path-qualified error strings in a CLI context.

The most significant implementation risks are subtle and mechanical: bag window double-routing (moving tier-1 windows to every workspace entry instead of only the first), cross-entry snapshot pollution (a slow app from entry A being detected as a new window by entry B's `snapshotWindowIds` poll), and layout focus contamination (each entry's `focusWindow()` call for layout context overriding the intended post-loop focus). All three have clear, low-cost prevention strategies documented in PITFALLS.md. Sequential entry processing (never `Promise.all`) is a hard constraint derived from the snapshot-delta model. The total implementation is 2-3 focused engineering sessions.

## Key Findings

### Recommended Stack

No new dependencies. Zod v4 (already at `^4.3.6`) provides all required patterns: `z.preprocess` for the migration shim, `z.array` + `z.object` for the per-entry schema, and post-parse manual counting for focus/duplicate validation. TypeScript is already at `^6.0.2`. AeroSpace CLI (`v0.20.3-Beta`) communicates via Unix socket at approximately 100ms per CLI invocation; no rate limiting exists; the sporadic hang bug from pre-v0.16.2 is fixed. No batching API exists yet (planned as a 1.0-blocker in issue #278) — sequential `_exec.run` calls are the correct approach and no sleep/retry is needed.

**Core technologies:**
- `z.preprocess(migrateFn, schema)` (Zod v4) — normalizes old flat config shape to `workspaces[]` at parse time; API unchanged from v3 despite internal `ZodPipe` return; recommended over `z.union` because consumers always receive a single canonical `WorkspaceEntry[]` type
- AeroSpace CLI sequential subprocess calls — ~100ms per call; a 4-entry config with 2 windows each totals ~800ms, acceptable for an `open` operation; `for...of` loop with `await` per call is the correct sequencing
- Existing `_exec.run` injectable pattern from `src/lib/aerospace.ts` — already supports test isolation; no changes to the wrapper layer

### Expected Features

The v0.12.0 feature set is tightly bounded. Every "must ship" item maps directly to an existing code path that gets looped or extended — no new abstractions.

**Must have (v0.12.0 core):**
- `workspaces` array schema replacing flat `workspace` field — foundation for everything else
- Per-entry processing loop in `open()` — iterate existing steps (flatten → bag-move → commands → layout → focus) once per array entry
- Unrouted tier-1 bag windows default to `workspaces[0]` — prevents VSCode/IntelliJ windows from being orphaned
- Upfront `listWorkspaces()` call to validate all workspace names before the loop — prevents partial-setup failures
- Focus validation: at most one `focus: true` entry, enforced with a runtime warn + early return (not Zod refinement)
- Legacy flat-config detection: when `workspaces` array is absent but old `workspace` field is present, emit an actionable migration warning (not a silent skip)

**Falls out naturally from the loop (zero extra effort):**
- Per-entry `layout`, `flatten_before_open`, `commands`, `normalization` — each entry is structurally identical to the old flat config

**Defer:**
- Multi-monitor workspace routing — requires AeroSpace TOML patching; out of scope
- `git-stacks env` dump command — separate feature, not blocked on this milestone
- Per-repo window routing — below current abstraction floor; no demand signal

### Architecture Approach

The change is confined to `src/lib/integrations/aerospace.ts`. The existing `open()` method body becomes a `for...of` loop over `config.workspaces`. The `WindowDetector` lifecycle (`begin()`/`resolve()` around the entire `open()` call) is unchanged — one global snapshot per integration, not one per workspace entry. `runner.ts`, `types.ts`, `src/lib/aerospace.ts` (wrapper layer), and `integrations/index.ts` are all unchanged. The build order is: (1) update schema definitions, (2) rewrite `open()` body with the loop, (3) add/update tests, (4) CHANGELOG + README.

**Major components (only aerospace.ts changes):**
1. `aerospaceWorkspaceEntrySchema` (new) — per-entry Zod schema, same fields as old flat config minus `enabled`
2. `aerospaceConfigSchema` (updated) — top-level schema with `z.preprocess` migration shim + `workspaces: z.array(entrySchema).optional()`
3. `open()` multi-workspace loop — pre-loop: hoist `listWorkspaces()` call, check focus count; loop body: validate/flatten/bag-route/commands/layout per entry; post-loop: workspace-level focus for the entry with `focus: true`
4. `tests/lib/integrations/aerospace.test.ts` (extended) — new describe blocks for array schema, focus validation, bag routing to index 0, call-count assertions, partial failure tolerance

### Critical Pitfalls

1. **Bag window double-routing** — Process bag windows only for `workspaces[0]` using an index check (`if (i === 0)`). The `ArtifactBag` has no "consumed" flag; without this guard every loop iteration moves all tier-1 windows to every AeroSpace workspace, with the last entry winning silently.

2. **Cross-entry snapshot pollution** — Pass a shared global `beforeSet: Set<number>` accumulated across all entries into each `snapshotWindowIds` call. Without this, a slow app from entry A that times out will appear as entry B's newly detected window, routing it to the wrong workspace. Requires adding a `beforeSet` option to `SnapshotOpts` in `src/lib/aerospace.ts`.

3. **Layout focus contamination** — Use `setLayout(layout, windowId)` (the optional second parameter already exists in `src/lib/aerospace.ts`) instead of calling `focusWindow()` before `setLayout()`. Bare `focusWindow()` switches the visible AeroSpace context between workspace entries during the layout step, overriding the intended post-loop focus.

4. **`listWorkspaces()` inside the loop** — Hoist before the loop. Each per-entry subprocess call adds ~100ms for data that never changes during `open()`. With 3 entries this is 300ms of avoidable overhead.

5. **Silent no-op on legacy config** — After schema migration, old `workspace: "dev"` flat configs parse to an empty `workspaces` array and silently do nothing. Detect explicitly: `if ('workspace' in rawConfig && !parsedConfig?.workspaces?.length)` → emit a migration warning with an example of the new array format.

## Implications for Roadmap

Based on research, the milestone cleanly splits into two implementation phases plus a release-prep phase.

### Phase 1: Schema Definition and Migration

**Rationale:** All other code changes depend on the validated TypeScript types produced by the schema. The migration shim and legacy detection must also land here — not as a follow-up — because PITFALLS.md classifies the silent legacy no-op as HIGH recovery cost (users lose their AeroSpace integration with no explanation after upgrading).
**Delivers:** Updated `aerospaceWorkspaceEntrySchema` + `aerospaceConfigSchema` with `z.preprocess` migration shim; post-parse focus count validation; duplicate workspace name validation; legacy flat-field detection with actionable warning.
**Addresses:** `workspaces` array schema (table stakes), backward-compat detection (differentiator), focus validation, duplicate name rejection
**Avoids:** Pitfall 3 (multi-focus), Pitfall 5 (legacy silent no-op), duplicate workspace name security pitfall

### Phase 2: Core Loop Implementation

**Rationale:** With stable types from Phase 1, the loop body is straightforward rewiring of existing single-workspace steps. The three mechanical pitfalls (bag routing, snapshot pollution, layout focus) must be designed upfront before writing the loop — not discovered during test failures.
**Delivers:** Rewritten `open()` with `for...of` loop; pre-loop hoisting of `listWorkspaces()` and focus count check; bag window routing to index 0 only; workspace-level focus deferred to post-loop; `setLayout(layout, windowId)` for layout application; `beforeSet` option added to `SnapshotOpts` in `src/lib/aerospace.ts` for cross-entry snapshot isolation.
**Uses:** Existing `_exec.run`, `listWorkspaces()`, `moveNodeToWorkspace()`, `setLayout()` — no new AeroSpace wrappers needed
**Avoids:** Pitfall 1 (bag double-routing), Pitfall 2 (listWorkspaces overhead), Pitfall 4 (snapshot pollution), Pitfall 3 (layout focus contamination)

### Phase 3: Tests

**Rationale:** ARCHITECTURE.md identifies 10 specific "looks done but isn't" test cases, most of which verify behavior invisible without targeted assertions (call counts, exact workspace targets, cross-entry ordering). These are concrete enough to be their own phase with a checklist.
**Delivers:** Test cases for: array schema parsing, focus validation, duplicate workspace name rejection, bag routing to index 0, `listWorkspaces` call-count assertion (exactly 1 for N entries), entry ordering, deferred post-loop focus, cross-entry snapshot pollution, `setLayout` with `windowId` argument, legacy config warning. Existing backward-compat test block updated — old flat-field test case explicitly removed with a comment.
**Addresses:** All pitfall prevention verification from PITFALLS.md checklist

### Phase 4: Release Prep

**Rationale:** The schema change is a documented breaking change. Users with v0.11.0/v0.11.1 configs must have a clear migration path in the CHANGELOG. README must show old format vs new format side by side with concrete examples.
**Delivers:** Version bump to v0.12.0, CHANGELOG entry documenting the breaking schema change with migration example (flat `workspace:` → `workspaces: [{...}]`), README update with multi-workspace config examples matching FEATURES.md "before/after" config shapes.

### Phase Ordering Rationale

- Schema before loop: TypeScript types from schema definitions are the function signatures for the loop body. Writing the loop without stable types invites type drift between schema and implementation.
- Loop before tests: Tests must verify specific behaviors (call counts, routing targets, ordering); those behaviors can only be confirmed against the actual implementation.
- Legacy detection in Phase 1, not Phase 4: Detection requires knowing the schema shape; doing it in release prep would require re-opening schema work.
- Release prep last: Requires knowing the final config shape to document accurate examples.

### Research Flags

All phases use standard patterns — no phase needs `/gsd:research-phase`.

Phases with standard patterns (skip research-phase):
- **Phase 1 (Schema):** `z.preprocess` usage is fully documented in STACK.md with verified Zod v4 API examples. Post-parse validation pattern is established in existing codebase.
- **Phase 2 (Loop):** All AeroSpace CLI commands are stable wrappers in `src/lib/aerospace.ts`. Loop structure follows the documented build order in ARCHITECTURE.md verbatim.
- **Phase 3 (Tests):** Test patterns (`beforeEach` reset, `mock.module` isolation) are established in existing `aerospace.test.ts`. PITFALLS.md checklist serves directly as the test specification.
- **Phase 4 (Release):** Standard release-prep; config shape well-defined by Phase 1.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Zod v4 API verified against zod.dev/api; AeroSpace timing from GitHub issue #278 (maintainer statement); version from releases page; existing codebase verified by direct file read |
| Features | HIGH | Derived from direct codebase inspection of v0.11.1 implementation + AeroSpace docs; table stakes are extensions of existing working feature |
| Architecture | HIGH | Direct code analysis of all affected files; build order derived from type dependency graph; no third-party unknowns; single-file change confirmed |
| Pitfalls | HIGH | Each pitfall grounded in specific line references in existing source files; none are speculative |

**Overall confidence:** HIGH

### Gaps to Address

- **`snapshotWindowIds` `beforeSet` option:** PITFALLS.md recommends adding `beforeSet?: Set<number>` to `SnapshotOpts` in `src/lib/aerospace.ts` to prevent cross-entry snapshot pollution. This is a minor interface extension not yet in the codebase. Phase 2 must include it or choose the inline snapshot alternative (track seen IDs in the loop body directly).

- **`setLayout` windowId behavior without prior focus:** ARCHITECTURE.md and PITFALLS.md both recommend `setLayout(layout, windowId)` to avoid `focusWindow()` side effects. The signature supports this (`setLayout(layout, windowId?)` in `src/lib/aerospace.ts`). The behavior of `aerospace layout h_tiles --window-id <id>` without a prior focus call should be confirmed during Phase 2 implementation. Fallback: defer all workspace focus to post-loop (documented alternative in PITFALLS.md) if the windowId variant behaves unexpectedly.

## Sources

### Primary (HIGH confidence)

- `src/lib/integrations/aerospace.ts` — full v0.11.1 `open()` implementation; existing schema; bag window routing pattern; direct code analysis
- `src/lib/aerospace.ts` — `_exec`, `snapshotWindowIds`, `SnapshotOpts`, `setLayout(layout, windowId?)`, `listWorkspaces()`; direct code analysis
- `src/lib/integrations/runner.ts` — begin/open/resolve lifecycle; WindowDetector contract; direct code analysis
- `src/lib/integrations/types.ts` — `ArtifactBag` (no "consumed" flag), `Integration`, `WindowDetector` interfaces; direct code analysis
- `tests/lib/integrations/aerospace.test.ts` — existing test structure; backward-compat block at lines 721-740 to be updated; direct code analysis
- `package.json` — Zod `^4.3.6`, TypeScript `^6.0.2`; direct file read
- `zod.dev/api` — `z.preprocess(fn, schema)` v4 API; `.superRefine` cross-element validation pattern
- `github.com/nikitabobko/AeroSpace/issues/278` — ~100ms IPC round-trip per CLI call (maintainer statement); batch combinators planned but not shipped in v0.20.3-Beta
- `nikitabobko.github.io/AeroSpace/commands` — `move-node-to-workspace --window-id` stable; no rate limiting documented

### Secondary (MEDIUM confidence)

- `github.com/nikitabobko/AeroSpace/issues/868` — sporadic hang bug fixed after v0.16.2 (reporter statement, not maintainer confirmation)
- AeroSpace official guide — workspace model, `persistent-workspaces`, monitor assignment
- AeroSpace community discussion #756 — sequential script-driven workspace setup pattern
- i3/Sway community — editor/browser/terminal multi-workspace layout conventions as the standard developer pattern

---
*Research completed: 2026-03-29*
*Ready for roadmap: yes*
