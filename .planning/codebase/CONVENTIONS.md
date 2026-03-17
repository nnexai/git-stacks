# Coding Conventions

**Analysis Date:** 2026-03-17

## Naming Patterns

**Files:**
- Kebab-case for all files (e.g., `workspace-ops.ts`, `stack-wizard.ts`, `completion-generator.ts`)
- Test files follow pattern: `{name}.test.ts` (e.g., `detect.test.ts`, `config.test.ts`)
- Helper/utility files: `utils.ts` (e.g., `src/tui/utils.ts`, `tests/helpers.ts`)
- No `.d.ts` files — types are colocated with implementation

**Functions:**
- Camel case for all function names
- Prefix with verb for clarity:
  - `read*` / `write*` — YAML I/O (`readStack`, `writeStack`, `readWorkspace`)
  - `create*` / `remove*` — git operations (`createWorktree`, `removeWorktree`)
  - `list*` / `scan*` — discovery/enumeration (`listWorkspaces`, `listStacks`, `scanForRepos`)
  - `is*` / `check*` — boolean checks (`isRepoDirty`, `checkBranchExists`, `isWorktreeRegistered`)
  - `get*` — computed values (`getCurrentBranch`, `getMergeConflicts`, `getWorkspaceListInfo`)
  - `generate*` — artifact creation (`generateCodeWorkspace`, `generateIntellijProject`)
  - `resolve*` — configuration resolution (`resolveEnabled`, `resolveEnabledGlobally`)
  - `run*` — CLI command entry points (`runWorkspaceNew`, `runWorkspaceClone`)
  - `format*` — string formatting (`formatAge`)

**Variables:**
- Camel case (e.g., `dirtyRepos`, `repoPath`, `taskPath`)
- Descriptive names with context:
  - `{entity}Path`: full file paths (`repoPath`, `stackPath`, `worktreePath`, `taskPath`)
  - `{entity}Dir`: directory paths (`tasksDir`, `mainDir`)
  - `main_path` / `task_path`: YAML field names (snake_case, matching YAML schema)
- Destructure when unpacking YAML objects: `const { name, path, type } = repo`
- Plural for arrays: `workspaces`, `repos`, `commands`, `dirtyRepos`, `issues`

**Types:**
- PascalCase for all type/interface names: `Workspace`, `Stack`, `RepoType`, `Integration`, `WorkspaceListInfo`
- Schema types use suffix `Schema`: `StackSchema`, `WorkspaceSchema`, `StackRepoSchema`
- Infer types from schemas: `export type Stack = z.infer<typeof StackSchema>`
- Use `type` not `interface` for simple data structures, `interface` for contracts (e.g., `Integration`)
- Prefix optional fields with descriptive names: `cmux_workspace_id`, `env_file`, `task_path` (never just `id`)

**Constants:**
- UPPER_SNAKE_CASE for paths and configuration constants:
  - `HOME`, `DEFAULT_WORKSPACE_ROOT`, `STACKS_DIR`, `WORKSPACES_DIR`, `GLOBAL_CONFIG_FILE`
- Located in `src/lib/paths.ts` as single source of truth

## Code Style

**Formatting:**
- No explicit formatter configured (Bun runs TypeScript directly)
- Implicit style observed:
  - 2-space indentation
  - Single quotes for strings (when not interpolating)
  - Template literals for multiline strings and interpolation
  - No semicolons at statement ends (rare, only in shell command strings)

**Linting:**
- No ESLint/Biome config present
- TypeScript strict mode enforced:
  - `tsconfig.json`: `"strict": true`
  - `noUnusedLocals: true` — all vars must be used
  - `noUnusedParameters: true` — all params must be used

**Type Safety:**
- Always export types alongside implementations: `export type Workspace = z.infer<typeof WorkspaceSchema>`
- Zod schemas are single source of truth for YAML shape
- No `any` — use type parameters or explicit unions instead
- Structural typing used in config I/O: `schema.parse(data)` pattern

## Import Organization

**Order:**
1. Built-ins: `import { ... } from "bun"`, `import { ... } from "fs"`, `import { ... } from "path"`
2. Third-party: `import { ... } from "yaml"`, `import { ... } from "zod"`
3. Local lib: `import { ... } from "@/lib/config"`, `import { ... } from "@/lib/git"`
4. Commands/TUI: relative imports up directory tree
5. Types: `import type { ... }` — always explicit `type` keyword

**Path Aliases:**
- `@/*` resolves to `./src/*` (configured in `tsconfig.json`)
- Used in tests and deep-nested imports: `import { cancel } from "@/tui/utils"`

