# Phase 89: Files Sync Schema and Materialization - Pattern Map

## PATTERN MAPPING COMPLETE

## Source Files and Roles

| File | Role | Existing Pattern To Reuse |
|------|------|---------------------------|
| `src/lib/config.ts` | Schema source of truth for template/workspace YAML | Zod schemas with inferred exported types; `FilesSchema` reused by templates, workspace, and per-repo entries |
| `src/lib/composition.ts` | Template include merge behavior | `mergeFiles()` concatenates operation arrays in include order and omits absent keys |
| `src/lib/files.ts` | File operation engine | `dstExists()`, `resolveSourcePath()`, `expandGlob()`, `ApplyResult`, `applyFileOpsForRepo()`, `applyFileOpsForWorkspace()` |
| `src/lib/git.ts` | Git subprocess helpers | Bun `$` with `.quiet().nothrow()` and typed result unions |
| `src/lib/workspace-lifecycle.ts` | Create-time file-op orchestration | Tracked `OperationRunner` steps throw on file-op failures and rollback around worktree creation |
| `src/lib/workspace-ops.ts` | Open-time file-op orchestration | Best-effort progress warnings during `openWorkspace()` |
| `tests/lib/config.test.ts` | Schema regression tests | Parse valid YAML shapes and reject invalid ones through schema parse errors |
| `tests/lib/composition.test.ts` | Template merge tests | Isolated config fixtures with `writeTestTemplate()` and `composeTemplates()` |
| `tests/lib/files.test.ts` | File-op unit tests | Temp directories, `write()`, `mkdir()`, `makeFileTree()`, and direct helper calls |
| `tests/lib/lifecycle-files-env-config-real-fixture.test.ts` | Real fixture integration | Real filesystem and local Git behaviors in one focused integration file |

## Data Flow

1. YAML config is parsed by `TemplateSchema`, `WorkspaceSchema`, or `WorkspaceRepoSchema`.
2. Template includes are composed by `composeTemplates()`, which returns merged `files`.
3. Workspace creation/open passes workspace-level and repo-level file configs to `applyFileOpsForWorkspace()` and `applyFileOpsForRepo()`.
4. `src/lib/files.ts` resolves sources, validates destinations, materializes entries, and returns `ApplyResult`.
5. Repo-level sync entries with `git_exclude: true` call git helpers to resolve common git dir, detect tracked target collisions, and update local exclude.

## Code Excerpts To Preserve

### Config Schema Shape

`FilesSchema` is optional and shared:

```ts
export const FilesSchema = z
  .object({
    copy: z.array(z.string()).optional(),
    symlink: z.array(z.string()).optional(),
  })
  .optional()
export type Files = z.infer<typeof FilesSchema>
```

The plan should extend this in place so every existing `files: FilesSchema` reference sees sync.

### File Operation Result Contract

`src/lib/files.ts` uses a discriminated result:

```ts
export type ApplyResult = { ok: true; warnings?: string[] } | { ok: false; error: string }
```

Sync materialization should preserve this contract rather than throwing for expected failures.

### Existing Destination Existence Semantics

`dstExists()` uses `lstatSync()`, which is exactly the Phase 89 target-exists definition:

```ts
export function dstExists(dst: string): boolean {
  try {
    lstatSync(dst)
    return true
  } catch {
    return false
  }
}
```

### Composition Merge Pattern

`mergeFiles()` in `src/lib/composition.ts` collects arrays and returns only populated keys. Add a `sync` array to the same pattern.

## Landmines

- Do not change `applyEntry()` skip behavior for copy/symlink; sync needs a separate strict path.
- Do not flatten sync targets the way absolute copy/symlink entries flatten to basename. Sync has an explicit `target`.
- Do not write excludes for workspace-level sync entries.
- Do not write `.gitignore`.
- Do not treat linked worktree `.git` as the exclude target. Use `git rev-parse --git-common-dir`.
- Do not implement `git-stacks files status|pull|push` in Phase 89.

