# Project Research Summary

**Project:** git-stacks — core engine extraction + observability
**Domain:** TypeScript CLI refactoring: module decomposition, dependency injection, structured logging
**Researched:** 2026-04-05
**Confidence:** HIGH

## Executive Summary

This milestone is a pure refactoring engagement on a stable, shipping CLI tool. The primary objective is breaking `workspace-ops.ts` (1,735 lines, 35 exports) into domain-cohesive modules without regressing any of the 800+ existing tests and without changing the public API seen by `commands/` and `tui/` consumers. Research confirms the decomposition is low-risk when done incrementally using the re-export facade pattern: each domain module is extracted one at a time with a `workspace-ops.ts` re-export shim maintaining backward compatibility, the full test suite runs after every step, and callers are updated only after all modules are stable. The natural boundary analysis produces four domain modules (`workspace-state`, `workspace-env`, `workspace-git`, `workspace-yaml`) with `workspace-ops.ts` retained as a thin orchestrator for the five lifecycle operations (open/close/clean/remove/merge) that require cross-cutting coordination.

Observability is added via LogTape (`@logtape/logtape@^2.0.5`), the only net-new dependency this milestone introduces. It is the correct choice over pino and winston: zero dependencies, Bun-native, library-first design means log calls are no-ops when `configure()` is never called, and activation is gated on a `GIT_STACKS_DEBUG` environment variable. This prevents any output pollution of the CLI's stdout contract (`--json` piping) and avoids TUI screen corruption. The existing `_exec` mutable object pattern for subprocess injection is extended to new modules unchanged — no DI framework, no decorator requirement, no signature changes to existing exported functions.

The single greatest risk is correctness of the `mock.module()` paths in the test suite during extraction. When functions move files, test mocks targeting the old module path silently stop applying — tests can pass while calling real git operations. Prevention is mechanical: every extraction commit must include a grep-and-update pass on all `mock.module` references to the moved path. A secondary risk is circular imports during splitting; the dependency graph must be mapped before any code moves, and domain modules must import only from the stable leaf modules (`config.ts`, `git.ts`, `lifecycle.ts`) — never from each other.

## Key Findings

### Recommended Stack

The base stack (Bun, TypeScript ^6.0.2, Commander.js ^14.0.3, Zod ^4.3.4, yaml ^2.8.3, SolidJS + OpenTUI, @clack/prompts ^1.2.0) is unchanged. The only addition is `@logtape/logtape@^2.0.5`. No DI framework additions; the established `_exec` mutable object export pattern handles all subprocess injection needs. No barrel files for new domain modules (per existing CLAUDE.md convention).

**Core technologies:**
- `@logtape/logtape@^2.0.5`: structured debug logging — zero-dep, Bun-native, no-op when unconfigured; library-first design fits CLI tools exactly
- `_exec` mutable object pattern (no new dep): subprocess injection for new domain modules — already battle-tested in `lifecycle.ts`, `niri.ts`, `tmux.ts`, `cmux.ts`, `aerospace.ts`
- `performance.now()` (Bun built-in): operation timing in debug output — zero-cost, no dependency

