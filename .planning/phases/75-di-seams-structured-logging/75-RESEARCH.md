# Phase 75: DI Seams & Structured Logging - Research

**Researched:** 2026-04-05 [VERIFIED: local environment]
**Domain:** Bun CLI observability, mutable subprocess seams, stderr-only structured debug output [VERIFIED: codebase grep]
**Confidence:** MEDIUM [ASSUMED]

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Phase 75 extends the existing observability path in `src/lib/observability.ts` and its one-time bootstrap in `src/index.ts`; it does not add a parallel logger or bypass LogTape.
- **D-02:** Structured debug output remains stderr-only so normal human-readable stdout and `--json` stdout stay unchanged, and `git-stacks manage` continues to silence observability before the TUI starts.

### Debug environment contract
- **D-03:** `GS_DEBUG` becomes the Phase 75 selector syntax for structured debug output.
- **D-04:** `GS_DEBUG=1` and `GS_DEBUG=true` enable debug output for all modules.
- **D-05:** Existing `GIT_STACKS_DEBUG=1` behavior remains accepted as a compatibility alias during the transition so current docs, tests, and user workflows do not break.

### Module filter and output shape
- **D-06:** Structured debug fields are added centrally through the observability helpers rather than by per-module custom formatting.
- **D-07:** Module filtering accepts short user-facing tokens such as `lifecycle` and `git`, even though current internal category names are `workspace-lifecycle` and `workspace-git`.
- **D-08:** Structured output should remain single-line and human-readable on stderr while carrying the roadmap-required fields `{ op, module, repo?, ms?, msg }`.

### DI seam pattern
- **D-09:** `workspace-lifecycle.ts` adopts the established mutable `_exec` object pattern already used in shell-wrapper modules so tests can replace subprocess behavior without spawning real processes.
- **D-10:** `workspace-git.ts` keeps the same mutable `_exec` seam convention rather than switching to constructor injection or threaded dependency parameters.
- **D-11:** The public `workspace-ops.ts` facade and the existing close -> clean -> remove/merge cascade behavior remain unchanged in this phase.

### the agent's Discretion
- Exact serialization format of the structured stderr line, as long as all required fields are present and the output remains readable in a terminal.
- Whether module aliasing is implemented as a normalization map, category metadata, or another centralized observability helper.
- Whether compatibility coverage for `GIT_STACKS_DEBUG=1` is enforced primarily in observability unit tests, command-level tests, or both.

### Deferred Ideas (OUT OF SCOPE)
- Broader dependency injection across every filesystem/process boundary - outside Phase 75 and already noted as future work in v0.16 artifacts.
- Structured logging beyond the current stderr debug channel - still deferred; this phase only upgrades the existing debug path.
- Rollback orchestration, integration capability contracts, and indexed config caching - covered by Phases 76-78, not this context pass.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| OBSV-01 | `workspace-lifecycle.ts` has injectable `_exec` seam for subprocess testing | Reuse the existing `SpawnHandle` / `_exec.spawn` contract from `src/lib/lifecycle.ts` instead of inventing a second spawn shape. [VERIFIED: codebase grep] |
| OBSV-02 | `workspace-git.ts` has injectable `_exec` seam for subprocess testing | Keep the mutable exported object pattern, but avoid broad `git.ts` rewrites because current `workspace-git.ts` behavior is already isolated through mocked `git.ts` helpers in unit tests. [VERIFIED: codebase grep] |
| OBSV-03 | Debug output uses structured fields `{ op, module, repo?, ms?, msg }` on stderr | Extend `src/lib/observability.ts` formatter and helper API; the current sink already owns stderr rendering and can read `LogRecord.properties`. [VERIFIED: codebase grep] [VERIFIED: npm package types] |
| OBSV-04 | `GS_DEBUG=lifecycle,git` filters debug output to named modules only | Implement selector parsing and category-to-token normalization centrally in observability helpers, not by filtering rendered strings in commands. [VERIFIED: phase context] [VERIFIED: codebase grep] |
| OBSV-05 | `GS_DEBUG=1` or `GS_DEBUG=true` continues to show all module output | Bootstrap stays in `src/index.ts`, and the legacy `GIT_STACKS_DEBUG=1` alias must remain accepted during the transition. [VERIFIED: codebase grep] [VERIFIED: phase context] |
</phase_requirements>

