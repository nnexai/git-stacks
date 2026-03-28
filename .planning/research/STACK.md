# Stack Research

**Domain:** Bun CLI tool — v0.11.0 AeroSpace Window Management Integration
**Researched:** 2026-03-28
**Confidence:** HIGH (AeroSpace CLI verified against local exploration notes + official docs; Bun.TOML verified against official Bun docs; niri integration pattern verified against source)

---

## Scope

This document covers **only what is new for v0.11.0**. The existing stack (Bun runtime, TypeScript strict, Commander.js 12.1.0, SolidJS 1.9.11 + @opentui/core 0.1.87, Zod 3.25.76 + yaml 2.8.2, @clack/prompts 0.9.1) is unchanged and not re-researched.

Two new components, five questions:

1. `src/lib/aerospace.ts` — what CLI invocation pattern replaces niri's JSON IPC?
2. `--format` string parsing — how do we parse tab-delimited `%{field}` output into typed structs?
3. TOML config reading — do we need a TOML parser to read `aerospace.toml` for normalization detection, and which one?
4. `src/lib/integrations/aerospace.ts` — what differs from the niri plugin pattern?
5. What NOT to add — libraries that are tempting but wrong for this context.

---

## Recommended Stack

### Core Technologies

All existing. No new runtime, framework, or language additions required for v0.11.0.

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Bun `$` shell | (runtime) | All `aerospace` CLI invocations | Same pattern as niri's `_exec.run(args)` — `$\`aerospace ${args}\`.quiet().nothrow()`; AeroSpace uses CLI not IPC socket |
| Zod | 3.25.76 | Typed schemas for parsed `--format` rows | Already installed; `z.object({ windowId: z.number(), appBundleId: z.string(), ... })` for validated row structs after `splitFormatRow()` |
| `Bun.TOML.parse` | (runtime built-in) | Read `aerospace.toml` for normalization detection | Bun has a native `TOML.parse(string)` API — no npm package needed; use `import { TOML } from "bun"` |

### Supporting Libraries

No new npm dependencies are required. All capabilities map to existing tools or Bun built-ins.

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| (none new) | — | — | — |

### Development Tools

No changes to dev tooling.

---

## Feature-Specific Implementation Notes

### `src/lib/aerospace.ts` — Shell Wrappers

**Key difference from niri.ts:** AeroSpace has no IPC socket. All commands go through the `aerospace` CLI binary. niri uses `niri msg -j <action>` with JSON output; AeroSpace uses `aerospace <subcommand> --format '%{field}\t...'` with tab-delimited text output.

**`_exec` injectable pattern — same as niri:**

```typescript
export type AerospaceCmdResult = { exitCode: number; stdout: string }

export const _exec = {
  run: async (args: string[]): Promise<AerospaceCmdResult> => {
    const result = await $`aerospace ${args}`.quiet().nothrow()
    return { exitCode: result.exitCode, stdout: result.text() }
  },
}
```

Tests replace `_exec.run` with a mock. No `mock.module()` needed — the mutable object property pattern is established in `niri.ts`, `tmux.ts`, `cmux.ts`.

**`isAeroSpaceRunning()` — availability gate:**

AeroSpace is macOS-only. The guard is not an env var check (unlike `NIRI_SOCKET`) — it is a binary presence check:

```typescript
export async function isAeroSpaceRunning(): Promise<boolean> {
  const result = await $`which aerospace`.quiet().nothrow()
  return result.exitCode === 0
}
```

This is sufficient because `aerospace` is only installed on macOS and only available when AeroSpace is running. Do NOT check for a socket file or process name — the `which` check covers the "binary available" case; a separate `list-workspaces` health probe can verify the daemon is actually responsive if needed.

**`--format` string parsing — no library needed:**

`list-windows` and `list-workspaces` use `--format '%{field1}\t%{field2}\t...'` with tab-separated output. Each line is a record. Parsing is:

```typescript
function splitFormatRow(line: string, fields: number): string[] {
  const parts = line.split('\t')
  return parts.length === fields ? parts : []  // discard malformed rows
}
```

The format string is fixed in the wrapper (not user-configurable), so the field count is always known at compile time. No CSV/TSV parsing library needed.

**Recommended format string for `listAerospaceWindows()`:**

```
%{window-id}\t%{app-bundle-id}\t%{app-name}\t%{app-pid}\t%{workspace}\t%{window-layout}\t%{window-is-fullscreen}\t%{window-title}
```

