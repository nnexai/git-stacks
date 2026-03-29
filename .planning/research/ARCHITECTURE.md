# Architecture Research

**Domain:** Multi-workspace AeroSpace integration — v0.12.0 extension of existing v0.11.1 plugin
**Researched:** 2026-03-29
**Confidence:** HIGH — direct code analysis of all affected files; no third-party unknowns

## Context: What Already Exists

The v0.11.1 AeroSpace integration is a complete, working tier-3 plugin. The architecture for v0.12.0 is an extension of that plugin only. No other integrations, runner.ts, types.ts, or shell wrappers change.

Existing state at the start of this milestone:

- `src/lib/aerospace.ts` — all CLI wrappers, `_exec`, `snapshotWindowIds` (unchanged)
- `src/lib/integrations/aerospace.ts` — single-workspace `open()`, flat `aerospaceConfigSchema`, one `WindowDetector` (modified here)
- `src/lib/integrations/types.ts` — `Integration`, `WindowDetector`, `ArtifactBag` contracts (unchanged)
- `src/lib/integrations/runner.ts` — tier-ordered loop, calls `begin()`/`open()`/`resolve()` per integration (unchanged)

## System Overview

```
┌──────────────────────────────────────────────────────────────────────┐
│              git-stacks open (workspace-ops.ts)                       │
│                     runIntegrations(ctx)                              │
├──────────────────────────────────────────────────────────────────────┤
│              runner.ts  (UNCHANGED)                                   │
│  vscode(10) → intellij(11) → tmux(20) → niri(30) → aerospace(31)     │
│  begin() → open() → resolve() loop per integration                   │
├──────────────────────────────────────────────────────────────────────┤
│              aerospaceIntegration  (MODIFIED)                         │
│                                                                       │
│  windowDetector.begin()  ──────────────────────────────────────────► │
│    one global snapshot before aerospace.open() is called             │
│                                                                       │
│  open(ctx, null, bag)                                                 │
│    ├─ isAerospaceRunning() gate                                       │
│    ├─ parse config → workspaces[] (new schema)                        │
│    ├─ SINGLE global listWorkspaces() call                            │
│    └─ for ws of workspaces[] in order:                               │
│         ├─ validate ws.workspace exists (reuse global list)          │
│         ├─ if ws.flatten_before_open → flattenWorkspaceTree()        │
│         ├─ move bag windows (first entry only — see §bag-routing)    │
│         ├─ launch ws.commands[]                                      │
│         ├─ apply ws.layout                                           │
│         └─ if ws.focus → _exec.run(["workspace", ws.workspace])      │
│                                                                       │
│  windowDetector.resolve()  ────────────────────────────────────────► │
│    one global resolve after open() returns                           │
│                                                                       │
├──────────────────────────────────────────────────────────────────────┤
│              src/lib/aerospace.ts  (UNCHANGED)                        │
│  _exec, listWindows, listWorkspaces, moveNodeToWorkspace, etc.        │
└──────────────────────────────────────────────────────────────────────┘
```

## Recommended Project Structure

The change is confined to a single file:

```
src/
└── lib/
    └── integrations/
        └── aerospace.ts   MODIFIED — new schema + multi-workspace loop inside open()
```

No other production files change. Tests gain a new test file or new describes in the existing `tests/lib/integrations/aerospace.test.ts`.

## The Four Key Architecture Questions

### Question 1: Loop inside open() vs calling open() multiple times

**Decision: loop inside open().**

Calling `open()` multiple times is wrong for two reasons:

1. `runner.ts` calls `windowDetector.begin()` once before `open()` and `windowDetector.resolve()` once after. Calling `open()` N times would require N begin/resolve cycles in runner.ts, which runner.ts does not do and must not be changed to do.

2. The `WindowDetector.begin()` snapshot purpose is to capture the universe of windows before tier-1 integrations run. That snapshot is already complete by the time aerospace's `open()` is called at order 31. The snapshot is shared across all N workspace entries — there is no per-workspace-entry snapshot.

