# Phase 50: integration-specific-tools - Research

**Researched:** 2026-04-01
**Domain:** Commander.js command extension, TypeScript interface extension, CLI output formatting
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Generic handler in `src/commands/integration.ts` — register `config` subcommand group once for ALL integrations. `config example` reads a new `configExample?: string` property from the `Integration` interface. `config show [workspace]` reads `globalConfig.integrations[id]` and workspace overrides via `resolveEnabled()`. Zero per-integration code needed for these commands.
- **D-02:** Integrations without a `configExample` string show a fallback message: `"No configuration example available for <id>. See: git-stacks integration <id> config show"`. Every integration gets `config example` — consistent, no surprises.
- **D-03:** Both `integration list` and `config show` support `--json` flag for machine-readable output. Matches existing pattern (doctor, status, list all have `--json`).
- **D-04:** `git-stacks integration vscode open <workspace>` calls `generate()` to create/update `.code-workspace` file, then `open()` with an empty ArtifactBag. No hooks, no other integrations. Reuses existing integration methods.
- **D-05:** `git-stacks integration aerospace focus <workspace>` resolves which AeroSpace workspace to focus: find the workspace entry with `focus: true`; if none has focus, use `workspaces[0]`. Mirrors runtime behavior in `open()` post-loop focus.
- **D-06:** `git-stacks integration list [workspace]` is a top-level subcommand on `integrationCommand`, registered directly alongside the per-integration subcommands. Not per-integration — it shows ALL integrations.
- **D-07:** Table columns: ID, Label, Enabled, Configured. Workspace-aware when argument provided (enabled column reflects workspace override cascade).

### Claude's Discretion

- Table formatting approach for `list` output (padEnd alignment vs library)
- Whether `config show` dumps raw YAML or formatted key-value pairs
- Error messages for missing workspace argument in focus/open commands
- Whether to add `configExample` strings to all 10 integrations in this phase or just the ones with non-trivial config (aerospace, niri, tmux, vscode)

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope.
</user_constraints>

---

## Summary

Phase 50 extends `src/commands/integration.ts` (currently 13 lines) with three categories of new subcommands: generic config introspection (`config example`, `config show`) registered once for all integrations; a top-level `list` command; and standalone per-integration action commands (`aerospace focus`, `vscode open`). No new integrations are added — only the command surface grows.

The codebase provides all required building blocks: `resolveEnabled()` / `resolveEnabledGlobally()` for enabled-state resolution, `readWorkspace()` / `readGlobalConfig()` for config I/O, `_exec.run(["workspace", name])` in `src/lib/aerospace.ts` for AeroSpace focus dispatch, and `generate()` + `open()` on `vscodeIntegration` for the standalone open command. The niri `focus-workspace` command (lines 327-338 of `niri.ts`) is the direct implementation template for `aerospace focus`.

The primary architecture question (resolved by D-01) is that generic handlers are registered in `integration.ts` inside the per-integration loop, not in each integration file. This keeps per-integration files free of boilerplate.

**Primary recommendation:** Implement in two task groups — (1) interface + generic commands, (2) per-integration action commands — keeping each group independently testable.

---

## Project Constraints (from CLAUDE.md)

- Runtime: Bun only — use `Bun.spawn`, `$` shell, `Bun.file` APIs
- TypeScript strict mode throughout — no `any`, explicit return types on exported functions
- Production `src/` code must use relative imports (no `@/*` alias)
- Tests must use `bun run test` (not `bun test tests/` — mock pollution)
- All YAML I/O via `src/lib/config.ts`; all paths via `src/lib/paths.ts`
- Integration plugin registration only in `src/lib/integrations/index.ts`
- Per-integration config stored under `globalConfig.integrations[id]` as `Record<string, unknown>`
- Commander.js 12.x (package.json), yaml 2.8.x, Zod 3.x — all verified current

---

## Standard Stack

### Core (all already installed)

