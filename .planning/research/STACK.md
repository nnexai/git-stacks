# Stack Research

**Domain:** Bun CLI tool — Engine hardening and template labels (v0.17.0)
**Researched:** 2026-04-05
**Confidence:** HIGH (all decisions verified against official docs, existing codebase, or npm registry)

---

## Scope

This document covers **only what is new for the v0.17.0 milestone**. The base stack (Bun, TypeScript strict ^6.0.2, Commander.js ^14.0.3, SolidJS + OpenTUI, yaml ^2.8.3, @clack/prompts ^1.2.0, Zod ^4.3.6, @logtape/logtape ^2.0.5) is unchanged and not re-researched.

**Four capability areas this milestone adds:**

1. **Template labels → workspace propagation** — schema extension only; label copy at `new`/`clone` time
2. **Operation runner with rollback** — structured step execution with compensating transactions
3. **Indexed config store** — replace O(n) scan-based YAML lookups with O(1) in-memory Map
4. **Integration plugin contracts** — runtime-enforced capability declarations on the `Integration` interface
5. **Broader DI + structured logging** — extend `_exec` pattern and LogTape usage to new modules

---

## Verdict: No New Dependencies

All four feature areas are implementable with what is already installed. The additions are **purely structural patterns** in TypeScript.

This is the key finding: adding libraries for a rollback runner (Temporal, a saga framework) or a config store (a key-value library) would impose runtime overhead and operational complexity on a CLI tool where sub-100ms startup is critical. The patterns map cleanly to plain TypeScript.

---

## Recommended Stack

### Core Technologies (unchanged)

| Technology | Version | Purpose | Status |
|------------|---------|---------|--------|
| Bun | latest | Runtime, shell, test runner | Unchanged |
| TypeScript | ^6.0.2 | Type system | Unchanged |
| Zod | ^4.3.6 | Schema validation — used for plugin contract schemas | Already in use; v4 features unlock contract registration |
| yaml | ^2.8.3 | Config I/O | Unchanged |
| @logtape/logtape | ^2.0.5 | Structured logging — extend to operation runner and config store | Already installed; extend usage |

### New Dependencies

None.

---

## Pattern: Template Labels → Workspace Propagation

**What it is:** `Template.labels` already exists in the Zod schema (line 106 of `config.ts`). `Workspace.labels` also exists (line 186). The gap is that `newWorkspace()` in `workspace-lifecycle.ts` does not copy template labels to the workspace at creation time.

**What to add:**

No schema changes. The copy happens in `workspace-lifecycle.ts` inside `newWorkspace()`:

```typescript
// At workspace creation, merge template labels (dedup)
const inherited = template?.labels ?? []
const explicit = options.labels ?? []
workspace.labels = [...new Set([...inherited, ...explicit])]
```

**Why no library:** This is a three-line array merge. The label data model, schema, and storage are already complete.

---

## Pattern: Operation Runner with Rollback

**What it is:** A lightweight step executor that runs an ordered list of operations and, on failure, calls compensating functions in reverse order for any completed steps.

**Why not a saga framework or Temporal:** This is a local CLI process, not a distributed system. Saga frameworks designed for microservices (Temporal, NestJS sagas) bring async queues, worker processes, and durable execution — none of which apply to a process that lives for under a second. The Command pattern with explicit compensate functions is sufficient and already idiomatic in the codebase's discriminated union error style.

**Interface pattern (zero dependencies):**

```typescript
// src/lib/operations.ts

export interface OperationStep<T = void> {
  name: string
  run: () => Promise<T>
  rollback?: () => Promise<void>
}

export type OperationResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string; rolledBack: boolean }

export async function runWithRollback<T>(
  steps: OperationStep<T>[]
): Promise<OperationResult<T>> {
  const completed: OperationStep<unknown>[] = []
  try {
    let last: T = undefined as T
    for (const step of steps) {
      last = await step.run()
      completed.push(step)
    }
    return { ok: true, value: last }
  } catch (err) {
    // Compensate in reverse
    for (const step of [...completed].reverse()) {
      if (step.rollback) await step.rollback().catch(() => {})
    }
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      rolledBack: true,
    }
  }
}
```

**Integration with LogTape:** The runner logs each step start/completion/failure using the existing `timeOperation()` wrapper in `observability.ts`. No changes to the logging system needed.

**File location:** `src/lib/operations.ts` — single new file, ~40 lines.

---

## Pattern: Indexed Config Store

