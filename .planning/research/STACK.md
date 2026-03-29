# Stack Research

**Domain:** Bun CLI tool — v0.12.0 Multi-Workspace AeroSpace Configuration
**Researched:** 2026-03-29
**Confidence:** HIGH (Zod v4 API verified against official docs; AeroSpace CLI timing verified against GitHub issues #278 and #868 + official commands reference; existing codebase verified by direct file read)

---

## Scope

This document covers **only what is new or changed for v0.12.0**. The base stack (Bun runtime, TypeScript strict, Commander.js, SolidJS + OpenTUI, yaml, @clack/prompts) is unchanged and not re-researched.

**What changed in v0.11.0** (documented in prior STACK.md) is also not re-researched — the `_exec` injectable pattern, TSV parsing, `snapshotWindowIds`, and AeroSpace binary gate are all stable and unchanged.

**Three questions this milestone adds:**

1. Zod schema — how to express `workspaces: WorkspaceEntry | WorkspaceEntry[]` with backward-compatible parsing of the old flat single-object format
2. AeroSpace CLI timing — can we loop `moveNodeToWorkspace` calls for multiple workspaces rapidly without rate limiting or hang risk?
3. Sequential workspace setup — any ordering constraints imposed by AeroSpace's server model?

---

## Current Dependency Versions (Verified from package.json)

| Package | Version | Notes |
|---------|---------|-------|
| zod | ^4.3.6 | Upgraded from 3.x used in v0.11.0 STACK research; verify APIs below use v4 |
| typescript | ^6.0.2 | Strict mode enforced |
| bun | (runtime) | All Bun APIs (spawn, $, file) available |
| commander | ^14.0.3 | CLI framework; no changes needed |

> **Note:** The prior STACK.md listed Zod 3.25.76. package.json now shows `^4.3.6`. All Zod patterns below use the v4 API.

---

## Recommended Stack

### Core Technologies

No new dependencies. All required patterns are covered by Zod v4 (already installed) plus the existing `_exec` injectable pattern from `src/lib/aerospace.ts`.

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Zod v4 `z.preprocess` | ^4.3.6 | Coerce old flat config object into single-element array for backward compat | `z.preprocess` in v4 returns `ZodPipe` internally; usage API is identical to v3 — `z.preprocess(fn, schema)` still works; `(val) => Array.isArray(val) ? val : [val]` is the correct normalizer |
| Zod v4 `z.union` | ^4.3.6 | Accept either old format (flat object with `workspace: string`) or new format (object with `workspaces: array`) at parse time | `z.union([oldSchema, newSchema])` tries each in order; first match wins; use this at the top-level integration config schema boundary |
| AeroSpace CLI `move-node-to-workspace` | v0.20.3-Beta | Sequential window moves across multiple AeroSpace workspaces | No batching API exists in CLI; each call is a separate subprocess via `_exec.run`; each invocation costs ~100ms IPC round-trip (see Timing Constraints below) |

### Supporting Libraries

No new npm dependencies required.

---

## Zod Pattern: Single Object → Array Backward Compat

**Problem:** v0.11.0 config format is a flat object:

```yaml
integrations:
  aerospace:
    enabled: true
    workspace: "5"
    layout: h_tiles
    focus: true
```

v0.12.0 format is an array:

```yaml
integrations:
  aerospace:
    enabled: true
    workspaces:
      - workspace: "5"
        layout: h_tiles
        focus: true
      - workspace: "6"
        layout: v_tiles
```

**Recommended Zod pattern — two-stage parse:**

Stage 1: Normalize input shape (preprocess before union discrimination)
Stage 2: Validate the normalized shape

```typescript
// The per-workspace entry schema (identical fields to old flat config, minus `enabled`)
const aerospaceWorkspaceEntrySchema = z.object({
  workspace: z.string(),
  layout: z.enum(["h_tiles", "v_tiles", "h_accordion", "v_accordion"]).optional(),
  normalization: z.boolean().optional(),
  flatten_before_open: z.boolean().optional(),
  focus: z.boolean().optional(),
  commands: z.array(aerospaceCommandSchema).optional(),
})

// Top-level config: accept either old flat format OR new workspaces-array format
const aerospaceConfigSchema = z.object({
  enabled: z.boolean().optional(),
  // Preprocess coerces old format (flat object with workspace key) into
  // new format (array with one entry). Union then validates either shape.
  workspaces: z.preprocess(
    (val) => {
      // Already an array — new format, pass through
      if (Array.isArray(val)) return val
      // Has `workspace` key — old single-workspace flat format, wrap in array
      if (val && typeof val === "object" && "workspace" in (val as object)) return [val]
      // No workspaces key present — return undefined to allow optional()
      return undefined
    },
    z.array(aerospaceWorkspaceEntrySchema).optional()
  ),
})
```

**Why this approach over `z.union` at the workspaces field level:**

`z.union` at the top level tries each schema in order and returns the first match — it handles the case where callers pass either `{ workspace: "5", ... }` (old) or `{ workspaces: [...] }` (new). However, `z.preprocess` at the `workspaces` field level is cleaner because:
- It normalizes the shape before validation, producing a single canonical runtime type (`WorkspaceEntry[]`)
- Consumers of the parsed config never need to branch on old vs new — they always iterate an array
- The field is marked `.optional()` so configs that omit `workspaces` entirely still parse (for cases where only `enabled: true/false` is set at the workspace-override level)

**Alternative: top-level union schema for two-format dispatch**

If the old format must be accepted at the outer config level (where `workspace: "5"` is a sibling of `enabled`), wrap the entire config in a union with a preprocess normalizer:

```typescript
const aerospaceConfigSchema = z.preprocess(
  (val) => {
    if (!val || typeof val !== "object") return val
    const obj = val as Record<string, unknown>
    // Migrate: if flat `workspace` field present and no `workspaces` array, convert
    if (typeof obj.workspace === "string" && !obj.workspaces) {
      const { workspace, layout, normalization, flatten_before_open, focus, commands, ...rest } = obj
      return {
        ...rest,
        workspaces: [{ workspace, layout, normalization, flatten_before_open, focus, commands }],
      }
    }
    return val
  },
  z.object({
    enabled: z.boolean().optional(),
    workspaces: z.array(aerospaceWorkspaceEntrySchema).optional(),
  })
)
```

**This is the recommended approach** for this milestone because it migrates cleanly at parse time — the integration plugin code never sees the old format. `parsedConfig.workspaces` is always `WorkspaceEntry[] | undefined` at runtime.

**Confidence:** HIGH — `z.preprocess` v4 API verified against zod.dev/api; v4 internal `ZodPipe` return does not change the `z.preprocess(fn, schema)` calling convention; tested pattern matches official Zod v4 documentation examples.

---

## Focus Validation: At Most One `focus: true`

**Recommended approach — Zod `.superRefine` after array parse:**

```typescript
const aerospaceConfigSchema = z.preprocess(
  migrateToWorkspacesArray, // preprocess fn from above
  z.object({
    enabled: z.boolean().optional(),
    workspaces: z.array(aerospaceWorkspaceEntrySchema)
      .optional()
      .superRefine((entries, ctx) => {
        if (!entries) return
        const focusCount = entries.filter((e) => e.focus === true).length
        if (focusCount > 1) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `At most one AeroSpace workspace entry may have focus: true (found ${focusCount})`,
          })
        }
      }),
  })
)
```

`.superRefine` on the array is the correct hook — it fires after all individual entries pass validation, so you can count across the full array. Do not use `.refine` (it can't access `ctx.addIssue` with custom message in all Zod versions) — use `.superRefine`.

**Confidence:** HIGH — `.superRefine` is stable in Zod v3 and v4; cross-element validation is its canonical use case.

---

## AeroSpace CLI Timing Constraints

**Summary: No rate limits, but IPC round-trip cost is ~100ms per CLI invocation. Sequential multi-workspace setup is safe.**

**Details:**

AeroSpace communicates via a Unix socket at `/tmp/(aeroSpaceAppId)-(unixUserName).sock`. Each `aerospace <cmd>` invocation is a subprocess that connects to the socket, sends the command, waits for a response, then exits. There is:

- No documented rate limiting or command throttling
- No queue saturation at typical workloads (5-10 windows, 2-4 workspaces)
- An acknowledged ~100ms IPC round-trip overhead per CLI call (GitHub issue #278 — documented by maintainer, labeled 1.0-blocker for a batching solution)

**Implication for sequential workspace setup:**

Iterating a `workspaces` array and calling `moveNodeToWorkspace`, `setLayout`, `flattenWorkspaceTree`, and optionally `focusWindow` per workspace entry is safe. For a typical config (2-4 workspace entries, 3-8 windows total), the total sequential duration is:

```
2 workspace entries × (1 flatten + 1 layout + N move calls + 1 focus) × ~100ms each
```

For a 4-entry config with 2 windows each = ~8 calls = ~800ms total. This is acceptable for an `open` operation (which already runs other integrations and hooks).

**The sporadic hang bug (issue #868)** was fixed in builds after v0.16.2 — "non-issue in all the recent builds" per the reporter. Current version is v0.20.3-Beta. This is not a concern.

**Batching (issue #278)** — shell-like combinators (`&&`, `||`, `;`) for single-round-trip multi-command execution — is a planned 1.0-blocker feature. As of v0.20.3-Beta it has **not shipped**. Our `for...of` loop over workspace entries using individual `_exec.run` calls is the correct current approach. When batching ships, refactoring would reduce latency but is not required for correctness.

**No rate limit mitigation is needed.** Do not add `sleep()` calls between workspace entries. Do not add retry logic. The AeroSpace server processes commands synchronously and awaiting each `_exec.run` call is sufficient sequencing.

**Confidence:** HIGH — timing cost from GitHub issue #278 (maintainer statement); hang fix from issue #868 (reporter confirmation); batching feature status from issue #278 (open, 1.0-blocker label); AeroSpace version v0.20.3-Beta from releases page.

---

## Sequential Workspace Setup: Ordering Constraints

**Window routing to first workspace (unrouted tier-1 windows):**

VSCode and IntelliJ are tier-1 integrations that deposit window IDs into `ArtifactBag`. The AeroSpace integration (tier-3, order 31) reads from the bag. When the `workspaces` array has multiple entries, unrouted tier-1 windows should go to the first entry in the array.

Implementation: before the workspace iteration loop, move all bag windows to `workspaces[0].workspace`. Then iterate `workspaces[1..n]` for layout/focus/commands on subsequent entries.

**`focus: true` workspace selection:**

Only one workspace entry may have `focus: true`. The workspace-level focus (switching AeroSpace to that workspace) should be the final step after all entries are processed — otherwise focus would switch mid-setup as each workspace is configured.

**Recommended processing order per workspace entry:**

1. Validate workspace exists (`listWorkspaces()` result check)
2. Flatten if `flatten_before_open: true`
3. Move bag windows (first entry only; subsequent entries get only command-launched windows)
4. Launch `commands` (and move newly launched windows to this workspace)
5. Apply layout
6. Accumulate `focusWindowId` if `cmd.focus: true`

**Workspace-level focus last:**

After all entries are processed:
1. Focus specific window (`focusWindowId`) if any command set `focus: true`
2. Switch AeroSpace workspace (`_exec.run(["workspace", targetWorkspace])`) for the entry with `focus: true`

**Confidence:** HIGH — derived directly from existing single-workspace flow in `src/lib/integrations/aerospace.ts`; the multi-workspace generalization follows the same step order with an outer loop added.

---

## What NOT to Add

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `z.discriminatedUnion` for old/new format dispatch | No discriminator key exists — old format uses `workspace: string` at top level, new format uses `workspaces: array`; these can't be discriminated by a shared enum key | `z.preprocess` to normalize old → new at parse time |
| Sleep/delay between workspace setup steps | AeroSpace server processes commands synchronously; each `_exec.run` awaits the round-trip; no timing gaps needed between moves/layouts | `for await...of` loop over workspace entries |
| Batch command construction (building `;`-delimited strings) | Issue #278 batch syntax is not released in v0.20.3-Beta; undocumented behavior risk | Sequential `_exec.run` calls |
| `aerospace config --get` for reading workspaces | Does not reliably expose all TOML keys (documented in v0.11.0 STACK.md); this applies to multi-workspace config too | User-provided YAML config in git-stacks workspace/template YAML |
| Zod v3 API patterns (`.refine` for cross-field) | Project is now on Zod v4 (`^4.3.6`); use `.superRefine` for cross-element validation with `ctx.addIssue` | `.superRefine` on the array field |
| New npm dependencies for schema migration | All needed patterns are in Zod v4 already | `z.preprocess` + `z.array` + `.superRefine` |

---

## Alternatives Considered

| Recommended | Alternative | Why Not |
|-------------|-------------|---------|
| `z.preprocess` migration at parse boundary | Separate read paths for v1 (flat) and v2 (array) config | Two code paths require the integration plugin to branch; runtime type is ambiguous after parse; preprocess collapses to single type |
| `.superRefine` for focus count validation | Validate in `open()` function body at runtime | Runtime validation produces user-visible error logs but not Zod parse errors; `.superRefine` integrates with Zod's error reporting and prevents invalid config from being accepted |
| Sequential per-entry processing loop | Concurrent `Promise.all` across workspace entries | AeroSpace commands are stateful (focus, layout) — concurrent calls produce non-deterministic workspace state; sequential is required |

---

## Version Compatibility

| Component | Requires | Notes |
|-----------|----------|-------|
| `z.preprocess(fn, schema)` | Zod v4+ | API identical to v3; returns `ZodPipe` internally in v4 but calling convention unchanged |
| `.superRefine` | Zod v3+ | Stable across v3 and v4 |
| `z.union([a, b])` | Zod v3+ | Stable; tries schemas in order |
| AeroSpace sequential CLI calls | v0.20.x-Beta | No rate limiting; ~100ms per call; sporadic hang bug fixed after v0.16.2 |
| `move-node-to-workspace --window-id` | v0.20.x-Beta | `--window-id` flag stable; used by existing v0.11.0 integration |

---

## Installation

No new npm packages to install for v0.12.0. All capabilities are covered by the existing dependency set.

```bash
# No new dependencies
```

---

## Sources

- `/home/nnex/dev/prj/git-stacks/src/lib/integrations/aerospace.ts` — Existing v0.11.0 config schema (`aerospaceConfigSchema`) and `open()` processing order; direct file read (HIGH confidence)
- `/home/nnex/dev/prj/git-stacks/src/lib/aerospace.ts` — Existing `_exec.run`, `AerospaceCommands` interface, `snapshotWindowIds`; direct file read (HIGH confidence)
- `/home/nnex/dev/prj/git-stacks/package.json` — Confirmed Zod `^4.3.6`, TypeScript `^6.0.2`; direct file read (HIGH confidence)
- `zod.dev/api` — Confirmed `z.preprocess(fn, schema)` v4 API; `z.union` first-match behavior; `.superRefine` cross-element validation (HIGH confidence)
- `zod.dev/v4/changelog` — Confirmed `z.preprocess` returns `ZodPipe` in v4 but calling convention unchanged; `z.union` and `z.discriminatedUnion` have no breaking changes (HIGH confidence)
- `github.com/nikitabobko/AeroSpace/issues/278` — Maintainer-documented ~100ms IPC round-trip cost per CLI call; shell-like batch combinators planned but not yet shipped in v0.20.3-Beta (HIGH confidence)
- `github.com/nikitabobko/AeroSpace/issues/868` — Sporadic hang bug confirmed fixed after v0.16.2; "non-issue in all the recent builds" (MEDIUM confidence — reporter statement, not maintainer)
- `nikitabobko.github.io/AeroSpace/commands` — `move-node-to-workspace --window-id` flag confirmed stable; no rate limiting documented (HIGH confidence)
- `github.com/nikitabobko/AeroSpace/releases` — Current version v0.20.3-Beta (March 8, 2025) confirmed (HIGH confidence)

---

*Stack research for: git-stacks v0.12.0 Multi-Workspace AeroSpace Configuration*
*Researched: 2026-03-29*