| Library | Version | Purpose | Role in phase |
|---------|---------|---------|---------------|
| commander | 14.0.3 | CLI command tree | Register new subcommands |
| yaml | 2.8.3 | YAML serialization | `config show` YAML output path |
| zod | 4.3.6 | Schema validation | Parse aerospace config for `focus` |
| bun (runtime) | latest | Shell execution | `_exec.run()` calls |

No new dependencies required.

---

## Architecture Patterns

### Recommended Project Structure (additions only)

```
src/
  commands/
    integration.ts      — extend with generic config subgroup + list subcommand
  lib/
    integrations/
      types.ts          — add configExample?: string to Integration interface
      aerospace.ts      — add commands(parent) with focus subcommand
      vscode.ts         — add commands(parent) with open subcommand
```

### Pattern 1: Generic config subgroup in the per-integration loop

**What:** In `integration.ts`, inside the existing `for (const integration of integrations)` loop, register a `config` subcommand group with `example` and `show [workspace]` children. This fires for every integration uniformly — no per-integration code.

**When to use:** When behavior is identical across all integrations (D-01).

**Example (from codebase analysis):**
```typescript
// src/commands/integration.ts — extended loop body
for (const integration of integrations) {
  const sub = new Command(integration.id).description(integration.hint)

  // Generic: config introspection (D-01)
  const config = sub.command("config").description("Inspect integration configuration")

  config
    .command("example")
    .description("Print a YAML configuration example")
    .action(() => {
      if (integration.configExample) {
        console.log(integration.configExample)
      } else {
        console.log(`No configuration example available for ${integration.id}. See: git-stacks integration ${integration.id} config show`)
      }
    })

  config
    .command("show [workspace]")
    .description("Show current configuration for this integration")
    .option("--json", "Output as JSON")
    .action((workspace?: string, opts: { json?: boolean } = {}) => {
      const globalConfig = readGlobalConfig()
      const globalRaw = globalConfig.integrations[integration.id] ?? {}
      let wsRaw: unknown = undefined
      if (workspace) {
        const ws = readWorkspace(workspace)
        wsRaw = ws.settings?.integrations?.[integration.id]
      }
      const enabled = workspace
        ? resolveEnabled(integration.id, integration.enabledByDefault, {
            workspace: readWorkspace(workspace),
            config: globalConfig,
            tasksDir: "",
          })
        : resolveEnabledGlobally(integration.id, integration.enabledByDefault, globalConfig)

      if (opts.json) {
        console.log(JSON.stringify({ id: integration.id, enabled, global: globalRaw, workspace: wsRaw ?? null }, null, 2))
        return
      }
      console.log(`Integration: ${integration.id}`)
      console.log(`Enabled:     ${enabled}`)
      console.log(`Global config:`)
      console.log(stringify(globalRaw))
      if (workspace) {
        console.log(`Workspace override (${workspace}):`)
        console.log(wsRaw ? stringify(wsRaw) : "  (none)")
      }
    })

  if (integration.commands) {
    integration.commands(sub)
  }
  integrationCommand.addCommand(sub)
}
```

### Pattern 2: `integration list` as a top-level subcommand

**What:** Register `list [workspace]` directly on `integrationCommand` (D-06), not inside the per-integration loop.

**When to use:** When aggregating across all integrations.

**Example:**
```typescript
// Register BEFORE the per-integration loop (avoids name collision with integration IDs)
integrationCommand
  .command("list [workspace]")
  .description("List all integrations with enabled/disabled status")
  .option("--json", "Output as JSON")
  .action((workspace?: string, opts: { json?: boolean } = {}) => {
    const globalConfig = readGlobalConfig()
    const rows = integrations.map((i) => {
      const ctx = workspace
        ? { workspace: readWorkspace(workspace), config: globalConfig, tasksDir: "" }
        : undefined
      const enabled = ctx
        ? resolveEnabled(i.id, i.enabledByDefault, ctx)
        : resolveEnabledGlobally(i.id, i.enabledByDefault, globalConfig)
      const configured = Object.keys(globalConfig.integrations[i.id] ?? {}).length > 0
      return { id: i.id, label: i.label, enabled, configured }
    })
    if (opts.json) {
      console.log(JSON.stringify(rows, null, 2))
      return
    }
    for (const row of rows) {
      const enabledMark = row.enabled ? "✓" : "✗"
      const configuredMark = row.configured ? "yes" : "no"
      console.log(`  ${enabledMark}  ${row.id.padEnd(12)} ${row.label.padEnd(16)} ${configuredMark}`)
    }
  })
```

