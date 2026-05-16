import { cpSync, symlinkSync, lstatSync, mkdirSync, readdirSync, readFileSync, rmSync } from "fs"
import { join, dirname, basename, isAbsolute, normalize, resolve, relative, sep } from "path"
import { expandHome } from "./paths"
import type { WorkspaceRepo, Workspace, Files, FileSyncEntry } from "./config"
import { isGitTrackedPathSync, writeLocalGitExcludesSync } from "./git"

export type ApplyResult = { ok: true; warnings?: string[] } | { ok: false; error: string }
export const DEFAULT_VERBOSE_PATH_LIMIT = 50

export type FileEntryKind = "copy" | "symlink" | "sync"
export type SimpleFileEntryState = "materialized" | "missing" | "error"
export type SyncEntryState = "ok" | "pullable" | "pushable" | "diverged" | "error"
export type SyncComparisonCounts = {
  equal: number
  sourceOnly: number
  targetOnly: number
  differing: number
  errors: number
}
export type VerbosePathBucket = {
  paths: string[]
  omitted: number
}
export type SyncVerbosePaths = {
  sourceOnly: VerbosePathBucket
  targetOnly: VerbosePathBucket
  differing: VerbosePathBucket
  errors: VerbosePathBucket
}
export type FileEntryStatus =
  | {
      kind: "copy" | "symlink"
      scope: "workspace" | "repo"
      name: string
      target: string
      state: SimpleFileEntryState
      hint: string
      error?: string
    }
  | {
      kind: "sync"
      scope: "workspace" | "repo"
      name: string
      target: string
      state: SyncEntryState
      counts: SyncComparisonCounts
      hint: string
      verbosePaths?: SyncVerbosePaths
      error?: string
    }

export type FileEntryStatusOptions = {
  verbose?: boolean
  pathLimit?: number
}

export type FileOpsApplyOptions = {
  sync?: "apply" | "skip" | "missingOnly"
}

export type SyncOperationDirection = "pull" | "push"
export type SyncOperationOptions = {
  direction: SyncOperationDirection
  force?: boolean
  dryRun?: boolean
  verbose?: boolean
  pathLimit?: number
}
export type SyncOperationPlan = {
  writes: string[]
  overwrites: string[]
  deletes: string[]
  skipped: string[]
  refusals: Array<{ path: string; reason: string }>
}
export type SyncOperationResult = {
  ok: boolean
  dryRun: boolean
  force: boolean
  direction: SyncOperationDirection
  entries: Array<{
    scope: "workspace" | "repo"
    name: string
    target: string
    plan: SyncOperationPlan
    error?: string
  }>
}

/** Minimal interface for a file ops source at the per-repo level. */
export interface FileOpsRepoSource {
  name?: string
  path: string
  files?: Files
}

/** Minimal interface for a file ops source at the workspace-instance level. */
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
): { copy: string[]; symlink: string[]; sync: FileSyncEntry[] } {
  return {
    copy: [...(a?.copy ?? []), ...(b?.copy ?? [])],
    symlink: [...(a?.symlink ?? []), ...(b?.symlink ?? [])],
    sync: [...(a?.sync ?? []), ...(b?.sync ?? [])],
  }
}

function resolveSyncTargetPath(target: string, destDir: string): { ok: true; path: string; rel: string } | { ok: false; error: string } {
  if (target.length === 0) {
    return { ok: false, error: "Invalid sync target: target must not be empty" }
  }
  if (isAbsolute(target)) {
    return { ok: false, error: `Invalid sync target '${target}': absolute targets are not allowed` }
  }

  const normalizedTarget = normalize(target)
  const parts = normalizedTarget.split(/[\\/]+/)
  if (parts.includes("..")) {
    return { ok: false, error: `Invalid sync target '${target}': traversal is not allowed` }
  }

  const destRoot = resolve(destDir)
  const targetPath = resolve(destRoot, normalizedTarget)
  const relFromRoot = relative(destRoot, targetPath)
  if (relFromRoot === "" || relFromRoot.startsWith("..") || isAbsolute(relFromRoot)) {
    return { ok: false, error: `Invalid sync target '${target}': resolved path escapes destination root` }
  }

  return { ok: true, path: targetPath, rel: relFromRoot.split(sep).join("/") }
}

