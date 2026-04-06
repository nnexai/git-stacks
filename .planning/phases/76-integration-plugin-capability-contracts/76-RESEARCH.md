# Phase 76: Integration Plugin Capability Contracts - Research

**Researched:** 2026-04-06
**Domain:** TypeScript interface evolution, integration plugin system
**Confidence:** HIGH

## Summary

Phase 76 adds a typed `capabilities` field to the `Integration` interface and uses it to replace duck-typed optional chaining in `runner.ts`. All 10 plugins are first-party and co-located, so this is a pure TypeScript refactor with no external dependencies, no migration ambiguity, and no compat shims needed.

The change surface is narrow and well-bounded: one type definition, three runner functions, one CLI command, and ten plugin files. The TypeScript compiler enforces correctness — if any plugin is missing `capabilities`, `bun run typecheck` fails. Tests for runner gating behavior are the only new test code required.

**Primary recommendation:** Add `Capability` type and `capabilities: ReadonlySet<Capability>` to `Integration` in `types.ts`, update all 10 plugins in a single wave, update the runner to use `.has()` checks, then add the column to `integration list`.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** `Capability` is a string union type: `'generate' | 'cleanup' | 'commands' | 'configExample' | 'windowDetection' | 'applies'`
- **D-02:** The set covers only optional behaviors. `open`, `isEnabled`, `configurePrompt` are always present — not in the set.
- **D-03:** Runner checks `integration.capabilities.has('generate')` (and equivalents) before calling the method, replacing optional chaining.
- **D-04:** Methods remain optional on the interface (`generate?`, etc.). Runner uses non-null assertion (`!`) after the capability check.
- **D-05:** No runtime validation that capabilities match method presence. TypeScript compile-time enforcement only. Trusted declaration model.
- **D-06:** Human-readable table gets a "Capabilities" column with abbreviated tags: `gen`, `cmd`, `clean`, `win`, `cfg`, `apl`.
- **D-07:** JSON output (`--json`) includes `"capabilities": ["generate", "commands", ...]` with full capability names.
- **D-08:** `capabilities` is a required (non-optional) field. TypeScript compiler forces all 10 plugins to declare it.
- **D-09:** No third-party plugin concerns. No runtime compat shim or deprecation notice needed.
- **D-10:** No additional runtime assertion test beyond the TS compiler. `bun run typecheck` passing is sufficient.

### Claude's Discretion

- Exact abbreviated tag labels (gen/cmd/clean/win/cfg/apl are suggestions, can adjust for readability)
- Whether `Capability` type lives in `types.ts` or a separate `capabilities.ts`
- Test structure and file placement for runner capability-gating tests
- Order of capability tags in list output

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| ENGN-07 | Each integration plugin declares its capabilities via a typed `capabilities` field | Capability taxonomy fully mapped from codebase audit; all 10 plugins inventoried |
| ENGN-08 | Integration runner uses capability declarations instead of optional chaining to gate calls | Three runner functions identified; exact optional-chaining sites catalogued below |
| ENGN-09 | `integration list` displays plugin capabilities | Existing table render pattern in `integration.ts` identified; column addition is straightforward |
</phase_requirements>

---

## Standard Stack

No new libraries needed. This phase uses only what is already present.

| Component | Version | Purpose |
|-----------|---------|---------|
| TypeScript | ^6.0.2 | Compile-time enforcement via `ReadonlySet<Capability>` [VERIFIED: CLAUDE.md] |
| bun:test | bundled with Bun | Existing test framework for new runner gating tests [VERIFIED: codebase] |

**Installation:** None required.

---

## Architecture Patterns

### Recommended File Layout

The `Capability` type should live in `src/lib/integrations/types.ts` alongside the `Integration` interface — it is part of the same contract and placing it in a separate file adds an import hop with no benefit (all plugin files already import from `types.ts`). [ASSUMED — consistent with codebase convention of colocating related types]

### Pattern 1: Capability Type Definition