The correct architecture: `open()` contains a single `for...of` loop over the `workspaces` array. Each iteration processes one aerospace workspace entry: validate, flatten, move windows, launch commands, apply layout, focus. The loop is entirely inside the existing `open()` method body.

```typescript
async open(ctx: IntegrationContext, _artifactPath: string | null, bag: ArtifactBag): Promise<null> {
  if (!(await isAerospaceRunning())) return null

  const config = parseConfig(ctx)
  if (!config.workspaces?.length) { /* skip */ return null }

  const allWorkspaces = await listWorkspaces()  // one call, reused per iteration

  for (const wsEntry of config.workspaces) {
    await processWorkspaceEntry(wsEntry, allWorkspaces, bag, ctx)
  }

  return null
}
```

### Question 2: WindowDetector — one global snapshot or per-workspace

**Decision: one global snapshot (no change to WindowDetector).**

`WindowDetector.begin()` and `resolve()` operate at the integration level, not the workspace-entry level. The snapshot captured in `begin()` is the set of all windows before any tier-1 integration (vscode, intellij) opens. The `resolve()` after aerospace's `open()` returns returns any windows that appeared after tier-1 integrations ran and before aerospace's `open()` finished.

Within `open()`, each workspace entry's `commands` array uses `snapshotWindowIds()` directly — this is per-command snapshot-delta, which already exists in v0.11.1 and does not involve `WindowDetector`.

The `WindowDetector` interface stays completely unchanged. Its begin/resolve cycle happens exactly once around the entire `open()` call, which now contains the N-entry loop internally.

### Question 3: Bag window routing — first workspace only

**Decision: unrouted tier-1 windows (vscode, intellij artifacts in bag) go to `workspaces[0]`.**

"Bag windows" means window IDs accumulated in `ArtifactBag` by tier-1 integrations (vscode, intellij). In v0.11.1, every bag window was moved to the single configured workspace. With a workspaces array, the bag windows have no explicit per-window routing annotation.

The routing rule: bag windows are moved to `workspaces[0]` only, during the first loop iteration.

Implementation: extract bag-window movement out of the general loop body and apply it only when the loop index is 0:

```typescript
for (let i = 0; i < config.workspaces.length; i++) {
  const wsEntry = config.workspaces[i]
  const isBagTarget = i === 0  // only first entry receives bag windows

  if (isBagTarget) {
    await moveBagWindowsToWorkspace(wsEntry.workspace, bag, ctx)
  }

  // ... flatten, commands, layout, focus for this entry
}
```

This rule is simple, predictable, and documented in the schema hint. A future schema extension could add an explicit `receives_bag: true` field to opt other entries in, but that is out of scope for v0.12.0.

### Question 4: Schema design

**Decision: `workspaces` array replaces flat fields. Per-entry config is a named sub-schema.**

The v0.11.1 flat schema:

```typescript
const aerospaceConfigSchema = z.object({
  enabled: z.boolean().optional(),
  workspace: z.string(),              // required in v0.11.1
  layout: z.enum([...]).optional(),
  normalization: z.boolean().optional(),
  flatten_before_open: z.boolean().optional(),
  focus: z.boolean().optional(),
  commands: z.array(aerospaceCommandSchema).optional(),
})
```

The v0.12.0 schema:

```typescript
// Per-entry schema — same fields as flat schema minus `enabled`
const aerospaceWorkspaceEntrySchema = z.object({
  workspace: z.string(),
  layout: z.enum(["h_tiles", "v_tiles", "h_accordion", "v_accordion"]).optional(),
  normalization: z.boolean().optional(),
  flatten_before_open: z.boolean().optional(),
  focus: z.boolean().optional(),
  commands: z.array(aerospaceCommandSchema).optional(),
})

// Top-level schema — `enabled` stays at this level
const aerospaceConfigSchema = z.object({
  enabled: z.boolean().optional(),
  workspaces: z.array(aerospaceWorkspaceEntrySchema).optional(),
})
```

**Focus validation** is a post-parse check, not a Zod refinement. Zod refinements on arrays produce confusing error messages. Instead, validate after `safeParse` succeeds:

```typescript
const focusCount = config.workspaces.filter((ws) => ws.focus === true).length
if (focusCount > 1) {
  spinner?.stop("AeroSpace: at most one workspace entry may have focus: true — skipping")
  return null
}
```

**Breaking change handling:** The v0.11.1 format has flat fields (`workspace: "5"`, not a `workspaces` array). v0.12.0 drops the flat format — this is an intentional breaking change from v0.11.1, aligned with the milestone goal. No migration shim is required; users must update their YAML. The CHANGELOG entry must clearly state this.

## Data Flow

### Multi-workspace open() sequence

```
open(ctx, null, bag)
    |
    v
isAerospaceRunning() → false → return null
    |
    v
parse aerospaceConfigSchema from ctx.workspace.settings?.integrations?.["aerospace"]
    |
    v
if !config.workspaces?.length → log "skipped" → return null
    |
    v
focusCount = count entries with focus: true
if focusCount > 1 → log error → return null
    |
    v
allWorkspaces = await listWorkspaces()   ← ONE call for all entries
    |
    v
for i = 0..N-1 (wsEntry of config.workspaces):
    |
    ├─ validate wsEntry.workspace in allWorkspaces → warn + continue if missing
    |
    ├─ if wsEntry.flatten_before_open:
    |     flattenWorkspaceTree(wsEntry.workspace)
    |
    ├─ if i === 0:   ← BAG-ROUTING: first entry receives all bag windows
    |     for artifact of bag values:
    |       if artifact.kind === "window":
    |         for wid of artifact.windowIds?.["aerospace"]:
    |           moveNodeToWorkspace(wid, wsEntry.workspace)
    |
    ├─ if wsEntry.commands?.length:   ← per-entry commands
    |     for cmd of wsEntry.commands:
    |       [source / app / command branching — same as v0.11.1]
    |
    ├─ if wsEntry.layout:   ← per-entry layout
    |     focus a window in wsEntry.workspace
    |     setLayout(wsEntry.layout)
    |
    └─ if wsEntry.focus:   ← workspace-level focus
          _exec.run(["workspace", wsEntry.workspace])

    v
return null
```

### WindowDetector flow (unchanged from v0.11.1)

```
runner.ts processes aerospace (order 31):

  aerospaceDetector.begin()
  → snapshot all current window IDs as Set<number>

  aerospace.open(ctx, null, bag)   ← multi-workspace loop runs here
  → bag already contains vscode/intellij WindowArtifacts with windowIds["aerospace"]

  aerospaceDetector.resolve(snapshot)
  → polls for any NEW window IDs since begin()
  → returns new IDs (used by runner to populate bag["aerospace"] if aerospace returned WindowArtifact)
  → aerospace always returns null, so resolve() result is unused
```

Note: `resolve()` still runs because runner.ts calls it for all detectors after every `open()`. The result is ignored because aerospace returns null (tier-3 consumer, never a WindowArtifact producer). This is unchanged from v0.11.1.

## Architectural Patterns

### Pattern 1: Single listWorkspaces() call, reused per loop iteration

**What:** Call `listWorkspaces()` once before the loop. Pass the result into each iteration for existence-checking.

**When to use:** Always — even for a 1-entry array. Avoids N subprocess calls for N workspace entries.

**Trade-offs:** The list is a snapshot taken at open() start. A workspace removed from AeroSpace during open() would produce a false-positive existence check. This is acceptable — the window between snapshot and use is milliseconds in practice.

```typescript
const allWorkspaces = await listWorkspaces()
for (const wsEntry of config.workspaces) {
  const exists = allWorkspaces.some((ws) => ws.workspace === wsEntry.workspace)
  if (!exists) {
    if (!ctx.silent) p.log.warn(`AeroSpace workspace "${wsEntry.workspace}" not found — skipping`)
    continue  // skip this entry, continue loop
  }
  // ...
}
```

### Pattern 2: Partial failure tolerance — continue on entry failure

**What:** A try/catch wraps each loop iteration body. Failure of one entry does not abort subsequent entries.

