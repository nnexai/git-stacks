# Phase 64: Schema & Registry - Research

**Researched:** 2026-04-04
**Domain:** Zod schema extension, registry I/O, CLI command guards, detect.ts scan expansion
**Confidence:** HIGH

## Summary

Phase 64 extends three existing schemas (`RepoRegistryEntrySchema`, `TemplateRepoSchema`, `WorkspaceRepoSchema`) to support a new "dir" concept for non-git directories, and updates two CLI surfaces (`repo add` and `repo scan`) to accept plain directories alongside git repos.

The codebase is cleanly layered: Zod schemas live entirely in `src/lib/config.ts`, directory scanning in `src/lib/detect.ts`, CLI commands in `src/commands/repo.ts`, and the interactive scan wizard in `src/tui/repo-wizard.ts`. All four need targeted changes but no architectural shifts.

The central design decision is where to encode "dir-ness." The recommended approach (see Architecture Patterns) introduces a new top-level flag `is_dir: boolean` on `RepoRegistryEntry` instead of extending `RepoTypeSchema`. This keeps `RepoTypeSchema` as a language/build-system enum (its current meaning) and avoids conflating repo kind with tech stack. `WorkspaceRepoSchema.mode` gains a `"dir"` option, and `task_path` becomes optional so dir repos can omit it at the schema level.

**Primary recommendation:** Add `is_dir: boolean` (default `false`) to `RepoRegistryEntrySchema`; add `"dir"` to `WorkspaceRepoSchema.mode`; make `task_path` optional in `WorkspaceRepoSchema`; extend `scanForRepos` with an `includeDirs` flag.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
None — auto-generated infrastructure phase, discuss skipped.

### Claude's Discretion
All implementation choices are at Claude's discretion. Key schema decisions to make:
- Extend `RepoTypeSchema` to include "dir" or create a separate `RepoKindSchema`
- Whether `TemplateRepoSchema.mode` gains a "dir" option or infers it from registry type
- How `WorkspaceRepoSchema` handles dir repos (task_path behavior, base_branch omission)
- Whether `scanForRepos` in detect.ts should offer non-git directories or remain git-only with a separate scan function

### Deferred Ideas (OUT OF SCOPE)
None — infrastructure phase.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SCHM-01 | User can set repo type to "dir" in registry and template YAML | Add `is_dir` flag to `RepoRegistryEntrySchema`; `"dir"` to `WorkspaceRepoSchema.mode` |
| SCHM-02 | Workspace YAML stores dir repos with mode "dir" and resolves main_path only (no task_path, no branch) | Make `task_path` optional; `WorkspaceRepoSchema` guards by `mode` |
| REG-01 | User can add a non-git directory to the repo registry via `repo add` | Remove `.git` guard; skip git ops for dir paths; skip forge detection |
| REG-02 | `repo scan` detects and offers to register plain directories alongside git repos | Extend `scanForRepos` or add parallel `scanForDirs`; merge in wizard |
</phase_requirements>

## Standard Stack

### Core — Already in Use
| Library | Version | Purpose | Notes |
|---------|---------|---------|-------|
| zod | ^4.3.6 | Schema validation | `z.enum`, `.optional()`, `.default()` — all patterns already used [VERIFIED: codebase grep] |
| yaml | ^2.8.3 | YAML read/write | Already handles all config I/O [VERIFIED: codebase grep] |
| bun:fs | built-in | `existsSync`, `readdirSync` | Used throughout detect.ts and config.ts [VERIFIED: codebase grep] |

No new dependencies required for this phase. All functionality is additive changes to existing modules.

**Installation:** None needed.

## Architecture Patterns

### Recommended Project Structure (unchanged)
```
src/
  lib/
    config.ts        — schema changes: RepoRegistryEntrySchema, WorkspaceRepoSchema, TemplateRepoSchema
    detect.ts        — scan changes: scanForRepos gains includeDirs option or new scanForDirs export
  commands/
    repo.ts          — repo add: remove .git guard, skip git ops for dir; no forge for dir
  tui/
    repo-wizard.ts   — runRepoScan: present git repos + plain dirs; label "dir" in hint
```