```typescript
// Source: types.ts (new addition)
export type Capability =
  | 'generate'
  | 'cleanup'
  | 'commands'
  | 'configExample'
  | 'windowDetection'
  | 'applies'

// Added to Integration interface:
capabilities: ReadonlySet<Capability>
```

`ReadonlySet<T>` is a TypeScript built-in (lib.es2015). It is not yet used elsewhere in the codebase but is the idiomatic type for an immutable set declaration. [VERIFIED: codebase grep — no existing ReadonlySet usage; standard TypeScript]

### Pattern 2: Plugin Declaration

```typescript
// Source: vscode.ts (illustrative — actual values listed in capability map below)
export const vscodeIntegration: Integration = {
  // ... existing fields ...
  capabilities: new Set<Capability>(['generate', 'commands', 'configExample', 'windowDetection']),
  // ...
}
```

`new Set<Capability>([...])` is assignable to `ReadonlySet<Capability>` — TypeScript allows a mutable `Set` where `ReadonlySet` is expected (subtype relationship). No `as const` or wrapper needed. [VERIFIED: TypeScript structural typing — Set implements ReadonlySet interface]

### Pattern 3: Runner Gating

Current optional chaining to replace:

```typescript
// BEFORE (runner.ts runIntegrationGenerate and runIntegrations):
const path = integration.generate?.(ctx) ?? null

// AFTER:
const path = integration.capabilities.has('generate')
  ? integration.generate!(ctx)
  : null
```

```typescript
// BEFORE (runner.ts runIntegrations — applies check):
if (integration.applies && !integration.applies(ctx.workspace)) continue

// AFTER:
if (integration.capabilities.has('applies') && !integration.applies!(ctx.workspace)) continue
```

```typescript
// BEFORE (runner.ts runIntegrationCleanup):
if (!integration.cleanup) continue
await integration.cleanup(ctx)

// AFTER:
if (!integration.capabilities.has('cleanup')) continue
await integration.cleanup!(ctx)
```

```typescript
// BEFORE (runner.ts runIntegrations — windowDetector collection):
.filter((i) => i.windowDetector && i.isEnabled(ctx) && (!i.applies || i.applies(ctx.workspace)))

// AFTER:
.filter((i) => i.capabilities.has('windowDetection') && i.isEnabled(ctx) &&
  (!i.capabilities.has('applies') || i.applies!(ctx.workspace)))
```

### Pattern 4: integration list Column Addition

```typescript
// Source: integration.ts (existing table render pattern — extend rows object)
const rows = integrations.map((i) => {
  // ... existing enabled/configured logic ...
  const caps = [...i.capabilities]
    .map(capToTag)      // 'generate' -> 'gen', etc.
    .sort()
    .join(' ')
  return { id: i.id, label: i.label, enabled, configured, caps }
})

// JSON branch — add capabilities array with full names:
return { id: i.id, label: i.label, enabled, configured,
  capabilities: [...i.capabilities] }
```

Column header width: `"Capabilities".padEnd(20)` — enough for `gen cmd win cfg apl` plus spacing.

### Anti-Patterns to Avoid

- **Capability as optional field:** D-08 requires it as required. Making it optional defeats compiler enforcement.
- **Runtime capability-vs-method mismatch checks:** D-05 explicitly prohibits runtime validation. Trust the type system.
- **Capability as string array instead of Set:** A Set is correct — order is irrelevant, membership testing via `.has()` is O(1), and `ReadonlySet` communicates immutability.
- **Checking `configExample` capability in the runner:** `configExample` is a string property, not called by the runner. It is only used in `integration.ts` config example command. The capability flag exists for discoverability in `integration list` only.

---

## Complete Capability Map (All 10 Plugins)

Derived from direct code audit. [VERIFIED: full source read of all 10 plugin files]