This captures all fields needed for snapshot-delta detection and window identity. `window-id` is the operational handle; `app-bundle-id` is stable app identity.

**Recommended format string for `listAerospaceWorkspaces()`:**

```
%{workspace}\t%{workspace-is-focused}\t%{workspace-is-visible}\t%{workspace-root-container-layout}\t%{monitor-id}
```

**Zod schemas for parsed output:**

```typescript
const AerospaceWindowSchema = z.object({
  windowId: z.number(),
  appBundleId: z.string(),
  appName: z.string(),
  appPid: z.number(),
  workspace: z.string(),
  windowLayout: z.string(),
  windowIsFullscreen: z.boolean(),
  windowTitle: z.string(),
})

const AerospaceWorkspaceSchema = z.object({
  workspace: z.string(),
  isFocused: z.boolean(),
  isVisible: z.boolean(),
  rootContainerLayout: z.string(),
  monitorId: z.number(),
})
```

Parse with `AerospaceWindowSchema.parse({ windowId: parseInt(parts[0]), ... })` after `splitFormatRow`. Return `[]` on any parse failure (same defensive pattern as niri.ts).

**Core wrapper functions to implement:**

| Function | AeroSpace command | Notes |
|---|---|---|
| `isAeroSpaceRunning()` | `which aerospace` | Binary gate — returns bool |
| `listAerospaceWindows()` | `list-windows --all --format '...'` | Returns `AerospaceWindow[]` |
| `listAerospaceWorkspaces()` | `list-workspaces --all --format '...'` | Returns `AerospaceWorkspace[]` |
| `moveWindowToAerospaceWorkspace(windowId, workspace)` | `move-node-to-workspace --window-id <id> <ws>` | Moves one window |
| `focusAerospaceWorkspace(workspace)` | `workspace <ws>` | Switch focus to workspace |
| `aerospaceLayout(layout)` | `layout <layout>` | Set root container layout |
| `aerospaceFlattenWorkspaceTree(workspace?)` | `flatten-workspace-tree [--workspace <ws>]` | Reset/normalize layout |

**AerospaceCLI interface for test mock completeness (mirrors NiriCommands):**

```typescript
export interface AerospaceCommands {
  isAeroSpaceRunning(): Promise<boolean>
  listAerospaceWindows(): Promise<AerospaceWindow[]>
  listAerospaceWorkspaces(): Promise<AerospaceWorkspace[]>
  moveWindowToAerospaceWorkspace(windowId: number, workspace: string): Promise<void>
  focusAerospaceWorkspace(workspace: string): Promise<void>
  aerospaceLayout(layout: string): Promise<void>
  aerospaceFlattenWorkspaceTree(workspace?: string): Promise<void>
}
```

**Confidence:** HIGH — all functions directly derived from verified CLI exploration in `_references/aerospace.md`.

---

### TOML Config Reading for Normalization Detection

**The problem:** `aerospace split` is a no-op when `enable-normalization-flatten-containers = true` in `aerospace.toml`. The controller must either:
1. Detect this setting and use `join-with` instead of `split`, or
2. Let the user configure which strategy to use via `settings.integrations.aerospace.layout_strategy`

**Recommendation:** Use the user-configuration approach (option 2) as the default path. This avoids a fragile file-path assumption. The normalization detection via TOML is a **secondary enhancement** for better defaults.

**If TOML reading is implemented** (for normalization auto-detection):

Use `Bun.TOML.parse()` — it is a native Bun built-in. No npm package needed.

```typescript
import { TOML } from "bun"

async function readAerospaceConfig(): Promise<Record<string, unknown>> {
  const configPath = `${process.env.HOME}/.config/aerospace/aerospace.toml`
  try {
    const text = await Bun.file(configPath).text()
    return TOML.parse(text) as Record<string, unknown>
  } catch {
    return {}
  }
}
```

`Bun.TOML.parse(string)` is documented and available in Bun 1.x (confirmed in official Bun docs, last updated 2026-03-21 for Bun 1.3.11).

**Important caveat:** `aerospace config --get` does not expose all TOML keys reliably (confirmed in `_references/aerospace.md`). Do not use the `aerospace config` CLI for normalization detection. Read the file directly with `Bun.TOML.parse`.

**Default config path:** `~/.config/aerospace/aerospace.toml`. AeroSpace also supports `~/.aerospace.toml`. Check both with existence checks; prefer `~/.config/aerospace/aerospace.toml`.

**Confidence:** HIGH — Bun.TOML.parse verified in official Bun docs; file path confirmed in exploration notes.

