# Phase 44: Core Integration Plugin - Research

**Researched:** 2026-03-28
**Phase:** 44 — Core Integration Plugin

## Research Question

What do we need to know to plan the AeroSpace integration plugin (`src/lib/integrations/aerospace.ts`) that detects newly created windows via snapshot-delta and moves them to a configured AeroSpace workspace?

## Integration Plugin Pattern Analysis

### Niri Integration Structure (Direct Template)

The niri integration (`src/lib/integrations/niri.ts`) is the canonical template. Key structural elements:

1. **Config schema** (Zod): `niriConfigSchema` with `enabled`, `focus`, `columns` fields
2. **Integration object**: Exported as `niriIntegration: Integration` with all required interface fields
3. **WindowDetector**: Implements `begin()` (snapshot before) and `resolve()` (poll after with exponential backoff)
4. **open()**: Receives `IntegrationContext`, artifact path (null for tier-3), and `ArtifactBag` — iterates bag to find WindowArtifacts with `windowIds["niri"]` and moves them
5. **cleanup()**: Unnames the niri workspace (aerospace will be no-op per DETECT-05)
6. **configurePrompt()**: Returns `{ enabled: true }` (minimal — no interactive config)
7. **Registration**: Added to `src/lib/integrations/index.ts` array

### Integration Runner Flow

`runner.ts` (`runIntegrations`) orchestrates the lifecycle:

1. Sorts integrations by `order` (ascending)
2. Collects WindowDetectors from enabled integrations
3. For each integration (in order):
   - Check `isEnabled()` and `applies()`
   - Call `generate()` if present
   - Call `begin()` on ALL WindowDetectors (snapshot pre-state)
   - Call `open()` on the integration
   - If result is WindowArtifact: call `resolve()` on ALL WindowDetectors to populate `windowIds`
   - Store artifact in bag
4. Tier-3 integrations (order 30+) run AFTER tier-1/2, so `bag` already contains WindowArtifacts from vscode/intellij/cmux/tmux

**Critical insight**: WindowDetector `begin()`/`resolve()` is called for EVERY integration's open(), not just the detector's own integration. This means the aerospace detector captures snapshots even when vscode is opening — so `windowIds["aerospace"]` gets populated on vscode's WindowArtifact. The aerospace `open()` then reads those IDs from the bag.

### Config Schema Scope (Phase 44 vs Phase 45)

Per CONTEXT.md D-02, Phase 44 is minimal:

```typescript
const aerospaceConfigSchema = z.object({
  enabled: z.boolean().optional(),
  workspace: z.string(),  // Required — target AeroSpace workspace name
})
```

Phase 45 extends this with: `layout`, `normalization`, `focus`, `commands`, `flatten_before_open`.

### Workspace YAML Configuration Path

Users configure AeroSpace via:
```yaml
settings:
  integrations:
    aerospace:
      enabled: true
      workspace: "dev"
```

The `resolveEnabled()` helper from `types.ts` handles the global/workspace config cascade. The `workspace` field is read from either workspace or global config.

## Phase 43 Dependency: Shell Wrappers

Phase 44 consumes these from `src/lib/aerospace.ts` (created in Phase 43):

| Function | Phase 44 Usage |
|----------|---------------|
| `isAerospaceRunning()` | Gate check in `open()` and `windowDetector.begin()` |
| `listWindows()` | Pre/post snapshot for window detection |
| `listWorkspaces()` | Validate target workspace exists before moving |
| `moveNodeToWorkspace()` | Move detected windows to target workspace |
| `snapshotWindowIds()` | NOT used directly — WindowDetector reimplements with `begin()`/`resolve()` |

### WindowDetector Implementation

The WindowDetector for aerospace follows niri's pattern exactly:

**begin():**
1. Check `isAerospaceRunning()` — return empty snapshot if not running
2. Call `listWindows()` to get current window IDs
3. Return `DetectorSnapshot` with `_brand: "aerospace"` and `data: Set<number>` of window IDs

**resolve():**
1. Extract `beforeIds` Set from snapshot
2. Poll with exponential backoff (200ms initial, 2s max, 10s timeout)
3. Call `listWindows()` each poll
4. Return new IDs (filter out `beforeIds`)
5. Return `[]` on timeout

### open() Flow

1. **Gate check**: `isAerospaceRunning()` — return null if not running
2. **Spinner**: Create spinner if `!ctx.silent` (follow niri pattern)
3. **Parse config**: Read `workspace` from workspace-level or global-level integration config
4. **Validate workspace**: Call `listWorkspaces()`, check if target workspace exists. If not: log warning, stop spinner, return null
5. **Move bag windows**: Iterate `Object.values(bag)`, find WindowArtifacts with `windowIds["aerospace"]`, call `moveNodeToWorkspace()` for each ID
6. **Stop spinner**, return null (tier-3 returns null always)

### Test Strategy

Tests need to mock `src/lib/aerospace.ts` entirely (using `mock.module`) since Phase 44 is a consumer:

1. **Integration unit tests** (`tests/lib/integrations/aerospace.test.ts`):
   - Mock all aerospace.ts functions
   - Test `isEnabled()` with various config combinations
   - Test `windowDetector.begin()` and `resolve()` with mock data
   - Test `open()` flow: gate check, workspace validation, window movement
   - Test `cleanup()` is a no-op
   - Test `configurePrompt()` returns `{ enabled: true }`

2. **Registration test**: Verify `aerospaceIntegration` appears in `integrations` array with correct order

## Key Risks and Mitigations

| Risk | Mitigation |
|------|-----------|
| Phase 43 not yet executed — `src/lib/aerospace.ts` doesn't exist | Plan references Phase 43 function signatures from 43-01-PLAN.md; executor will read actual file |
| Config workspace field could be missing | Zod schema makes `workspace` required; safeParse fails gracefully |
| Target AeroSpace workspace might not exist | Explicit validation via `listWorkspaces()` with clear warning message (DETECT-04) |
| Multiple windows from same integration | Iterate all IDs in `windowIds["aerospace"]` array, move each individually |

## Validation Architecture

### Unit Test Coverage

| Requirement | Test Strategy |
|-------------|--------------|
| DETECT-01 (snapshot-delta detection) | Mock `listWindows` returning different sets for begin/resolve, verify new IDs returned |
| DETECT-02 (window movement) | Mock `moveNodeToWorkspace`, verify called with correct windowId and workspace name |
| DETECT-03 (YAML config) | Create IntegrationContext with workspace/global config, verify `workspace` field is read |
| DETECT-04 (workspace validation) | Mock `listWorkspaces` returning empty or non-matching list, verify warning logged and null returned |
| DETECT-05 (cleanup no-op) | Call `cleanup()`, verify no aerospace functions called |

### Integration Test Coverage

| Scenario | Verification |
|----------|-------------|
| Registration | `integrations` array includes aerospace with order 31 |
| isEnabled cascade | Global enabled + workspace override disabled = disabled |
| Full open flow | Mock aerospace + bag with WindowArtifact, verify moveNodeToWorkspace called |

## RESEARCH COMPLETE