## Summary

Phase 75 is an extension pass, not a logging rewrite. `src/index.ts` already bootstraps observability once per process, `src/lib/observability.ts` already owns stderr sink formatting plus the disabled fast path, and `git-stacks manage` already re-silences observability before the TUI starts. [VERIFIED: codebase grep]

The codebase already has the seam pattern this phase should reuse: `src/lib/lifecycle.ts` exports a mutable `_exec.spawn` object with a typed `SpawnHandle`, while many integration wrappers use the same exported-object injection style. `workspace-lifecycle.ts` currently exports no `_exec`, and `workspace-git.ts` exports only a placeholder seam while still delegating real work to `git.ts` helpers. [VERIFIED: codebase grep]

**Primary recommendation:** keep all selector parsing, module aliasing, and structured line rendering inside `src/lib/observability.ts`; preserve `src/index.ts` as the only env bootstrap; add a real `_exec.spawn` seam to `workspace-lifecycle.ts` by reusing the lifecycle spawn contract; keep `workspace-git.ts` minimal and avoid a broad `git.ts` refactor unless a concrete Phase 75 test requires it. [VERIFIED: codebase grep] [ASSUMED]

## Project Constraints (from CLAUDE.md)

- Use Bun commands already defined by the repo: `bun run src/index.ts`, `bun run test`, `bun test <single-file>`, and `bun run typecheck`. [VERIFIED: CLAUDE.md]
- Do not use `bun test tests/` directly because shared-process module mocks leak between files; use the repo runner for suite runs and single-file `bun test` only for targeted files. [VERIFIED: CLAUDE.md]
- Production `src/` code must use relative imports; the `@/*` alias is test-only. [VERIFIED: CLAUDE.md]
- Modules with subprocesses should export mutable `_exec` objects for test injection. [VERIFIED: CLAUDE.md]
- Runtime is Bun, TypeScript is strict, YAML schema compatibility must be preserved, and public workspace YAML behavior must not break. [VERIFIED: CLAUDE.md]
- The `workspace-ops.ts` facade remains stable through this milestone per project state and phase context. [VERIFIED: codebase grep]

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Bun | `1.3.10` [VERIFIED: local environment] | Runtime, stderr writer, and test runner for this repo. [VERIFIED: local environment] | The project executes TypeScript directly with Bun and existing observability code already depends on `Bun.stderr.writer()`. [VERIFIED: CLAUDE.md] [VERIFIED: codebase grep] |
| `@logtape/logtape` | `2.0.5` (published 2026-03-23) [VERIFIED: npm registry] | Existing logger/sink/formatter host for stderr debug output. [VERIFIED: package.json] [VERIFIED: codebase grep] | Phase 75 is locked to extend the current LogTape-backed observability path instead of adding a parallel backend. [VERIFIED: phase context] |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `bun:test` | Bundled with Bun `1.3.10` [VERIFIED: local environment] | Unit and command-level regression coverage. [VERIFIED: local environment] | Use targeted single-file runs while iterating on observability or seam behavior. [VERIFIED: CLAUDE.md] |
| `scripts/test-runner.ts` | repo-local script [VERIFIED: package.json] | Isolated full-suite execution for mock-heavy tests. [VERIFIED: CLAUDE.md] | Use for full validation before phase completion because direct directory runs can leak mocks across files. [VERIFIED: CLAUDE.md] |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Helper-level selector checks inside `logDebug()` / `timeOperation()` [ASSUMED] | LogTape sink filters or per-category logger configs. [VERIFIED: npm package types] | Helper-level checks preserve the repo's existing single choke point for disabled-path behavior and avoid spreading filter logic across command code. [VERIFIED: codebase grep] [ASSUMED] |
| Reusing current LogTape sink/formatter path [VERIFIED: phase context] | Ad-hoc `console.error()` or a second logger backend. [VERIFIED: phase context] | A second path would violate locked decisions D-01 and D-06 and would make TUI silencing harder to reason about. [VERIFIED: phase context] |

**Installation:**
```bash
bun install
```

**Version verification:** `@logtape/logtape` is already on the current latest `2.0.5`, published on 2026-03-23. [VERIFIED: npm registry]

