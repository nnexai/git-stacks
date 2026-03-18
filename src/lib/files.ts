import { cpSync, symlinkSync, lstatSync, mkdirSync } from "fs"
import { join, dirname, basename, isAbsolute } from "path"
import { expandHome } from "./paths"
import type { WorkspaceRepo, Workspace, Files } from "./config"

export type ApplyResult = { ok: true; warnings?: string[] } | { ok: false; error: string }

/**
 * Minimal interface for a file ops source at the per-repo level.
 * Replaces the old StackRepo type, keeping only the fields needed for file ops.
 */
export interface FileOpsRepoSource {
  name?: string
  path: string
  files?: Files
}

/**
 * Minimal interface for a file ops source at the workspace-instance level.
 * Replaces the old Stack type, keeping only the fields needed for file ops.
 */
export interface FileOpsWorkspaceSource {
  files?: Files
}

/**
 * Check if something exists at the given path (file, directory, or symlink — including dangling).
 * Uses lstatSync which does NOT follow symlinks, so dangling symlinks return true.
 */
export function dstExists(dst: string): boolean {
  try {
    lstatSync(dst)
    return true
  } catch {
    return false
  }
}

/**
 * Returns true if the string contains glob metacharacters.
 */
export function isGlobPattern(p: string): boolean {
  return /[*?{}[\]!]/.test(p)
}

/**
 * Expand a glob pattern against a cwd directory.
 * Returns relative paths from cwd. dot:true ensures dotfiles are included.
 * If pattern is not a glob, returns the literal string as-is in an array.
 */
export function expandGlob(pattern: string, cwd: string): string[] {
  if (!isGlobPattern(pattern)) return [pattern]
  const g = new Bun.Glob(pattern)
  return Array.from(g.scanSync({ cwd, dot: true, onlyFiles: false }))
}

/**
 * Resolve a source path entry to an absolute path.
 * Handles ~/relative paths via expandHome, absolute paths as-is,
 * and relative paths joined against baseDir.
 */
export function resolveSourcePath(entry: string, baseDir: string): string {
  const expanded = expandHome(entry)
  if (isAbsolute(expanded)) return expanded
  return join(baseDir, expanded)
}

/**
 * Apply a single file operation (copy or symlink) with three-case logic:
 * Case 1: destination exists → skip (no error, source not checked)
 * Case 2: destination missing + source missing → error
 * Case 3: destination missing + source exists → apply
 */
export function applyEntry(op: "copy" | "symlink", src: string, dst: string): ApplyResult {
  // Case 1: destination exists — skip silently (handles dangling symlinks correctly)
  if (dstExists(dst)) return { ok: true }
  // Case 2: destination missing, source missing — fail loud
  if (!dstExists(src)) return { ok: false, error: `Source not found: ${src}` }
  // Case 3: destination missing, source exists — apply
  mkdirSync(dirname(dst), { recursive: true })
  if (op === "copy") {
    cpSync(src, dst, { recursive: true })
  } else {
    symlinkSync(src, dst)
  }
  return { ok: true }
}

/**
 * Additively merge two Files configs. Returns a normalized object with empty arrays as defaults.
 * Stack files and workspace files are concatenated, not replaced.
 */
export function mergeFiles(
  a: Files | undefined,
  b: Files | undefined
): { copy: string[]; symlink: string[] } {
  return {
    copy: [...(a?.copy ?? []), ...(b?.copy ?? [])],
    symlink: [...(a?.symlink ?? []), ...(b?.symlink ?? [])],
  }
}

/**
 * Process a list of file entries (possibly containing globs), applying copy or symlink.
 * Glob patterns are expanded against sourceBaseDir. Literal paths are resolved via resolveSourcePath.
 * Returns ok:true (possibly with warnings for zero-match globs) or ok:false on first error.
 */
export function processFileList(
  op: "copy" | "symlink",
  entries: string[],
  sourceBaseDir: string,
  destDir: string
): ApplyResult {
  const warnings: string[] = []
  for (const entry of entries) {
    if (isGlobPattern(entry)) {
      const matches = expandGlob(entry, sourceBaseDir)
      if (matches.length === 0) {
        warnings.push(`Glob '${entry}' matched no files in ${sourceBaseDir}`)
        continue
      }
      for (const match of matches) {
        const src = join(sourceBaseDir, match)
        const dst = join(destDir, match)
        const r = applyEntry(op, src, dst)
        if (!r.ok) return r
      }
    } else {
      const src = resolveSourcePath(entry, sourceBaseDir)
      // For absolute/home-relative entries, flatten to basename in dest
      const expanded = expandHome(entry)
      const dstRel = isAbsolute(expanded) ? basename(expanded) : entry
      const dst = join(destDir, dstRel)
      const r = applyEntry(op, src, dst)
      if (!r.ok) return r
    }
  }
  return warnings.length > 0 ? { ok: true, warnings } : { ok: true }
}