### Pattern 1: Separate flag vs. extended enum

**Decision:** Use `is_dir: boolean` on `RepoRegistryEntry` rather than adding `"dir"` to `RepoTypeSchema`.

**Why:** `RepoTypeSchema` (`"java" | "typescript" | "other"`) describes language/build-system detection. Extending it with `"dir"` conflates two orthogonal concepts. A dir could be a typescript or java project that happens to be non-git. An `is_dir` flag at the registry entry level cleanly separates "is this a git repo?" from "what language is it?".

For `TemplateRepoSchema.mode` and `WorkspaceRepoSchema.mode`, adding `"dir"` is the right place since mode already describes how the repo participates in workspace lifecycle.

**Schema additions:**

```typescript
// Source: src/lib/config.ts — current code [VERIFIED: codebase read]

// RepoRegistryEntrySchema — add is_dir flag
export const RepoRegistryEntrySchema = z.object({
  name: NameSchema,
  schema_version: z.string().default("1"),
  local_path: z.string(),
  default_branch: z.string().default("main"),
  type: RepoTypeSchema.default("other"),
  forge: ForgeTypeSchema,
  is_dir: z.boolean().default(false),          // NEW: true = non-git directory
})

// TemplateRepoSchema — add "dir" to mode
export const TemplateRepoSchema = z.object({
  repo: z.string(),
  mode: z.enum(["trunk", "worktree", "dir"]).default("worktree"),  // "dir" added
  base_branch: z.string().optional(),
  branch_pattern: z.string().optional(),
})

// WorkspaceRepoSchema — add "dir" to mode, make task_path optional
export const WorkspaceRepoSchema = z.object({
  name: z.string(),
  repo: z.string(),
  type: RepoTypeSchema,
  mode: z.enum(["trunk", "worktree", "dir"]),  // "dir" added
  main_path: z.string().transform(expandHome),
  task_path: z.string().transform(expandHome).optional(),  // optional for dir repos
  base_branch: z.string().optional(),
  hooks: WorkspaceRepoHooksSchema.optional(),
  files: FilesSchema,
})
```

**Backward compatibility:** `is_dir` defaults to `false` — all existing registry YAML parses without changes. `task_path` becomes `.optional()` — all existing workspace YAMLs with `task_path` present still parse correctly. Existing `"trunk" | "worktree"` modes continue to work.

### Pattern 2: Workspace repo construction for dir repos

When `buildReposFromTemplate` encounters a registry entry with `is_dir: true`, it sets `mode: "dir"` and omits `task_path` and `base_branch`.

```typescript
// In workspace-wizard.ts buildReposFromTemplate — adapted from existing pattern [VERIFIED: codebase read]

if (regEntry.is_dir) {
  repos.push({
    name: regEntry.name,
    repo: tplRepo.repo,
    type: regEntry.type,
    mode: "dir",
    main_path: regEntry.local_path,
    // no task_path, no base_branch
  })
  continue
}

const mode = tplRepo.mode ?? "worktree"
const taskPath = mode === "worktree"
  ? join(tasksDir, wsName, regEntry.name)
  : regEntry.local_path
repos.push({
  name: regEntry.name,
  repo: tplRepo.repo,
  type: regEntry.type,
  mode,
  main_path: regEntry.local_path,
  task_path: taskPath,
  base_branch: tplRepo.base_branch ?? regEntry.default_branch,
})
```

Note: The workspace-wizard changes are strictly guarded by `is_dir` flag. Phase 64 only writes the SCHM-02 workspace shape — lifecycle consumption (Phase 65) reads `mode: "dir"` to skip git ops.

### Pattern 3: scanForRepos extension

Two options for REG-02:

