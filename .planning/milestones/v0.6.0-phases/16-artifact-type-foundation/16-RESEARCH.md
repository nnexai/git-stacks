# Phase 16: artifact-type-foundation - Research

**Researched:** 2026-03-21
**Domain:** TypeScript discriminated unions, Integration interface type evolution, backward-compatible signature migration
**Confidence:** HIGH

## Summary

Phase 16 is a pure type-system change. The Integration interface's `open()` method currently returns `Promise<void>`. This phase changes it to `Promise<IntegrationArtifact | null>`, adds `ArtifactBag` as a shared accumulator type threaded through open(), and defines `IntegrationArtifact` as a discriminated union. No runtime behavior changes.

The scope is tightly bounded: one interface file (`types.ts`), four integration implementations, one primary caller (`workspace-ops.ts`), and one secondary generate-only path in `App.tsx` that does not call `open()` at all. The State.md records a design decision to use a transitional `void | T` union first if needed, but since all four integrations change in the same PR, we can go directly to `IntegrationArtifact | null` without the transitional form.

The critical risk is test mock compatibility. Five test files mock the `open()` method as `mock(async () => {})` (returning `void`). TypeScript will accept `void` where `Promise<IntegrationArtifact | null>` is expected only if the mock is typed loosely — which it currently is (no explicit type annotations). The mocks will continue to satisfy TypeScript's structural compatibility requirements and will not need changes.

**Primary recommendation:** Define types in `types.ts`, update the interface, update all four integration `open()` implementations to return `null` (stubbed values for this phase), update the single caller loop in `workspace-ops.ts` to collect into an `ArtifactBag`, and verify with `bun run typecheck` and `bun test tests/`.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
None — all implementation choices are at Claude's discretion.

### Claude's Discretion
All implementation choices are at Claude's discretion — pure infrastructure phase.

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| ORCH-01 | Integration `open()` returns typed artifacts (session names, window info) instead of void | Change `open()` return type in `Integration` interface from `Promise<void>` to `Promise<IntegrationArtifact \| null>` |
| ORCH-02 | Artifacts accumulate into a shared bag passed to each subsequent integration's `open()` call | Add `bag: ArtifactBag` parameter to `open()` signature; update caller loop in `workspace-ops.ts` to build the bag iteratively |
| ART-05 | Window artifact type is shared across all integrations: `{ pid: number; app_id: string; title: string }` | Define `WindowArtifact` variant in the `IntegrationArtifact` discriminated union |
| ART-06 | Integrations that cannot identify their window return null artifact (graceful degradation) | All four current integrations return `null` from `open()` in this phase — the type permits null |
| TEST-03 | Existing integration tests continue to pass after `open()` return type change | Test mocks use structural typing; `mock(async () => {})` returns `undefined` which TypeScript accepts; verified by running `bun test tests/` |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| TypeScript | 5.x (already installed) | Discriminated unions, `satisfies`, type narrowing | Project baseline — `bun run typecheck` uses `tsc --noEmit` |
| Bun | 1.x (already installed) | Runtime and test runner | Project baseline |

No new libraries needed. This phase adds only type definitions.

**Installation:** None required.

## Architecture Patterns

### Recommended Project Structure
No new files. All changes are within:
```
src/lib/integrations/
  types.ts          — add IntegrationArtifact, ArtifactBag, update Integration interface
  tmux.ts           — update open() return type → return null
  cmux.ts           — update open() return type → return null
  vscode.ts         — update open() return type → return null
  intellij.ts       — update open() return type → return null
src/lib/
  workspace-ops.ts  — update integration loop to collect ArtifactBag
```

### Pattern 1: Discriminated Union for IntegrationArtifact
**What:** A TypeScript discriminated union where each variant carries a `kind` literal discriminant plus payload fields.
**When to use:** When callers (future niri integration) must narrow to a specific artifact type without runtime instanceof checks.
**Example:**
```typescript
// In src/lib/integrations/types.ts

export type TmuxArtifact = {
  kind: "tmux"
  sessionName: string
}

export type CmuxArtifact = {
  kind: "cmux"
  workspaceRef: string
}

export type WindowArtifact = {
  kind: "window"
  pid: number
  app_id: string
  title: string
}

export type IntegrationArtifact = TmuxArtifact | CmuxArtifact | WindowArtifact
```

