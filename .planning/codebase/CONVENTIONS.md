# Coding Conventions

**Analysis Date:** 2026-04-04

## Naming Patterns

**Files:**
- Kebab-case for all source files: `workspace-ops.ts`, `completion-generator.ts`, `forge-utils.ts`
- Test files: `{name}.test.ts` or `{name}.test.tsx` (e.g., `detect.test.ts`, `ActionMenu.test.tsx`)
- Integration test files in dashboard: prefix `integ-` (e.g., `integ-tab-switching.test.tsx`, `integ-action-menu.test.tsx`)
- Snapshot test files: `{Component}.snap.test.tsx` in `tests/tui/dashboard/snapshots/`
- No `.d.ts` files -- types are colocated with implementation

**Functions:**
- camelCase for all function names
- Prefix with verb: `readWorkspace`, `writeTemplate`, `createWorktree`, `removeWorktree`, `buildWorkspaceEnv`, `formatEnvTable`
- Boolean checks: `is*` or `has*` prefix: `isRepoDirty`, `isWorktreeRegistered`, `hasUpstreamTracking`, `isFetchStale`
- Async functions return `Promise<T>` with explicit annotations on exports

**Variables:**
- camelCase: `dirtyRepos`, `repoPath`, `taskPath`, `worktreeRepos`
- Destructure when unpacking objects: `const { name, path, type } = repo`
- Plural for arrays: `workspaces`, `repos`, `commands`, `results`

**Types:**
- PascalCase: `Workspace`, `Template`, `RepoType`, `Integration`, `WorkspaceListInfo`
- Schema types use `Schema` suffix: `TemplateSchema`, `WorkspaceSchema`, `GlobalConfigSchema`
- Infer types from Zod schemas: `export type Stack = z.infer<typeof StackSchema>`
- Use `type` for data structures, `interface` for contracts (e.g., `Integration`, `WindowDetector`)
- Error classes: PascalCase with `Error` suffix: `CircularIncludesError`, `MissingTemplateError`

**Constants:**
- UPPER_SNAKE_CASE for path constants: `WORKSPACES_DIR`, `GLOBAL_CONFIG_FILE`, `REGISTRY_FILE`, `TEMPLATES_DIR`
- All path constants in `src/lib/paths.ts` as single source of truth
- Hook key arrays: `const HOOK_KEYS: HookKey[]` in `src/lib/composition.ts`

## Code Style

**Formatting:**
- No explicit formatter (Prettier/Biome) configured
- 2-space indentation (implicit, consistent across codebase)
- Double quotes for strings (consistent across all files)
- Trailing comma in multi-line structures
- Arrow functions for callbacks and short functions
- Explicit `function` for named exports

**Linting:**
- No ESLint or Biome configured
- TypeScript strict mode enforced via `tsconfig.json`:
  - `"strict": true`
  - `"noUnusedLocals": true`
  - `"noUnusedParameters": true`

**Type Usage:**
- Never use `any` -- use type parameters, explicit unions, or `unknown`
- Structural typing for Zod schema parameters: `schema: { parse: (data: unknown) => T }` (see `readYaml` in `src/lib/config.ts`)
- Discriminated unions for fallible results: `{ ok: true; data: T } | { ok: false; error: string }`
- `as const` for fixed arrays used as type constraints
- Export types alongside implementations: `export type Workspace = z.infer<typeof WorkspaceSchema>`

## Import Organization

**Order:**
1. Node.js builtins: `import { join } from "path"`, `import { existsSync } from "fs"`
2. External packages: `import { z } from "zod"`, `import { $ } from "bun"`, `import { Command } from "commander"`
3. Internal absolute (test-only): `import type { X } from "@/lib/types"`
4. Internal relative: `import { readWorkspace } from "./config"`

**Path Alias:**
- `@/*` resolves to `./src/*` (configured in `tsconfig.json`)
- **Test-only**: DO NOT use `@/*` in `src/` production code -- the alias is not available in the published npm package since Bun does not resolve tsconfig paths from within `node_modules`
- Production code in `src/` must use relative imports: `import { readWorkspace } from "./config"`
- Type-only imports with `@/*` are safe in tests (erased at compile time)

**Import Style:**
- Named exports only: `import { readStack, writeStack } from "./config"`
- Never use wildcard imports: no `import * as config from "./config"`
- Exception: `import * as p from "@clack/prompts"` in `src/tui/utils.ts` -- wrapped in mutable `prompts` object for testability

