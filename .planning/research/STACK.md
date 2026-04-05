# Stack Research

**Domain:** Bun CLI tool — Core engine extraction and observability
**Researched:** 2026-04-05
**Confidence:** HIGH (LogTape verified against official docs + GitHub; DI pattern verified against existing codebase; pino Bun issues confirmed in pino issue tracker)

---

## Scope

This document covers **only what is new for the core engine extraction + observability milestone**. The base stack (Bun, TypeScript strict, Commander.js ^14.0.3, SolidJS + OpenTUI, yaml ^2.8.3, @clack/prompts ^1.2.0, Zod ^4.3.6) is unchanged and not re-researched.

**Three capability areas this milestone adds:**

1. **Module extraction** — splitting `workspace-ops.ts` (1,735 lines) into domain modules
2. **Dependency injection** — injectable boundaries for shell/process/filesystem operations
3. **Structured logging** — debug-level observability without polluting CLI output

---

## Recommended Stack

### Core Technologies (new additions only)

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| `@logtape/logtape` | ^2.0.5 | Structured logging | Zero dependencies, Bun-native, library-first design means no-op when unconfigured — libraries can log without imposing on consumers; works identically in Bun with `bun add` |

No additional framework additions for DI or module extraction — see rationale below.

### Supporting Libraries

None recommended. The patterns below use TypeScript interfaces and mutable object injection (already established in the codebase) rather than DI frameworks.

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| None new | — | Module extraction is pure TypeScript refactoring; no new tooling required |

---

## Installation

```bash
# Structured logging (only new dependency)
bun add @logtape/logtape
```

---

## Pattern: Module Extraction (No New Dependencies)

`workspace-ops.ts` contains logically distinct domains that can be split into separate files without any new tooling:

| Proposed Module | Current Functions | Rationale |
|-----------------|-------------------|-----------|
| `workspace-env.ts` | `mergeEnv`, `buildBaseEnv`, `buildRepoEnv`, `resolveWorkspaceEnvVars`, `buildWorkspaceEnv`, `writeEnvFiles` | Pure env assembly, no git I/O |
| `workspace-status.ts` | `getWorkspaceStatus`, `getDirtyWorktrees`, `getWorkspaceListInfo` | Read-only status queries |
| `workspace-lifecycle.ts` | `openWorkspace`, `closeWorkspace`, `cleanWorkspace`, `removeWorkspace`, `mergeWorkspace` | Stateful lifecycle with hooks |
| `workspace-git.ts` | `pushWorkspace`, `syncWorkspace`, `pullWorkspace` | Remote git operations |
| `workspace-rename.ts` | `renameWorkspace`, `renameTemplate` | Cross-file rename operations |
| `workspace-edit.ts` | `editWorkspaceYaml`, `editTemplateYaml`, `editGlobalConfigYaml`, `editRegistryYaml`, `openYamlInEditor` | Editor launch operations |
| `workspace-detect.ts` | `detectWorkspaceFromCwd` | CWD-based resolution |

**Extraction approach:** Named exports from each domain module, re-exported from `workspace-ops.ts` barrel during transition (preserves all existing import sites without a big-bang rename). Commands in `src/commands/workspace.ts` import from `workspace-ops.ts` unchanged.

---

## Pattern: Dependency Injection (No New Dependencies)

The codebase already uses the `_exec` mutable object pattern in `lifecycle.ts`, `niri.ts`, `tmux.ts`, `cmux.ts`, and `aerospace.ts`. This is the established DI idiom — extend it, do not replace it.

**What already works:**
```typescript
// Existing pattern (lifecycle.ts, niri.ts, etc.)
export const _exec = {
  spawn: (args: ...) => Bun.spawn(args),
}
// Tests replace _exec.spawn without mock.module() complexity
```

**What to add for extracted modules:**

Each domain module that shells out should export its own `_exec` object:

```typescript
// workspace-git.ts
export const _exec = {
  git: (args: string[], cwd: string) => $`git -C ${cwd} ${args}`.quiet().nothrow(),
}
```

**What NOT to add:** A DI container (tsyringe, InversifyJS, etc.). Decorator-based DI requires `experimentalDecorators` or `emitDecoratorMetadata` which conflict with Bun's zero-build TypeScript execution and TypeScript ^6.x. The mutable object export pattern achieves the same testability with zero overhead.

---

## Pattern: Structured Logging with LogTape

**Why LogTape over pino:**

