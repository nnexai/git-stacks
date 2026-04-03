# Phase 61: Secrets - Research

**Researched:** 2026-04-03
**Status:** Complete

## 1. Codebase Integration Points

### Primary Integration: `openWorkspace()` in `src/lib/workspace-ops.ts`

The secret resolution pipeline inserts between two existing calls at lines 842-844:

```
Before:
  const mergedEnvVars = mergeEnv(wsWithPorts)
  writeEnvFiles(wsWithPorts, mergedEnvVars, msg => onProgress?.(msg))
  const hookEnv = { ...baseEnv, ...mergedEnvVars }

After:
  const mergedEnvVars = mergeEnv(wsWithPorts)
  const resolvedEnvVars = await resolveSecrets(mergedEnvVars, buildResolvers(config))
  writeEnvFiles(wsWithPorts, resolvedEnvVars, msg => onProgress?.(msg))
  const hookEnv = { ...baseEnv, ...resolvedEnvVars }
```

Key constraint: `resolveSecrets` receives a flat `Record<string, string>` — never a workspace object. This prevents any path where resolved plaintext could be written back to YAML.

### Secondary Integration: `buildBaseEnv()` at line 122

`buildBaseEnv` also calls `mergeEnv()` at line 132 and feeds into hook env. This is called at line 794 (`const baseEnv = buildBaseEnv(wsWithPorts, tasksDir, "open")`), **before** the env writing block. The `hookEnv` at line 844 already spreads resolved values over baseEnv, so hooks get resolved secrets. No change needed to `buildBaseEnv` itself.

### No other callers of `mergeEnv`/`writeEnvFiles`

Verified: `mergeEnv` is called only in `workspace-ops.ts` (lines 108, 132, 842). `writeEnvFiles` is called only at line 843. The workspace-creation flow in the TUI wizard does not call these — it writes the workspace YAML and then calls `openWorkspace` which handles env.

## 2. `mergeEnv()` Analysis

```ts
export function mergeEnv(workspace: Workspace): Record<string, string> {
  const merged: Record<string, string> = {}
  if (workspace.env) Object.assign(merged, workspace.env)
  if (workspace.ports) {
    for (const [key, value] of Object.entries(workspace.ports)) {
      if (typeof value === "number") merged[key] = String(value)
    }
  }
  return merged
}
```

Returns raw env values — secret references like `${{ keychain:service/account }}` pass through as literal strings. `resolveSecrets` processes this output.

## 3. Platform Keychain Commands

### macOS: `security find-generic-password`

```bash
security find-generic-password -s <service> -a <account> -w
```

- `-s` = service name, `-a` = account, `-w` = print password only
- Exit 0 on success, 44 (errSecItemNotFound) on missing
- Always available on macOS (part of Security.framework)
- Reference path format: `keychain:service/account`

### Linux: `secret-tool lookup`

```bash
secret-tool lookup service <service> account <account>
```

- Part of `libsecret-tools` package (Debian/Ubuntu) or `libsecret` (Fedora)
- Exit 0 on success, 1 on missing
- NOT always installed — need helpful error: "secret-tool not found. Install libsecret-tools."
- Reference path format same: `keychain:service/account`

### Platform detection

Use `process.platform`:
- `"darwin"` → macOS `security` CLI
- `"linux"` → `secret-tool`
- Other → error with "keychain resolver not supported on this platform"

## 4. Subprocess Execution Pattern

The project uses Bun's `$` shell for git operations:
```ts
const result = await $`git -C ${path} ...`.quiet().nothrow()
```

For secret resolvers, the same pattern works:
```ts
const result = await $`security find-generic-password -s ${service} -a ${account} -w`.quiet().nothrow()
```

### Timeout Implementation

Bun's `$` does not have a built-in timeout. Use `AbortSignal.timeout(10_000)`:

```ts
const controller = new AbortController()
const timer = setTimeout(() => controller.abort(), 10_000)
const proc = Bun.spawn(["sh", "-c", cmd], { signal: controller.signal })
const exitCode = await proc.exited
clearTimeout(timer)
```

Or simpler with Bun shell + a wrapper:
```ts
async function execWithTimeout(cmd: string[], timeoutMs: number): Promise<{ ok: boolean; stdout: string; error?: string }> {
  const proc = Bun.spawn(cmd, { stdout: "pipe", stderr: "pipe" })
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => { proc.kill(); reject(new Error(`timeout after ${timeoutMs}ms`)) }, timeoutMs)
  )
  const exit = proc.exited.then(code => code)
  const exitCode = await Promise.race([exit, timeout])
  // ...
}
```