## Error Handling

**Shell Operations (`src/lib/git.ts`):**
- Use Bun's `$` shell with `.quiet().nothrow()` to suppress stderr and capture exit codes
- Check `result.exitCode` manually rather than catching exceptions
- Abort failed merge/rebase automatically: `git rebase --abort`, `git merge --abort`
```typescript
const result = await $`git -C ${repoPath} rev-parse --verify ${branch}`.quiet().nothrow()
return result.exitCode === 0
```

**Fallible Operation Returns:**
- Return discriminated union results, never throw for expected failures:
```typescript
export async function pullFFOnly(
  repoPath: string,
  branch: string
): Promise<{ ok: true; commits: number } | { ok: false; reason: string }> {
```
- Return `null` only when "not found" is expected, never for errors
- Include context in error reasons: `"diverged: ${branch}"`, `"no remote branch: ${branch}"`

**YAML/Config Validation:**
- Zod `.parse()` throws on invalid schema -- only used for trusted YAML files
- `.safeParse()` for user-supplied data that may be invalid (corrupt workspace files)
- Wrap parse errors with context: `throw new Error(\`Invalid config at ${path}: ${formatZodError(err)}\`)`

**Hook Failures:**
- `runHooks()` in `src/lib/lifecycle.ts` throws on non-zero exit when `abortOnFailure=true` (default)
- Callers wrap in try/catch and convert to `{ ok: false, error: string }` return

**File I/O:**
- Try-catch in narrow scopes, not around entire functions
- Catch silently when failure is expected (e.g., missing files): `catch { // skip unreadable files }`
- Custom error classes for domain-specific errors: `CircularIncludesError`, `MissingTemplateError` in `src/lib/composition.ts`

## Logging

**Framework:** Plain `console.log` / `console.error`

**Patterns:**
- `console.log()` for normal user-facing output
- `console.error()` for errors and warnings, prefixed with `[git-stacks]`: `console.error(\`[git-stacks] Skipping corrupt workspace '${f}'\`)`
- Indented progress: `console.log(\`  ${msg}\`)` for nested context
- Progress callback pattern for operations that report incremental progress:
```typescript
export type ProgressCallback = (message: string) => void

export async function openWorkspace(
  name: string,
  opts: OpenOptions,
  onProgress?: ProgressCallback
): Promise<...> {
  onProgress?.("Creating worktree for api...")
}
```
- Format tables with `.padEnd()` for column alignment
- Shell output inherited directly for hooks: `stdio: "inherit"` in `src/lib/lifecycle.ts`

## Comments

**Section Dividers:**
```typescript
// --- Schemas ---
// --- Helpers ---
// --- Global Config ---
// --- Workspaces ---
```

**When to Comment:**
- Edge cases and workarounds: `"Use structural typing to avoid Zod's internal generic complexity"`
- Non-obvious behavior: `"Branch from current HEAD of the main clone, not a fixed base branch"`
- Known library quirks: `"@clack/prompts p.text returns undefined (not '') on empty input"`
- Injectable test seam explanation: `"Bun.spawn calls funnel through _exec.spawn. The object property is mutable even in ESM"`

**JSDoc:**
- Sparse -- only on public interfaces and complex function signatures
- Used on `Integration` interface methods in `src/lib/integrations/types.ts`
- Single-line `//` comments for inline parameter explanations
- No block comments (`/* */`) except JSDoc

## Function Design

**Parameters:**
- Max 3-4 positional params; use destructured options objects beyond that
- Options objects for behavior flags: `{ force?: boolean; gone?: boolean; skipSecrets?: boolean }`
- Callbacks for progress: `ProgressCallback = (message: string) => void`
- Injectable `_sleep` and `_listWindows` functions in `SnapshotOpts` for testing: `_sleep?: (ms: number) => Promise<void>`

**Return Types:**
- Explicit return type annotations on all exported functions
- Discriminated unions for fallible operations:
```typescript
Promise<{ ok: true } | { ok: false; error: string }>
Promise<{ ok: true; commits: number } | { ok: false; reason: string }>
```
- Return `null` only for "not found" semantics
- Async functions always return `Promise<T>`

**Function Size:**
- Most functions are 10-40 lines
- Larger orchestration functions (e.g., `openWorkspace`, `syncWorkspace` in `src/lib/workspace-ops.ts`) can be 100+ lines
- Extract helpers for repeated logic within the same module

## Module Design