**Option A (recommended): extend signature with options object**
```typescript
// Source: src/lib/detect.ts — current code [VERIFIED: codebase read]
export interface ScanOptions {
  includeDirs?: boolean   // default false — backward compat
}

export function scanForRepos(dir: string, options: ScanOptions = {}): DiscoveredRepo[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => {
      if (!e.isDirectory()) return false
      if (options.includeDirs) return true           // include all dirs
      return existsSync(join(dir, e.name, ".git"))  // default: git only
    })
    .map((e) => {
      const repoPath = join(dir, e.name)
      const isDir = !existsSync(join(repoPath, ".git"))
      return {
        name: e.name,
        path: repoPath,
        detectedType: detectRepoType(repoPath),
        isDir,                                       // NEW flag on DiscoveredRepo
      }
    })
    .sort((a, b) => a.name.localeCompare(b.name))
}
```

**Option B: separate `scanForDirs` export** — simpler but duplicates scan logic.

Option A is preferred: keeps the single scan function, existing callers unchanged (options default to git-only), `isDir` on `DiscoveredRepo` lets the wizard distinguish them for display and registration.

**DiscoveredRepo interface extension:**
```typescript
export interface DiscoveredRepo {
  name: string
  path: string
  detectedType: RepoType
  isDir: boolean         // NEW: true if no .git found
}
```

### Pattern 4: `repo add` command changes for REG-01

Current guard in `repo.ts` (line 36-39):
```typescript
if (!existsSync(join(localPath, ".git"))) {
  console.error(`Not a git repository: ${localPath}`)
  process.exit(1)
}
```

Replace with:
```typescript
const isDir = !existsSync(join(localPath, ".git"))
// No error for non-git dirs — they are valid dir repos
```

For dir repos, skip git-specific operations:
- Skip `getCurrentBranch(localPath)` — use `"main"` as placeholder (or empty string)
- Skip `detectForgeForRepo(localPath)` — dirs have no remote
- Set `is_dir: true` in the entry

```typescript
const isDir = !existsSync(join(localPath, ".git"))
const type = detectRepoType(localPath)
const defaultBranch = isDir ? "main" : (opts.branch ?? (await getCurrentBranch(localPath)))
const forge = isDir ? undefined : /* existing forge detection logic */

const entry: RepoRegistryEntry = {
  name,
  schema_version: "1",
  local_path: localPath,
  default_branch: defaultBranch,
  type,
  forge,
  is_dir: isDir,
}
```

### Pattern 5: `runRepoScan` wizard changes for REG-02

The wizard in `repo-wizard.ts` calls `scanForRepos(dir)`. With Option A, pass `{ includeDirs: true }` and use the `isDir` flag to:
1. Show a distinct hint in the multiselect (e.g., `dir — /path/to/dir` vs `java — /path/to/repo`)
2. Skip `getCurrentBranch` and `detectForgeForRepo` for dir entries
3. Set `is_dir: true` in the registry push

```typescript
// Changed call site in repo-wizard.ts
const discovered = scanForRepos(dir, { includeDirs: true })

// In registration loop
if (repo.isDir) {
  registry.push({
    name: regName,
    schema_version: "1",
    local_path: repo.path,
    default_branch: "main",
    type: repo.detectedType,
    is_dir: true,
  })
} else {
  // existing git branch + forge detection
}
```

### Anti-Patterns to Avoid

