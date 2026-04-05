# Feature Research

**Domain:** CLI tool domain module extraction and observability
**Researched:** 2026-04-05
**Confidence:** HIGH (codebase analysis) / MEDIUM (external patterns via web research)

## Feature Landscape

### Table Stakes (Users Expect These)

Features a refactoring milestone must deliver. Missing these = the extraction is incomplete or the result is worse than before.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Stable public API (no breaking changes) | workspace-ops.ts is imported by 6+ command files; any signature change breaks callers | MEDIUM | Re-export barrel or in-place delegation pattern; existing callers must not change |
| All existing tests still pass | 780+ tests cover ops behavior; extraction that regresses them is a failure, not a refactor | LOW | Tests import from workspace-ops directly — extraction must preserve those exports |
| `_exec` injectable pattern on new modules | lifecycle.ts, niri.ts, tmux.ts already use it; any new module spawning processes must match | LOW | Object property mutation, not class injection — must stay consistent |
| `ProgressCallback` threading | onProgress is already the progress bus for TUI + CLI callers; extracted modules must accept and forward it | LOW | Type is already defined; modules need `onProgress?: ProgressCallback` in signatures |
| Discriminated union return types | `{ ok: true } \| { ok: false; error: string }` is the whole-codebase convention for fallible ops | LOW | Any new function that can fail must follow this; never throw expected errors |
| Cascade ordering preserved | `remove → clean → close` cascade is codified in D-02/D-10 lifecycle docs; extraction must not reorder or skip steps | MEDIUM | Internal `_executeClose` / `_executeClean` helpers encode this; must move together |

### Differentiators (Competitive Advantage)

Features that make the extraction genuinely better than the status quo monolith, not just reorganized.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| `GS_DEBUG=1` env-var trace output | Reveals which domain step is running, with repo name and timing; invaluable for diagnosing hook failures or stalled worktree ops without adding `--verbose` flags to every command | MEDIUM | Write to stderr only; key=value format or simple prefix; controlled by env var following `DEBUG=*` CLI convention; no new dependency |
| Operation timing in debug output | "open: worktree recreation took 340ms", "sync: fetch 2s, rebase 80ms" — identifies real bottlenecks | MEDIUM | `performance.now()` is free in Bun; format as `[domain] step: Xms` to stderr when GS_DEBUG=1 |
| Domain module cohesion (one concern per file) | sync/push/pull ops share git+env logic but have zero overlap with rename/remove; splitting them makes each file comprehensible in isolation | MEDIUM | Natural splits: `workspace-env.ts`, `workspace-lifecycle.ts`, `workspace-git.ts`, `workspace-yaml.ts`; workspace-ops.ts becomes a thin re-export facade |
| Consistent progress event shape | Currently onProgress is `(message: string) => void` — opaque strings. A richer `{ phase, repo?, message }` shape lets TUI render structured progress (per-repo spinners, phase labels) | HIGH | Breaking change to ProgressCallback signature unless done as new type alongside old; TUI consumers would need update too; likely v2 concern |
| Test coverage for extracted modules in isolation | openWorkspace is 186 lines with no unit tests for sub-steps; extracted helpers can be unit-tested directly without real git repos | MEDIUM | Builds on existing `_exec` mock pattern; major testability win |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| DI container (InversifyJS, tsyringe) | "Proper" DI — auto-wiring, decorators, IoC container | Requires decorators (reflect-metadata), adds startup overhead, fights Bun's ESM model, and is overkill for a CLI with 5 injectable points | Keep the mutable `_exec` object pattern — it's already proven, zero-overhead, and test-friendly without decorators |
| Structured JSON logging library (pino, winston) | Real structured logs for grep/jq querying | CLIs write human-readable progress to stderr; adding a JSON logger creates friction for normal use and is sized for servers not CLIs | `GS_DEBUG=1` env var with plain `process.stderr.write()` — simple, zero-dep, follows established CLI conventions |
| OpenTelemetry tracing | "Real observability" for distributed tracing | git-stacks is a single-process CLI, not a distributed system; OTEL's span/context model is significant complexity for no runtime benefit | Per-operation timing logged to stderr under `GS_DEBUG=1` covers 100% of the diagnostic need |
| Global logger singleton | Single import for all logging | Global state in a CLI is an initialization order hazard; hard to suppress in tests without mocking | Pass debug flag or `onDebug?` callback at call site, same as `onProgress` — keeps modules pure |
| Async dependency graph / effect system | Effect-TS layers for "proper" functional DI | Effect is a major paradigm shift; workspace-ops already uses simple `async/await`; rewriting to Effect would be months of risk for negligible benefit at this scale | The existing `_exec` + `ProgressCallback` approach is already a lightweight form of effect injection |
| Class-based domain objects | "WorkspaceOpsDomain" class with constructor injection | Breaks named-export convention; forces callers to instantiate before calling; no benefit over module-level functions with injected `_exec` | Module-level async functions + mutable `_exec` object — idiomatic for this codebase |

## Feature Dependencies

```
[GS_DEBUG trace output]
    └──requires──> [domain module split] (need module identity to label trace lines)

[Operation timing]
    └──enhances──> [GS_DEBUG trace output]

[Domain module split]
    └──requires──> [stable public API facade] (workspace-ops.ts becomes re-export barrel)
                       └──requires──> [cascade ordering preserved]

[Test coverage for extracted modules]
    └──requires──> [domain module split]
    └──enhances──> [_exec injectable pattern on new modules]

[Consistent progress event shape]
    └──conflicts──> [stable public API facade] (ProgressCallback type change is breaking)
```

### Dependency Notes