**Cleanup pattern:**
- Import named exports: `import { readStack, writeStack } from "./config"`
- Never use wildcard imports: no `import * as config from "./config"`
- Group by functionality: all git functions together, all config functions together

## Error Handling

**Patterns:**
- Bun shell (`$`) operations use `.quiet().nothrow()` to suppress stderr and return exit codes:
  ```typescript
  const result = await $`git -C ${repoPath} ...`.quiet().nothrow()
  if (result.exitCode === 0) { /* success */ }
  return { ok: true } or { ok: false, error: result.stderr.toString() }
  ```
- Zod parsing with `.parse()` throws on invalid schema — only used for trusted YAML files
- Try-catch in narrow scopes, not around entire functions:
  ```typescript
  try { stacks.set(name, readStack(name)) } catch { /* stack deleted */ }
  ```
- Catch errors silently when expected (e.g., file operations on potentially missing files)
- Throw with descriptive messages including context: `throw new Error(\`Hook failed (exit ${exitCode}): ${cmd}\`)`

**Return types:**
- Use discriminated unions for fallible operations:
  ```typescript
  type Result = { ok: true } | { ok: false; error: string }
  ```
- Never return `null` for operations that may fail — use union with error info
- Use `.nothrow()` and check `.exitCode` rather than catching shell errors

**Abort pattern:**
- Long-running operations (rebase, merge) auto-abort on failure: `git rebase --abort`, `git merge --abort`
- Return error in result object rather than throwing

## Logging

**Framework:** `console` (built-in, no logger library)

**Patterns:**
- `console.log()` for normal output
- `console.error()` for errors and warnings
- Prefix output with indentation for nested context: `console.log(\`  ${msg}\`)`
- Pass callback for progress: `openWorkspace(name, opts, (msg) => console.log(\`  ${msg}\`))`
- Format tables manually with `.padEnd()` for alignment
- Shell output inherited directly from spawned processes in lifecycle.ts

## Comments

**When to Comment:**
- Section dividers using visual markers: `// --- Schemas ---`, `// --- Helpers ---`
- Edge cases and workarounds: "Use structural typing to avoid Zod's internal generic complexity"
- Why something non-obvious: "Branch from current HEAD of the main clone, not a fixed base branch"
- Known limitations: `@clack/prompts p.text returns undefined (not "") on empty input`

**JSDoc/TSDoc:**
- Sparse — only on public interfaces and complex types
- Used in integration system: `/** Unique key — used as the key in config.integrations */`
- Document callback and return types for integration hooks
- No auto-generated docs

**Inline comments:**
- Single `//` on same line explaining non-obvious parameters
- No block comments (`/* */`) except JSDoc

## Function Design

**Size:** Most functions 10-40 lines; larger functions are orchestration (workspace-ops.ts: openWorkspace, syncWorkspace)

**Parameters:**
- Max 3-4 positional params; use destructuring for objects with >2 fields
- Options objects for CLI: `{ force: boolean; gone: boolean }`
- Callbacks for progress: `ProgressCallback = (message: string) => void`

**Return Values:**
- Explicit return type annotations always present on exported functions
- Use union types for fallible: `{ ok: true } | { ok: false; error: string }`
- Return null only when "not found" is expected, never for errors
- Async functions always return `Promise<T>`

## Module Design

**Exports:**
- Separate `lib/` (reusable) from `commands/` (CLI) from `tui/` (interaction)
- Export all public functions and types
- Export types alongside: `export type Stack = z.infer<typeof StackSchema>`

**Single source of truth:**
- All paths: `src/lib/paths.ts`
- All schemas: `src/lib/config.ts`
- All integrations: `src/lib/integrations/index.ts`
- All git ops: `src/lib/git.ts`

**Barrel Files:**
- `src/lib/integrations/index.ts` exports all integrations and types
- `src/index.ts` is CLI entry point, not a barrel

## Structural Patterns

**YAML I/O:**
All reads/writes in `src/lib/config.ts`:
- `readYaml(path, schema)` — parses with Zod
- `writeYaml(path, data)` — stringifies
- Create `read*` and `write*` functions for each entity
- Ensure directory exists before writing

**Integration plugin system:**
Implement `Integration` interface:
- `id` — unique config key
- `applies?(workspace)` — optional filter
- `isEnabled(ctx)` — resolve config
- `generate?(ctx)` — return path or null
- `open(ctx, path)` — launch tool
- Register only in `src/lib/integrations/index.ts`

**Error propagation:**
- Shell operations: `.catch()`, map to error result
- YAML parsing: let Zod throw (data trusted)
- File I/O: try-catch around copy/symlink (expected to fail sometimes)