**When to use:** Required for multi-workspace. If workspace entry "5" fails to set layout, workspace entry "6" should still have its commands launched.

**Trade-offs:** Silent continuation makes debugging harder. Mitigated by logging a warn per caught error with the workspace name in context.

```typescript
for (const wsEntry of config.workspaces) {
  try {
    await processEntry(wsEntry, ...)
  } catch (err) {
    if (!ctx.silent) p.log.warn(`AeroSpace: workspace "${wsEntry.workspace}" failed: ${String(err)}`)
    // continue — partial failure acceptable
  }
}
```

This extends the existing per-command try/catch in v0.11.1 to the per-entry level.

### Pattern 3: Focus validation as post-parse check

**What:** After `safeParse()` succeeds, count entries with `focus: true`. Reject configs with more than one.

**When to use:** Any cross-entry validation that is awkward to express in Zod (cross-array constraints).

**Trade-offs:** Zod's `.superRefine()` could handle this, but error messages from Zod refinements on array items are less user-friendly than a manual check with a plain English log message.

```typescript
const parsed = aerospaceConfigSchema.safeParse(rawConfig)
if (!parsed.success) { /* skip */ return null }
const config = parsed.data

const focusEntries = config.workspaces?.filter((ws) => ws.focus === true) ?? []
if (focusEntries.length > 1) {
  spinner?.stop("AeroSpace: at most one workspace entry may have focus: true — skipped")
  return null
}
```

### Pattern 4: Preserving per-entry spinner messages

**What:** The spinner is started once at open() entry, updated per meaningful action, and stopped at the end.

**When to use:** Same as v0.11.1 — `ctx.silent` gates all spinner and log calls.

**Trade-offs:** The spinner text can only show one message at a time. For a 3-entry workspaces array, the last meaningful action's message is shown at stop. This is acceptable for terminal UX; the alternative (one spinner per entry) would cause flicker.

## Integration Points

### Files: New vs Modified

| File | Status | Nature of Change |
|------|--------|-----------------|
| `src/lib/integrations/aerospace.ts` | MODIFIED | New `aerospaceWorkspaceEntrySchema`, replace flat `aerospaceConfigSchema`, loop in `open()`, focus validation, bag routing to index 0 |
| `tests/lib/integrations/aerospace.test.ts` | MODIFIED | New test cases for multi-entry array, focus validation, bag routing, partial failure |
| `src/lib/aerospace.ts` | UNCHANGED | No new shell wrappers needed |
| `src/lib/integrations/types.ts` | UNCHANGED | No interface changes |
| `src/lib/integrations/runner.ts` | UNCHANGED | Already correct — open() loop is internal to aerospace |
| `src/lib/integrations/index.ts` | UNCHANGED | Already registered |
| `src/commands/doctor.ts` | UNCHANGED | Binary check already in place from v0.11.0 |

### Internal Module Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| `runner.ts` → `aerospace.open()` | Single call, returns null | runner.ts does not know about per-entry looping |
| `runner.ts` → `aerospace.windowDetector` | begin()/resolve() once each | Global snapshot — unchanged |
| `aerospace.open()` → `bag` | Read-only: `bag[id]?.windowIds?.["aerospace"]` | Only index-0 entry consumes bag windows |
| `aerospace.open()` → `listWorkspaces()` | One call, result reused | No per-entry subprocess call |

## Build Order

```
Step 1: Update aerospaceWorkspaceEntrySchema + aerospaceConfigSchema
  File: src/lib/integrations/aerospace.ts
  Scope: schema definitions only — no behavior changes yet
  Dependency: none

Step 2: Update open() to loop over workspaces[]
  File: src/lib/integrations/aerospace.ts
  Scope: replace single-workspace body with for-loop; add focus validation; add bag routing
  Dependency: Step 1 (new schema types must exist)

Step 3: Tests
  File: tests/lib/integrations/aerospace.test.ts
  Scope: new test cases for array schema, focus validation, bag routing to [0], per-entry failure tolerance
  Dependency: Step 2 (tests verify new behavior)

Step 4: CHANGELOG + README update
  Scope: document breaking schema change from flat to workspaces array
  Dependency: Steps 1-3 complete
```