## 5. Reference Syntax Parsing

Pattern: `${{ resolver:path }}`
Regex: `/^\$\{\{\s*(\w+):(.+?)\s*\}\}$/`

Key behaviors:
- Whitespace around content is allowed: `${{  env:VAR  }}` works
- The entire string must be the reference — no inline interpolation (`foo-${{ env:VAR }}-bar` does NOT match). This is intentional: partial resolution is complex and error-prone.
- Non-matching strings pass through unchanged

## 6. GlobalConfigSchema Extension

Current schema (lines 163-171):
```ts
export const GlobalConfigSchema = z.object({
  workspace_root: z.string().default(DEFAULT_WORKSPACE_ROOT).transform(expandHome),
  integrations: z.record(z.string(), z.unknown()).default({}),
  ports: z.object({
    range_start: z.number().int().default(10000),
    range_end: z.number().int().default(65000),
  }).default(() => ({ range_start: 10000, range_end: 65000 })),
})
```

Add:
```ts
secrets: z.object({
  resolvers: z.array(z.string()).optional(),
}).optional(),
```

When `secrets.resolvers` is not set (default), enable `keychain` and `env` only. `cmd` requires explicit opt-in (`secrets: { resolvers: [keychain, env, cmd] }`).

## 7. Config Wizard Pattern

The existing config wizard (`src/commands/config.ts`) uses `@clack/prompts` with a linear flow:
1. Text input for workspace_root
2. Multiselect for integrations
3. Per-integration config prompts
4. Save

The secrets section fits after integrations:
1. Multiselect: "Enabled secret resolvers" (options: keychain, env, cmd)
2. Default selection: keychain, env
3. If cmd selected, show warning about arbitrary command execution

## 8. `--skip-secrets` Flag Pattern

Similar to `--no-ide` and `--no-cmux` on the open command. Add to both `open` and the TUI open flow.

For CLI: `.option("--skip-secrets", "Skip secret resolution (substitute empty strings)")`

For `openWorkspace()`: Add `skipSecrets?: boolean` to the opts parameter.

When active:
- Each unresolved reference logs a warning via `onProgress`
- Substitutes empty string `""` for the resolved value
- Does NOT return `{ ok: false }` — continues with degraded env

## 9. Error Handling Strategy

Fatal by default (D-05):
```ts
// In resolveSecrets:
for (const [key, value] of Object.entries(env)) {
  const ref = parseSecretRef(value)
  if (!ref) { resolved[key] = value; continue }
  const resolver = resolvers.find(r => r.id === ref.id)
  if (!resolver) throw new Error(`No resolver for '${ref.id}' — available: ${resolvers.map(r=>r.id).join(", ")}`)
  resolved[key] = await resolver.resolve(ref.path)
}
```

The caller (`openWorkspace`) catches and returns `{ ok: false, error }`.

## 10. File Layout

New file: `src/lib/secrets.ts`
- `SecretResolver` interface
- `parseSecretRef()` function
- `resolveSecrets()` function
- `buildResolvers()` function (reads GlobalConfig, returns enabled resolvers)
- Built-in resolver implementations: `keychainResolver`, `envResolver`, `cmdResolver`

New test file: `tests/lib/secrets.test.ts`
- Test `parseSecretRef` with valid/invalid references
- Test `resolveSecrets` with mock resolvers
- Test `envResolver` against `process.env`
- Test `keychainResolver` with mocked subprocess
- Test `cmdResolver` with mocked subprocess
- Test timeout behavior
- Test `--skip-secrets` behavior (empty string substitution)

## 11. Concurrency

`resolveSecrets` can resolve all references in parallel — resolvers are independent per-key. Use `Promise.all` over entries:

```ts
const entries = await Promise.all(
  Object.entries(env).map(async ([key, value]) => {
    const ref = parseSecretRef(value)
    if (!ref) return [key, value] as const
    const resolver = resolvers.find(r => r.id === ref.id)
    if (!resolver) throw new Error(...)
    return [key, await resolver.resolve(ref.path)] as const
  })
)
return Object.fromEntries(entries)
```

## RESEARCH COMPLETE

All integration points, patterns, and technical decisions are mapped. Ready for planning.