- **Domain module split requires stable public API facade:** All 6+ command files import from `workspace-ops`; the re-export barrel lets extraction happen without touching callers.
- **GS_DEBUG trace output requires domain module split:** Without module identity, debug lines have no useful prefix. Each module emits `[lifecycle]`, `[git-ops]`, `[env]` labels.
- **Consistent progress event shape conflicts with stable public API facade:** Changing `ProgressCallback = (message: string) => void` to a structured type breaks every TUI caller. Defer to a later milestone — it would be a semver-minor at earliest.

## MVP Definition

### Launch With (v1 — this milestone)

Minimum viable extraction: the file is broken up, observable in debug mode, and nothing regresses.

- [ ] **Domain module split** — workspace-ops.ts (~1735 lines) split into 4-5 focused modules; workspace-ops.ts re-exports all public symbols for backward compat; no caller changes
- [ ] **`_exec` pattern extended to new modules** — any extracted module that spawns processes gets its own `_exec` object following lifecycle.ts precedent
- [ ] **`GS_DEBUG=1` trace output** — each domain module emits phase-labeled stderr lines when the env var is set; at minimum: operation entry, each repo being processed, hook execution, completion with timing
- [ ] **Cascade ordering preserved and documented** — `_executeClose` / `_executeClean` internal helpers move with their callers; inline comment references D-02/D-10 lifecycle rules
- [ ] **All existing tests pass** — the test suite is the acceptance criterion; no new test infra needed for this milestone

### Add After Validation (v1.x)

- [ ] **Unit tests for extracted helpers** — now that `prepareWorktreeEnv`, `executeOpen`, `executeMerge` etc. are in separate files, add focused tests that don't need real git repos
- [ ] **Operation timing in debug output** — `performance.now()` before/after each major step; millisecond-level granularity; behind `GS_DEBUG=1` flag

### Future Consideration (v2+)

- [ ] **Structured ProgressCallback type** — `{ phase: string; repo?: string; message: string }` shape; enables TUI per-repo progress bars; requires coordinated update of all TUI consumers
- [ ] **Per-operation debug namespacing** — `GS_DEBUG=open,sync` to filter debug output to specific operations; only needed once `GS_DEBUG=1` proves useful

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Domain module split | HIGH (maintainability, readability) | MEDIUM (careful boundary finding, cascade safety) | P1 |
| Stable public API facade | HIGH (zero regression) | LOW (re-export barrel is mechanical) | P1 |
| `_exec` pattern on new modules | HIGH (test isolation) | LOW (copy pattern from lifecycle.ts) | P1 |
| Cascade ordering preserved | HIGH (correctness) | LOW (move helpers together) | P1 |
| `GS_DEBUG=1` trace output | MEDIUM (debugging ergonomics) | LOW (stderr writes, env var check) | P1 |
| Operation timing in debug | MEDIUM (performance insight) | LOW (performance.now()) | P2 |
| Unit tests for extracted helpers | MEDIUM (confidence) | MEDIUM (new test fixtures) | P2 |
| Structured ProgressCallback | LOW (TUI enhancement) | HIGH (breaking, broad change) | P3 |

## Domain Boundary Analysis

Based on reading workspace-ops.ts, the natural cohesion boundaries are:

| Proposed Module | Functions | Lines (approx) | Shared with |
|-----------------|-----------|-----------------|-------------|
| `workspace-env.ts` | `mergeEnv`, `buildBaseEnv`, `buildRepoEnv`, `buildWorkspaceEnv`, `writeEnvFiles`, `resolveWorkspaceEnvVars` | ~130 | Used by all ops |
| `workspace-lifecycle.ts` | `cleanWorkspace`, `closeWorkspace`, `removeWorkspace`, `mergeWorkspace`, `_executeClose`, `_executeClean` | ~450 | Cascade chain; hooks |
| `workspace-git.ts` | `syncWorkspace`, `pushWorkspace`, `pullWorkspace` | ~430 | All use git.ts + env |
| `workspace-status.ts` | `getWorkspaceStatus`, `getDirtyWorktrees`, `getWorkspaceListInfo` | ~230 | Read-only; no side effects |
| `workspace-yaml.ts` | `editWorkspaceYaml`, `editTemplateYaml`, `editGlobalConfigYaml`, `editRegistryYaml`, `openYamlInEditor`, `renameWorkspace`, `renameTemplate`, `detectWorkspaceFromCwd` | ~210 | YAML + filesystem only |
| `workspace-ops.ts` (facade) | Re-exports all of the above | ~50 | None — pure re-export |

This split eliminates cross-domain coupling. `workspace-env.ts` is the only shared dependency (all ops build env vars). No circular imports result from this structure.

## Sources

- Codebase analysis: `/home/nnex/dev/prj/git-stacks/src/lib/workspace-ops.ts` (1735 lines, 25 exports)
- Existing injectable pattern: `/home/nnex/dev/prj/git-stacks/src/lib/lifecycle.ts`
- Node.js CLI best practices: [lirantal/nodejs-cli-apps-best-practices](https://github.com/lirantal/nodejs-cli-apps-best-practices) — stderr for debug, env var debug flag convention
- God object refactoring patterns: [How to Break Up God Objects](https://dev.to/saber-amani/how-to-break-up-god-objects-strategies-for-clean-backend-architecture-5ala) — extract by domain not layer
- TypeScript DI options surveyed: tsyringe, InversifyJS, typedi — all rejected for CLI use (see Anti-Features)
- Structured logging comparison: pino, winston, debug npm — all rejected in favor of stderr+env var pattern for CLI

---
*Feature research for: CLI tool domain module extraction and observability*
*Researched: 2026-04-05*