- **Adding `"dir"` to `RepoTypeSchema`:** Conflates language detection with repo kind. `RepoTypeSchema` has always been tech-stack detection; mixing in structural metadata breaks the semantic.
- **Making `task_path` required with a dummy value for dir repos:** Writing `task_path: ""` or `task_path: main_path` for dirs creates confusion in downstream code. Optional is the right schema shape.
- **Inferring `is_dir` from `mode: "dir"` at read time:** `WorkspaceRepoSchema` stores the computed workspace snapshot; `RepoRegistryEntrySchema` stores the source of truth. Both need the concept, but the registry needs `is_dir` to know what it registered before any workspace exists.
- **Calling `getCurrentBranch` on non-git dirs:** This calls `git -C <path> rev-parse --abbrev-ref HEAD` which will error on non-git directories. Always guard with `is_dir` or `existsSync(".git")` first.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Optional field with transform | `.optional().transform()` chaining issues | `.optional()` then `.transform()` on the non-optional, or use `z.string().optional()` without transform | Zod transform on optional requires `.optional()` wrapping correctly — see Code Examples |
| Backward compat defaults | Manual version checks | `z.boolean().default(false)` | Zod `.default()` handles absent fields transparently |

**Key insight:** The entire feature is a schema extension + two command guard removals. All the complexity is avoided by leaning on Zod's `.default()` for backward compat and `.optional()` for omittable fields.

## Common Pitfalls

### Pitfall 1: `task_path` transform on optional field
**What goes wrong:** `z.string().transform(expandHome).optional()` transforms before optionality check, causing runtime error when field is absent.
**Why it happens:** Zod applies `.transform()` on the inner type; `.optional()` wraps it. The correct order is `z.string().transform(expandHome).optional()` — this is actually valid in Zod 4, but verify the test passes.
**How to avoid:** Test with `WorkspaceRepoSchema.parse({ ..., mode: "dir" })` omitting `task_path` — ensure it parses without error.
**Warning signs:** `TypeError: Cannot read properties of undefined (reading 'replace')` at schema parse time.

### Pitfall 2: Existing `workspace-ops.ts` code assumes `task_path` is always defined
**What goes wrong:** Lines like `repo.task_path` accessed without optional check throw `undefined` errors for dir repos.
**Why it happens:** `WorkspaceRepo.task_path` is currently non-optional; all consumers assume it exists.
**How to avoid:** Phase 64 only writes schema + scan + CLI registration. It does NOT touch `workspace-ops.ts`. Phase 65 handles lifecycle guards. The planner must NOT include workspace-ops changes in Phase 64 tasks.
**Warning signs:** TypeScript errors `Object is possibly 'undefined'` after making `task_path` optional — these will surface at typecheck time and confirm that Phase 65 must add the guards.

### Pitfall 3: `isDir` on DiscoveredRepo breaks existing detect.test.ts
**What goes wrong:** Tests that do `expect(found[0].path).toBe(...)` still pass, but if tests destructure `DiscoveredRepo` they may need updating.
**Why it happens:** Adding `isDir` to the interface doesn't break existing tests — it's an additive property. But the test for "ignores dirs without .git" would now return them with `isDir: true` when `includeDirs: true`.
**How to avoid:** Do not change the default scan behavior — only the `{ includeDirs: true }` path returns plain dirs. Existing tests call `scanForRepos(tmp)` with no options, so they remain unaffected.

### Pitfall 4: `default_branch` on dir repos
**What goes wrong:** Storing `default_branch: "main"` for a dir registry entry misleads future code that might try to use it for git operations.
**Why it happens:** `RepoRegistryEntrySchema.default_branch` has `.default("main")` and is always written.
**How to avoid:** Accept the dummy value — it is never read for dir repos because Phase 65 skips git ops by `mode: "dir"` check. Document the convention: `default_branch` on dir entries is meaningless and ignored.

### Pitfall 5: Zod 4 enum extension syntax
**What goes wrong:** Using `.extend()` or `.merge()` on a `z.enum()` value.
**Why it happens:** `z.enum()` is not extendable like `z.object()`.
**How to avoid:** Replace the enum definition entirely: `z.enum(["trunk", "worktree", "dir"])`. Since the mode enum appears only in `TemplateRepoSchema` and `WorkspaceRepoSchema`, both are trivial inline replacements. [VERIFIED: codebase read — enum is defined inline, not as a shared export]

## Code Examples