## Architecture Patterns

### Recommended Project Structure
This is the current layout plus the minimum new test surface Phase 75 is likely to need. [VERIFIED: codebase grep] [ASSUMED]

```text
src/
├── index.ts
├── lib/observability.ts
├── lib/lifecycle.ts
├── lib/workspace-lifecycle.ts
└── lib/workspace-git.ts

tests/
├── lib/observability.test.ts
├── lib/workspace-git.test.ts
├── lib/workspace-lifecycle.test.ts
└── commands/debug-output.test.ts
```

### Pattern 1: Centralize selector parsing and module normalization
**What:** Parse `GS_DEBUG` and the legacy `GIT_STACKS_DEBUG` alias in one place, normalize user tokens like `lifecycle` and `git` to the repo's internal categories, and let observability helpers decide whether a category should emit. [VERIFIED: phase context] [VERIFIED: codebase grep]

**When to use:** For every debug emission path; command files should never parse selectors or decide module filtering themselves. [VERIFIED: phase context]

**Example:**
```typescript
// Source pattern: src/index.ts + src/lib/observability.ts
await configureObservability(process.env.GS_DEBUG ?? process.env.GIT_STACKS_DEBUG)
```

### Pattern 2: Keep structured line formatting in the stderr formatter, not in call sites
**What:** `logDebug()` and `timeOperation()` should hand the formatter structured properties like `op`, `module`, `repo`, `ms`, and `msg`; the formatter should own the final single-line human-readable stderr string. [VERIFIED: phase context] [VERIFIED: npm package types]

**When to use:** For all new ad-hoc debug lines and timing output. [VERIFIED: codebase grep]

**Example:**
```typescript
// Source pattern: LogRecord.properties is available to a custom formatter.
getStreamSink(stream, {
  formatter: (record) => {
    const props = record.properties
    return `op=${props.op} module=${props.module} msg=${props.msg}`
  },
})
```

### Pattern 3: Reuse the canonical spawn seam contract
**What:** `src/lib/lifecycle.ts` already defines the spawn argument shape plus `SpawnHandle`; Phase 75 should reuse that contract for `workspace-lifecycle.ts` rather than invent a second subprocess abstraction. [VERIFIED: codebase grep]

**When to use:** For hook-executing lifecycle code and unit tests that must replace subprocess behavior without launching shells. [VERIFIED: codebase grep]

**Example:**
```typescript
// Source: src/lib/lifecycle.ts
export const _exec = {
  spawn: (args: {
    cmd: string[]
    cwd: string
    env: Record<string, string>
    stdout: "inherit" | "pipe"
    stderr: "inherit" | "pipe"
  }): SpawnHandle => { /* ... */ },
}
```

### Pattern 4: Do not widen Phase 75 into a `git.ts` refactor
**What:** `workspace-git.ts` currently composes imported `git.ts` helpers and its unit tests already mock those helpers. The phase should align the seam shape and structured logging, not replace every helper call with direct `Bun.spawn` usage. [VERIFIED: codebase grep]

**When to use:** During planning for OBSV-02 and test scope. [VERIFIED: codebase grep]

**Anti-Patterns to Avoid**
- **Substring filtering on rendered lines:** filter by normalized category/token before formatting, not by searching the final stderr string. [VERIFIED: phase context] [ASSUMED]
- **Parsing `op` back out of freeform debug text:** move ad-hoc `logDebug(category, "foo: bar")` calls to structured fields instead of reverse-parsing strings. [VERIFIED: codebase grep] [ASSUMED]
- **Duplicate spawn wrappers in multiple modules:** prefer one spawn contract so `_exec.spawn` tests do not drift by module. [VERIFIED: codebase grep] [ASSUMED]
- **Testing selector behavior only through `status`:** `status` proves stderr separation, but it does not cover the roadmap's `GS_DEBUG` selector or lifecycle-domain hook paths. [VERIFIED: codebase grep]

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Structured debug line rendering | Per-module `console.error()` formatters. [VERIFIED: phase context] | `src/lib/observability.ts` custom stderr sink formatter. [VERIFIED: codebase grep] | The current sink already owns stderr output and can render `LogRecord.properties` without changing stdout behavior. [VERIFIED: codebase grep] [VERIFIED: npm package types] |
| Subprocess test interception | Global `spyOn(Bun, "spawn")` patches. [VERIFIED: CHANGELOG.md] | Mutable exported `_exec` objects with the existing spawn contract. [VERIFIED: CLAUDE.md] [VERIFIED: codebase grep] | The repo already moved away from unreliable native spawn spying in other modules. [VERIFIED: CHANGELOG.md] |
| Module alias parsing | Freeform string matching or regexes over categories in each module. [VERIFIED: phase context] | One observability normalization map from user token to internal category. [VERIFIED: phase context] | Short tokens like `lifecycle` and `git` are a locked contract and should not be redefined module by module. [VERIFIED: phase context] |

