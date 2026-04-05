# Requirements: git-stacks

**Defined:** 2026-04-05
**Core Value:** One command takes you from "I need to work on feature X" to a fully running dev environment

## v0.16.0 Requirements

Requirements for v0.16.0 Core Engine & Observability. Each maps to roadmap phases.

### Module Extraction

- [ ] **EXTR-01**: workspace-ops.ts is split into domain modules with workspace-ops.ts as a re-export facade
- [ ] **EXTR-02**: workspace-env.ts extracted — mergeEnv, buildBaseEnv, buildRepoEnv, buildWorkspaceEnv, writeEnvFiles, resolveWorkspaceEnvVars
- [ ] **EXTR-03**: workspace-lifecycle.ts extracted — close/clean/remove/merge with cascade helpers (_executeClose, _executeClean) co-located
- [ ] **EXTR-04**: workspace-git.ts extracted — sync/push/pull operations
- [ ] **EXTR-05**: workspace-status.ts extracted — getWorkspaceStatus, getDirtyWorktrees, getWorkspaceListInfo
- [ ] **EXTR-06**: workspace-yaml.ts extracted — YAML editors, rename ops, detectWorkspaceFromCwd
- [ ] **EXTR-07**: Each extracted module exports `_exec` object following lifecycle.ts pattern where it spawns processes
- [ ] **EXTR-08**: All existing tests pass after each extraction step (800+ tests, zero regressions)
- [ ] **EXTR-09**: Cascade ordering (remove → clean → close) preserved with D-02/D-10 lifecycle references

### Observability

- [ ] **OBSV-01**: GIT_STACKS_DEBUG=1 env var enables debug trace output to stderr
- [ ] **OBSV-02**: Each domain module emits labeled debug lines: `[module] operation: detail`
- [ ] **OBSV-03**: Operation timing via performance.now() — `[module] step: Xms` format behind debug flag
- [ ] **OBSV-04**: Debug output is silent by default — zero overhead on normal CLI invocations
- [ ] **OBSV-05**: TUI-safe — debug output goes to stderr only, never corrupts OpenTUI screen

### Testing

- [ ] **TEST-01**: Unit tests for extracted workspace-env helpers without real git repos
- [ ] **TEST-02**: Unit tests for extracted workspace-status query functions
- [ ] **TEST-03**: Unit tests for extracted workspace-git operations using _exec mocks
- [ ] **TEST-04**: Circular import detection verified (no circular deps between new modules)

## Future Requirements

Deferred to future milestone. Tracked but not in current roadmap.

### Structured Progress

- **PROG-01**: ProgressCallback upgraded to structured type `{ phase, repo?, message }`
- **PROG-02**: TUI per-repo progress bars using structured progress events

### Debug Filtering

- **DBGF-01**: `GIT_STACKS_DEBUG=open,sync` namespace filtering for debug output

## Out of Scope

| Feature | Reason |
|---------|--------|
| DI container/framework (InversifyJS, tsyringe) | `_exec` pattern already proven; containers fight Bun ESM model |
| Structured JSON logging (pino, winston) | CLI tool, not a server; env-var stderr is the right primitive |
| OpenTelemetry tracing | Single-process CLI; OTEL's distributed model adds complexity for no benefit |
| Class-based domain objects | Breaks named-export convention; no benefit over module-level functions |
| Effect-TS layers | Major paradigm shift; existing async/await + `_exec` is sufficient |
| Caller import path migration | Updating commands/tui to import from domain modules directly — defer to post-extraction |
| Structured ProgressCallback | Breaking change to TUI consumers; defer to future milestone |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| EXTR-02 | Phase 69 | Pending |
| EXTR-03 | Phase 69 | Pending |
| EXTR-09 | Phase 69 | Pending |
| EXTR-01 | Phase 70 | Pending |
| EXTR-04 | Phase 70 | Pending |
| EXTR-05 | Phase 70 | Pending |
| EXTR-06 | Phase 70 | Pending |
| EXTR-07 | Phase 70 | Pending |
| EXTR-08 | Phase 70 | Pending |
| OBSV-01 | Phase 71 | Pending |
| OBSV-02 | Phase 71 | Pending |
| OBSV-03 | Phase 71 | Pending |
| OBSV-04 | Phase 71 | Pending |
| OBSV-05 | Phase 71 | Pending |
| TEST-01 | Phase 72 | Pending |
| TEST-02 | Phase 72 | Pending |
| TEST-03 | Phase 72 | Pending |
| TEST-04 | Phase 72 | Pending |

**Coverage:**
- v0.16.0 requirements: 18 total
- Mapped to phases: 18
- Unmapped: 0 ✓

---
*Requirements defined: 2026-04-05*
*Last updated: 2026-04-05 — traceability mapped to phases 69-72*