### Pattern 3: `aerospace focus` — direct template from niri `focus-workspace`

**What:** Per the canonical ref, niri lines 327-338 is the direct template. Difference: aerospace must parse the workspace config to find the `focus: true` entry or fall back to `workspaces[0]`.

**Example:**
```typescript
// src/lib/integrations/aerospace.ts — commands() method addition
commands(parent: Command): void {
  parent
    .command("focus <workspace>")
    .description("Focus the AeroSpace workspace mapped to a git-stacks workspace")
    .action(async (workspaceName: string) => {
      const globalConfig = readGlobalConfig()
      const ws = readWorkspace(workspaceName)
      // Config resolution: workspace override takes precedence (same as open())
      const wsConfig = aerospaceConfigSchema.safeParse(ws.settings?.integrations?.["aerospace"] ?? {})
      const gc = aerospaceConfigSchema.safeParse(globalConfig.integrations["aerospace"] ?? {})
      const parsed = wsConfig.success ? wsConfig.data : gc.success ? gc.data : undefined
      if (!parsed?.workspaces?.length) {
        console.error(`No AeroSpace workspaces configured for workspace '${workspaceName}'`)
        process.exit(1)
      }
      // D-05: find focus:true entry, else workspaces[0]
      const focusEntry = parsed.workspaces.find((e) => e.focus === true) ?? parsed.workspaces[0]
      try {
        await _exec.run(["workspace", focusEntry.workspace])
      } catch (err) {
        console.error(`AeroSpace focus failed: ${String(err)}`)
        process.exit(1)
      }
    })
},
```

Note: `_exec` is exported from `src/lib/aerospace.ts` (not from `src/lib/integrations/aerospace.ts`). The integration file already imports it via `import { ..., _exec } from "../aerospace"`.

### Pattern 4: `vscode open` — generate + open with empty bag

**What:** Per D-04, generate the `.code-workspace` artifact, then call `open()` with an empty `ArtifactBag {}`. No hooks, no other integrations.

**Example:**
```typescript
// src/lib/integrations/vscode.ts — commands() method addition
commands(parent: Command): void {
  parent
    .command("open <workspace>")
    .description("Generate .code-workspace and open VSCode without running hooks")
    .action(async (workspaceName: string) => {
      const globalConfig = readGlobalConfig()
      const ws = readWorkspace(workspaceName)
      const tasksDir = getTasksDir(globalConfig.workspace_root)
      const ctx: IntegrationContext = { workspace: ws, tasksDir, config: globalConfig }
      const artifactPath = vscodeIntegration.generate?.(ctx) ?? null
      await vscodeIntegration.open(ctx, artifactPath, {})
    })
},
```

Note: `vscodeIntegration` is the object being defined — use `vscodeIntegration.generate` and `vscodeIntegration.open` from within `commands()`. Since `commands` is a method on the same object, `this` is not used in the codebase (functions/arrow methods). Reference the exported name directly after the object is assigned — this requires `commands` to be defined after `generate` and `open` in the object literal, which is already the case in the current file structure.