The discriminant `kind` must be a string literal in each variant — TypeScript uses exhaustiveness checking in `switch (artifact.kind)` to ensure all variants are handled.

### Pattern 2: ArtifactBag as Accumulated Record
**What:** A record keyed by integration `id` mapping to `IntegrationArtifact | null`. Built up as each integration runs — later integrations can read earlier artifacts.
**When to use:** The niri integration (Phase 20) reads the tmux session name from the bag to attach its terminal.
**Example:**
```typescript
// In src/lib/integrations/types.ts

export type ArtifactBag = Record<string, IntegrationArtifact | null>
```

Caller loop in `workspace-ops.ts` updates:
```typescript
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

### Pattern 3: Updated Integration Interface Signature
**What:** Add `bag: ArtifactBag` as the third parameter to `open()`, change return type to `Promise<IntegrationArtifact | null>`.
**Example:**
```typescript
// In Integration interface in src/lib/integrations/types.ts

open(ctx: IntegrationContext, artifactPath: string | null, bag: ArtifactBag): Promise<IntegrationArtifact | null>
```

### Pattern 4: Implementation Stub — Return null
**What:** All four existing integrations return `null` from `open()` in Phase 16. Actual artifact construction (e.g., returning session name from tmux) is deferred to Phase 18 (ART-01 through ART-04).
**Example:**
```typescript
// In tmux.ts
async open(ctx, _artifactPath, _bag) {
  // ... existing logic unchanged ...
  return null
}
```

The `_bag` prefix on the parameter signals intentional non-use without triggering a TypeScript unused variable error.

### Anti-Patterns to Avoid
- **Do not use a class for ArtifactBag:** A plain `Record<string, IntegrationArtifact | null>` is sufficient and aligns with the project's Zod/plain-object style.
- **Do not add a `void` variant to IntegrationArtifact:** The union uses `null` for "no artifact" — not a void/undefined sentinel — because `Record<string, IntegrationArtifact | null>` is unambiguous about presence.
- **Do not mark `bag` as optional on the interface:** The planner noted that ArtifactBag must flow through all calls; making it required on the interface enforces this at the call site.
- **Do not update App.tsx integration loop:** App.tsx calls `integration.generate?.(ctx)` only — it never calls `open()`. No changes needed in that file.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Type narrowing for artifact variants | Manual `if ("sessionName" in artifact)` checks | Discriminated union with `kind` field + `switch` | TypeScript exhaustiveness checking catches missing cases at compile time |
| Artifact type validation at runtime | Zod schema for IntegrationArtifact | No runtime validation needed | This is internal type flow — artifacts are never deserialized from YAML/user input in Phase 16 |

## Common Pitfalls

### Pitfall 1: Test Mocks Break TypeScript Structural Check
**What goes wrong:** Test mocks declare `open: mock(async () => {})`. If the `Integration` interface's `open` return type is tightened to `Promise<IntegrationArtifact | null>`, TypeScript might flag mock objects as not satisfying the interface.
**Why it happens:** Mock objects in tests are typed as `typeof fakeIntegrations[0]` (inferred), not as `Integration`. TypeScript structural checks only apply where the type annotation says `Integration`.
**How to avoid:** The fake integration arrays in the tests are not annotated as `Integration[]` — they're passed to `mock.module()` which accepts `unknown`. No test file changes needed.
**Warning signs:** `tsc --noEmit` fails in test files after changing the interface. If this happens, cast the mock return: `open: mock(async () => null as IntegrationArtifact | null)`.

### Pitfall 2: `bag` Parameter Added to Interface But Not All Callers
**What goes wrong:** workspace-ops.ts is the only production caller of `open()`. If bag is added to the interface but workspace-ops.ts is not updated simultaneously, typecheck fails.
**Why it happens:** TypeScript immediately enforces the call site must pass all required parameters.
**How to avoid:** Update types.ts + workspace-ops.ts in the same task. Implementations (tmux.ts, cmux.ts, vscode.ts, intellij.ts) can use `_bag` since they don't read it yet.

### Pitfall 3: IntelliJ Integration Returns Early — Must Still Return null
**What goes wrong:** `intellij.ts open()` has two early-return paths: `if (!artifactPath) return` and `if (check.exitCode !== 0) return`. After the signature change, bare `return` resolves to `undefined`, not `null`.
**Why it happens:** TypeScript allows `return;` (returning `undefined`) inside an `async` function returning `Promise<T | null>` — but `undefined` and `null` are different. While this compiles (TypeScript treats `undefined` in async as acceptable for `Promise<T | null>` in some configurations), it is semantically wrong and may cause unexpected behavior in future bag consumers.
**How to avoid:** Change all bare `return` statements in `open()` implementations to `return null`. Typecheck this explicitly.

### Pitfall 4: VSCode Integration Has Same Early-Return Pattern
**What goes wrong:** `vscode.ts open()` has `if (!artifactPath) return` and `return` after binary not found. Same issue as IntelliJ.
**How to avoid:** Same fix — change all bare `return` in `open()` bodies to `return null`.

### Pitfall 5: tmux open() Catches Errors and Falls Through
**What goes wrong:** `tmux.ts open()` has a try/catch with `spinner.stop(...)` in the catch. The function ends without an explicit return, returning `undefined` (implicit return) after the try/catch block.
**How to avoid:** Add `return null` at the end of `open()` in tmux.ts and cmux.ts (after the try/catch).

## Code Examples

### IntegrationArtifact Discriminated Union (types.ts)
```typescript
// Canonical definition for Phase 16
// Source: requirements ORCH-01, ART-05 — no external library needed

