# Phase 17: integration-runner - Research

**Researched:** 2026-03-21
**Domain:** TypeScript module refactor — integration loop consolidation with tier-based ordering
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
None — pure infrastructure phase. All implementation choices are at Claude's discretion.

### Claude's Discretion
All implementation choices are at Claude's discretion — pure infrastructure phase

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| ORCH-03 | Integration execution uses three-tier ordering: independent setup (tier 1), partial side-effects (tier 2), window management (tier 3) | Runner sorts integrations by `order` field before iteration; established ordering from STATE.md decisions |
| ORCH-04 | Tier assignment is per-integration with extensible numeric priority (not hardcoded to niri) | `order` field added to `Integration` interface in `types.ts`; concrete values assigned to all four existing integrations |
| ORCH-05 | Four duplicated integration loops consolidated into a single runner module | `src/lib/integrations/runner.ts` replaces loops in workspace-ops.ts:574, workspace-wizard.ts:459, workspace-clone.ts:166, App.tsx:790 |
| ORCH-06 | Runner supports both generate-only mode (TUI callers) and generate+open mode (workspace-ops, CLI) | Two exported functions: `runIntegrationGenerate()` and `runIntegrations()` |
| ORCH-07 | Existing `--no-ide`/`--no-cmux` skip flags preserved through runner consolidation | `runIntegrations()` accepts `skip: Set<string>` parameter; callers pass the same skip set they build today |
| TEST-02 | Integration runner has unit tests for artifact accumulation, tier ordering, and skip-flag behavior | `tests/lib/integrations/runner.test.ts` with `mock.module("@/lib/integrations/index")` pattern |
</phase_requirements>

## Summary

Phase 17 is a pure structural refactor — no behavior changes, no new external dependencies. The goal is to extract four nearly-identical integration-loop patterns scattered across the codebase into a single `src/lib/integrations/runner.ts` module that also enforces tier-based ordering.

The four existing loops differ along two axes: (1) whether they call `open()` after `generate()` and accumulate an `ArtifactBag`, and (2) whether they accept a `skip` set. The `workspace-ops.ts` loop (line 574) is the full generate+open loop with ArtifactBag and skip support. The three TUI loops (`workspace-wizard.ts:459`, `workspace-clone.ts:166`, `App.tsx:790`) are generate-only loops with no ArtifactBag, no skip set, and no `open()` calls.

The tier ordering requirement (ORCH-03/ORCH-04) means adding a numeric `order` field to the `Integration` interface in `types.ts`, assigning values to all four existing integrations (vscode/intellij = tier 1, cmux = tier 2 as decided in STATE.md), and having the runner sort by this field before iterating. The planner should treat the `types.ts` change and the `runner.ts` creation as distinct tasks since both are required before the caller updates can land.

**Primary recommendation:** Add `order: number` to the `Integration` interface, assign tier values to existing integrations, create `runner.ts` with `runIntegrationGenerate()` and `runIntegrations()`, then do a single wave replacing all four inline loops, followed by unit tests.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| bun:test | built-in (Bun) | Test runner with mock.module | Already used across all test files in this project |
| TypeScript | project-defined | Module and interface typing | Project uses TypeScript throughout |

No new npm dependencies are needed for this phase. Everything required already exists in the project.

**Installation:** none required

## Architecture Patterns

### Existing Loop Pattern (generate+open, from workspace-ops.ts:574)
```typescript
const ctx: IntegrationContext = { workspace, tasksDir, config }
const bag: ArtifactBag = {}

for (const integration of integrations) {
  if (skip.has(integration.id)) continue
  if (!integration.isEnabled(ctx)) continue
  if (integration.applies && !integration.applies(workspace)) continue
  const artifactPath = integration.generate?.(ctx) ?? null
  const artifact = await integration.open(ctx, artifactPath, bag)
  bag[integration.id] = artifact
}
```

### Existing Loop Pattern (generate-only, from workspace-wizard.ts:459 and workspace-clone.ts:166)
```typescript
const ctx: IntegrationContext = { workspace: workspaceObj, tasksDir, config }
for (const integration of integrations) {
  if (!integration.isEnabled(ctx)) continue
  if (integration.applies && !integration.applies(workspaceObj)) continue
  const path = integration.generate?.(ctx) ?? null
  // path logged to UI; no open() call
}
```

### Existing Loop Pattern (generate-only without path result, from App.tsx:790)
```typescript
const ctx: IntegrationContext = { workspace: workspaceObj, tasksDir, config }
for (const integration of integrations) {
  if (!integration.isEnabled(ctx)) continue
  if (integration.applies && !integration.applies(workspaceObj)) continue
  integration.generate?.(ctx)
}
```