function applySyncEntry(
  entry: FileSyncEntry,
  sourceBaseDir: string,
  destDir: string,
  repoPath?: string,
  mode: "apply" | "missingOnly" = "apply"
): ApplyResult {
  const target = resolveSyncTargetPath(entry.target, destDir)
  if (!target.ok) return target

  const sourcePath = resolveSourcePath(entry.source, sourceBaseDir)
  if (!dstExists(sourcePath)) return { ok: false, error: `Source not found: ${sourcePath}` }
  if (repoPath && isGitTrackedPathSync(repoPath, target.rel)) {
    return { ok: false, error: `Refusing to overwrite tracked target: ${target.rel}` }
  }
  if (dstExists(target.path)) {
    return mode === "missingOnly"
      ? { ok: true }
      : { ok: false, error: `Sync target already exists: ${target.rel}` }
  }

  mkdirSync(dirname(target.path), { recursive: true })
  cpSync(sourcePath, target.path, { recursive: true })

  if (repoPath && entry.git_exclude === true) {
    const sourceStats = lstatSync(sourcePath)
    const patterns = sourceStats.isDirectory()
      ? [`/${target.rel}/`, `/${target.rel}/**`]
      : [`/${target.rel}`]
    try {
      writeLocalGitExcludesSync(repoPath, patterns)
    } catch (err) {
      return {
        ok: false,
        error: `git_exclude failed for ${target.rel}: ${err instanceof Error ? err.message : String(err)}`,
      }
    }
  }

  return { ok: true }
}

export function processSyncList(
  entries: FileSyncEntry[],
  sourceBaseDir: string,
  destDir: string,
  repoPath?: string,
  mode: "apply" | "missingOnly" = "apply"
): ApplyResult {
  for (const entry of entries) {
    const result = applySyncEntry(entry, sourceBaseDir, destDir, repoPath, mode)
    if (!result.ok) return result
  }
  return { ok: true }
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

type SyncPathSet = Map<string, string>

function makeBucket(paths: string[], limit: number): VerbosePathBucket {
  return {
    paths: paths.slice(0, limit),
    omitted: Math.max(0, paths.length - limit),
  }
}

function emptyCounts(): SyncComparisonCounts {
  return { equal: 0, sourceOnly: 0, targetOnly: 0, differing: 0, errors: 0 }
}

function isInsideRoot(root: string, candidate: string): boolean {
  const rel = relative(resolve(root), resolve(candidate))
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel))
}