| Plugin | generate | cleanup | commands | configExample | windowDetection | applies |
|--------|----------|---------|----------|---------------|-----------------|---------|
| vscode | YES | no | YES | YES | no* | no |
| intellij | YES | no | no | no | no* | YES |
| cmux | no | no | no | no | no | no |
| tmux | no | YES | YES | YES | no | no |
| niri | no | YES | YES | YES | YES | no |
| aerospace | no | YES** | YES | YES | YES | no |
| github | no | no | YES | no | no | no |
| gitlab | no | no | YES | no | no | no |
| gitea | no | no | YES | no | no | no |
| jira | no | no | YES | no | no | no |

*vscode and intellij have `windowDetector` provided by niri/aerospace via runner injection — they do NOT declare their own `windowDetector` field. Only niri and aerospace declare `windowDetector` on the plugin object. [VERIFIED: source code audit]

**aerospace `cleanup` is an explicit no-op (`async cleanup(_ctx) {}`). It still declares the method, so capabilities SHOULD include `'cleanup'`. However this is a design decision: an empty no-op cleanup could be omitted from the capability set. Recommend including it since the method is present on the object — the capability describes method presence, not behavior. [ASSUMED — interpretation of D-04 re: method presence]

### Abbreviated Tag Map (D-06)

| Capability | Tag |
|------------|-----|
| generate | gen |
| cleanup | clean |
| commands | cmd |
| configExample | cfg |
| windowDetection | win |
| applies | apl |

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Capability set membership | Custom array includes() | `ReadonlySet.has()` | O(1), idiomatic, already in TypeScript stdlib |
| Compile-time enforcement | Runtime assertion library | TypeScript compiler + `bun run typecheck` | D-05 explicitly forbids runtime checks |
| Capability display sorting | Custom comparator | `[...caps].sort()` | Alphabetic sort is sufficient and predictable |

---

## Common Pitfalls

### Pitfall 1: aerospace cleanup no-op inclusion
**What goes wrong:** Implementer excludes `'cleanup'` from aerospace because its implementation is empty.
**Why it happens:** Capability represents method presence, not behavioral impact.
**How to avoid:** Check if the method is defined on the object. Aerospace has `cleanup` defined (empty body). Include `'cleanup'`.
**Warning signs:** Typecheck passes but aerospace capability set differs from what the runner would naturally call.

### Pitfall 2: windowDetector vs windowDetection capability
**What goes wrong:** Implementer names the capability `'windowDetector'` (matching the property name) instead of `'windowDetection'` (D-01).
**Why it happens:** Natural tendency to mirror field name.
**How to avoid:** The canonical capability name from D-01 is `'windowDetection'`. The `windowDetector` property name is distinct.

### Pitfall 3: runner.test.ts fake integrations not updated
**What goes wrong:** Existing `runner.test.ts` fakeIntegrations objects don't have `capabilities` field; after adding it as required to the interface, tests may fail type checking or runtime tests that expect duck-typed behavior.
**Why it happens:** Test fakes mirror the real interface but are plain objects cast via `as any` or `as Integration`.
**How to avoid:** Add `capabilities` to all fake integration objects in `runner.test.ts`. Existing test fakes are typed loosely (checked: fakeIntegrations is not explicitly typed as `Integration[]`, avoiding strict compile error — but should be updated for correctness).
**Warning signs:** Runner tests pass but `bun run typecheck` flags the test file.

### Pitfall 4: integration list column width overflow
**What goes wrong:** Plugin with many capabilities overflows table column width.
**Why it happens:** `gen cmd clean win cfg apl` = 25 chars including spaces; if not padEnd'd correctly, columns misalign.
**How to avoid:** Use at least `padEnd(26)` for the capabilities column. The maximum capability string is all six tags.

### Pitfall 5: applies gating behavior change
**What goes wrong:** Old runner: `if (integration.applies && !integration.applies(ctx.workspace)) continue` — if `applies` is undefined, skips the gate (always runs). New runner: `if (integration.capabilities.has('applies') && !integration.applies!(ctx.workspace)) continue` — must be logically equivalent.
**Why it happens:** Changing the gate expression from property existence to capability flag.
**How to avoid:** The two are equivalent IF and only IF plugins that have an `applies` method declare `'applies'` in capabilities (and vice versa). The capability map above shows only intellij declares `applies`. This must be verified against the map.