All steps are confined to `src/lib/integrations/aerospace.ts`. No cascading changes to other production files. The WindowDetector on the same object is not modified.

## Anti-Patterns

### Anti-Pattern 1: Calling open() multiple times from runner.ts

**What people do:** Add a loop in runner.ts or workspace-ops.ts that calls `aerospaceIntegration.open()` once per workspace entry.

**Why it's wrong:** runner.ts calls `windowDetector.begin()` before `open()` and `windowDetector.resolve()` after. Multiple open() calls with the same snapshot would cause the snapshot delta to include windows from previous open() calls as "new" windows in subsequent calls. The bag window state also changes between calls. The Integration interface contract is one call per integration per workspace open.

**Do this instead:** Put the loop entirely inside `open()`. The Integration interface is unchanged.

### Anti-Pattern 2: Keeping the flat schema as a fallback

**What people do:** Add a compatibility path: if `workspaces` array is absent, fall back to reading flat `workspace: "5"` from the same config object.

**Why it's wrong:** v0.12.0 is explicitly a breaking change. Maintaining two schema paths doubles the test surface, the code paths, and the documentation surface. The config is user-editable YAML with no automatic migration — a clear CHANGELOG entry is the correct mitigation.

**Do this instead:** Parse only `aerospaceConfigSchema` with the `workspaces` array. If `workspaces` is absent or empty, log "no workspaces configured" and return null. Document the migration in the CHANGELOG.

### Anti-Pattern 3: Per-entry listWorkspaces() calls

**What people do:** Inside the loop, call `listWorkspaces()` per entry to get a "fresh" workspace list for existence-checking.

**Why it's wrong:** Each `listWorkspaces()` call spawns an `aerospace` subprocess. With 3 workspace entries, that is 3 extra subprocess calls that return the same data. AeroSpace workspaces are static (defined in aerospace.toml). They do not appear or disappear during an open() call.

**Do this instead:** Call `listWorkspaces()` once before the loop and reuse the result.

### Anti-Pattern 4: Routing bag windows to every workspace entry

**What people do:** In each loop iteration, move all bag windows (vscode/intellij window IDs) to the current workspace entry's target.

**Why it's wrong:** A vscode window can only live in one AeroSpace workspace at a time. Moving it to entry[0] and then entry[1] leaves it in entry[1]. The final position is determined by the last iteration that processes it, not the user's intent. The result is non-deterministic from the user's perspective.

**Do this instead:** Bag windows go to `workspaces[0]` only. This is the primary workspace — the one most likely to receive the IDEs. Document this rule in the schema hint.

### Anti-Pattern 5: Zod `.superRefine()` for focus count validation

**What people do:** Add a `.superRefine()` on `aerospaceConfigSchema` to enforce "at most one focus: true entry".

**Why it's wrong:** Zod refinement errors on array items produce path-qualified messages like `"workspaces[1].focus: invalid"` which are unhelpful in a CLI context where the user needs a plain English explanation. Zod also short-circuits `.safeParse()` on refinement failure, making it harder to surface which entry violated the rule.

**Do this instead:** Let `.safeParse()` validate field types only. After parsing succeeds, count `focus: true` entries manually and log a user-readable message if the count exceeds 1.

## Sources

- `src/lib/integrations/aerospace.ts` — full v0.11.1 implementation, direct code analysis
- `src/lib/integrations/runner.ts` — begin/open/resolve loop, direct code analysis
- `src/lib/integrations/types.ts` — Integration and WindowDetector interface contracts, direct code analysis
- `src/lib/aerospace.ts` — CLI wrapper layer, direct code analysis
- `tests/lib/integrations/aerospace.test.ts` — existing test structure and mock patterns, direct code analysis
- `.planning/PROJECT.md` — milestone goals and v0.12.0 feature list, direct read

---

*Architecture research for: multi-workspace AeroSpace integration (git-stacks v0.12.0)*
*Researched: 2026-03-29*