export type TmuxArtifact = {
  kind: "tmux"
  sessionName: string
}

export type CmuxArtifact = {
  kind: "cmux"
  workspaceRef: string
}

export type WindowArtifact = {
  kind: "window"
  pid: number
  app_id: string
  title: string
}

export type IntegrationArtifact = TmuxArtifact | CmuxArtifact | WindowArtifact

export type ArtifactBag = Record<string, IntegrationArtifact | null>
```

### Updated Integration Interface Signature
```typescript
// In Integration interface
open(ctx: IntegrationContext, artifactPath: string | null, bag: ArtifactBag): Promise<IntegrationArtifact | null>
```

### Updated Caller Loop (workspace-ops.ts)
```typescript
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

### Stub Implementation Pattern (all four integrations)
```typescript
// tmux.ts example — add _bag param, return null
async open(ctx, _artifactPath, _bag) {
  const spinner = p.spinner()
  spinner.start("Setting up tmux session")
  try {
    const { created } = await openTmuxSession(ctx.workspace.name, ctx.tasksDir)
    if (created) {
      await applyPaneLayout(ctx)
    }
    spinner.stop("tmux session ready")
    await focusTmuxSession(ctx.workspace.name)
  } catch (err) {
    spinner.stop("tmux unavailable — skipped")
    p.log.warn(`tmux: ${String(err)}`)
  }
  return null
},
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `open(): Promise<void>` | `open(): Promise<IntegrationArtifact \| null>` | Phase 16 | Callers can now accumulate artifacts for later integrations |
| No artifact accumulation | `ArtifactBag` threaded through sequential `open()` calls | Phase 16 | Niri (Phase 20) reads tmux session name from bag |

## Call-Site Inventory

All locations that must be updated (or verified as not needing updates):

| File | What Changes | Needs Update? |
|------|-------------|---------------|
| `src/lib/integrations/types.ts` | Add types, update interface signature | YES — add 3 types + update `open()` sig |
| `src/lib/integrations/tmux.ts` | Add `_bag` param, add `return null` | YES |
| `src/lib/integrations/cmux.ts` | Add `_bag` param, add `return null` | YES |
| `src/lib/integrations/vscode.ts` | Add `_bag` param, change bare `return` to `return null` | YES |
| `src/lib/integrations/intellij.ts` | Add `_bag` param, change bare `return` to `return null` | YES |
| `src/lib/workspace-ops.ts` | Update integration loop to build ArtifactBag | YES — at line 573-579 |
| `src/tui/dashboard/App.tsx` | Calls `integration.generate?.(ctx)` only, never `.open()` | NO — no change needed |
| `tests/tui/workspace-wizard.test.ts` | Mocks `open: mock(async () => {})` — not typed as Integration | NO — mocks are structurally compatible |
| `tests/commands/workspace-edit.test.ts` | Same mock pattern | NO |
| `tests/tui/dashboard/WorkspaceDetail.test.tsx` | Same mock pattern | NO |
| `tests/tui/dashboard/TemplateDetail.test.tsx` | Same mock pattern | NO |

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | bun:test (built into Bun) |
| Config file | none — `bun test tests/` discovers automatically |
| Quick run command | `bun run typecheck` |
| Full suite command | `bun test tests/` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| ORCH-01 | `open()` returns `Promise<IntegrationArtifact \| null>` — typechecks | type check | `bun run typecheck` | ✅ (tsconfig exists) |
| ORCH-02 | ArtifactBag threaded through open() caller loop | type check + unit | `bun run typecheck && bun test tests/lib/workspace-ops.test.ts` | ✅ |
| ART-05 | WindowArtifact type has `{ pid, app_id, title }` fields | type check | `bun run typecheck` | ✅ |
| ART-06 | All four integrations compile returning null | type check | `bun run typecheck` | ✅ |
| TEST-03 | Existing 375 tests pass unchanged | regression | `bun test tests/` | ✅ |

### Sampling Rate
- **Per task commit:** `bun run typecheck`
- **Per wave merge:** `bun run typecheck && bun test tests/`
- **Phase gate:** Full suite (375 tests) green before `/gsd:verify-work`

### Wave 0 Gaps
None — existing test infrastructure covers all phase requirements. Phase 16 is type-only; all behavioral tests already exist and must continue to pass (TEST-03).

## Open Questions

1. **`void | T` transitional union — needed or not?**
   - What we know: STATE.md records this as a fallback option in case changing all four integrations atomically is complex.
   - What's clear: All four integrations change in the same phase, so there is no multi-phase compile break risk. No transitional form needed.
   - Recommendation: Go directly to `IntegrationArtifact | null`. Simpler and avoids legacy `void` in the union.

2. **Should `ArtifactBag` be exported from `index.ts`?**
   - What we know: `types.ts` exports are re-exported through `index.ts` selectively. Currently `Integration` and `IntegrationContext` are re-exported; `ArtifactBag` and `IntegrationArtifact` will be needed by Phase 17 (runner module) and Phase 20 (niri).
   - Recommendation: Export both `ArtifactBag` and `IntegrationArtifact` from `index.ts` alongside the existing re-exports.

## Sources

### Primary (HIGH confidence)
- Direct code inspection of `src/lib/integrations/types.ts` — current Integration interface verified
- Direct code inspection of all four integration implementations — all `open()` signatures and return paths mapped
- Direct code inspection of `src/lib/workspace-ops.ts` lines 573-579 — only production caller of `open()`
- Grep across all test files — all five mock sites identified (`tests/tui/workspace-wizard.test.ts`, `tests/commands/workspace-edit.test.ts`, `tests/tui/dashboard/WorkspaceDetail.test.tsx`, `tests/tui/dashboard/TemplateDetail.test.tsx`, `tests/tui/dashboard/App.tsx` — App.tsx does NOT call open())
- `bun run typecheck` baseline — passes clean
- `bun test tests/` baseline — 375 pass, 0 fail

### Secondary (MEDIUM confidence)
- TypeScript handbook on discriminated unions — `kind` literal field pattern is canonical; verified via training data (TypeScript 5.x feature set stable)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new libraries, pure TypeScript type system
- Architecture: HIGH — all call sites identified through code inspection, not assumption
- Pitfalls: HIGH — all four early-return patterns verified by reading source files
- Test compatibility: HIGH — mock sites grep'd and structurally verified

**Research date:** 2026-03-21
**Valid until:** 60 days — type system patterns are stable; code is inspected fresh