---

## Code Examples

### Type definition (types.ts)

```typescript
// Source: src/lib/integrations/types.ts (verified current interface shape)
export type Capability =
  | 'generate'
  | 'cleanup'
  | 'commands'
  | 'configExample'
  | 'windowDetection'
  | 'applies'

export interface Integration {
  // ... existing fields ...
  capabilities: ReadonlySet<Capability>    // <-- new required field
  // ... existing optional methods unchanged ...
}
```

### Runner gating (runner.ts)

```typescript
// Source: src/lib/integrations/runner.ts (verified current — three functions)

// runIntegrationGenerate and runIntegrations:
// BEFORE: integration.generate?.(ctx) ?? null
// AFTER:
const path = integration.capabilities.has('generate')
  ? integration.generate!(ctx)
  : null

// runIntegrations — applies filter BEFORE generate/open:
// BEFORE: if (integration.applies && !integration.applies(ctx.workspace)) continue
// AFTER:
if (integration.capabilities.has('applies') && !integration.applies!(ctx.workspace)) continue

// runIntegrations — windowDetector collection:
// BEFORE: i.windowDetector && i.isEnabled(ctx) && (!i.applies || i.applies(ctx.workspace))
// AFTER:
i.capabilities.has('windowDetection') &&
i.isEnabled(ctx) &&
(!i.capabilities.has('applies') || i.applies!(ctx.workspace))

// runIntegrationCleanup:
// BEFORE: if (!integration.cleanup) continue; await integration.cleanup(ctx)
// AFTER:
if (!integration.capabilities.has('cleanup')) continue
await integration.cleanup!(ctx)
```

### integration list column (integration.ts)

```typescript
// Source: src/commands/integration.ts (verified existing table render pattern)
const TAG_MAP: Record<string, string> = {
  generate: 'gen',
  cleanup: 'clean',
  commands: 'cmd',
  configExample: 'cfg',
  windowDetection: 'win',
  applies: 'apl',
}

// In the rows mapping:
const caps = [...i.capabilities].map((c) => TAG_MAP[c] ?? c).sort().join(' ')
return { id: i.id, label: i.label, enabled, configured, caps }

// Table header:
console.log(`${'ID'.padEnd(14)} ${'Label'.padEnd(18)} ${'Enabled'.padEnd(9)} ${'Configured'.padEnd(11)} Capabilities`)

// JSON branch:
return { id: i.id, label: i.label, enabled, configured, capabilities: [...i.capabilities] }
```

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | bun:test (bundled) |
| Config file | none — scripts/test-runner.ts orchestrates |
| Quick run command | `bun run test` |
| Full suite command | `bun run test` |

### Phase Requirements to Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| ENGN-07 | All 10 plugins have `capabilities` field with correct members | typecheck | `bun run typecheck` | N/A — compile gate |
| ENGN-08 | Runner gates `generate` via capability check, not optional chaining | unit | `bun test tests/lib/integrations/runner.test.ts` | YES — needs new tests |
| ENGN-08 | Runner gates `applies` via capability check | unit | `bun test tests/lib/integrations/runner.test.ts` | YES — needs new tests |
| ENGN-08 | Runner gates `cleanup` via capability check | unit | `bun test tests/lib/integrations/runner.test.ts` | YES — needs new tests |
| ENGN-08 | Runner gates `windowDetection` via capability check | unit | `bun test tests/lib/integrations/runner.test.ts` | YES — needs new tests |
| ENGN-09 | `integration list` table includes capabilities column | unit | `bun test tests/lib/integration-commands.test.ts` | YES — needs new test |
| ENGN-09 | `integration list --json` includes capabilities array | unit | `bun test tests/lib/integration-commands.test.ts` | YES — needs new test |

### Sampling Rate

- Per task commit: `bun run typecheck && bun test tests/lib/integrations/runner.test.ts`
- Per wave merge: `bun run test`
- Phase gate: full suite green before `/gsd-verify-work`

### Wave 0 Gaps

