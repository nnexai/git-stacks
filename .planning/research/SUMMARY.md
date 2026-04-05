# Project Research Summary

**Project:** git-stacks v0.17.0 — Engine Hardening & Template Labels
**Domain:** CLI workspace manager — structural hardening of an existing Bun/TypeScript CLI tool
**Researched:** 2026-04-05
**Confidence:** HIGH

## Executive Summary

git-stacks v0.17.0 is a hardening milestone on a stable, shipping CLI tool. Research confirms that all four capability areas — template label propagation, operation runner with rollback, indexed config store, and integration plugin contracts — are implementable entirely with existing dependencies. No new packages are needed. The additions are structural TypeScript patterns: a LIFO compensation stack for rollback, a module-level `Map` for config caching, a `capabilities` field on the `Integration` interface, and a label merge in the workspace creation path.

The recommended approach is incremental delivery ordered by dependency and blast radius. Template labels and DI/logging additions are pure additions with zero risk to existing behavior. Plugin contracts require touching 10 files but are mechanical and additive. Config indexing and operation-runner wiring into `workspace-lifecycle.ts` are the highest-risk changes and must ship as discrete phases with regression coverage before combining. The facade signature of `workspace-ops.ts` must remain unchanged throughout — callers (command handlers, TUI dashboard) should see no API changes.

The dominant risks are correctness details, not technical complexity: rollback undo order must be strictly LIFO; the config index must be read-only with YAML as source of truth; labels must be snapshot-copied at creation time (not resolved at runtime via the template reference); and interface additions must remain optional until all 10 plugins are updated. Each risk has a specific test that proves prevention — those tests are the acceptance criteria.

## Key Findings

### Recommended Stack

The stack is unchanged. All v0.17.0 work ships in existing packages: Bun (runtime), TypeScript ^6.0.2 (strict mode), Zod ^4.3.6 (schema validation; already used for all config; v4 metadata API available for plugin contract schemas), yaml ^2.8.3 (config I/O), and @logtape/logtape ^2.0.5 (structured logging; `withContext()` via AsyncLocalStorage is available in the installed version for per-operation log correlation). Avoiding new dependencies is a deliberate constraint — sub-100ms CLI startup and zero-build Bun execution are incompatible with saga engines, DI containers, or embedded databases.

**Core technologies (v0.17.0 relevant):**
- Zod ^4.3.6: plugin contract schema validation via `parseConfig()` per integration; already installed; v4 discriminated unions used for operation result types
- @logtape/logtape ^2.0.5: extend `timeOperation()` from `observability.ts` to cover operation runner steps; `withContext()` available for per-operation correlation at no extra cost
- Bun `$` shell: unchanged for git operations; `_exec` injectable pattern extended to `lifecycle.ts` to close a DI gap

**Explicitly rejected:**
- Temporal / NestJS sagas: durable execution requires external server; wrong abstraction layer for a CLI process that lives under one second
- xstate: state machine overhead for a linear step sequence; adds heavy dependency for zero benefit
- better-sqlite3 / LevelDB: schema migrations, binary dependency, startup cost for a dataset of dozens of YAML records
- tsyringe / InversifyJS: requires `experimentalDecorators`; conflicts with Bun's zero-build TS execution and TypeScript ^6.x

### Expected Features

**Must have (table stakes):**
- Template label CLI (`template label add/remove/list/clear`) — symmetry with existing workspace label commands; users expect parity
- Template labels propagate to workspace at `new` and `clone` time — workspace YAML must be self-contained at creation; runtime template lookup violates the existing invariant
- `--label` filter on `template list` — `matchesLabels()` already exists; wire it up
- Rollback on partial workspace creation failure — orphan worktrees on failed `new` are a known correctness bug; multi-step ops need a compensation ledger
- Indexed workspace/template lookups — repeated `readdirSync` + full parse on every call is measurable at 50+ workspaces; TUI dashboard polls on keypress
- Integration plugin capability declarations — runner uses duck-typing today; explicit `capabilities` field enables doctor checks and removes optional-chain guards from the runner

**Should have (differentiators):**
- Rollback progress visible to user — "Rolling back: removed worktree for api" on stderr; reuses existing `onProgress` callback channel, no new plumbing
- `GS_DEBUG` module filter (`GS_DEBUG=lifecycle,git`) — targeted debug without noise from all modules
- Plugin capability introspection via `integration list` — useful for plugin authors and `doctor` output

**Defer (v2+):**
- TUI label management panel — depends on OpenTUI input components; add-on after core is solid
- On-disk index file persistence — only needed at 50+ workspaces; in-memory index sufficient for v0.17.0
- Shell completion for label values — requires reading all labels at completion time; low priority until label adoption grows