### Recommended runner.ts API
```typescript
// Source: derived from existing loop analysis

export interface RunGenerateResult {
  integration: Integration
  path: string | null
}

/**
 * Generate artifacts only — for TUI callers that need generate paths for display.
 * Runs integrations in ascending order field order.
 * Returns array of {integration, path} for callers that want to log results.
 */
export async function runIntegrationGenerate(
  ctx: IntegrationContext
): Promise<RunGenerateResult[]>

/**
 * Generate + open — for workspace-ops/CLI. Accumulates ArtifactBag.
 * Accepts skip set for --no-ide / --no-cmux flags.
 */
export async function runIntegrations(
  ctx: IntegrationContext,
  skip?: Set<string>
): Promise<ArtifactBag>
```

### Required types.ts change — add order field
```typescript
// In src/lib/integrations/types.ts, Integration interface:
export interface Integration {
  id: string
  label: string
  hint: string
  enabledByDefault: boolean
  /**
   * Numeric execution tier:
   *   tier 1 (10-19): independent setup — vscode, intellij
   *   tier 2 (20-29): partial side-effects — cmux
   *   tier 3 (30-39): window management — niri (future)
   * Runner sorts ascending before iteration.
   */
  order: number
  // ... existing methods unchanged
}
```

### Tier assignments for existing integrations
| Integration | Current array position | Tier | `order` value |
|-------------|----------------------|------|---------------|
| vscodeIntegration | 0 (first) | 1 — independent | 10 |
| intellijIntegration | 1 | 1 — independent | 11 |
| cmuxIntegration | 2 | 2 — partial side-effects | 20 |
| tmuxIntegration | 3 | 1 — independent | 12 |

**Note:** STATE.md establishes tmux as tier 1 and cmux as tier 2 (cmux may consume tmux artifacts in future per INT-01). The `order` values above reflect this, with cmux at 20 (tier 2) and tmux at 12 (tier 1, after vscode/intellij so IDE windows open first).

### Recommended project structure additions
```
src/lib/integrations/
  runner.ts             — NEW: runIntegrationGenerate() + runIntegrations()
  types.ts              — MODIFY: add order: number to Integration interface
  index.ts              — unchanged (just imports/re-exports)
  vscode.ts             — MODIFY: add order field
  intellij.ts           — MODIFY: add order field
  cmux.ts               — MODIFY: add order field
  tmux.ts               — MODIFY: add order field
tests/lib/integrations/
  runner.test.ts        — NEW: unit tests for runner
  wizard-helpers.test.ts — existing (no change needed)
```

### Caller changes
| File | Current pattern | Change required |
|------|----------------|-----------------|
| `src/lib/workspace-ops.ts:571-581` | inline generate+open loop with bag | Replace with `const bag = await runIntegrations(ctx, skip)` |
| `src/tui/workspace-wizard.ts:456-465` | inline generate-only loop | Replace with `const results = await runIntegrationGenerate(ctx)` |
| `src/tui/workspace-clone.ts:163-172` | inline generate-only loop | Replace with `const results = await runIntegrationGenerate(ctx)` |
| `src/tui/dashboard/App.tsx:789-794` | inline generate-only loop, ignores path | Replace with `await runIntegrationGenerate(ctx)` |

**Note on wizard.ts and clone.ts path logging:** Both callers currently log `path` to the UI (`p.log.success`). The `RunGenerateResult[]` return value from `runIntegrationGenerate()` gives callers access to `{ integration, path }` pairs so they can replicate this logging.

### Anti-Patterns to Avoid
- **Passing integrations array as a parameter:** The runner should import from `@/lib/integrations/index` directly, not accept an array parameter. This avoids test friction and matches the rest of the codebase's import pattern.
- **Calling open() in generate-only mode:** The generate-only path must NOT call `open()` — TUI callers invoke this before asking the user if they want to open. The App.tsx caller also never calls open().
- **Hardcoding tier numbers as conditions:** Use the numeric `order` field and sort ascending — do not write `if (tier === 1)` branches.
- **Mutating integrations array order:** Sort a copy (`[...integrations].sort(...)`) — do not sort the exported array in place.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Mock integration registry in tests | Custom registry singleton with injection | `mock.module("@/lib/integrations/index", () => ({ integrations: fakeIntegrations }))` | Pattern already proven in `wizard-helpers.test.ts:50` |
| Tier string labels | Separate "tier" enum | Numeric `order` field | ORCH-04 explicitly says "extensible numeric priority, not hardcoded to niri" |
| Async mock for `open()` | Complex spy infrastructure | `mock(async () => null)` from bun:test | Sufficient for unit tests; open() is already async |

## Common Pitfalls