### Making task_path optional in WorkspaceRepoSchema
```typescript
// Source: src/lib/config.ts — adapted [VERIFIED: codebase read]
export const WorkspaceRepoSchema = z.object({
  name: z.string(),
  repo: z.string(),
  type: RepoTypeSchema,
  mode: z.enum(["trunk", "worktree", "dir"]),
  main_path: z.string().transform(expandHome),
  task_path: z.string().transform(expandHome).optional(),  // optional for dir repos
  base_branch: z.string().optional(),
  hooks: WorkspaceRepoHooksSchema.optional(),
  files: FilesSchema,
})
```

### Zod parse test for dir repo (SCHM-01, SCHM-02)
```typescript
// How to verify schema accepts dir repos
const repo = WorkspaceRepoSchema.parse({
  name: "my-notes",
  repo: "notes-dir",
  type: "other",
  mode: "dir",
  main_path: "/home/user/notes",
  // task_path intentionally omitted
})
expect(repo.mode).toBe("dir")
expect(repo.task_path).toBeUndefined()
```

### Registry entry for dir (SCHM-01)
```typescript
const entry = RepoRegistryEntrySchema.parse({
  name: "notes-dir",
  local_path: "/home/user/notes",
  is_dir: true,
  // default_branch defaults to "main", type defaults to "other"
})
expect(entry.is_dir).toBe(true)
```

### Backward compat: existing registry entries parse without is_dir
```typescript
const entry = RepoRegistryEntrySchema.parse({ name: "api", local_path: "/dev/api" })
expect(entry.is_dir).toBe(false)  // default kicks in
```

### scanForRepos with includeDirs option (REG-02)
```typescript
// Source: src/lib/detect.ts — adapted [VERIFIED: codebase read]
const all = scanForRepos(dir, { includeDirs: true })
const gitRepos = all.filter(r => !r.isDir)   // existing git repos
const plainDirs = all.filter(r => r.isDir)   // new plain dirs
```

## State of the Art

| Old Approach | Current Approach | Notes |
|--------------|------------------|-------|
| `mode: "trunk" \| "worktree"` | `mode: "trunk" \| "worktree" \| "dir"` | Additive change, no migration needed |
| `task_path: required` | `task_path: optional` | Backward compat via `.optional()` — existing files with task_path still parse |
| `is_dir: absent` | `is_dir: boolean default false` | Zod `.default(false)` handles all existing registry entries |

**Nothing deprecated:** all existing functionality preserved.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `z.string().transform(expandHome).optional()` is valid in Zod 4 and returns `string \| undefined` correctly | Code Examples | If wrong, need alternate pattern — verify with typecheck during implementation |
| A2 | `default_branch` on dir repos can safely hold the dummy value `"main"` without breaking existing downstream reads | Common Pitfalls | Phase 65 will expose if any code reads `default_branch` from a dir registry entry and acts on it |

## Open Questions

1. **Should `TemplateRepoSchema.mode` also gain `"dir"`?**
   - What we know: Template mode drives workspace construction in `buildReposFromTemplate`. If a user hand-edits a template to set `mode: "dir"`, the wizard should respect it. Alternatively, `is_dir` on the registry entry can override/coerce the mode at construction time.
   - What's unclear: Whether explicit `mode: "dir"` in template YAML adds clarity or redundancy.
   - Recommendation: Add `"dir"` to `TemplateRepoSchema.mode` for explicitness, but also coerce to `"dir"` in `buildReposFromTemplate` when `regEntry.is_dir` is true, regardless of template mode. Belt-and-suspenders.

2. **Where does `is_dir` live in template YAML?**
   - Templates reference repos by name (registry key). Templates don't embed registry metadata. The registry entry already carries `is_dir`. Templates themselves don't need `is_dir`.
   - Recommendation: `is_dir` lives only on `RepoRegistryEntry`. Templates implicitly pick it up via registry lookup at workspace creation time.

## Environment Availability