### Architecture Approach

The architecture is layered and stable. v0.17.0 adds two new modules (`src/lib/operation-runner.ts`, `src/lib/config-index.ts`) and modifies eight existing files (`workspace-lifecycle.ts`, `config.ts`, `observability.ts`, `lifecycle.ts`, `integrations/types.ts`, `integrations/runner.ts`, `commands/label.ts`, `commands/doctor.ts`) plus the 10 plugin files and `tui/workspace-clone.ts`. The facade layer (`workspace-ops.ts`) is intentionally unchanged — same exported function signatures, same return types throughout.

**New modules:**
1. `src/lib/operation-runner.ts` — step sequencing with LIFO compensation stack; domain-agnostic (steps are closures; runner knows only `{name, run, rollback}`); emits progress via callback; exports `_exec` for test injection
2. `src/lib/config-index.ts` — in-memory `Map<name, {filePath, mtime, data}>` for workspaces and templates; read-only cache with mtime-based staleness detection; invalidated via write functions in `config.ts`

**Modified components:**
3. `workspace-lifecycle.ts` — internal step composition replaced by `runOperation()` calls; public API and return types unchanged
4. `config.ts` — write functions call `invalidateWorkspace()`/`invalidateTemplate()` after atomic YAML write; read functions delegate to `config-index.ts` with scan fallback
5. `integrations/types.ts` — `Capability` type added; `capabilities?: Capability[]` and `isolatedFailure?: boolean` on `Integration` interface (additive, optional)
6. `integrations/runner.ts` — isolated failure wrapping in `open()` call; capability-based guard logic
7. `label.ts` — template label subcommands added in parallel to existing workspace label structure
8. `tui/workspace-clone.ts` — copy `source.labels` into clone YAML (one-line addition; already partially handled in `workspace-wizard.ts` for new path)

### Critical Pitfalls

1. **Rollback out of order** — push compensation entries with `stack.push()` immediately after each successful forward step; drain with `while (stack.length) stack.pop().undo()` (LIFO, not FIFO). Each undo must be wrapped in try/catch so a failing undo does not abort subsequent undos. Proven by: 3-step test where middle step fails and undo call order is asserted as `[step3, step2]` not `[step1, step2]`.

2. **Labels resolved at runtime instead of copied at creation** — `workspace.labels` must contain the merged label array in the written YAML, not a reference to the template. Template mutation must not retroactively change existing workspace labels. Proven by: create workspace from labeled template, mutate template labels, read workspace YAML, assert workspace labels unchanged.

3. **Index divergence from disk** — index is read-only; YAML is the source of truth. Every `write*` function in `config.ts` calls `invalidate*()` after the atomic rename. Index entries include `mtime`; stale entries trigger a re-parse. Failing YAML parses during index build use `safeParse` with a fallback entry and a stderr warning — no silent drops. Proven by a diff test: `listWorkspaces()` via index must equal `listWorkspaces()` via scan for all CRUD operations.

4. **Breaking the Integration interface** — new fields must be optional on the interface; enforcement goes in the runner (`if (!integration.capabilities) throw new Error(...)`). Run `bun run typecheck` after any interface change with all 10 plugin files in scope. Signature changes to `open()`, `generate()`, or `commands()` are forbidden in this milestone.

5. **Hooks running before git ops creating unrollback-able state** — `pre_create` hooks must run after worktree creation, not before. If git ops fail before hooks run, rollback has nothing to undo on the hooks side. The hook/git ordering contract must be documented before writing any rollback code. Add `GS_ROLLBACK=1` env var to any compensating context so hook authors can detect rollback scenarios.

## Implications for Roadmap

Architecture research provides an explicit build order with risk ratings (LOW/MEDIUM/HIGH per step). The suggested phase structure follows that dependency order, grouping zero-risk additions early and deferring the highest-risk lifecycle rewrite until prior phases provide coverage and infrastructure.

### Phase 1: Template Label CLI and Propagation
**Rationale:** Zero-risk additions; schema already supports labels on both `TemplateSchema` and `WorkspaceSchema`; `matchesLabels()` already exists. Highest user-visible feature per unit of implementation risk. Unblocks every downstream feature that references template labels, and creates regression coverage for the creation path that Phase 5 will later refactor.
**Delivers:** `template label add/remove/list/clear` commands; `--label` filter on `template list`; labels snapshot-copied into workspace YAML at `new` time; labels copied at `clone` time
**Addresses:** All P1 label features from FEATURES.md; symmetry expectation from users
**Avoids:** Labels-as-runtime-reference pitfall (Pitfall 2); label schema bypass (re-validate via `LabelSchema.parse()` on each copied value)
**Research flag:** None — direct extension of existing pattern with no unknowns