---

### `src/lib/integrations/aerospace.ts` — Integration Plugin

**Pattern match to niri.ts** — tier-3 plugin at `order: 31` (one above niri's 30 to allow coexistence on Linux when only niri is running).

**Key structural differences from niri.ts:**

| Aspect | niri | AeroSpace |
|---|---|---|
| Availability gate | `process.env.NIRI_SOCKET` | `which aerospace` exit 0 |
| Window identification | niri window ID (integer) | AeroSpace window ID (integer, `%{window-id}`) |
| Workspace creation | `focusNiriWorkspaceDown()` + `setNiriWorkspaceName()` | Use existing named/numbered workspace — AeroSpace workspaces are pre-configured names in config |
| Window movement | `moveWindowToWorkspace(windowId, workspaceName)` | `moveWindowToAerospaceWorkspace(windowId, workspace)` |
| Layout commands | Not applicable | `aerospaceLayout()` + `aerospaceFlattenWorkspaceTree()` |
| Cleanup | `unsetNiriWorkspaceName()` | No cleanup needed — AeroSpace workspaces are config-defined |
| WindowDetector | Yes — `snapshotWindowIds` via poll | Yes — before/after `listAerospaceWindows()` diff by window-id |

**Snapshot-delta detection — no polling needed:**

Unlike niri (which must poll because niri creates windows asynchronously), AeroSpace's `list-windows` output is synchronous CLI state. The integration opens a process via `Bun.spawn` (to capture PID) and waits for the window to appear. The `WindowDetector.begin()` / `WindowDetector.resolve()` pattern from `types.ts` works directly:

```typescript
windowDetector: {
  id: "aerospace",
  async begin(): Promise<DetectorSnapshot> {
    const running = await isAeroSpaceRunning()
    if (!running) return { _brand: "aerospace", data: new Set<number>() }
    const windows = await listAerospaceWindows()
    return { _brand: "aerospace", data: new Set(windows.map(w => w.windowId)) }
  },
  async resolve(snapshot, _hints): Promise<number[]> {
    // Poll with exponential backoff, same as niri WindowDetector
    // ...
  }
}
```

**Config schema:**

```typescript
const aerospaceConfigSchema = z.object({
  enabled: z.boolean().optional(),
  workspace: z.string().optional(),          // target AeroSpace workspace name (e.g. "5", "work")
  focus: z.boolean().optional(),             // whether to focus workspace after setup
  layout: z.string().optional(),             // root layout to apply (h_tiles, h_accordion, etc.)
  flatten_after: z.boolean().optional(),     // run flatten-workspace-tree before layout
})
```

**Confidence:** HIGH — derived from niri.ts pattern + AeroSpace CLI verified in exploration notes.

---

### `git-stacks doctor` Check

Add to `src/commands/doctor.ts`: a check that verifies `aerospace` binary is available when AeroSpace integration is enabled. Follow the existing pattern for `tmux`, `niri` binary checks already in doctor.ts.

**Confidence:** HIGH — pattern already established for niri binary check.

---

## Alternatives Considered

| Recommended | Alternative | Why Not |
|-------------|-------------|---------|
| `Bun.TOML.parse` (built-in) | `smol-toml` npm package | Bun has native TOML parsing; no dependency justified |
| `Bun.TOML.parse` (built-in) | `@iarna/toml` npm package | Same — adds production dep for something Bun provides natively |
| `Bun.TOML.parse` (built-in) | `js-toml` npm package | Same — native Bun API is sufficient |
| Tab-split parsing in `splitFormatRow()` | CSV/TSV parsing library | The format string is controlled by our code; field count is fixed; `String.split('\t')` is sufficient |
| User-configured `layout_strategy` field | Auto-detect normalization via `aerospace config --get` | `aerospace config --get` does not reliably expose all TOML keys (confirmed in exploration notes); file read is more reliable but adds complexity |
| `which aerospace` binary check | `AEROSPACE_SOCKET` env var | AeroSpace does not expose an env var equivalent to `NIRI_SOCKET`; binary presence is the correct gate |
| `order: 31` for AeroSpace plugin | `order: 30` (same as niri) | Both can be installed; different order allows coexistence when only niri or only AeroSpace is present; niri is Linux, AeroSpace is macOS so they won't both run, but separate order values are cleaner |

---

## What NOT to Add

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `smol-toml` / `@iarna/toml` / `js-toml` | Bun has `TOML.parse()` built in; adding a dep for built-in functionality is unnecessary | `import { TOML } from "bun"` |
| `aerospace config --get <key>` for normalization detection | The reference notes explicitly confirm this does not expose all TOML keys reliably | `Bun.TOML.parse(await Bun.file(configPath).text())` |
| `aerospace` JSON output (`--json` flag on `list-windows`) | `list-windows --json` only returns `app-name`, `window-id`, `window-title` — insufficient for stable app identity and workspace tracking | `list-windows --format '%{window-id}\t%{app-bundle-id}\t...'` |
| Node.js `fs.readFileSync` for TOML reading | Use Bun-native APIs throughout; `Bun.file(path).text()` is the established pattern | `Bun.file(configPath).text()` |
| Hardcoded AeroSpace workspace creation | AeroSpace workspaces are defined in `aerospace.toml`; the integration should target existing named workspaces, not create new ones | `workspace` config field in integration settings pointing to an existing workspace name |

---

## AeroSpace Version Compatibility

**Current version:** v0.20.3-Beta (March 8, 2025) — project is pre-1.0 beta only; no stable releases exist.

**Breaking change in v0.20.0:** `--stdin` flag now required for stdin-piped workspace names on `workspace` and `move-node-to-workspace`. Our implementation uses explicit `--window-id` and positional workspace args — not stdin — so this breaking change does not affect us.

**`--format` flag stability:** The `%{field}` interpolation variables for `list-windows` and `list-workspaces` have been stable across the beta versions documented. The reference notes were collected against v0.20.3-Beta and the format variables documented in the official AeroSpace commands page match.

**Minimum version for our feature set:** v0.20.x-Beta. All commands we use (`list-windows --format`, `list-workspaces --format`, `move-node-to-workspace --window-id`, `workspace`, `layout`, `flatten-workspace-tree`) are present and working in v0.20.3-Beta.

**Version check in doctor:** The doctor check should verify `aerospace` is available but does not need to enforce a minimum version — the CLI behavior is stable enough for our use.

---

## Version Compatibility

| Component | Requires | Notes |
|-----------|----------|-------|
| `Bun.TOML.parse` | Bun 1.x | Documented in Bun 1.3.11 official docs; available across all recent Bun 1.x versions |
| AeroSpace `--format` parsing | AeroSpace v0.20.x+ | `%{window-id}` and all fields used were confirmed in v0.20.3-Beta exploration; v0.20.0 added `persistent-workspaces` (not relevant to our use) |
| `_exec` injectable pattern | (no version) | Established pattern in niri.ts, tmux.ts, cmux.ts — no version constraint |
| `WindowDetector` interface | (no version) | Defined in `src/lib/integrations/types.ts`; no changes needed |

---

## Installation

No new npm packages to install for v0.11.0. All capabilities are covered by the existing dependency set plus Bun built-ins.

```bash
# No new dependencies
```

---

## Sources

- `_references/aerospace.md` — Full CLI exploration against AeroSpace v0.20.3-Beta; `--format` variables verified, normalization behavior confirmed, snapshot strategy documented (HIGH confidence)
- `src/lib/niri.ts` — Verified injectable `_exec` pattern and `SnapshotOpts` approach to adopt (HIGH confidence)
- `src/lib/integrations/niri.ts` — Verified `WindowDetector` implementation and `order: 30` tier-3 plugin structure (HIGH confidence)
- `src/lib/integrations/types.ts` — Verified `WindowDetector`, `DetectorSnapshot`, `ArtifactBag`, `Integration` interface contracts (HIGH confidence)
- `bun.com/reference/bun/TOML` — Confirmed `Bun.TOML.parse(string)` API exists, documented for Bun 1.3.11 (HIGH confidence)
- `bun.sh/guides/runtime/import-toml` — Confirmed `import { TOML } from "bun"` syntax (HIGH confidence)
- `nikitabobko.github.io/AeroSpace/commands` — Official command reference: `list-windows`, `list-workspaces`, `move-node-to-workspace --window-id` flags verified (HIGH confidence)
- `github.com/nikitabobko/AeroSpace/releases` — Confirmed current version is v0.20.3-Beta; no stable release; v0.20.0 breaking change documented (MEDIUM confidence — GitHub releases page, no official stable channel)
- `package.json` — Current dependency versions confirmed; no new dependencies needed (HIGH confidence)

---

*Stack research for: git-stacks v0.11.0 AeroSpace Window Management Integration*
*Researched: 2026-03-28*