### Pitfall 1: App.tsx generate-only loop discards path
**What goes wrong:** The App.tsx integration loop at line 790 calls `integration.generate?.(ctx)` but discards the return value — it does not log paths. If the runner returns `RunGenerateResult[]` and the caller ignores it, this is fine. But if the runner is made to log internally, it will corrupt the OpenTUI screen.
**Why it happens:** App.tsx runs inside the OpenTUI TUI — any stdout/stderr corrupts the terminal rendering. The CLAUDE.md already notes `runHooksCaptured()` vs `runHooks()` for the same reason.
**How to avoid:** Runner must NOT call `p.log.*` or write to stdout/stderr internally. Logging stays in the callers (wizard.ts, clone.ts) which ARE in @clack/prompts context.
**Warning signs:** TUI screen garbling when `git-stacks manage` creates a workspace.

### Pitfall 2: bun:test mock.module cache ordering
**What goes wrong:** `mock.module("@/lib/integrations/index")` called in one test file affects all subsequent test files in the same bun test run — bun caches module mocks globally.
**Why it happens:** The `wizard-helpers.test.ts` comment (line 60-68) explicitly documents this: "Bun caches mock.module globally across test files; the first registration wins."
**How to avoid:** The runner test file must register its own `mock.module("@/lib/integrations/index")` at the top level (before any imports). Use query-parameter cache-busting (`"@/lib/integrations/runner?unit-test"`) when importing runner in tests to force fresh load.
**Warning signs:** Test passes in isolation but fails when run as part of full suite (`bun test tests/`).

### Pitfall 3: types.ts order field breaks Integration interface implementors
**What goes wrong:** Adding `order: number` as a required field to `Integration` breaks the fake integration objects in `wizard-helpers.test.ts` and any other test stubs.
**Why it happens:** TypeScript structural typing — existing fakes will fail to compile unless they add `order`.
**How to avoid:** Update all fake integration objects in tests. There are two in `wizard-helpers.test.ts` (lines 31-48). The runner test will create its own fakes and must include `order`.
**Warning signs:** TypeScript compile errors on `bun run typecheck` after adding the field.

### Pitfall 4: skip set not passed to runIntegrations
**What goes wrong:** `workspace-ops.ts` builds a `skip` Set from `--no-ide`/`--no-cmux` flags, then passes `opts` to `openWorkspace`. If the runner's `skip` parameter defaults to `new Set()` (empty), and the caller accidentally omits it, skip flags silently stop working.
**Why it happens:** Optional parameter with a safe default is easy to omit.
**How to avoid:** Test ORCH-07 explicitly: pass `skip = new Set(["vscode"])` to `runIntegrations()` and assert `vscode.open` was never called.
**Warning signs:** `git-stacks open --no-ide` still opens VSCode.

### Pitfall 5: generate() is optional on the Integration interface
**What goes wrong:** The `generate?` method is optional. Calling `integration.generate?.(ctx)` works, but tests must verify the runner uses optional chaining, not just calls it directly.
**Why it happens:** IntelliJ and vscode have generate, but a future integration might not. The runner's null-coalescence `?? null` is load-bearing.
**How to avoid:** Include at least one fake integration with no `generate` method in the runner tests and assert no error is thrown.

## Code Examples

Verified patterns from existing codebase:

### mock.module pattern (from wizard-helpers.test.ts:50)
```typescript
// Source: tests/lib/integrations/wizard-helpers.test.ts

mock.module("@/lib/integrations/index", () => ({
  integrations: fakeIntegrations,
}))
```

### Query-param cache-busting for fresh module load (from wizard-helpers.test.ts:65)
```typescript
// Source: tests/lib/integrations/wizard-helpers.test.ts

const { promptIntegrationOverrides } = await import(
  // @ts-ignore — query param cache-busting for bun module cache
  "@/lib/integrations/runner?unit-test"
)
```

### async mock for open() in runner tests
```typescript
// Pattern: bun:test mock() for async functions
import { mock } from "bun:test"

const mockOpen = mock(async (_ctx: unknown, _path: unknown, _bag: unknown) => null)
const fakeIntegrations = [
  {
    id: "vscode", label: "VSCode", hint: "", enabledByDefault: true,
    order: 10,
    isEnabled: () => true,
    generate: () => "/path/to/artifact",
    open: mockOpen,
    configurePrompt: async () => ({}),
  },
]
```

### Sort by order field (for runner.ts internals)
```typescript
// Defensive: sort a copy, never mutate the exported array
const sorted = [...integrations].sort((a, b) => a.order - b.order)
```

### How workspace-ops.ts open call will look post-refactor
```typescript
// Current (lines 571-581)
const ctx: IntegrationContext = { workspace, tasksDir, config }
const bag: ArtifactBag = {}
for (const integration of integrations) { /* ... */ }

// After
import { runIntegrations } from "./integrations/runner"
const ctx: IntegrationContext = { workspace, tasksDir, config }
const bag = await runIntegrations(ctx, skip)
```