**Layer Separation:**
- `src/lib/` -- Reusable business logic (config I/O, git ops, integrations)
- `src/commands/` -- CLI command definitions (thin wrappers, dispatch to lib/)
- `src/tui/` -- Interactive prompts and TUI dashboard (SolidJS)

**Export Patterns:**
- Export all public functions and types from each module
- Export types alongside implementations: `export type Stack = z.infer<typeof StackSchema>`
- No barrel files except `src/lib/integrations/index.ts` (integration registry)
- `src/index.ts` is CLI entry point, not a barrel

**Single Source of Truth:**
- All paths: `src/lib/paths.ts`
- All Zod schemas: `src/lib/config.ts`
- All integrations: `src/lib/integrations/index.ts`
- All git ops: `src/lib/git.ts`

## Structural Patterns

**YAML Config I/O (`src/lib/config.ts`):**
```typescript
function readYaml<T>(path: string, schema: { parse: (data: unknown) => T }): T {
  const raw = readFileSync(path, "utf-8")
  return schema.parse(parse(raw))
}

function writeYaml(path: string, data: unknown) {
  ensureDir(dirname(path))
  const tmpPath = `${path}.tmp`
  const fd = openSync(tmpPath, "w")
  writeSync(fd, stringify(data), 0, "utf-8")
  fsyncSync(fd)
  closeSync(fd)
  renameSync(tmpPath, path)  // atomic rename
}
```
- Paired `read*` / `write*` functions for each entity: `readWorkspace` / `writeWorkspace`, `readTemplate` / `writeTemplate`
- Atomic writes: write to `.tmp`, fsync, then rename

**Injectable Executor Pattern (`_exec`):**
- Modules that spawn subprocesses export a mutable `_exec` object:
```typescript
export const _exec = {
  spawn: (args: { cmd: string[]; cwd: string; env: Record<string, string> }): SpawnHandle => {
    return Bun.spawn(args.cmd, { ... })
  },
}
```
- Used in: `src/lib/lifecycle.ts`, `src/lib/tmux.ts`, `src/lib/niri.ts`, `src/lib/aerospace.ts`, `src/lib/cmux.ts`, `src/lib/integrations/vscode.ts`, `src/lib/integrations/intellij.ts`, `src/lib/integrations/github.ts`, `src/lib/integrations/gitlab.ts`, `src/lib/integrations/gitea.ts`, `src/lib/integrations/jira.ts`
- Tests replace `_exec.spawn` with a mock to verify call shapes without executing real processes
- Object property is mutable even in ESM (unlike named exports)

**Integration Plugin System (`src/lib/integrations/`):**
```typescript
export interface Integration {
  id: string
  label: string
  order: number          // tier 1: 10-19, tier 2: 20-29, tier 3: 30-39
  applies?(workspace: Workspace): boolean
  isEnabled(ctx: IntegrationContext): boolean
  generate?(ctx: IntegrationContext): string | null
  open(ctx: IntegrationContext, artifactPath: string | null, bag: ArtifactBag): Promise<IntegrationArtifact | null>
  cleanup?(ctx: IntegrationContext): Promise<void>
  configurePrompt(current: Record<string, unknown>): Promise<Record<string, unknown> | null>
}
```
- Register in `src/lib/integrations/index.ts` only
- Runner (`src/lib/integrations/runner.ts`) sorts by `order` ascending, checks `applies()` and `isEnabled()`, then calls `generate()` then `open()`
- Config stored under `globalConfig.integrations[id]` (a `Record<string, unknown>`), parsed internally by each integration with its own Zod schema

**Mutable Prompts Object (`src/tui/utils.ts`):**
```typescript
export const prompts = {
  text: p.text,
  select: p.select,
  confirm: p.confirm,
  // ...
}
```
- Tests can replace individual methods: `prompts.confirm = mock(async () => true)`
- `safeText()` wrapper normalizes `@clack/prompts` empty-string quirk (returns `undefined` instead of `""`)

**Scan-Based Lookup (`src/lib/config.ts`):**
- Workspace and template lookups scan all YAML files and match by `name` field, not filename
- Handles filename drift (where YAML `name` differs from filename stem)
- Warns on duplicate names via `console.error`

**Discriminated Union Results:**
- Consistently used for all workspace operations in `src/lib/workspace-ops.ts`:
```typescript
{ ok: true } | { ok: false; error: string }
{ ok: true; commits: number } | { ok: false; reason: string }
```

---

*Convention analysis: 2026-04-04*