**Explicitly rejected:**
- pino: worker thread transport incompatible with Bun; maintainers explicitly scope to Node.js only (confirmed issue #2060)
- winston: heavy, server-oriented, no Bun support
- tsyringe/InversifyJS: requires `experimentalDecorators` + `emitDecoratorMetadata`, incompatible with TypeScript ^6.x and Bun's zero-build execution

### Expected Features

**Must have (table stakes):**
- Domain module split — `workspace-ops.ts` split into 4 focused modules; `workspace-ops.ts` re-exports all 35 public symbols; zero caller changes in phase 1
- Stable public API facade — all existing command and TUI import paths continue working without modification
- `_exec` pattern on all new subprocess-spawning modules — every new domain module that calls `$` or `Bun.spawn` exports `_exec`
- Cascade ordering preserved — `remove → clean → close` chain keeps `_executeClose`/`_executeClean` private in `workspace-ops.ts`, not in extracted domain modules
- All 800+ existing tests pass — the test suite is the sole acceptance criterion
- `GS_DEBUG=1` trace output — stderr-only, zero stdout pollution, zero output when env var absent

**Should have (differentiators):**
- Operation timing in debug output — `performance.now()` before/after major steps; `[domain] step: Xms` format to stderr
- Unit tests for extracted module helpers — `workspace-env`, `workspace-state` etc. as separate files enable focused unit tests without real git repos

**Defer (v2+):**
- Structured `ProgressCallback` type (`{ phase, repo?, message }`) — breaking change to all TUI consumers; deserves its own milestone
- `GS_DEBUG=open,sync` namespace filtering — only needed once `GS_DEBUG=1` proves its value

### Architecture Approach

`workspace-ops.ts` becomes a thin lifecycle orchestrator retaining only the five operations requiring cross-cutting coordination (open/close/clean/remove/merge) plus `renameWorkspace`. Everything else is extracted to domain modules that `workspace-ops.ts` re-exports during transition, then callers are updated and re-exports removed within the same milestone. Domain modules import only from stable leaf modules; no cross-domain imports between new modules.

**Major components after decomposition:**
1. `workspace-state.ts` — read-only queries: list info, status, dirty checks, CWD detection; imports only config.ts + git.ts
2. `workspace-env.ts` — GS_* env var assembly, secret resolution, .env file writes; `resolveWorkspaceEnvVars` stays private (not exported)
3. `workspace-git.ts` — multi-repo sync/push/pull; exports `_exec` for test injection; SyncRow/PushRow types must be re-exported from workspace-ops.ts facade (App.tsx imports them by that path)
4. `workspace-yaml.ts` — YAML editor utilities, rename-template, validate schemas; spawns `$EDITOR` via `_exec`
5. `workspace-ops.ts` (retained) — lifecycle orchestrator: open/close/clean/remove/merge/rename; imports all four domain modules; `_executeClose`/`_executeClean` stay private here

### Critical Pitfalls

1. **Circular imports created during split** — map intra-module dependency graph before writing any code; domain modules import from stable leaves only (`config.ts`, `git.ts`, `lifecycle.ts`); run `madge --circular src/` after each split commit; symptom is silent TypeScript compilation but runtime `TypeError: X is not a function`

2. **Mock paths not updated in lockstep** — when a function moves files, `mock.module("@/lib/workspace-ops")` calls in tests silently stop intercepting it; grep for mock.module references to every moved path after every extraction commit; tests passing while calling real git are the hardest failure mode to detect

3. **Structured logging corrupts stdout/TUI** — all log output to stderr only, never stdout; default level `warn`; force `logger.level = "silent"` before TUI renderer starts; `--json` output must parse as valid JSON with `2>/dev/null` suppressing stderr

4. **Re-export intermediaries left indefinitely** — re-exports accumulate and workspace-ops.ts never fully decomposes; the extraction phase and caller-update phase must be in the same milestone, not deferred

5. **Logger level baked at module evaluation time** — ESM caches the module; `process.env` changes after import are invisible to a singleton created at top-level; use lazy `configureLogger()` called from `src/index.ts` after environment is established

## Implications for Roadmap

The extraction order is determined by which domain modules have the fewest dependencies on other new modules. State queries have none; env has none but is depended on by lifecycle; git and yaml are independent of each other. Logging infrastructure must be established before any log calls are added. Re-export shims must be removed within the same milestone.

### Phase 1: Extract workspace-state.ts
**Rationale:** Lowest-risk entry point — pure read-only query functions, no side effects, no subprocess spawning, no dependencies on other new domain modules. A problem here is immediately visible in tests with no confounding factors.
**Delivers:** `getWorkspaceListInfo`, `getWorkspaceStatus`, `getDirtyWorktrees`, `detectWorkspaceFromCwd`, and associated types moved to `workspace-state.ts`; re-exported from `workspace-ops.ts`; full test suite passes
**Addresses:** Domain module split (table stakes), stable public API facade
**Avoids:** Circular imports (no cross-domain deps possible at this stage)

### Phase 2: Extract workspace-env.ts
**Rationale:** The env module is consumed by all lifecycle operations but has no dependency on other new domain modules. Extracting it second means the most-depended-upon shared utility is isolated early, enabling remaining splits to import from it cleanly.
**Delivers:** `mergeEnv`, `buildBaseEnv`, `buildRepoEnv`, `buildWorkspaceEnv`, `writeEnvFiles` in `workspace-env.ts`; `resolveWorkspaceEnvVars` stays private; `openWorkspace` in workspace-ops.ts imports from the new module
**Uses:** secrets.ts, ports.ts (stable leaves — no new cross-domain deps)
**Avoids:** Exposing `resolveWorkspaceEnvVars` as public API (implementation detail of `buildWorkspaceEnv`)

### Phase 3: Extract workspace-git.ts
**Rationale:** sync/push/pull are independent of lifecycle operations and share no code with env or state. Medium risk due to stash restore logic in syncWorkspace — extract after env module is stable since sync uses env utilities.
**Delivers:** `syncWorkspace`, `pushWorkspace`, `pullWorkspace`, SyncRow/PushRow/PullRow types in `workspace-git.ts`; `_exec` exported for test injection; types re-exported from workspace-ops.ts facade
**Implements:** `_exec` pattern on new module (App.tsx imports SyncRow/PushRow by name from `workspace-ops` — must re-export)
**Avoids:** Pitfall 2 (update mock.module paths for syncWorkspace/pushWorkspace tests)

### Phase 4: Extract workspace-yaml.ts
**Rationale:** YAML editor utilities and rename-template have no dependencies on other new modules. Low risk. `renameTemplate` touches `listWorkspaces` from config.ts — must verify this does not create a cycle (it won't; config.ts is a stable leaf).
**Delivers:** `editWorkspaceYaml`, `editTemplateYaml`, `editGlobalConfigYaml`, `editRegistryYaml`, `openYamlInEditor`, `renameTemplate` in `workspace-yaml.ts`; `_exec` exported for editor spawn
**Avoids:** Moving `_executeClose`/`_executeClean` out of workspace-ops.ts (they are not independently callable)

### Phase 5: Clean up workspace-ops.ts + update callers
**Rationale:** After phases 1-4, workspace-ops.ts retains only lifecycle operations and re-export shims. This phase removes shims, updates all call sites in `commands/` and `tui/`, and extracts the shared `execHooks` helper that is currently copy-pasted ~15 times across lifecycle functions.
**Delivers:** workspace-ops.ts at ~700 lines (down from 1,735); re-export shims removed; all callers import from correct module paths; grep `from.*workspace-ops` in `src/` returns only legitimate lifecycle imports; `execHooks` shared helper eliminates 15x duplication
**Avoids:** Pitfall 9 (re-exports left indefinitely)

### Phase 6: Logging infrastructure
**Rationale:** Logging infrastructure must be established before any log calls are added — transport, default level, lazy configuration, and TUI silent mode must all be wired upfront. Adding calls before this is in place causes immediate stdout corruption or TUI breakage.
**Delivers:** `src/lib/logger.ts` with `setupLogging()` / `configureLogger(level)`; `@logtape/logtape` installed; `GIT_STACKS_DEBUG` env var activates debug output to stderr; TUI mode forces silent level; `--json` output verified clean (parses as valid JSON with `2>/dev/null`)
**Uses:** @logtape/logtape@^2.0.5
**Avoids:** Pitfall 4 (stdout/TUI corruption), Pitfall 10 (level baked at module load time)

### Phase 7: Add debug instrumentation to domain modules
**Rationale:** With infrastructure in place, add `logger.debug()` calls to domain modules for operation tracing and per-step timing. All log calls are additive with zero impact at the default `warn` level.
**Delivers:** `[lifecycle]`, `[git]`, `[env]`, `[state]` labeled debug output; `performance.now()` timing per major step; zero observable change for users without `GIT_STACKS_DEBUG=1`
**Avoids:** Pitfall 5 (log verbosity noise — no `logger.info()` on production paths); Pitfall 8 (hot path serialization — log only scalar identifiers in `getWorkspaceListInfo`, never full workspace objects)

### Phase Ordering Rationale

- Phases 1-4 are ordered by dependency depth: state (no deps on new modules) → env (depended-on by lifecycle) → git (independent) → yaml (independent). Each phase is independently reviewable and reverts cleanly.
- Phase 5 completes the extraction before logging is added — callers must use correct import paths before log labels reference module identity.
- Phase 6 (logging infra) always precedes Phase 7 (log calls). Transport, default level, and TUI-silent configuration must exist before any call sites are added.
- The re-export facade approach means phases 1-4 carry zero risk to `commands/` or `tui/` — they are not touched until phase 5.

### Research Flags

Standard patterns (skip research phase for all phases):
- **Phases 1-4:** Module extraction; patterns fully documented in ARCHITECTURE.md with explicit build order and code examples derived from direct codebase analysis
- **Phase 5:** Caller update pass; mechanical grep-and-replace with full test suite as safety net
- **Phase 6:** LogTape configuration fully documented in STACK.md with exact code snippets; official docs verified at HIGH confidence
- **Phase 7:** Instrumentation follows from Phase 6 infrastructure; no unknowns

No phases require `/gsd-research-phase`. All implementation patterns are resolved. The only validation needed is runtime: `madge --circular src/` returns zero cycles after each extraction commit, and `--json` output parses cleanly after Phase 6.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | LogTape verified against official docs + GitHub; pino Bun incompatibility confirmed in upstream issue tracker; `_exec` DI pattern verified against existing production code in lifecycle.ts, niri.ts |
| Features | HIGH | Based on direct codebase analysis of workspace-ops.ts (1,735 lines) and all 6+ import sites; no speculation or inference |
| Architecture | HIGH | Based on direct code reading of workspace-ops.ts, commands/workspace.ts, tui/dashboard/App.tsx, lifecycle.ts; dependency graph confirmed by inspection |
| Pitfalls | HIGH | Grounded in direct reads of workspace-ops.test.ts mock patterns, CLAUDE.md conventions, Bun ESM module caching behavior, and TypeScript circular import behavior |

**Overall confidence:** HIGH

### Gaps to Address

- **`openWorkspace` internal complexity (~186 lines):** App.tsx reimplements parts of openWorkspace inline for step-level TUI progress, directly importing `createWorktree`, `runHooksCaptured`, `applyFileOpsForRepo`, `runIntegrationGenerate`. The boundary between what stays in workspace-ops.ts vs. what App.tsx calls directly must be validated during Phase 5 cleanup — not a decomposition blocker but needs explicit attention.

- **`renameTemplate` dependency chain:** ARCHITECTURE.md notes `renameTemplate` touches `listWorkspaces`. Verify during Phase 4 that this resolves to config.ts (a stable leaf), not to any new domain module, before coding. Should be clean but confirm.

- **Performance baseline for `getWorkspaceListInfo`:** No existing benchmark. Establish baseline before adding any log calls. PITFALLS.md warns that serializing the full workspace object on TUI arrow-key navigation causes visible latency — log only scalar identifiers there (workspace.name, repo count, not the full objects).

## Sources

### Primary (HIGH confidence)
- `src/lib/workspace-ops.ts` — full 1,735-line analysis; domain boundary identification; import graph
- `src/commands/workspace.ts` — all import sites confirmed
- `src/tui/dashboard/App.tsx` — 9 function + 3 type imports from workspace-ops; inline reimplementation of openWorkspace noted (lines 26-53)
- `src/lib/lifecycle.ts` — `_exec` pattern canonical reference (139 lines, full read)
- https://logtape.org/manual/config — configureSync(), sink setup
- https://logtape.org/manual/struct — getLogger(), structured logging API
- https://github.com/dahlia/logtape — v2.0.5 confirmed latest stable
- https://github.com/pinojs/pino/issues/2060 — pino maintainer closes Bun/Deno issues as out of scope

### Secondary (MEDIUM confidence)
- https://logtape.org/comparison — LogTape vs pino/winston comparison; library-first philosophy rationale
- https://github.com/vktrl/bun-plugin-pino — existence confirms pino Bun incompatibility is real
- https://github.com/lirantal/nodejs-cli-apps-best-practices — stderr for debug, env var debug convention
- https://dev.to/saber-amani/how-to-break-up-god-objects-strategies-for-clean-backend-architecture-5ala — extract by domain not layer

### Tertiary (LOW confidence)
- TypeScript/Bun ESM circular import runtime behavior (undefined values at startup) — documented in TypeScript and Bun specs; validate with `madge --circular` during implementation rather than relying solely on documentation

---
*Research completed: 2026-04-05*
*Ready for roadmap: yes*