### How wizard/clone generate-only calls will look post-refactor
```typescript
// workspace-wizard.ts and workspace-clone.ts — they log paths
import { runIntegrationGenerate } from "@/lib/integrations/runner"
const ctx: IntegrationContext = { workspace: workspaceObj, tasksDir, config }
const results = await runIntegrationGenerate(ctx)
for (const { integration, path } of results) {
  if (path) p.log.success(`${integration.label}: ${path}`)
}

// App.tsx — discards paths (must not log)
await runIntegrationGenerate(ctx)
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Inline integration loops in each caller | Centralized runner module | Phase 17 (this phase) | Single place to add tier ordering, future niri tier |
| Array order determines execution order | Numeric `order` field + sort | Phase 17 (this phase) | Extensible without changing array position |
| `open()` returns `void` | `open()` returns `IntegrationArtifact | null` | Phase 16 (complete) | ArtifactBag pipeline possible |

## Open Questions

1. **tmux integration's `order` relative to vscode/intellij**
   - What we know: STATE.md places tmux in tier 1 with vscode and intellij
   - What's unclear: Whether tmux should run before or after IDE integrations (tmux starts a terminal session; IDEs open window apps — order within tier 1 probably doesn't matter)
   - Recommendation: Assign tmux order=12, after vscode=10 and intellij=11 — this preserves the existing array order (vscode, intellij, cmux, tmux is current order, though cmux is actually tier 2)

2. **Whether `runIntegrationGenerate()` should be async**
   - What we know: `generate?()` is synchronous on the `Integration` interface (`generate?(ctx: IntegrationContext): string | null`)
   - What's unclear: Whether a future integration will need async generate
   - Recommendation: Make `runIntegrationGenerate()` async anyway (returns `Promise<RunGenerateResult[]>`) for consistency with `runIntegrations()` and to allow future async generate without an API break. The body can use a plain synchronous loop.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | bun:test (built-in) |
| Config file | none — `bun test tests/` runs all |
| Quick run command | `bun test tests/lib/integrations/runner.test.ts` |
| Full suite command | `bun test tests/` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| ORCH-03 | Integrations execute in ascending order field order | unit | `bun test tests/lib/integrations/runner.test.ts` | ❌ Wave 0 |
| ORCH-04 | Numeric order field on each integration object | unit (compile) | `bun run typecheck` | ❌ Wave 0 (types.ts change) |
| ORCH-05 | workspace-ops/wizard/clone/App no longer contain inline loops | structural (code review) | manual | n/a |
| ORCH-06 | runIntegrationGenerate() skips open(); runIntegrations() calls open() | unit | `bun test tests/lib/integrations/runner.test.ts` | ❌ Wave 0 |
| ORCH-07 | skip set causes named integrations to be skipped | unit | `bun test tests/lib/integrations/runner.test.ts` | ❌ Wave 0 |
| TEST-02 | Unit tests for artifact accumulation, tier ordering, skip-flag | unit | `bun test tests/lib/integrations/runner.test.ts` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `bun test tests/lib/integrations/runner.test.ts`
- **Per wave merge:** `bun test tests/`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/lib/integrations/runner.test.ts` — covers ORCH-03, ORCH-06, ORCH-07, TEST-02

*(ORCH-04 is verified by TypeScript compile; ORCH-05 is structural — confirmed by absence of inline loops in source, verifiable via grep.)*

## Sources

### Primary (HIGH confidence)
- Direct code reading: `src/lib/workspace-ops.ts:449-598` — full openWorkspace function including skip set and integration loop
- Direct code reading: `src/tui/workspace-wizard.ts:456-465` — generate-only loop
- Direct code reading: `src/tui/workspace-clone.ts:163-172` — generate-only loop
- Direct code reading: `src/tui/dashboard/App.tsx:788-794` — generate-only loop discarding path
- Direct code reading: `src/lib/integrations/types.ts` — Integration interface, ArtifactBag
- Direct code reading: `src/lib/integrations/index.ts` — current integration registry array
- Direct code reading: `tests/lib/integrations/wizard-helpers.test.ts` — mock.module and cache-busting patterns
- Direct code reading: `.planning/STATE.md:52-56` — tier assignment decisions (tmux=tier 1, cmux=tier 2)

### Secondary (MEDIUM confidence)
- Direct code reading: `src/commands/workspace.ts:71-72` — `--no-ide` and `--no-cmux` flag definitions, `opts: { ide: boolean; cmux: boolean }` passed to openWorkspace

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new dependencies, all from existing project
- Architecture: HIGH — runner API shape derived directly from reading all four existing loops
- Pitfalls: HIGH — bun module cache behavior documented in existing test file comments; TUI/stdout corruption documented in CLAUDE.md

**Research date:** 2026-03-21
**Valid until:** 2026-04-21 (stable internal refactor — no external dependency changes)