### Phase 2: DI Seams and Structured Logging
**Rationale:** Pure additions to two files (`lifecycle.ts` and `observability.ts`); no behavior change; creates test infrastructure that Phase 5 (operation runner) depends on. Doing this before the operation runner ensures rollback closures are written with proper `_exec` injection from the start rather than retrofitted.
**Delivers:** `_exec.spawn` injectable seam in `lifecycle.ts`; optional `context?: Record<string, string | number | boolean>` parameter on `logDebug()` in `observability.ts`
**Addresses:** DI and structured logging features from FEATURES.md (P2 priority)
**Avoids:** DI container pitfall (Pitfall 5); rollback closures bypassing `_exec` (ARCHITECTURE.md Anti-Pattern 4)
**Research flag:** None — established codebase pattern; two-file addition

### Phase 3: Integration Plugin Capability Contracts
**Rationale:** Interface change touches 10 plugin files but is purely additive (optional fields with runner-side enforcement). Must be done before Phase 5 (operation runner) because the runner's isolated failure handling reads `integration.isolatedFailure`. Also enables `doctor.ts` capability-driven checks.
**Delivers:** `Capability` type in `types.ts`; `capabilities` and `isolatedFailure` fields on `Integration`; isolated failure wrapping in `runner.ts`; capability-driven checks in `doctor.ts` replacing ad-hoc per-plugin binary checks
**Addresses:** Integration plugin contract features from FEATURES.md
**Avoids:** Breaking interface pitfall (Pitfall 4); duck-typing fragility in runner
**Research flag:** None — additive interface extension enforced at compile time with `bun run typecheck`

### Phase 4: Indexed Config Store
**Rationale:** Self-contained new module with clear fallback semantics. Must be validated in isolation before Phase 5 (operation runner) depends on fast lookups during rollback execution. Migration safety (Pitfall 7: schema-invalid YAML silently dropped from index) requires specific test coverage before any command switches to the indexed path.
**Delivers:** `src/lib/config-index.ts` with mtime-based cache; `config.ts` write functions call invalidation; `listWorkspaces()` and `readWorkspace()` delegate to cache with scan fallback; `doctor --fix` triggers `rebuildIndex()`
**Addresses:** Indexed lookup features from FEATURES.md; TUI dashboard polling performance
**Avoids:** Index divergence pitfall (Pitfall 3); silent entry dropping on Zod parse failure (Pitfall 7); write-through cache anti-pattern (ARCHITECTURE.md Anti-Pattern 2)
**Research flag:** None for the pattern; implementation requires a diff-test proving index === scan for all CRUD operations before Phase 5 starts. TUI long-lived process cache invalidation is an acknowledged gap (see Gaps section).

### Phase 5: Operation Runner with Rollback
**Rationale:** Highest-risk change — modifies the core workspace creation path in `workspace-lifecycle.ts`. Placed last because it depends on DI seams (Phase 2), integration contracts (Phase 3 provides `isolatedFailure`), and benefits from the indexed config (Phase 4). Requires the most test coverage before shipping.
**Delivers:** `src/lib/operation-runner.ts` with LIFO compensation stack; `workspace-lifecycle.ts` refactored to use `runOperation()`; user-visible rollback progress messages via existing `onProgress` channel; `workspace-ops.ts` facade signature unchanged
**Addresses:** Rollback on partial failure (P1 table stakes from FEATURES.md); structured progress visibility
**Avoids:** Rollback out-of-order pitfall (Pitfall 1); hooks-before-git-ops ordering pitfall (Pitfall 6); god-object runner anti-pattern (steps are closures, runner knows only `{name, run, rollback}`); rollback closures bypassing `_exec` (Anti-Pattern 4)
**Research flag:** Consider `/gsd-research-phase` during planning for integration-specific rollback edge cases: git worktree `--force` semantics, tmux `has-session` guard before `kill-session`, VSCode artifact vs window state mismatch, YAML atomic write rollback path (Pitfall noted in PITFALLS.md Integration Gotchas section).

### Phase Ordering Rationale