/**
 * Apply file operations at the per-repo level.
 * Merges source files config with workspace repo files config (additive).
 * Source base: wsRepo.main_path (where large files live in the main clone)
 * Destination: wsRepo.task_path (the worktree)
 */
export function applyFileOpsForRepo(source: FileOpsRepoSource, wsRepo: WorkspaceRepo): ApplyResult {
  const merged = mergeFiles(source.files, wsRepo.files)
  const sourceBase = wsRepo.main_path
  const destDir = wsRepo.task_path

  const copyResult = processFileList("copy", merged.copy, sourceBase, destDir)
  if (!copyResult.ok) return copyResult

  const symlinkResult = processFileList("symlink", merged.symlink, sourceBase, destDir)
  if (!symlinkResult.ok) return symlinkResult

  // Combine any warnings from both operations
  const warnings = [
    ...(copyResult.warnings ?? []),
    ...(symlinkResult.warnings ?? []),
  ]
  return warnings.length > 0 ? { ok: true, warnings } : { ok: true }
}

/**
 * Apply file operations at the workspace-instance level.
 * Merges source files config with workspace files config (additive).
 * Source base: wsInstanceRoot (relative paths resolve against workspace instance root)
 * Destination: wsInstanceRoot
 */
export function applyFileOpsForWorkspace(
  source: FileOpsWorkspaceSource,
  workspace: Workspace,
  wsInstanceRoot: string
): ApplyResult {
  const merged = mergeFiles(source.files, workspace.files)
  const sourceBase = wsInstanceRoot
  const destDir = wsInstanceRoot

  const copyResult = processFileList("copy", merged.copy, sourceBase, destDir)
  if (!copyResult.ok) return copyResult

  const symlinkResult = processFileList("symlink", merged.symlink, sourceBase, destDir)
  if (!symlinkResult.ok) return symlinkResult

  // Combine any warnings from both operations
  const warnings = [
    ...(copyResult.warnings ?? []),
    ...(symlinkResult.warnings ?? []),
  ]
  return warnings.length > 0 ? { ok: true, warnings } : { ok: true }
}

/**
 * Identify file entries that reference paths outside the workspace's task directory boundary.
 * Warns when a files.copy or files.symlink entry is an absolute path (including ~/...)
 * that resolves to a location outside the workspace root (wsDir = join(tasksDir, workspace.name)).
 * Reasons purely from path math — never checks filesystem existence (Pitfall 4).
 *
 * Checks workspace-instance level file ops and per-repo file ops (for worktree-mode repos).
 * Returns warning strings for any destination that is NOT inside join(tasksDir, workspace.name).
 */
export function warnExternalFiles(
  workspace: Workspace,
  wsDir: string,
  _tasksDir: string,
): string[] {
  const warnings: string[] = []
  const boundaryDir = wsDir

  function isInternal(resolvedPath: string): boolean {
    return resolvedPath === boundaryDir || resolvedPath.startsWith(boundaryDir + "/")
  }

  function checkEntry(entry: string): void {
    if (isGlobPattern(entry)) {
      // Glob patterns always expand into destinations inside their destDir,
      // which is always within the workspace boundary
      return
    }
    const expanded = expandHome(entry)
    if (isAbsolute(expanded) && !isInternal(expanded)) {
      warnings.push(`Warning: external destination ${expanded} was not removed`)
    }
    // Relative paths always resolve inside destDir, so always internal
  }

  // Collect workspace-level files
  if (workspace.files?.copy) {
    for (const entry of workspace.files.copy) checkEntry(entry)
  }
  if (workspace.files?.symlink) {
    for (const entry of workspace.files.symlink) checkEntry(entry)
  }

  // Collect per-repo files (workspace repos carry their own files config)
  for (const repo of workspace.repos) {
    if (repo.files?.copy) {
      for (const entry of repo.files.copy) checkEntry(entry)
    }
    if (repo.files?.symlink) {
      for (const entry of repo.files.symlink) checkEntry(entry)
    }
  }

  return warnings
}

/**
 * @deprecated Use applyFileOpsForRepo instead.
 * Kept for backward compatibility with the existing call site in workspace-wizard.ts.
 * Applies file operations using only the source repo's files config (no workspace merge).
 * Source: source.path, Destination: taskPath
 */
export function applyFileOperations(source: FileOpsRepoSource, taskPath: string): void {
  if (!source.files) return
  processFileList("copy", source.files.copy ?? [], source.path, taskPath)
  processFileList("symlink", source.files.symlink ?? [], source.path, taskPath)
}