- **Pino has known Bun incompatibilities** — pino uses worker threads for async transport; `bun-plugin-pino` exists specifically to work around bundling issues; pino maintainers explicitly state they target Node.js only (confirmed in issue #2060 closure: "file issues with the runtime if you are not using Node.js")
- **LogTape is zero-dependency, Bun-native** — `bun add @logtape/logtape`, no plugins, no bundler workarounds
- **Library-first design** — `getLogger()` calls in library code produce no output if the application doesn't call `configure()`. This fits git-stacks exactly: structured logging added to domain modules, active only when `GIT_STACKS_DEBUG=1` is set

**Integration pattern for git-stacks:**

```typescript
// src/lib/logger.ts (new file — ~20 lines)
import { configure, getConsoleSink, configureSync } from "@logtape/logtape"

export function setupLogging() {
  if (!process.env.GIT_STACKS_DEBUG) return
  configureSync({
    sinks: { stderr: getConsoleSink({ stream: process.stderr }) },
    loggers: [{ category: ["git-stacks"], lowestLevel: "debug", sinks: ["stderr"] }],
  })
}

// src/index.ts — one line at startup
import { setupLogging } from "./lib/logger"
setupLogging()
```

**Usage in domain modules:**

```typescript
// workspace-lifecycle.ts
import { getLogger } from "@logtape/logtape"
const logger = getLogger(["git-stacks", "lifecycle"])

export async function openWorkspace(...) {
  logger.debug("opening workspace {name}", { name })
  // ...
}
```

**No output by default** — `getLogger()` is a no-op when `configure()` hasn't been called. Zero performance impact on normal CLI invocations.

---

## Alternatives Considered

| Recommended | Alternative | Why Not |
|-------------|-------------|---------|
| LogTape ^2.0.5 | pino ^10.3.1 | Pino uses worker threads; known Bun incompatibilities; requires `bun-plugin-pino` workaround; Node.js-only maintainer stance |
| LogTape ^2.0.5 | winston ^3.x | Winston is heavy (no zero-dep), designed for server-side transports, no Bun-specific support |
| LogTape ^2.0.5 | `debug` npm package | debug is fine for simple namespaced output but lacks structured data fields; LogTape produces parseable JSON when needed |
| Mutable `_exec` exports | tsyringe / InversifyJS | Decorator DI requires `experimentalDecorators`; conflicts with TypeScript ^6.x and Bun's direct TS execution; far heavier than a mutable object property swap |
| Mutable `_exec` exports | Manual constructor injection | Functions (not classes) dominate workspace-ops.ts; constructor injection would require converting all exported functions to methods — large rewrite with no net gain |

---

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| pino | Worker thread transport model incompatible with Bun; requires `bun-plugin-pino` bundler plugin; maintainers won't support Bun | LogTape ^2.0.5 |
| tsyringe / InversifyJS | Requires `experimentalDecorators` and `emitDecoratorMetadata` which conflict with Bun's zero-build TS execution and TypeScript ^6.x; overkill for a CLI | Existing `_exec` mutable object pattern |
| Barrel `index.ts` for new domain modules | Existing codebase convention explicitly avoids barrel files (CLAUDE.md: "No barrel files except `src/lib/integrations/index.ts`") | Direct imports from named module files |
| Renaming all import sites simultaneously | Big-bang rename breaks git blame and creates massive diff; hard to review | Re-export from `workspace-ops.ts` during transition; migrate callsites per-phase |

---

## Version Compatibility

| Package | Compatible With | Notes |
|---------|-----------------|-------|
| `@logtape/logtape@^2.0.5` | Bun (any current) | No Node.js-specific deps; uses standard `console`, `process.stderr` |
| `@logtape/logtape@^2.0.5` | TypeScript ^6.0.2 | Pure TypeScript, no decorators required |
| `@logtape/logtape@^2.0.5` | Existing deps (zod, yaml, commander) | No conflicts; zero dependencies |

---

## Sources

- https://logtape.org/manual/config — configuration API, `configureSync()`, sink setup (HIGH confidence — official docs)
- https://logtape.org/manual/struct — structured logging API, `getLogger()`, template literal syntax (HIGH confidence — official docs)
- https://github.com/dahlia/logtape — version 2.0.5 confirmed latest stable; Bun install command `bun add @logtape/logtape` (HIGH confidence — official repo)
- https://logtape.org/comparison — performance comparison vs pino/winston; library-first philosophy rationale (HIGH confidence — official docs)
- https://github.com/pinojs/pino/issues/2060 — pino maintainer explicitly closes Bun/Deno issues as out of scope (HIGH confidence — upstream issue tracker)
- https://github.com/vktrl/bun-plugin-pino — workaround plugin existence confirms pino Bun incompatibility is real (MEDIUM confidence — third-party)
- Existing codebase (`src/lib/lifecycle.ts`, `src/lib/niri.ts`) — `_exec` mutable object DI pattern already in production (HIGH confidence — direct source read)

---

*Stack research for: git-stacks core engine extraction + observability*
*Researched: 2026-04-05*