- Labels first: independent, high-value, low-risk, exercises the creation path that Phase 5 later refactors — tests become regression coverage.
- DI seams before operation runner: rollback closures must use `_exec` from the start, not retrofitted after the fact.
- Plugin contracts before operation runner: runner's isolated failure path reads `integration.isolatedFailure`; capability checks in `doctor.ts` are coherent before rollback adds another failure surface.
- Config index before operation runner: multi-step ops and rollback must not trigger repeated directory scans; the index fallback semantics must be proven stable before being used under rollback conditions.
- Operation runner last: widest blast radius; all prior phases provide infrastructure, test coverage, and reduced unknowns.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 5 (Operation Runner):** Integration-specific rollback closures (tmux, VSCode, niri/aerospace, YAML atomic write path) have documented edge cases in PITFALLS.md but exact guard conditions are not yet enumerated. Recommend a planning research pass enumerating rollback closures for each of the 10 integrations before implementation begins.

Phases with standard patterns (skip research phase):
- **Phase 1 (Template Labels):** Purely extends existing pattern; `matchesLabels()`, `LabelSchema`, and both Zod schemas are in place. Wizard propagation already works at line 390-391 of `workspace-wizard.ts` for the `new` path.
- **Phase 2 (DI/Logging):** Documented codebase pattern; two-file addition; zero behavior change.
- **Phase 3 (Plugin Contracts):** TypeScript interface extension; additive with compile-time enforcement.
- **Phase 4 (Config Index):** Standard mtime-based read cache; pattern is well-understood and fully reversible by disabling delegation in `config.ts`.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Verified against `bun.lock`, official LogTape and Zod v4 docs, and existing source files; all alternatives explicitly rejected with sourced rationale |
| Features | HIGH | Derived from direct codebase analysis; existing Zod schemas confirm the implementation gap is narrow; `matchesLabels()` and label commands are already in place |
| Architecture | HIGH | Primary sources are the actual source files; build order verified against real import dependencies with risk ratings from the architecture researcher |
| Pitfalls | HIGH | Grounded in direct codebase invariants from CLAUDE.md and concrete test prescriptions; each pitfall includes a specific test that proves prevention |

**Overall confidence:** HIGH

### Gaps to Address

- **Hook ordering contract for operation runner:** PITFALLS.md identifies that `pre_create` hooks must run after git ops, not before, but the current `workspace-lifecycle.ts` interleaves hooks and git operations. The exact ordering contract must be decided and documented before Phase 5 implementation begins. The planning phase for Phase 5 should produce a step-order diagram mapping the current lifecycle flow to the new operation runner step array.

- **Integration-specific rollback semantics:** PITFALLS.md notes that tmux session kill, VSCode window artifact deletion, and git worktree force-remove each have edge cases (non-existent session check, open window state, untracked files). These are identified but the exact guard conditions are not enumerated per integration. Phase 5 planning should enumerate rollback closures for each of the 10 integrations before implementation.

- **TUI dashboard cache invalidation for external edits:** The dashboard runs as a long-lived process and polls `listWorkspaces()` via SolidJS reactive accessors. Once `config-index.ts` is in place, external YAML edits (user directly editing `~/.config/git-stacks/workspaces/*.yml`) will not invalidate the in-process cache. This is acceptable for the CLI (short-lived) but the dashboard is long-lived. Phase 4 planning should decide whether to add a polling invalidation strategy or document this as a known limitation.

## Sources

### Primary (HIGH confidence)
- `/home/nnex/dev/prj/git-stacks/src/lib/config.ts` — Zod schemas, scan-based lookup, write paths (direct read)
- `/home/nnex/dev/prj/git-stacks/src/lib/integrations/types.ts` — Integration interface structure (direct read)
- `/home/nnex/dev/prj/git-stacks/src/lib/integrations/runner.ts` — orchestration logic (direct read)
- `/home/nnex/dev/prj/git-stacks/src/lib/workspace-lifecycle.ts` — lifecycle step composition (direct read)
- `/home/nnex/dev/prj/git-stacks/src/lib/observability.ts` — LogTape wrapper API (direct read)
- `/home/nnex/dev/prj/git-stacks/src/tui/workspace-wizard.ts` — existing label propagation at lines 390-391 (direct read)
- `/home/nnex/dev/prj/git-stacks/bun.lock` — confirms `@logtape/logtape@2.0.5` and `zod@4.3.6` (direct read)
- `https://logtape.org/manual/contexts` — `withContext()` API for AsyncLocalStorage-based log correlation
- `https://zod.dev/v4` — Zod 4 discriminated unions and metadata registry

### Secondary (MEDIUM confidence)
- `.planning/PROJECT.md` — v0.17.0 milestone goals (project planning document)
- `PROJECT-DIRECTION.md` — author architectural intent for plugin contracts and capability declarations
- `CLAUDE.md` — established invariants: atomic writes, `_exec` injectable pattern, workspace YAML self-containment

---
*Research completed: 2026-04-05*
*Ready for roadmap: yes*