Step 2.6: SKIPPED (no external dependencies identified — pure schema/CLI changes, no new tools required)

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | bun:test |
| Config file | none — scripts/test-runner.ts orchestrates |
| Quick run command | `bun run test` |
| Full suite command | `bun run test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SCHM-01 | `RepoRegistryEntrySchema` accepts `is_dir: true` | unit | `bun test tests/lib/config.test.ts` | ✅ existing file — add test cases |
| SCHM-01 | `WorkspaceRepoSchema` accepts `mode: "dir"` | unit | `bun test tests/lib/config.test.ts` | ✅ existing file — add test cases |
| SCHM-02 | `WorkspaceRepoSchema` parses `mode: "dir"` with `task_path` absent | unit | `bun test tests/lib/config.test.ts` | ✅ existing file — add test cases |
| SCHM-01 | Existing registry entries without `is_dir` default to `false` | unit | `bun test tests/lib/config.test.ts` | ✅ existing file — add test cases |
| REG-02 | `scanForRepos(dir, { includeDirs: true })` returns plain dirs with `isDir: true` | unit | `bun test tests/lib/detect.test.ts` | ✅ existing file — add test cases |
| REG-02 | `scanForRepos(dir)` (no options) still ignores plain dirs (backward compat) | unit | `bun test tests/lib/detect.test.ts` | ✅ existing file — verify existing tests still pass |
| REG-01 | `repo add <plain-dir>` registers entry with `is_dir: true` | integration | manual smoke test (CLI command invocation with mocked prompts) | ❌ Wave 0 — no CLI integration test file exists |

### Sampling Rate
- **Per task commit:** `bun run test` (full suite — fast, ~10s)
- **Per wave merge:** `bun run test`
- **Phase gate:** Full suite green + `bun run typecheck` clean before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] REG-01 CLI integration test — `repo add` with a plain directory is not yet covered by automated tests. The schema unit tests in `config.test.ts` cover SCHM-01/SCHM-02 fully. REG-01 behavior is verified by: (a) schema test for `is_dir` flag, (b) typecheck confirms guard logic compiles, (c) manual smoke. A CLI-level test for `repo add` does not exist and is not required for Phase 64 (schema focus only).

*(All schema tests go into existing `tests/lib/config.test.ts` and `tests/lib/detect.test.ts` — no new test files needed)*

## Security Domain

This phase makes no network calls, handles no authentication, and does not introduce user input beyond filesystem paths already used in `repo add`. No ASVS categories apply beyond what is already present. `local_path` validation relies on the OS path resolution already used in the existing `repo add` command — no new attack surface.

## Sources

### Primary (HIGH confidence)
- Codebase read: `src/lib/config.ts` — current Zod schemas for all entities [VERIFIED]
- Codebase read: `src/lib/detect.ts` — `scanForRepos` and `DiscoveredRepo` interface [VERIFIED]
- Codebase read: `src/commands/repo.ts` — `repo add` guard logic and forge detection [VERIFIED]
- Codebase read: `src/tui/repo-wizard.ts` — `runRepoScan` wizard flow [VERIFIED]
- Codebase read: `src/tui/workspace-wizard.ts` — `buildReposFromTemplate` construction pattern [VERIFIED]
- Codebase read: `tests/lib/config.test.ts` — existing test patterns for schema coverage [VERIFIED]
- Codebase read: `tests/lib/detect.test.ts` — existing test patterns for scan coverage [VERIFIED]
- Codebase read: `tests/helpers.ts` — `makeConfigMock` and isolation patterns [VERIFIED]

### Secondary (MEDIUM confidence)
- None required — all findings verified directly from codebase.

### Tertiary (LOW confidence)
- None.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new dependencies; all patterns verified in codebase
- Architecture: HIGH — decision rationale based on verified schema structure
- Pitfalls: HIGH — derived from direct code analysis of existing patterns
- Test map: HIGH — existing test files confirmed; patterns verified

**Research date:** 2026-04-04
**Valid until:** 2026-05-04 (stable codebase, no fast-moving deps)
