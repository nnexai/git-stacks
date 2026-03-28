# Architecture Research

**Domain:** AeroSpace window manager integration for git-stacks CLI (v0.11.0)
**Researched:** 2026-03-28
**Confidence:** HIGH — based on direct code analysis of all existing integration files plus verified AeroSpace CLI behavior from `_references/aerospace.md`

## System Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                     Integration Plugin Layer                         │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌─────────────────────┐ │
│  │ vscode   │  │ intellij │  │  tmux    │  │  niri (order 30)    │ │
│  │ (ord 10) │  │ (ord 11) │  │ (ord 20) │  │  aerospace (ord 31) │ │
│  └──────────┘  └──────────┘  └──────────┘  │  NEW                │ │
│                                             └─────────────────────┘ │
├─────────────────────────────────────────────────────────────────────┤
│             runner.ts — tier-ordered begin/open/resolve loop         │
│             WindowDetectors called around every open() that produces │
│             a WindowArtifact. AeroSpace adds detector id "aerospace" │
├─────────────────────────────────────────────────────────────────────┤
│                  Shell Wrapper Layer (lib/*.ts)                       │
│  ┌────────────────────────┐  ┌──────────────────────────────────┐   │
│  │  src/lib/niri.ts       │  │  src/lib/aerospace.ts  NEW       │   │
│  │  _exec.run via         │  │  _exec.run via $`aerospace`      │   │
│  │  $`niri msg`           │  │  --format TSV field parsing      │   │
│  │  JSON → Zod schemas    │  │  TypeScript types + manual parse │   │
│  └────────────────────────┘  └──────────────────────────────────┘   │
├─────────────────────────────────────────────────────────────────────┤
│                     External Process Layer                           │
│  ┌───────────────────────┐    ┌─────────────────────────────────┐   │
│  │  niri compositor      │    │  aerospace CLI binary           │   │
│  │  IPC socket           │    │  CLI subprocess (macOS only)    │   │
│  │  NIRI_SOCKET env gate │    │  no env var gate — probe binary │   │
│  └───────────────────────┘    └─────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Status |
|-----------|----------------|--------|
| `src/lib/aerospace.ts` | Typed async CLI wrappers; `--format` TSV parsing; injectable `_exec` for test isolation | NEW |
| `src/lib/integrations/aerospace.ts` | Tier-3 plugin (order 31); WindowDetector; snapshot-delta detection; workspace movement; normalization-aware layout | NEW |
| `src/lib/integrations/index.ts` | Plugin registry — add `aerospaceIntegration` import + array entry | MODIFIED (one line) |
| `src/commands/doctor.ts` | Runtime dependency checks — add `aerospace` to `binaries` array | MODIFIED (one entry) |
| `src/lib/integrations/types.ts` | Integration, WindowDetector, ArtifactBag interfaces | UNCHANGED |
| `src/lib/integrations/runner.ts` | Tier-ordered execution; multi-detector WindowDetector support | UNCHANGED |

## Recommended Project Structure

```
src/
├── lib/
│   ├── niri.ts              # existing
│   ├── aerospace.ts         # NEW — CLI wrappers + TSV parser
│   └── integrations/
│       ├── types.ts         # unchanged
│       ├── niri.ts          # unchanged
│       ├── aerospace.ts     # NEW — tier-3 plugin
│       ├── index.ts         # MODIFIED — add aerospaceIntegration
│       └── runner.ts        # unchanged
└── commands/
    └── doctor.ts            # MODIFIED — add aerospace binary check
```

### Structure Rationale

- `aerospace.ts` lives at `lib/` (not inside `integrations/`) for the same reason `niri.ts` does: low-level CLI wrappers are independently testable without the integration plugin layer. Unit tests import `lib/aerospace.ts` directly and mock `_exec`. Integration plugin tests mock the whole `lib/aerospace.ts` module.
- No new directories. The feature slots into exactly two existing locations.

## Architectural Patterns

### Pattern 1: Injectable `_exec` for CLI Subprocess Isolation

**What:** A mutable object `_exec` whose `run` method executes the subprocess. Tests replace `_exec.run` with a mock, bypassing Bun's module mock cache issues.

**When to use:** Any module that wraps an external binary via `$` shell calls. This is the established pattern for `niri.ts`, `tmux.ts`, `cmux.ts`.

**Trade-offs:** Requires test files to import `_exec` and mutate it. More explicit than `mock.module()`, and avoids cache pollution in Bun's test runner when multiple test files run in the same process.

```typescript
// src/lib/aerospace.ts
export type AerospaceCmdResult = { exitCode: number; stdout: string }

export const _exec = {
  run: async (args: string[]): Promise<AerospaceCmdResult> => {
    const result = await $`aerospace ${args}`.quiet().nothrow()
    return { exitCode: result.exitCode, stdout: result.text() }
  },
}
```

The only difference from niri's `_exec`: `$\`aerospace ${args}\`` instead of `$\`niri msg ${args}\``. No IPC socket involved — direct subprocess call.

### Pattern 2: `--format` TSV Parsing vs JSON Parsing

**What:** AeroSpace outputs tab-separated values when `--format` is used. The caller provides a format string with `%{field-name}` tokens separated by `\t`. The output is parsed by splitting on `\n` then `\t` and mapping positionally to typed fields.

**When to use:** All `list-windows` and `list-workspaces` calls. `list-windows --json` is too sparse (only 3 fields). `--format` provides `app-pid`, `app-bundle-id`, `workspace` and other fields essential for window identification and ArtifactBag matching.

**Trade-offs:** Field order is determined by the format string, not the API. The format string is the schema contract — it must stay in sync with the parser. Use a named constant to prevent drift.

```typescript
// src/lib/aerospace.ts

// Format string is the schema — keep in sync with parseWindowRow()
const WINDOW_FORMAT =
  "%{window-id}\t%{app-bundle-id}\t%{app-name}\t%{app-pid}\t%{workspace}" +
  "\t%{window-layout}\t%{window-is-fullscreen}\t%{window-title}"

export type AerospaceWindow = {
  windowId: number
  appBundleId: string
  appName: string
  appPid: number
  workspace: string
  windowLayout: string
  windowIsFullscreen: boolean
  windowTitle: string
}

function parseWindowRow(line: string): AerospaceWindow | null {
  const parts = line.split("\t")
  if (parts.length < 8) return null
  const windowId = parseInt(parts[0], 10)
  if (isNaN(windowId)) return null
  return {
    windowId,
    appBundleId: parts[1],
    appName: parts[2],
    appPid: parseInt(parts[3], 10),
    workspace: parts[4],
    windowLayout: parts[5],
    windowIsFullscreen: parts[6] === "true",
    windowTitle: parts[7],
  }
}

export async function listAerospaceWindows(): Promise<AerospaceWindow[]> {
  try {
    const result = await _exec.run(["list-windows", "--all", "--format", WINDOW_FORMAT])
    if (result.exitCode !== 0) return []
    return result.stdout
      .trim()
      .split("\n")
      .filter(Boolean)
      .map(parseWindowRow)
      .filter((w): w is AerospaceWindow => w !== null)
  } catch {
    return []
  }
}
```

Contrast with niri: `JSON.parse(result.stdout)` then `z.array(NiriWindowSchema).parse(...)`. AeroSpace uses positional parsing — simpler but the exported TypeScript type still provides the same level of consumer-facing type safety.

### Pattern 3: Normalization-Aware Layout Control

**What:** AeroSpace's `enable-normalization-flatten-containers` config setting changes which layout commands are effective. With normalization on (the default and most common user config), `split` returns exit code 1 with a message saying it has no effect. With normalization off, `split` works but `join-with` and `flatten-workspace-tree` are the correct primitives.

**When to use:** Any time the integration issues layout commands after moving windows.

**Trade-offs:** Detecting normalization state from `aerospace config --get` is unreliable — reference testing showed the command does not expose all TOML keys even when they exist in the config file. Reading the TOML file directly is more reliable but adds a TOML parser dependency. The cleanest approach: let the user declare normalization mode in the git-stacks config schema, defaulting to `true` (normalization on, which matches the AeroSpace default). The integration never calls `split` by default.

Config schema in `integrations/aerospace.ts`:

```typescript
const aerospaceConfigSchema = z.object({
  enabled: z.boolean().optional(),
  workspace: z.string().optional(),          // target AeroSpace workspace name or number
  focus: z.boolean().optional(),             // switch to workspace after opening
  normalization: z.boolean().optional(),     // true=use join-with/flatten, false=use split
  layout: z.enum([
    "h_tiles", "v_tiles", "h_accordion", "v_accordion"
  ]).optional(),
})
```

Runtime selection:

```typescript
const normalization = config.normalization ?? true  // default: normalization enabled
if (normalization) {
  await flattenWorkspaceTree(targetWorkspace)        // reset to root policy
  await applyRootLayout(layout)                      // layout h_tiles etc.
} else {
  await splitLayout(layout)                          // split horizontal/vertical
}
```

### Pattern 4: Snapshot-Delta WindowDetector for AeroSpace

**What:** Implement the `WindowDetector` interface on the integration plugin (same as niri). `begin()` captures the current `window-id` set via `listAerospaceWindows()`. `resolve()` polls until new IDs appear. `runner.ts` calls `begin()` before each integration's `open()` and `resolve()` after it returns a `WindowArtifact`, populating `artifact.windowIds["aerospace"]` without those integrations importing from `aerospace.ts`.

**When to use:** Required so that tier-3 AeroSpace integration can receive window IDs from tier-1/tier-2 integrations (vscode, intellij, tmux) and move those windows to the target AeroSpace workspace.

**Trade-offs:** Same polling loop as niri — 200ms initial delay, exponential backoff, 10s timeout. Works reliably for both new-app launches and new-window-in-running-app cases per the reference exploration.

```typescript
// integrations/aerospace.ts
windowDetector: {
  id: "aerospace",
  async begin(): Promise<DetectorSnapshot> {
    const running = await isAerospaceRunning()
    if (!running) return { _brand: "aerospace", data: new Set<number>() }
    const windows = await listAerospaceWindows()
    return { _brand: "aerospace", data: new Set(windows.map((w) => w.windowId)) }
  },
  async resolve(snapshot: DetectorSnapshot): Promise<number[]> {
    const beforeIds = snapshot.data as Set<number>
    const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))
    const deadline = Date.now() + 10_000
    let delay = 200
    while (Date.now() < deadline) {
      await sleep(delay)
      const after = await listAerospaceWindows()
      const newIds = after.map((w) => w.windowId).filter((id) => !beforeIds.has(id))
      if (newIds.length > 0) return newIds
      delay = Math.min(delay * 2, 2_000)
    }
    return []
  },
} satisfies WindowDetector,
```

Key field name difference from niri: `w.windowId` (camelCase, from TSV parser) vs `w.id` (Zod-validated JSON field). The `_brand: "aerospace"` string prevents DetectorSnapshot values from different detectors from being cross-consumed.

### Pattern 5: AeroSpace Running Check (macOS-Only Gate)

**What:** niri uses `Boolean(process.env.NIRI_SOCKET)` as a zero-cost running check. AeroSpace exports no equivalent env var. The gate is: `process.platform === "darwin"` first, then probe the binary with a lightweight command.

**When to use:** At the top of `open()` in the integration plugin — return null immediately if AeroSpace is not available.

```typescript
// src/lib/aerospace.ts
export async function isAerospaceRunning(): Promise<boolean> {
  if (process.platform !== "darwin") return false
  try {
    const result = await _exec.run(["list-workspaces", "--json"])
    return result.exitCode === 0
  } catch {
    return false
  }
}
```

`list-workspaces --json` is cheap, read-only, and exits 0 when AeroSpace is running and manages the display. Cache the result within a single `open()` invocation to avoid repeated probes.

## Data Flow

### Integration Open Flow (AeroSpace at Order 31)

```
runIntegrations(ctx)
    |
    v
sorted: vscode(10) → intellij(11) → tmux(20) → niri(30) → aerospace(31)
    |
    v
For each integration:
  detector.begin()  <-- aerospaceDetector.begin() captures window-id Set
      |
      v
  integration.open(ctx, artifactPath, bag)  <-- e.g. vscode opens, returns WindowArtifact{pid}
      |
      v
  if artifact.kind === "window":
    aerospaceDetector.resolve(snapshot)
    --> polls listAerospaceWindows() until new windowId appears
    artifact.windowIds["aerospace"] = [newWindowId]
      |
      v
  bag["vscode"] = artifact  <-- now has windowIds["aerospace"]

... at order 31 ...

aerospace.open(ctx, null, bag)
    |
    v
  isAerospaceRunning()  --> false? return null immediately
    |
    v
  resolve target workspace from:
    ctx.workspace.settings?.integrations?.["aerospace"]?.workspace ?? "1"
    |
    v
  for each artifact in bag:
    artifact.windowIds?.["aerospace"]?.forEach(id =>
      moveNodeToWorkspace(id, targetWorkspace)
    )
    |
    v
  apply layout (normalization-aware):
    normalization=true  --> flattenWorkspaceTree + applyRootLayout
    normalization=false --> splitLayout
    |
    v
  optionally focus or return to prior workspace (mirrors niri focus: true/false)
    |
    v
  return null  <-- tier-3 is consumer, not producer
```

### TSV Parsing Data Flow

```
_exec.run(["list-windows", "--all", "--format", WINDOW_FORMAT])
    |
result.stdout = "21096\tcom.apple.Notes\tNotes\t59035\t5\th_tiles\tfalse\tNotes\n..."
    |
result.stdout.trim().split("\n").filter(Boolean)
    |
.map(parseWindowRow)  --> positional split on \t --> typed AerospaceWindow objects
    |
.filter(w => w !== null)  --> AerospaceWindow[]
    |
used for:
  begin()   --> new Set(windows.map(w => w.windowId))
  resolve() --> diff against beforeIds Set
  open()    --> filter by workspace name for context
```

### Workspace YAML Config Path

```
User workspace YAML:
  settings:
    integrations:
      aerospace:
        enabled: true
        workspace: "5"          # target AeroSpace workspace
        focus: false            # don't switch to it after opening
        normalization: true     # use join-with/flatten (default)
        layout: "h_tiles"       # root layout to apply
    |
    v
aerospaceConfigSchema.safeParse(ctx.workspace.settings?.integrations?.["aerospace"] ?? {})
```

## Build Order and Dependencies

```
Step 1: src/lib/aerospace.ts
  deps: none
  blast radius: new file only
  test approach: _exec.run = mockFn directly (unit tests, no mock.module)

Step 2: src/lib/integrations/aerospace.ts
  deps: aerospace.ts (Step 1)
  blast radius: new file only
  test approach: mock.module("@/lib/aerospace", () => ({...})) — all exports mocked
                 same pattern as Phase 20 niri integration tests

Step 3: src/lib/integrations/index.ts
  deps: aerospace.ts plugin (Step 2)
  blast radius: single import line + array entry

Step 4: src/commands/doctor.ts
  deps: none — independent of Steps 1-3
  blast radius: one entry in binaries array
  can be done in any order relative to Steps 1-3
```

All four steps are additive. No existing function signatures change. No YAML schema migrations.

## Key Differences: AeroSpace vs Niri

| Concern | Niri | AeroSpace |
|---------|------|-----------|
| Transport | IPC socket (`niri msg`) | CLI subprocess (`aerospace <cmd>`) |
| Running check | `process.env.NIRI_SOCKET` | `platform === "darwin" && exit code 0` |
| Output format | JSON → Zod validation | `--format` TSV → positional field parsing |
| Output schema definition | Zod schemas (`NiriWindowSchema`) | TypeScript types + format string constant |
| Workspace model | Dynamic; create new on demand via `focusWorkspaceDown` | Static; user-defined in aerospace.toml |
| Create workspace | `focusWorkspaceDown()` + `setWorkspaceName()` | Not possible — move to existing target workspace |
| Window movement command | `move-window-to-workspace` | `move-node-to-workspace` |
| Layout primitives | `set-column-width`, `consume-or-expel`, `move-column-to-index` | `layout`, `join-with`, `flatten-workspace-tree` |
| Normalization concept | N/A | `enable-normalization-flatten-containers` gates which layout cmds work |
| Cleanup on remove | `unsetNiriWorkspaceName` | None — static workspace; user manages lifecycle |
| Plugin order | 30 | 31 (runs after niri when both enabled) |

## Integration Points

### Files: New vs Modified

| File | Status | Nature of Change |
|------|--------|-----------------|
| `src/lib/aerospace.ts` | NEW | ~100 lines — TSV-parsing CLI wrappers with `_exec` injection |
| `src/lib/integrations/aerospace.ts` | NEW | ~150 lines — tier-3 plugin mirroring niri integration structure |
| `src/lib/integrations/index.ts` | MODIFIED | +1 import line, +1 array entry |
| `src/commands/doctor.ts` | MODIFIED | +1 entry in `binaries` array inside `doctorCommand.action` |
| `src/lib/integrations/types.ts` | UNCHANGED | No interface changes needed |
| `src/lib/integrations/runner.ts` | UNCHANGED | Already supports multiple WindowDetectors |

### Internal Module Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| `aerospace.ts` → `integrations/aerospace.ts` | Direct named imports | Mirrors `niri.ts` → `integrations/niri.ts` |
| `runner.ts` → `integrations/aerospace.ts` | `Integration` interface only | No runner changes |
| `integrations/aerospace.ts` → `ArtifactBag` | Read `bag[id]?.windowIds?.["aerospace"]` | Consumer, not producer |
| `doctor.ts` → `aerospace` binary | `checkBinary("aerospace")` helper | No new helper needed |

## Anti-Patterns

### Anti-Pattern 1: Using `list-windows --json` Instead of `--format`

**What people do:** Call `aerospace list-windows --json` because JSON looks more structured.

**Why it's wrong:** Default `--json` returns only 3 fields: `app-name`, `window-id`, `window-title`. Missing `app-pid`, `app-bundle-id`, and `workspace`. Without `app-pid`, matching windows to `WindowArtifact` entries in `ArtifactBag` for `windowIds` population is not possible.

**Do this instead:** Always use `list-windows --all --format WINDOW_FORMAT`. Define `WINDOW_FORMAT` as a named constant that includes all 8 required fields in a fixed order.

### Anti-Pattern 2: Using `split` Without Normalization Check

**What people do:** Issue `aerospace split vertical` to create a layout split.

**Why it's wrong:** With `enable-normalization-flatten-containers = true` (the AeroSpace default), `split` returns exit code 1 and a message saying it has no effect. The integration would silently fail to set layout.

**Do this instead:** Default to normalization-on behavior (`join-with` + `flatten-workspace-tree`). Expose `normalization: boolean` in the config schema for users who have disabled normalization in their `aerospace.toml`.

### Anti-Pattern 3: Probing `aerospace config --get` for Normalization State

**What people do:** Call `aerospace config --get enable-normalization-flatten-containers` to detect normalization state automatically without requiring user config.

**Why it's wrong:** Reference testing showed `aerospace config --get` does not reliably expose all TOML keys even when they exist in the config file. Automating on unreliable output causes non-deterministic layout behavior.

**Do this instead:** Provide an explicit `normalization` field in the git-stacks integration config schema. Default `true` (the safest assumption). Document the setting in the hint string so users with non-default configs know to set it.

### Anti-Pattern 4: Treating AeroSpace Workspaces as Dynamic Like Niri

**What people do:** Attempt to create a fresh AeroSpace workspace per git-stacks workspace, mirroring `focusNiriWorkspaceDown()`.

**Why it's wrong:** AeroSpace workspaces are static, user-defined in `aerospace.toml` and bound to keyboard shortcuts. There is no "create new workspace" command. AeroSpace's model is permanent numbered/named slots, not a dynamic list.

**Do this instead:** Require the user to specify a `workspace` in `settings.integrations.aerospace.workspace`. Default to `"1"` if unset. Move windows to that workspace with `move-node-to-workspace`. Document in the hint that the workspace must exist in the user's `aerospace.toml`.

### Anti-Pattern 5: Importing Integration Directly in Tests Without Module-Level Mocking

**What people do:** Import `aerospaceIntegration` and call `open()` in tests while expecting the actual `aerospace` CLI subprocess to be skipped.

**Why it's wrong:** The `$` shell in Bun cannot be intercepted via `mock.module()`. The integration calls `listAerospaceWindows()` which calls `_exec.run()` which calls `$\`aerospace\``.

**Do this instead:**
- Unit tests for `src/lib/aerospace.ts`: import `{ _exec }` and set `_exec.run = mockFn` directly.
- Integration tests for `src/lib/integrations/aerospace.ts`: use `mock.module("@/lib/aerospace", () => ({ listAerospaceWindows: mockFn, isAerospaceRunning: mockFn, moveNodeToWorkspace: mockFn, ... }))` — same pattern Phase 20 niri integration tests use.

## Sources

- `src/lib/niri.ts` — authoritative pattern for `_exec` injection and CLI wrapper structure (direct code analysis)
- `src/lib/integrations/niri.ts` — authoritative pattern for tier-3 plugin, WindowDetector, ArtifactBag consumption (direct code analysis)
- `src/lib/integrations/types.ts` — `Integration`, `WindowDetector`, `DetectorSnapshot`, `ArtifactBag` contracts (direct code analysis)
- `src/lib/integrations/runner.ts` — how WindowDetectors are called around `open()` (direct code analysis)
- `src/commands/doctor.ts` — binary check pattern: `checkBinary()`, `binaries` array structure (direct code analysis)
- `_references/aerospace.md` — direct AeroSpace CLI exploration: TSV format fields, normalization behavior, snapshot-delta strategy, commands classification

---

*Architecture research for: AeroSpace window manager integration (git-stacks v0.11.0)*
*Researched: 2026-03-28*