**What it is:** Replace `listTemplates()` and `listWorkspaces()` in `config.ts` (which `readdirSync` and parse every YAML file on every call) with an in-memory `Map` keyed by name. The store is populated once per process on first access, with explicit invalidation on writes.

**Why not a key-value library (LevelDB, better-sqlite3, etc.):** The dataset is tiny (dozens of files, kilobytes of YAML). The bottleneck is filesystem I/O + Zod parse, not the lookup itself. A `Map<string, Template>` eliminates the repeat `readdirSync` + `readFileSync` + `parse` + `safeParse` cycle on repeated operations (e.g., `status --all` calls `listWorkspaces()` multiple times). A database would add a persistent file, migration logic, and startup overhead for zero gain.

**Interface pattern:**

```typescript
// src/lib/config-store.ts

let workspaceCache: Map<string, Workspace> | null = null
let templateCache: Map<string, Template> | null = null

export function getWorkspaceIndex(): Map<string, Workspace> {
  if (!workspaceCache) workspaceCache = buildWorkspaceIndex()
  return workspaceCache
}

export function invalidateWorkspaceIndex(): void {
  workspaceCache = null
}

// config.ts write functions call invalidateWorkspaceIndex() after writeYaml()
```

**Lookup path:** `getWorkspaceIndex().get(name)` — O(1), replaces `listWorkspaces().find(w => w.name === name)`.

**Invalidation:** Called in `writeWorkspace()`, `removeWorkspace()`, and `renameWorkspace()` after each write. No cache persistence across processes — CLI is short-lived; the cost of a cold read on startup is negligible vs. eliminating repeated re-reads within a single invocation.

**File location:** Either a new `src/lib/config-store.ts` or a module-level cache within `config.ts` behind exported invalidation functions. The latter is lower complexity.

---

## Pattern: Integration Plugin Contracts

**What it is:** Formal capability declarations on the `Integration` interface that let the runner introspect what an integration supports without duck-typing or try/catch around optional method calls. Also: Zod-backed validation of integration config objects at `configure` time rather than at `open` time.

**What already exists:** The `Integration` interface in `src/lib/integrations/types.ts` already uses optional methods (`applies?`, `generate?`, `cleanup?`, `commands?`, `windowDetector?`). The contract gap is that config validation is deferred to each plugin's internal parse at `open()` time, and there's no standard way for the runner to know which capabilities a plugin declares.

**What to add — capability flags:**

```typescript
// src/lib/integrations/types.ts additions

export type IntegrationCapability =
  | "generate"     // has generate() method
  | "cleanup"      // has cleanup() method
  | "commands"     // registers subcommands
  | "window-detect" // has windowDetector

export interface Integration {
  // ... existing fields ...

  /** Declare capabilities statically. Runner uses this instead of duck-typing. */
  capabilities: ReadonlyArray<IntegrationCapability>

  /** Validate and parse this integration's config from globalConfig.integrations[id].
   *  Returns parsed config or throws ZodError. Called by runner before open(). */
  parseConfig(raw: unknown): Record<string, unknown>
}
```

**What to add — Zod schema per integration:**

Each plugin defines a `z.object({...})` schema for its config and exposes `parseConfig(raw) { return MyConfigSchema.parse(raw) }`. The runner calls `parseConfig()` during `runIntegrations()` and surfaces validation errors as structured failures before any side effects occur.

**Why Zod and not a custom validator:** Zod ^4.3.6 is already the project's validation layer. The `z.discriminatedUnion()` improvements and metadata registry in Zod 4 are available if needed for complex config shapes. No new dependency.

**File impact:** Add `capabilities` and `parseConfig` to `Integration` interface (types.ts). Update each of the 10 plugin files to implement `parseConfig`. Update `runner.ts` to call `parseConfig` before `generate`/`open`. The 10 plugin updates are mechanical.

---

## Pattern: Broader DI + Structured Logging

**DI extension:** The `_exec` mutable object pattern is already established in `lifecycle.ts`, `niri.ts`, `tmux.ts`, `cmux.ts`, `aerospace.ts`. The v0.17.0 additions (operations runner, config-store invalidation hooks) should follow the same pattern:

```typescript
// src/lib/operations.ts
export const _exec = {
  // Override in tests to simulate step failures or rollback errors
  runStep: async <T>(step: OperationStep<T>): Promise<T> => step.run(),
}
```

No new DI library. No decorators. The pattern is simple, test-isolated, and consistent with the established codebase idiom documented in CLAUDE.md.

**LogTape extension:** LogTape ^2.0.5 is already installed and configured. Extend `timeOperation()` from `observability.ts` to the new `runWithRollback()` function:

```typescript
// In operations.ts — reuse existing timeOperation
import { timeOperation, logDebug } from "./observability"

for (const step of steps) {
  await timeOperation("operations", `step:${step.name}`, () => step.run())
  // ...
}
```

The `withContext()` API (available in LogTape 2.x via `AsyncLocalStorage`) is available for correlating all log records within a single `runWithRollback()` invocation under a shared `operationId`. This is optional for v0.17.0 but requires no new dependency — it is part of the installed `@logtape/logtape@^2.0.5`.

**API reference:** `withContext({ operationId }, async () => { ... })` from `@logtape/logtape` — the `contextLocalStorage` option must be set in `configure()` to activate implicit context propagation.

---

## Alternatives Considered

| Recommended | Alternative | Why Not |
|-------------|-------------|---------|
| Plain `Map` in config-store | LevelDB / better-sqlite3 | Persistent DB is overkill for dozens of YAML files; adds migration logic; longer startup; `Map` invalidation is simpler |
| Plain `Map` in config-store | Redis / Bun KV | No network infrastructure in a local CLI tool |
| Handwritten `runWithRollback` | Temporal / NestJS sagas | Distributed workflow engines for microservices; wrong abstraction layer for a CLI process |
| Handwritten `runWithRollback` | xstate (state machines) | Statechart overhead for a linear step sequence; adds a heavy dependency |
| Zod `parseConfig()` per plugin | JSON Schema validation | Zod already present; switching to JSON Schema would add a second validation library |
| Capability flags on `Integration` | Runtime duck-typing | Duck-typing with `'generate' in plugin` works but is fragile across TypeScript strict mode changes; explicit declaration is clearer |

---

## What NOT to Add

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| Temporal / Inngest | Durable execution requires external server; wrong for a local CLI | Handwritten `runWithRollback()` in `src/lib/operations.ts` |
| xstate | State machine abstraction adds cognitive overhead and bundle size for a linear step runner | Plain step array with compensate functions |
| better-sqlite3 or any embedded DB | Schema migrations, binary dependency, startup cost — all for a dataset of dozens of records | Module-level `Map` with explicit invalidation |
| tsyringe / InversifyJS | Requires `experimentalDecorators`; conflicts with Bun's zero-build TS execution and TypeScript ^6.x | Existing `_exec` mutable object pattern |
| New logging library | LogTape 2.0.5 already installed; `withContext()` for correlation is built-in | Extend existing `timeOperation()` and `logDebug()` calls |

---

## Version Compatibility

| Package | Zod | LogTape | Bun | TypeScript |
|---------|-----|---------|-----|------------|
| Current `@logtape/logtape@^2.0.5` | No dependency | N/A | Compatible (zero Node-specific deps) | Compatible (no decorators) |
| Current `zod@^4.3.6` | N/A | No dependency | Compatible | Compatible |
| Proposed `src/lib/operations.ts` | Uses Zod discriminated unions for result type | Uses `timeOperation()` | Bun native | strict mode |
| Proposed `src/lib/config-store.ts` | Reuses existing Zod-validated read functions | Uses `logDebug()` | Bun native | strict mode |

---

## Sources

- `bun.lock` (project file) — confirms `@logtape/logtape@2.0.5` and `zod@4.3.6` installed (HIGH confidence — direct file read)
- `src/lib/config.ts` — confirmed `Template.labels` and `Workspace.labels` already in Zod schemas at lines 106 and 186 (HIGH confidence — direct source read)
- `src/lib/integrations/types.ts` — confirmed current `Integration` interface structure; capability gaps identified (HIGH confidence — direct source read)
- `src/lib/observability.ts` — confirmed `timeOperation()`, `logDebug()` API available for reuse (HIGH confidence — direct source read)
- https://logtape.org/manual/contexts — `withContext()` API and `AsyncLocalStorage` integration for implicit context propagation in LogTape 2.x (HIGH confidence — official docs)
- https://logtape.org/changelog — version 2.0.5 released 2026-03-24 is latest stable (HIGH confidence — official changelog, confirmed by `bun.lock`)
- https://zod.dev/v4 — Zod 4 discriminated union composition, metadata registry, `z.toJSONSchema()` for plugin contract schemas (HIGH confidence — official release notes)
- https://github.com/dahlia/logtape/discussions/133 — LogTape 2.0.0 discussion confirming async lazy evaluation and dynamic context values (MEDIUM confidence — official maintainer discussion)

---

*Stack research for: git-stacks v0.17.0 engine hardening and template labels*
*Researched: 2026-04-05*