Actually: because `commands` is defined on the same object literal as `generate` and `open`, and JavaScript object literals evaluate their methods in order, the safest pattern is to call `vscodeIntegration.generate!(ctx)` using the exported variable name — this works because by the time `commands()` is invoked at runtime, the entire object is already constructed. This is the established pattern in the codebase (aerospace's `open()` calls other methods via the `aerospaceIntegration` reference indirectly).

### Anti-Patterns to Avoid

- **Registering `list` inside the per-integration loop:** Would create a `list` subcommand under each integration ID, not a single top-level one. Register `list` directly on `integrationCommand` BEFORE the loop.
- **Calling `readWorkspace` inside `config` handler when workspace is optional:** `readWorkspace` throws if workspace not found. Guard with `workspaceExists(workspace)` before calling, or wrap in try-catch with user-friendly error.
- **Importing `_exec` from `src/lib/integrations/aerospace.ts`:** The mutable test-injectable `_exec` lives in `src/lib/aerospace.ts`. The integration file imports it from `"../aerospace"` — the `commands()` handler must do the same.
- **Calling `open()` with undefined `artifactPath`:** `vscodeIntegration.open()` returns null if `artifactPath` is null/falsy. The generate step is mandatory to get the path — don't skip it.
- **Using `this` in commands() method:** Codebase uses arrow functions and direct variable references, not `this`. Use the exported integration object name.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| JSON output formatting | Custom serializer | `JSON.stringify(data, null, 2)` | Identical to all existing `--json` handlers |
| YAML output for config show | Custom serializer | `stringify()` from `yaml` library (already imported in config.ts) | Consistent with how YAML is written to disk |
| Enabled-state resolution | Custom cascade logic | `resolveEnabled()` / `resolveEnabledGlobally()` from `types.ts` | Already handles ws → global → default cascade |
| Workspace reading with error | Try-catch + parse | `readWorkspace(name)` from `config.ts` | Already throws with clean error message |
| Table alignment | Custom padding function | `.padEnd()` — already used in workspace list, repo list, doctor | Consistent with all existing table output |
| AeroSpace CLI dispatch | Direct `$\`aerospace ...\`` | `_exec.run([...])` from `src/lib/aerospace.ts` | Test-injectable, consistent with existing aerospace integration |

---

## Common Pitfalls

### Pitfall 1: `list` command name collision with integration IDs
**What goes wrong:** If `list` is added inside the loop, Commander.js registers it as a subcommand of each integration (`aerospace list`, `vscode list`), not as `integration list`.
**Why it happens:** Loop body applies to each integration sub-command, not to `integrationCommand` itself.
**How to avoid:** Register `integrationCommand.command("list [workspace]")` BEFORE the loop, directly on `integrationCommand`.
**Warning signs:** `git-stacks integration list` says "unknown command" while `git-stacks integration aerospace list` works.

### Pitfall 2: `config` subcommand name collides with global `config` command
**What goes wrong:** No collision — `config` here is registered under `integration <id>`, not at the top level. Commander.js scopes subcommands to their parent.
**Why it happens:** Potential confusion with `src/commands/config.ts` which also has a `config show` subcommand.
**How to avoid:** No action needed — these are in different command trees. `git-stacks config show` vs `git-stacks integration vscode config show` are unambiguous.

### Pitfall 3: `readWorkspace` called without existence check
**What goes wrong:** `readWorkspace("nonexistent")` throws `Error: Workspace 'nonexistent' not found.`. Unhandled, this surfaces as an uncaught exception.
**Why it happens:** `readWorkspace` throws by design (no null return — matches "Workspace is the source of truth" pattern).
**How to avoid:** Check `workspaceExists(name)` first or wrap in try-catch with `process.exit(1)` and `console.error`. Existing commands (workspace.ts) use the `workspaceExists` guard pattern.
**Warning signs:** Stack trace visible in CLI output instead of clean error message.

### Pitfall 4: `vscode open` referencing `vscodeIntegration` before object assignment
**What goes wrong:** `commands()` is a method on the object literal being assigned to `vscodeIntegration`. If `commands` references `vscodeIntegration` during object evaluation (not invocation), it would be `undefined`.
**Why it happens:** JavaScript `const x = { method() { x.foo() } }` — `x` is not in scope during object literal evaluation but IS in scope when `method()` is later called at runtime.
**How to avoid:** This is safe because `commands()` is only ever CALLED at runtime (by `integration.ts`), not during module evaluation. The const binding is fully resolved by call time.
**Warning signs:** Only manifests if `commands()` is called synchronously during module import.

### Pitfall 5: YAML `stringify` import in `integration.ts`
**What goes wrong:** `integration.ts` currently has no yaml import. If `config show` uses YAML output, it needs `import { stringify } from "yaml"`.
**How to avoid:** Add the import. Alternatively, use `JSON.stringify` for the config show output — simpler and consistent with `--json` mode being the machine-readable path. The non-JSON path can use formatted `key: value` lines (like `config.ts:show` does with `console.log`).

### Pitfall 6: `aerospaceConfigSchema` not exported from `aerospace.ts` integration
**What goes wrong:** `aerospaceConfigSchema` is private (module-level const, not exported). The `commands()` handler in `aerospace.ts` can access it because it's in the same file — but cannot be imported externally.
**How to avoid:** No issue — `commands()` lives in `aerospace.ts`, same file as `aerospaceConfigSchema`. No export needed.

### Pitfall 7: `configExample` scope — which integrations to populate
**What goes wrong:** Adding `configExample` strings to all 10 integrations in one task is large. Forge integrations (github, gitlab, gitea) have trivial config (`enabled: true` only). Adding empty/trivial examples adds noise.
**Recommendation (discretion area):** Add `configExample` to the 4 integrations with non-trivial config: aerospace, niri, tmux, vscode. The remaining 6 display the D-02 fallback message.
**Warning signs:** If integrations with `enabled: true` only are given full examples, they'll just echo `enabled: true` which is less useful than the fallback pointing to `config show`.

---

## Code Examples

### Existing `--json` pattern (HIGH confidence — from workspace.ts)
```typescript
// src/commands/workspace.ts lines 291-293
if (opts.json) {
  console.log(JSON.stringify(infos, null, 2))
  return
}
```

### Existing padEnd table pattern (HIGH confidence — from workspace.ts line 301)
```typescript
console.log(
  `  ${dirtyMark} ${info.name.padEnd(20)} ${info.branch.padEnd(30)} ${repoStr.padEnd(10)} ${info.lastOpened.padEnd(6)}`
)
```

### Existing `_exec.run` for AeroSpace workspace focus (HIGH confidence — from aerospace.ts integration, line 348)
```typescript
await _exec.run(["workspace", deferredWorkspaceFocus])
```

### Existing niri `commands()` pattern — direct template (HIGH confidence — niri.ts lines 327-338)
```typescript
commands(parent: Command): void {
  parent
    .command("focus-workspace [workspace]")
    .description("Focus a workspace's niri workspace")
    .action(async (workspace?: string) => {
      if (!workspace) {
        console.error("Usage: git-stacks integration niri focus-workspace <workspace>")
        process.exit(1)
      }
      await focusNiriWorkspace(workspace)
    })
},
```

### Existing resolveEnabled usage (HIGH confidence — types.ts)
```typescript
// Workspace-aware
resolveEnabled(integration.id, integration.enabledByDefault, {
  workspace: readWorkspace(workspaceName),
  config: globalConfig,
  tasksDir: "",
})

// Global only
resolveEnabledGlobally(integration.id, integration.enabledByDefault, globalConfig)
```

### IntegrationContext construction for standalone open (HIGH confidence — runner.ts)
```typescript
const ctx: IntegrationContext = {
  workspace: ws,
  tasksDir: getTasksDir(globalConfig.workspace_root),
  config: globalConfig,
}
```

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | bun:test (Jest-compatible) |
| Config file | bunfig.toml (implicit) |
| Quick run command | `bun run test` |
| Full suite command | `bun run test` |

### Phase Requirements → Test Map

No formal requirement IDs are mapped to this phase. Tests should cover:

| Behavior | Test Type | File | Automated Command |
|----------|-----------|------|-------------------|
| `integration list` subcommand exists on integrationCommand | unit | `tests/lib/integration-commands.test.ts` | `bun run test` |
| `integration list --json` produces JSON array | unit | `tests/lib/integration-commands.test.ts` | `bun run test` |
| `integration <id> config example` subcommand exists | unit | `tests/lib/integration-commands.test.ts` | `bun run test` |
| `integration <id> config show` subcommand exists | unit | `tests/lib/integration-commands.test.ts` | `bun run test` |
| `integration aerospace focus` subcommand exists | unit | `tests/lib/integration-commands.test.ts` | `bun run test` |
| `integration vscode open` subcommand exists | unit | `tests/lib/integration-commands.test.ts` | `bun run test` |
| `configExample` property on Integration interface compiles | type | `bun run typecheck` | `bun run typecheck` |

### Sampling Rate
- **Per task commit:** `bun run test` (existing test runner handles mock isolation)
- **Per wave merge:** `bun run test && bun run typecheck`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

The existing `tests/lib/integration-commands.test.ts` already exists and tests command structure. New tests for Phase 50 should be added to that file. No new test file needs to be created — only new `test()` cases appended.

Existing mock setup in `integration-commands.test.ts` mocks all required modules (`@/lib/config`, `@/lib/integrations/issue-utils`, `@/lib/integrations/forge-utils`, `@/lib/tmux`, `@/lib/niri`, `@/lib/lifecycle`). The new `aerospace focus` command will also need `@/lib/aerospace` mocked for `_exec.run`. This mock is not yet in `integration-commands.test.ts` and must be added:

```typescript
// Add to integration-commands.test.ts Wave 0 setup
mock.module("@/lib/aerospace", () => ({
  _exec: { run: mock(async () => ({ exitCode: 0, stdout: "" })) },
  isAerospaceRunning: mock(async () => false),
  listWorkspaces: mock(async () => []),
  // ... other exports from lib/aerospace.ts
}))
```

Wave 0 gap: `@/lib/aerospace` mock not present in `integration-commands.test.ts`.

---

## Environment Availability

Step 2.6: SKIPPED (phase is pure TypeScript source changes — no external tools, services, or runtimes beyond the existing Bun + Git environment required).

---

## Sources

### Primary (HIGH confidence)
- Direct source read: `src/commands/integration.ts` — current 13-line structure (the primary modification target)
- Direct source read: `src/lib/integrations/types.ts` — `Integration` interface, `resolveEnabled`, `resolveEnabledGlobally`
- Direct source read: `src/lib/integrations/niri.ts` lines 327-338 — `commands()` pattern to copy
- Direct source read: `src/lib/integrations/aerospace.ts` — `aerospaceConfigSchema`, `_exec` import, focus logic
- Direct source read: `src/lib/integrations/vscode.ts` — `generate`, `open` method signatures
- Direct source read: `src/lib/integrations/runner.ts` — `IntegrationContext` construction pattern
- Direct source read: `src/lib/config.ts` — `readWorkspace`, `readGlobalConfig`, `workspaceExists`
- Direct source read: `src/lib/paths.ts` — `getTasksDir`
- Direct source read: `src/commands/workspace.ts` — `--json` pattern, `padEnd` table pattern
- Direct source read: `tests/lib/integration-commands.test.ts` — existing test structure, mock pattern

### Secondary (MEDIUM confidence)
- npm view: commander@14.0.3, yaml@2.8.3, zod@4.3.6 — all verified current

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new dependencies, all existing packages verified
- Architecture: HIGH — all patterns directly read from production code
- Pitfalls: HIGH — identified from direct code analysis (no speculation)

**Research date:** 2026-04-01
**Valid until:** 2026-05-01 (stable internal codebase — no external API dependency)