**Key insight:** Phase 75 already has the right extension seams in the codebase; the planner should connect them, not introduce a new logging subsystem or a broad direct-spawn rewrite. [VERIFIED: codebase grep]

## Common Pitfalls

### Pitfall 1: The roadmap example uses `open`, but `openWorkspace()` does not call `workspace-lifecycle.ts` or `workspace-git.ts`
**What goes wrong:** A plan assumes `git-stacks open <ws>` naturally exercises the two target modules, then writes command tests that never touch them. [VERIFIED: codebase grep]
**Why it happens:** `openWorkspace()` lives in `workspace-ops.ts` and currently uses `workspace-env.ts`, `lifecycle.ts`, integrations, and git helpers directly. [VERIFIED: codebase grep]
**How to avoid:** Keep seam coverage for `workspace-lifecycle.ts` and `workspace-git.ts` at unit level, and treat `open` as a structured-debug smoke test only if the fixture deliberately exercises hook subprocesses. [VERIFIED: codebase grep] [ASSUMED]
**Warning signs:** The command-level test passes without any lifecycle/git-category lines ever appearing. [VERIFIED: codebase grep] [ASSUMED]

### Pitfall 2: Placeholder `_exec` objects look compliant but do not isolate anything
**What goes wrong:** A module exports `_exec`, but no production path uses it, so tests still depend on deeper mocks or real subprocesses. [VERIFIED: codebase grep]
**Why it happens:** `workspace-git.ts` currently exports an empty forward-compatible seam while real work is delegated to `git.ts`. [VERIFIED: codebase grep]
**How to avoid:** Decide explicitly whether Phase 75 keeps the git seam contractual-only or adds at least one production use site; do not leave that ambiguous in the plan. [VERIFIED: codebase grep] [ASSUMED]
**Warning signs:** `_exec.spawn` can be replaced in tests but no assertion ever proves it was called. [VERIFIED: codebase grep] [ASSUMED]

### Pitfall 3: Structured output becomes multi-line or JSON-only
**What goes wrong:** The formatter emits raw JSON blobs or allows embedded newlines in `msg`, making stderr harder to scan and harder to filter with shell tools. [VERIFIED: phase context] [ASSUMED]
**Why it happens:** Current output is a simple single-line label formatter; moving to structured fields adds temptation to dump raw objects. [VERIFIED: codebase grep]
**How to avoid:** Keep the final formatter line-oriented and sanitize or collapse newline-bearing fields before rendering. [VERIFIED: phase context] [ASSUMED]
**Warning signs:** `stderr` lines span multiple rows or contain wrapped object inspections. [ASSUMED]

### Pitfall 4: Module filters are implemented outside observability helpers
**What goes wrong:** Commands or domain modules start checking env vars directly, which fractures behavior and breaks backward compatibility. [VERIFIED: phase context] [VERIFIED: codebase grep]
**Why it happens:** `GS_DEBUG` looks simple enough to parse inline. [ASSUMED]
**How to avoid:** Keep `src/index.ts` as the only bootstrap point and `src/lib/observability.ts` as the only selector interpreter. [VERIFIED: codebase grep] [VERIFIED: phase context]
**Warning signs:** `process.env.GS_DEBUG` starts appearing in multiple source files. [VERIFIED: codebase grep] [ASSUMED]

## Code Examples

Verified patterns from current sources:

### Existing stderr sink ownership
```typescript
// Source: src/lib/observability.ts
return getStreamSink(
  new WritableStream<Uint8Array>({
    start() {
      writer = Bun.stderr.writer()
    },
    write(chunk) {
      writer ??= Bun.stderr.writer()
      writer.write(chunk)
    },
  }),
  {
    formatter: (record) => `[${renderCategory(record.category)}] ${renderMessage(record)}`,
  }
)
```

### Existing canonical spawn seam
```typescript
// Source: src/lib/lifecycle.ts
export const _exec = {
  spawn: (args) => {
    const proc = spawn(args.cmd, {
      cwd: args.cwd,
      env: args.env,
      stdout: args.stdout,
      stderr: args.stderr,
    })
    return {
      exited: proc.exited,
      stdout: args.stdout === "pipe" ? (proc.stdout ?? null) : null,
      stderr: args.stderr === "pipe" ? (proc.stderr ?? null) : null,
    }
  },
}
```

### Existing disabled-path timing guard
```typescript
// Source: src/lib/observability.ts
export function timeOperation<T>(
  category: string,
  operation: string,
  run: () => T | Promise<T>
): T | Promise<T> {
  if (!enabled) {
    return run()
  }
  const startedAt = performance.now()
  // ...
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `GIT_STACKS_DEBUG=1` toggles all debug output and prints label-style lines like `[workspace-status] getWorkspaceListInfo: 12ms`. [VERIFIED: CHANGELOG.md] | `GS_DEBUG` token selectors plus structured single-line stderr fields are the Phase 75 target, while `GIT_STACKS_DEBUG=1` stays as a compatibility alias. [VERIFIED: phase context] | Planned for Phase 75 on 2026-04-05. [VERIFIED: phase context] | Debug stays stderr-only but becomes filterable by module and easier to grep or parse. [VERIFIED: phase context] [ASSUMED] |

**Deprecated/outdated:**
- `GIT_STACKS_DEBUG=1` as the only env contract is outdated for new docs once Phase 75 lands, but it remains accepted during the compatibility window. [VERIFIED: phase context]

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `workspace-lifecycle.ts` should export the same mutable `_exec` object reference used by `src/lib/lifecycle.ts` instead of duplicating spawn code. | Summary / Architecture Patterns | Low: if the team wants isolated executors per module, the plan needs a small seam-design adjustment. |
| A2 | When both vars are set, `GS_DEBUG` should take precedence over `GIT_STACKS_DEBUG`. | Architecture Patterns | Medium: precedence changes test expectations and user-facing docs. |
| A3 | The emitted `module` field should use the short token (`lifecycle`, `git`) rather than the internal category string (`workspace-lifecycle`, `workspace-git`). | Summary / Open Questions | Medium: if output uses internal names, filter docs and grep examples need different wording. |
| A4 | Command-level selector coverage should use a hook-rich `open` fixture or a different command that actually touches the targeted modules if the roadmap example proves too narrow. | Common Pitfalls / Validation Architecture | Medium: picking the wrong fixture could leave the success criteria under-tested. |

## Open Questions

1. **Should the output `module` field expose short tokens or internal category names?**
   - What we know: short tokens like `lifecycle` and `git` are locked for filter input. [VERIFIED: phase context]
   - What's unclear: the phase context does not explicitly say whether the rendered `module` field must be `lifecycle` or `workspace-lifecycle`. [VERIFIED: phase context]
   - Recommendation: use short tokens in output so filter input, docs, and stderr all share one user-facing vocabulary. [ASSUMED]

2. **How should the command-level acceptance test satisfy the roadmap's `open` example?**
   - What we know: `openWorkspace()` lives in `workspace-ops.ts` and does not route through `workspace-lifecycle.ts` or `workspace-git.ts`. [VERIFIED: codebase grep]
   - What's unclear: whether the roadmap example expects a hook-based lifecycle smoke test or just any command-level selector proof. [VERIFIED: codebase grep] [ASSUMED]
   - Recommendation: keep OBSV-01 and OBSV-02 at unit level, and use `open` only for structured stderr / selector smoke coverage with a deterministic fixture. [VERIFIED: codebase grep] [ASSUMED]

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Bun | Runtime, unit tests, CLI smoke tests | yes [VERIFIED: local environment] | `1.3.10` [VERIFIED: local environment] | None - project runtime is Bun. [VERIFIED: CLAUDE.md] |
| Git | Command-level fixtures and repo health checks | yes [VERIFIED: local environment] | `2.53.0` [VERIFIED: local environment] | None - many command tests create real git repos. [VERIFIED: codebase grep] |

**Missing dependencies with no fallback:**
- None. [VERIFIED: local environment]

**Missing dependencies with fallback:**
- None. [VERIFIED: local environment]

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | `bun:test` on Bun `1.3.10` plus repo runner isolation. [VERIFIED: local environment] [VERIFIED: CLAUDE.md] |
| Config file | `package.json` scripts plus `scripts/test-runner.ts`; no standalone Jest/Vitest config file is present. [VERIFIED: package.json] [VERIFIED: codebase grep] |
| Quick run command | `bun test tests/lib/observability.test.ts` or `bun test tests/lib/workspace-git.test.ts` while iterating. [VERIFIED: local execution] |
| Full suite command | `bun run test` and `bun run typecheck`. [VERIFIED: package.json] [VERIFIED: local execution] |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| OBSV-01 | `workspace-lifecycle.ts` exports and uses a mutable `_exec.spawn` seam for hook subprocess behavior. [VERIFIED: REQUIREMENTS.md] | unit | `bun test tests/lib/workspace-lifecycle.test.ts` | no - Wave 0 [VERIFIED: codebase grep] |
| OBSV-02 | `workspace-git.ts` exposes the matching seam contract without forcing real subprocesses in tests. [VERIFIED: REQUIREMENTS.md] | unit | `bun test tests/lib/workspace-git.test.ts` | yes [VERIFIED: codebase grep] |
| OBSV-03 | Structured stderr lines carry `op`, `module`, optional `repo`, optional `ms`, and `msg`. [VERIFIED: REQUIREMENTS.md] | unit + command | `bun test tests/lib/observability.test.ts` and `bun test tests/commands/debug-output.test.ts` | yes [VERIFIED: codebase grep] |
| OBSV-04 | `GS_DEBUG=lifecycle,git` restricts emitted modules to the named tokens. [VERIFIED: REQUIREMENTS.md] | command | `bun test tests/commands/debug-output.test.ts` or a new dedicated open-debug file. [VERIFIED: codebase grep] | partial - existing file, missing selector cases [VERIFIED: codebase grep] |
| OBSV-05 | `GS_DEBUG=1`, `GS_DEBUG=true`, and legacy `GIT_STACKS_DEBUG=1` all preserve all-module behavior. [VERIFIED: REQUIREMENTS.md] | unit + command | `bun test tests/lib/observability.test.ts` and `bun test tests/commands/debug-output.test.ts` | partial - existing files, missing new env cases [VERIFIED: codebase grep] |

### Sampling Rate
- **Per task commit:** `bun test tests/lib/observability.test.ts` plus the single relevant module test file. [VERIFIED: local execution]
- **Per wave merge:** `bun run test`. [VERIFIED: package.json]
- **Phase gate:** `bun run test` and `bun run typecheck` before `/gsd-verify-work`. [VERIFIED: package.json] [VERIFIED: local execution]

### Wave 0 Gaps
- [ ] `tests/lib/workspace-lifecycle.test.ts` - new seam-focused coverage for `_exec.spawn` replacement and hook call shapes. [VERIFIED: codebase grep]
- [ ] `tests/lib/observability.test.ts` - add selector parsing, legacy alias compatibility, and structured field rendering assertions. [VERIFIED: codebase grep]
- [ ] `tests/commands/debug-output.test.ts` or `tests/commands/open-debug-output.test.ts` - add `GS_DEBUG=1`, `GS_DEBUG=true`, token filtering, and backward-compat alias coverage. [VERIFIED: codebase grep]

## Security Domain

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no [VERIFIED: codebase grep] | Not in scope for this phase. [VERIFIED: codebase grep] |
| V3 Session Management | no [VERIFIED: codebase grep] | Not in scope for this phase. [VERIFIED: codebase grep] |
| V4 Access Control | no [VERIFIED: codebase grep] | Not in scope for this phase. [VERIFIED: codebase grep] |
| V5 Input Validation | yes [VERIFIED: phase context] | Normalize `GS_DEBUG` tokens centrally and reject or ignore unknown selectors deterministically. [VERIFIED: phase context] [ASSUMED] |
| V6 Cryptography | no [VERIFIED: codebase grep] | Not in scope for this phase. [VERIFIED: codebase grep] |

### Known Threat Patterns for this stack
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Multi-line log injection through `msg` or inspected values | Tampering | Keep the formatter single-line and escape or collapse newlines before writing to stderr. [VERIFIED: phase context] [ASSUMED] |
| Debug noise breaking JSON or human stdout contracts | Denial of Service | Preserve stderr-only routing and keep command stdout untouched. [VERIFIED: phase context] [VERIFIED: CHANGELOG.md] |
| Confusing env precedence exposing more debug than intended | Information Disclosure | Define and test one precedence rule for `GS_DEBUG` versus the legacy alias. [VERIFIED: phase context] [ASSUMED] |

## Sources

### Primary (HIGH confidence)
- [src/index.ts](/home/nnex/dev/prj/git-stacks/src/index.ts) - current observability bootstrap and `manage` silencing behavior. [VERIFIED: codebase grep]
- [src/lib/observability.ts](/home/nnex/dev/prj/git-stacks/src/lib/observability.ts) - current sink, formatter, disabled fast path, and timing helper. [VERIFIED: codebase grep]
- [src/lib/lifecycle.ts](/home/nnex/dev/prj/git-stacks/src/lib/lifecycle.ts) - canonical mutable `_exec.spawn` seam and `SpawnHandle` contract. [VERIFIED: codebase grep]
- [src/lib/workspace-lifecycle.ts](/home/nnex/dev/prj/git-stacks/src/lib/workspace-lifecycle.ts) - current lifecycle module behavior and absence of `_exec`. [VERIFIED: codebase grep]
- [src/lib/workspace-git.ts](/home/nnex/dev/prj/git-stacks/src/lib/workspace-git.ts) - placeholder seam and existing structured-debug call sites. [VERIFIED: codebase grep]
- [tests/lib/observability.test.ts](/home/nnex/dev/prj/git-stacks/tests/lib/observability.test.ts) - current observability unit coverage. [VERIFIED: codebase grep]
- [tests/commands/debug-output.test.ts](/home/nnex/dev/prj/git-stacks/tests/commands/debug-output.test.ts) - current stderr separation coverage. [VERIFIED: codebase grep]
- `npm view @logtape/logtape version time --json` - current published version `2.0.5` and publish time `2026-03-23`. [VERIFIED: npm registry]
- [node_modules/@logtape/logtape/dist/record.d.ts](/home/nnex/dev/prj/git-stacks/node_modules/@logtape/logtape/dist/record.d.ts) - `LogRecord.properties` and category/message fields. [VERIFIED: npm package types]
- [node_modules/@logtape/logtape/dist/sink.d.ts](/home/nnex/dev/prj/git-stacks/node_modules/@logtape/logtape/dist/sink.d.ts) - `getStreamSink()` and custom formatter support. [VERIFIED: npm package types]

### Secondary (MEDIUM confidence)
- [CHANGELOG.md](/home/nnex/dev/prj/git-stacks/CHANGELOG.md) - current public debug behavior and prior `_exec` testing rationale. [VERIFIED: CHANGELOG.md]
- [CLAUDE.md](/home/nnex/dev/prj/git-stacks/CLAUDE.md) - project workflow, test, and seam conventions. [VERIFIED: CLAUDE.md]

### Tertiary (LOW confidence)
- None. All unverified recommendations are listed explicitly in the assumptions log. [VERIFIED: this document]

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - existing dependency set, installed package types, and npm registry data all agree. [VERIFIED: package.json] [VERIFIED: npm registry]
- Architecture: MEDIUM - the core extension path is clear, but the roadmap's `open` example does not line up cleanly with the two target modules. [VERIFIED: codebase grep]
- Pitfalls: MEDIUM - most are grounded in current code/test structure, but a few acceptance-test details depend on unresolved selector/output decisions. [VERIFIED: codebase grep] [ASSUMED]

**Research date:** 2026-04-05 [VERIFIED: local environment]
**Valid until:** 2026-05-05 [ASSUMED]