None — existing test infrastructure covers all phase requirements. New test cases slot into existing `runner.test.ts` and `integration-commands.test.ts`. No new test files needed.

---

## Runner Function Inventory (Exact Sites to Change)

Direct audit of `runner.ts` — all duck-typing sites: [VERIFIED: full source read]

**`runIntegrationGenerate` (line 15):**
```
integration.generate?.(ctx) ?? null
```
Replace with capability check.

**`runIntegrations` (line 14, windowDetector filter):**
```
i.windowDetector && ...
```
Replace with `i.capabilities.has('windowDetection')`.

**`runIntegrations` (line 14, applies check):**
```
!i.applies || i.applies(ctx.workspace)
```
Replace with capability-gated form.

**`runIntegrations` (line 33, applies check in main loop):**
```
if (integration.applies && !integration.applies(ctx.workspace)) continue
```
Replace with capability check.

**`runIntegrations` (line 34, generate call):**
```
integration.generate?.(ctx) ?? null
```
Replace with capability check.

**`runIntegrationCleanup` (line 69, cleanup check):**
```
if (!integration.cleanup) continue
```
Replace with `if (!integration.capabilities.has('cleanup')) continue`.

Total: 6 optional-chaining/existence-check sites across 3 functions.

---

## Environment Availability

Step 2.6: SKIPPED (no external dependencies — pure TypeScript refactor within the project).

---

## Open Questions

1. **aerospace cleanup no-op**
   - What we know: `aerospaceIntegration.cleanup` is an explicit async no-op.
   - What's unclear: Should a no-op body be declared in the capability set?
   - Recommendation: Include `'cleanup'` — the capability describes method presence, not behavior. The runner should call it (it is a no-op, so no harm). Omitting it would mean the runner silently skips cleanup for aerospace even though the method exists. Better to be consistent.

2. **configExample capability usage**
   - What we know: `configExample` is a string property on `Integration`, checked in `integration.ts` with `if (integration.configExample)`. The runner never reads it.
   - What's unclear: Should the runner gate on `configExample` capability, or is the capability flag purely for `integration list` display?
   - Recommendation: The capability flag is display-only. Do not add a `configExample` capability check to the runner — it is not a callable method. The existing `if (integration.configExample)` duck-type check in `integration.ts` can remain unchanged (it's not in the runner).

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `Capability` type should live in `types.ts` (not a separate file) | Architecture Patterns | Low — either location works; only affects import paths in 10 plugin files |
| A2 | aerospace no-op `cleanup` should be included in the capability set | Capability Map / Open Questions | Low — affects only whether runner calls an empty function |
| A3 | `configExample` capability check is display-only; no runner gating needed | Open Questions | Low — configExample is a string, not a function; runner has no call site for it |

---

## Sources

### Primary (HIGH confidence)
- Direct source audit: `src/lib/integrations/types.ts` — current Integration interface
- Direct source audit: `src/lib/integrations/runner.ts` — all 3 runner functions and exact duck-typing sites
- Direct source audit: `src/commands/integration.ts` — existing list table render
- Direct source audit: all 10 plugin files — capability inventory
- Direct source audit: `tests/lib/integrations/runner.test.ts` — existing test structure
- Direct source audit: `tests/lib/integration-commands.test.ts` — existing list test structure
- CONTEXT.md decisions D-01 through D-10 — locked design choices

### Secondary (MEDIUM confidence)
- TypeScript documentation: `ReadonlySet<T>` is assignable from `Set<T>` (subtype relationship) [ASSUMED — standard TypeScript; not re-verified via external source in this session]

---

## Metadata

**Confidence breakdown:**
- Capability map: HIGH — all 10 plugin files read directly
- Runner change sites: HIGH — all 3 functions read directly, 6 exact lines identified
- Type patterns: HIGH — TypeScript stdlib, verified via codebase conventions
- Test structure: HIGH — existing test files read and structure confirmed

**Research date:** 2026-04-06
**Valid until:** Indefinite — pure internal refactor; no external dependencies