function collectFiles(root: string): { ok: true; files: SyncPathSet } | { ok: false; error: string } {
  const files: SyncPathSet = new Map()
  try {
    if (!dstExists(root)) return { ok: true, files }
    const rootStat = lstatSync(root)
    if (rootStat.isSymbolicLink()) {
      return { ok: false, error: `Cannot compare symlink root: ${root}` }
    }
    if (!rootStat.isDirectory()) {
      files.set("", root)
      return { ok: true, files }
    }

    const walk = (dir: string, prefix: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const abs = join(dir, entry.name)
        const relPath = prefix ? `${prefix}/${entry.name}` : entry.name
        if (entry.isSymbolicLink()) {
          files.set(relPath, abs)
        } else if (entry.isDirectory()) {
          walk(abs, relPath)
        } else if (entry.isFile()) {
          files.set(relPath, abs)
        }
      }
    }

    walk(root, "")
    return { ok: true, files }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

function compareFileContents(a: string, b: string): boolean {
  const left = readFileSync(a)
  const right = readFileSync(b)
  return left.equals(right)
}

function compareSyncTrees(
  sourceRoot: string,
  targetRoot: string,
  options: FileEntryStatusOptions = {}
): { counts: SyncComparisonCounts; verbosePaths?: SyncVerbosePaths; error?: string } {
  const limit = options.pathLimit ?? DEFAULT_VERBOSE_PATH_LIMIT
  const counts = emptyCounts()
  const sourceOnly: string[] = []
  const targetOnly: string[] = []
  const differing: string[] = []
  const errors: string[] = []
  const source = collectFiles(sourceRoot)
  const target = collectFiles(targetRoot)

  if (!source.ok) {
    counts.errors += 1
    errors.push(source.error)
  }
  if (!target.ok) {
    counts.errors += 1
    errors.push(target.error)
  }
  if (!source.ok || !target.ok) {
    return {
      counts,
      verbosePaths: options.verbose ? {
        sourceOnly: makeBucket(sourceOnly, limit),
        targetOnly: makeBucket(targetOnly, limit),
        differing: makeBucket(differing, limit),
        errors: makeBucket(errors, limit),
      } : undefined,
      error: errors.join("; "),
    }
  }

  const allPaths = new Set([...source.files.keys(), ...target.files.keys()])
  for (const relPath of [...allPaths].sort()) {
    const src = source.files.get(relPath)
    const dst = target.files.get(relPath)
    if (src && !dst) {
      counts.sourceOnly += 1
      sourceOnly.push(relPath)
    } else if (!src && dst) {
      counts.targetOnly += 1
      targetOnly.push(relPath)
    } else if (src && dst) {
      try {
        if (compareFileContents(src, dst)) {
          counts.equal += 1
        } else {
          counts.differing += 1
          differing.push(relPath)
        }
      } catch (err) {
        counts.errors += 1
        errors.push(`${relPath}: ${err instanceof Error ? err.message : String(err)}`)
      }
    }
  }

  return {
    counts,
    verbosePaths: options.verbose ? {
      sourceOnly: makeBucket(sourceOnly, limit),
      targetOnly: makeBucket(targetOnly, limit),
      differing: makeBucket(differing, limit),
      errors: makeBucket(errors, limit),
    } : undefined,
  }
}

function syncState(counts: SyncComparisonCounts): SyncEntryState {
  if (counts.errors > 0) return "error"
  if (counts.sourceOnly === 0 && counts.targetOnly === 0 && counts.differing === 0) return "ok"
  if (counts.differing > 0) return "diverged"
  if (counts.sourceOnly > 0 && counts.targetOnly === 0) return "pullable"
  if (counts.targetOnly > 0 && counts.sourceOnly === 0) return "pushable"
  return "diverged"
}

function statusHint(state: SyncEntryState): string {
  if (state === "ok") return "-"
  if (state === "pullable") return "files pull"
  if (state === "pushable") return "files push"
  if (state === "diverged") return "review"
  return "error"
}

function copySymlinkRows(
  kind: "copy" | "symlink",
  entries: string[],
  destDir: string,
  scope: "workspace" | "repo",
  name: string
): FileEntryStatus[] {
  const rows: FileEntryStatus[] = []
  for (const entry of entries) {
    const expanded = expandHome(entry)
    const dstRel = isAbsolute(expanded) ? basename(expanded) : entry
    rows.push({
      kind,
      scope,
      name,
      target: dstRel,
      state: dstExists(join(destDir, dstRel)) ? "materialized" : "missing",
      hint: dstExists(join(destDir, dstRel)) ? "-" : "missing",
    })
  }
  return rows
}

function syncRows(
  entries: FileSyncEntry[],
  sourceBaseDir: string,
  destDir: string,
  scope: "workspace" | "repo",
  name: string,
  options: FileEntryStatusOptions
): FileEntryStatus[] {
  return entries.map((entry) => {
    const target = resolveSyncTargetPath(entry.target, destDir)
    if (!target.ok) {
      return {
        kind: "sync",
        scope,
        name,
        target: entry.target,
        state: "error",
        counts: { ...emptyCounts(), errors: 1 },
        hint: "error",
        error: target.error,
      }
    }
    const sourceRoot = resolveSourcePath(entry.source, sourceBaseDir)
    const comparison = compareSyncTrees(sourceRoot, target.path, options)
    const state = syncState(comparison.counts)
    return {
      kind: "sync",
      scope,
      name,
      target: target.rel,
      state,
      counts: comparison.counts,
      hint: statusHint(state),
      verbosePaths: comparison.verbosePaths,
      error: comparison.error,
    }
  })
}

export function getFileEntryStatuses(
  workspace: Workspace,
  wsInstanceRoot: string,
  options: FileEntryStatusOptions = {}
): FileEntryStatus[] {
  const rows: FileEntryStatus[] = []
  const workspaceFiles = mergeFiles(undefined, workspace.files)
  rows.push(...copySymlinkRows("copy", workspaceFiles.copy, wsInstanceRoot, "workspace", workspace.name))
  rows.push(...copySymlinkRows("symlink", workspaceFiles.symlink, wsInstanceRoot, "workspace", workspace.name))
  rows.push(...syncRows(workspaceFiles.sync, wsInstanceRoot, wsInstanceRoot, "workspace", workspace.name, options))

  for (const repo of workspace.repos) {
    const repoFiles = mergeFiles(undefined, repo.files)
    const sourceBase = repo.main_path
    const destDir = repo.task_path ?? repo.main_path
    rows.push(...copySymlinkRows("copy", repoFiles.copy, destDir, "repo", repo.name))
    rows.push(...copySymlinkRows("symlink", repoFiles.symlink, destDir, "repo", repo.name))
    rows.push(...syncRows(repoFiles.sync, sourceBase, destDir, "repo", repo.name, options))
  }

  return rows
}

function makePlan(comparison: ReturnType<typeof compareSyncTrees>, options: SyncOperationOptions): SyncOperationPlan {
  const writes = comparison.verbosePaths?.sourceOnly.paths ?? []
  const overwrites = comparison.verbosePaths?.differing.paths ?? []
  const deletes = comparison.verbosePaths?.targetOnly.paths ?? []
  const plan: SyncOperationPlan = { writes: [], overwrites: [], deletes: [], skipped: [], refusals: [] }
  if (comparison.error) {
    plan.refusals.push({ path: "-", reason: comparison.error })
    return plan
  }
  if (options.force) {
    plan.writes.push(...writes)
    plan.overwrites.push(...overwrites)
    plan.deletes.push(...deletes)
    return plan
  }
  plan.writes.push(...writes)
  for (const path of overwrites) plan.refusals.push({ path, reason: "differing" })
  for (const path of deletes) {
    plan.refusals.push({ path, reason: options.direction === "pull" ? "target-only" : "source-only" })
  }
  return plan
}

function applySyncPlan(originRoot: string, destinationRoot: string, plan: SyncOperationPlan, dryRun: boolean): void {
  if (dryRun) return
  for (const relPath of [...plan.writes, ...plan.overwrites]) {
    const src = join(originRoot, relPath)
    const dst = join(destinationRoot, relPath)
    if (!isInsideRoot(originRoot, src) || !isInsideRoot(destinationRoot, dst)) {
      throw new Error(`Refusing path outside sync roots: ${relPath}`)
    }
    mkdirSync(dirname(dst), { recursive: true })
    cpSync(src, dst, { recursive: true, force: true })
  }
  for (const relPath of plan.deletes) {
    const dst = join(destinationRoot, relPath)
    if (!isInsideRoot(destinationRoot, dst)) {
      throw new Error(`Refusing delete outside sync root: ${relPath}`)
    }
    rmSync(dst, { recursive: true, force: true })
  }
}

function operateSyncEntries(
  entries: FileSyncEntry[],
  sourceBaseDir: string,
  destDir: string,
  scope: "workspace" | "repo",
  name: string,
  options: SyncOperationOptions
): SyncOperationResult["entries"] {
  return entries.map((entry) => {
    const target = resolveSyncTargetPath(entry.target, destDir)
    const emptyPlan: SyncOperationPlan = { writes: [], overwrites: [], deletes: [], skipped: [], refusals: [] }
    if (!target.ok) {
      return { scope, name, target: entry.target, plan: emptyPlan, error: target.error }
    }
    const sourceRoot = resolveSourcePath(entry.source, sourceBaseDir)
    const originRoot = options.direction === "pull" ? sourceRoot : target.path
    const destinationRoot = options.direction === "pull" ? target.path : sourceRoot
    if (!isInsideRoot(sourceBaseDir, sourceRoot) && !isAbsolute(expandHome(entry.source))) {
      return { scope, name, target: target.rel, plan: emptyPlan, error: `Sync source escapes root: ${entry.source}` }
    }
    const comparison = compareSyncTrees(originRoot, destinationRoot, {
      verbose: true,
      pathLimit: options.pathLimit ?? Number.MAX_SAFE_INTEGER,
    })
    const plan = makePlan(comparison, options)
    try {
      if (plan.refusals.length === 0) applySyncPlan(originRoot, destinationRoot, plan, options.dryRun === true)
      return { scope, name, target: target.rel, plan }
    } catch (err) {
      return {
        scope,
        name,
        target: target.rel,
        plan,
        error: err instanceof Error ? err.message : String(err),
      }
    }
  })
}

export function applySyncOperation(
  workspace: Workspace,
  wsInstanceRoot: string,
  options: SyncOperationOptions
): SyncOperationResult {
  const entries: SyncOperationResult["entries"] = []
  const workspaceFiles = mergeFiles(undefined, workspace.files)
  entries.push(...operateSyncEntries(workspaceFiles.sync, wsInstanceRoot, wsInstanceRoot, "workspace", workspace.name, options))

  for (const repo of workspace.repos) {
    const repoFiles = mergeFiles(undefined, repo.files)
    entries.push(...operateSyncEntries(
      repoFiles.sync,
      repo.main_path,
      repo.task_path ?? repo.main_path,
      "repo",
      repo.name,
      options
    ))
  }

  const ok = entries.every((entry) => !entry.error && entry.plan.refusals.length === 0)
  return {
    ok,
    dryRun: options.dryRun === true,
    force: options.force === true,
    direction: options.direction,
    entries,
  }
}

/**
 * Apply file operations at the per-repo level.
 * Merges source files config with workspace repo files config (additive).
 * Source base: wsRepo.main_path (where large files live in the main clone)
 * Destination: wsRepo.task_path (the worktree)
 */
export function applyFileOpsForRepo(
  source: FileOpsRepoSource,
  wsRepo: WorkspaceRepo,
  options: FileOpsApplyOptions = {}
): ApplyResult {
  const merged = mergeFiles(source.files, wsRepo.files)
  const sourceBase = wsRepo.main_path
  const destDir = wsRepo.task_path ?? wsRepo.main_path

  const copyResult = processFileList("copy", merged.copy, sourceBase, destDir)
  if (!copyResult.ok) return copyResult

  const symlinkResult = processFileList("symlink", merged.symlink, sourceBase, destDir)
  if (!symlinkResult.ok) return symlinkResult

  const syncResult = options.sync === "skip"
    ? { ok: true as const }
    : processSyncList(merged.sync, sourceBase, destDir, destDir, options.sync ?? "apply")
  if (!syncResult.ok) return syncResult

  // Combine any warnings from both operations
  const warnings = [
    ...(copyResult.warnings ?? []),
    ...(symlinkResult.warnings ?? []),
    ...(syncResult.warnings ?? []),
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
  wsInstanceRoot: string,
  options: FileOpsApplyOptions = {}
): ApplyResult {
  const merged = mergeFiles(source.files, workspace.files)
  const sourceBase = wsInstanceRoot
  const destDir = wsInstanceRoot

  const copyResult = processFileList("copy", merged.copy, sourceBase, destDir)
  if (!copyResult.ok) return copyResult

  const symlinkResult = processFileList("symlink", merged.symlink, sourceBase, destDir)
  if (!symlinkResult.ok) return symlinkResult

  const syncResult = options.sync === "skip"
    ? { ok: true as const }
    : processSyncList(merged.sync, sourceBase, destDir, undefined, options.sync ?? "apply")
  if (!syncResult.ok) return syncResult

  // Combine any warnings from both operations
  const warnings = [
    ...(copyResult.warnings ?? []),
    ...(symlinkResult.warnings ?? []),
    ...(syncResult.warnings ?? []),
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
