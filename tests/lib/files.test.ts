import { describe, test, expect, beforeEach, afterEach } from "bun:test"
import { existsSync, readFileSync, lstatSync, symlinkSync } from "fs"
import { join } from "path"
import { homedir } from "os"
import { makeTmpDir, cleanup, makeFileTree, write, mkdir } from "../helpers"
import {
  applyEntry,
  expandGlob,
  isGlobPattern,
  resolveSourcePath,
  mergeFiles,
  processFileList,
  applyFileOpsForRepo,
  applyFileOpsForWorkspace,
  warnExternalFiles,
  type FileOpsRepoSource,
  type FileOpsWorkspaceSource,
} from "../../src/lib/files"
import type { WorkspaceRepo, Workspace } from "../../src/lib/config"

// --- applyEntry ---

describe("applyEntry", () => {
  let tmp: string

  beforeEach(() => { tmp = makeTmpDir("files-applyEntry") })
  afterEach(() => cleanup(tmp))

  // FILES-01: copies a file
  test("FILES-01: copies a file from src to dst", () => {
    write(tmp, "src/data.txt", "hello world")
    const src = join(tmp, "src/data.txt")
    const dst = join(tmp, "dst/data.txt")
    const result = applyEntry("copy", src, dst)
    expect(result.ok).toBe(true)
    expect(existsSync(dst)).toBe(true)
    expect(readFileSync(dst, "utf-8")).toBe("hello world")
  })

  // FILES-02: copies a folder tree recursively
  test("FILES-02: copies a folder tree recursively", () => {
    makeFileTree(tmp, {
      "src/models/a.bin": "data-a",
      "src/models/sub/b.bin": "data-b",
    })
    const src = join(tmp, "src/models")
    const dst = join(tmp, "dst/models")
    const result = applyEntry("copy", src, dst)
    expect(result.ok).toBe(true)
    expect(existsSync(join(dst, "a.bin"))).toBe(true)
    expect(existsSync(join(dst, "sub/b.bin"))).toBe(true)
    expect(readFileSync(join(dst, "a.bin"), "utf-8")).toBe("data-a")
  })

  // FILES-03: creates a file symlink
  test("FILES-03: creates a file symlink", () => {
    write(tmp, "src/file.txt", "content")
    const src = join(tmp, "src/file.txt")
    const dst = join(tmp, "dst/file.txt")
    const result = applyEntry("symlink", src, dst)
    expect(result.ok).toBe(true)
    expect(existsSync(dst)).toBe(true)
    expect(lstatSync(dst).isSymbolicLink()).toBe(true)
  })

  // FILES-04: creates a directory symlink
  test("FILES-04: creates a directory symlink", () => {
    makeFileTree(tmp, { "src/mydir/file.txt": "hi" })
    const src = join(tmp, "src/mydir")
    const dst = join(tmp, "dst/mydir")
    const result = applyEntry("symlink", src, dst)
    expect(result.ok).toBe(true)
    expect(lstatSync(dst).isSymbolicLink()).toBe(true)
  })

  // FILES-08: skips when destination exists (does not check source)
  test("FILES-08: skips when destination exists — source not checked", () => {
    // Create dst file but do NOT create src
    write(tmp, "dst/existing.txt", "already here")
    const src = join(tmp, "src/nonexistent.txt")  // does NOT exist
    const dst = join(tmp, "dst/existing.txt")
    const result = applyEntry("copy", src, dst)
    // Must return ok:true without checking source
    expect(result.ok).toBe(true)
    // Dst should still have original content
    expect(readFileSync(dst, "utf-8")).toBe("already here")
  })

  // FILES-09: returns error when dst missing and src missing
  test("FILES-09: returns error when dst missing and src missing", () => {
    const src = join(tmp, "nonexistent/src.txt")
    const dst = join(tmp, "nonexistent/dst.txt")
    const result = applyEntry("copy", src, dst)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toMatch(/Source not found:/)
      expect(result.error).toContain(src)
    }
  })

  // FILES-10: applies when dst missing and src present
  test("FILES-10: applies when dst missing and src present", () => {
    write(tmp, "src/file.txt", "data")
    const src = join(tmp, "src/file.txt")
    const dst = join(tmp, "dst/file.txt")
    const result = applyEntry("copy", src, dst)
    expect(result.ok).toBe(true)
    expect(existsSync(dst)).toBe(true)
  })
})

// --- expandGlob ---

describe("expandGlob", () => {
  let tmp: string

  beforeEach(() => { tmp = makeTmpDir("files-expandGlob") })
  afterEach(() => cleanup(tmp))

  // FILES-05: .env.* matches dotfiles with dot:true
  test("FILES-05: .env.* matches dotfiles (dot:true required)", () => {
    makeFileTree(tmp, {
      ".env.local": "local",
      ".env.prod": "prod",
      "regular.txt": "ignore",
    })
    const matches = expandGlob(".env.*", tmp)
    expect(matches).toContain(".env.local")
    expect(matches).toContain(".env.prod")
    expect(matches).not.toContain("regular.txt")
  })

  // FILES-06: secrets/** matches all files under dir
  test("FILES-06: secrets/** matches all files under directory", () => {
    makeFileTree(tmp, {
      "secrets/key.pem": "key",
      "secrets/cert.pem": "cert",
      "secrets/sub/token.txt": "token",
    })
    const matches = expandGlob("secrets/**", tmp)
    // Should contain the files (may also include directory entries depending on Bun.Glob)
    const matchPaths = matches.map(m => m.replace(/\\/g, "/"))
    expect(matchPaths.some(m => m.includes("key.pem"))).toBe(true)
    expect(matchPaths.some(m => m.includes("cert.pem"))).toBe(true)
    expect(matchPaths.some(m => m.includes("token.txt"))).toBe(true)
  })

  test("isGlobPattern returns false for literal paths", () => {
    expect(isGlobPattern("regular.txt")).toBe(false)
    expect(isGlobPattern("subdir/file.txt")).toBe(false)
  })

  test("isGlobPattern returns true for glob patterns", () => {
    expect(isGlobPattern("*.txt")).toBe(true)
    expect(isGlobPattern(".env.*")).toBe(true)
    expect(isGlobPattern("secrets/**")).toBe(true)
    expect(isGlobPattern("{a,b}")).toBe(true)
    expect(isGlobPattern("[abc]")).toBe(true)
  })

  test("expandGlob with non-glob returns literal string", () => {
    const result = expandGlob("literal.txt", tmp)
    expect(result).toEqual(["literal.txt"])
  })
})

// --- processFileList ---

describe("processFileList", () => {
  let tmp: string

  beforeEach(() => { tmp = makeTmpDir("files-processFileList") })
  afterEach(() => cleanup(tmp))

  // FILES-07: zero-match glob produces warning, ok:true
  test("FILES-07: zero-match glob pattern produces warning but returns ok:true", () => {
    const src = join(tmp, "source")
    const dst = join(tmp, "dest")
    mkdir(tmp, "source")
    mkdir(tmp, "dest")
    const result = processFileList("copy", ["*.nomatch"], src, dst)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.warnings).toBeDefined()
      expect(result.warnings!.length).toBeGreaterThan(0)
      expect(result.warnings![0]).toContain("*.nomatch")
    }
  })
})

// --- resolveSourcePath ---

describe("resolveSourcePath", () => {
  // FILES-11: ~/relative path expands
  test("FILES-11: ~/relative path expands to absolute using HOME", () => {
    const HOME = homedir()
    const result = resolveSourcePath("~/test/file.txt", "/base")
    expect(result).toBe(join(HOME, "test/file.txt"))
  })

  // FILES-12: absolute path used as-is
  test("FILES-12: absolute path is returned as-is", () => {
    const result = resolveSourcePath("/abs/path/file.txt", "/base")
    expect(result).toBe("/abs/path/file.txt")
  })

  test("relative path joins with baseDir", () => {
    const result = resolveSourcePath("sub/file.txt", "/base/dir")
    expect(result).toBe("/base/dir/sub/file.txt")
  })
})

// --- mergeFiles ---

describe("mergeFiles", () => {
  // FILES-15: additive merge
  test("FILES-15: mergeFiles concatenates copy and symlink arrays additively", () => {
    const result = mergeFiles(
      { copy: ["a.txt"], symlink: ["node_modules"], sync: [{ source: "src-a", target: "dst-a" }] },
      { copy: ["b.txt"], symlink: ["dist"], sync: [{ source: "src-b", target: "dst-b", git_exclude: true }] }
    )
    expect(result.copy).toEqual(["a.txt", "b.txt"])
    expect(result.symlink).toEqual(["node_modules", "dist"])
    expect(result.sync).toEqual([
      { source: "src-a", target: "dst-a" },
      { source: "src-b", target: "dst-b", git_exclude: true },
    ])
  })

  test("undefined inputs produce empty arrays", () => {
    const result = mergeFiles(undefined, undefined)
    expect(result.copy).toEqual([])
    expect(result.symlink).toEqual([])
    expect(result.sync).toEqual([])
  })

  test("one undefined input merges with defined input", () => {
    const result = mergeFiles({ copy: ["a.txt"] }, undefined)
    expect(result.copy).toEqual(["a.txt"])
    expect(result.symlink).toEqual([])
    expect(result.sync).toEqual([])
  })
})

// --- applyFileOpsForWorkspace ---

describe("applyFileOpsForWorkspace", () => {
  let tmp: string

  beforeEach(() => { tmp = makeTmpDir("files-wsLevel") })
  afterEach(() => cleanup(tmp))

  // FILES-13: applies to wsInstanceRoot, not repo task_path
  test("FILES-13: workspace-level files applied to wsInstanceRoot", () => {
    const wsRoot = join(tmp, "workspace-root")
    mkdir(tmp, "workspace-root")
    // Create source file at wsRoot
    write(wsRoot, "shared.bin", "big binary data")

    const source: FileOpsWorkspaceSource = {
      files: { copy: ["shared.bin"] },
    }
    const workspace: Partial<Workspace> = {
      files: undefined,
    }

    // Apply workspace-level file ops
    const result = applyFileOpsForWorkspace(
      source,
      workspace as Workspace,
      wsRoot
    )

    // Result should be ok:true (file already exists at dst = wsRoot/shared.bin, skips on copy to same location)
    expect(result.ok).toBe(true)
  })

  test("FILES-13: workspace-level copy applies to wsInstanceRoot, not any repo path", () => {
    const wsRoot = join(tmp, "workspace-root")
    const srcDir = join(tmp, "source-data")
    mkdir(tmp, "workspace-root")
    mkdir(tmp, "source-data")
    write(srcDir, "config.env", "ENV=prod")

    // Source files with absolute path (resolves against wsInstanceRoot as basename)
    const source: FileOpsWorkspaceSource = {
      files: { copy: [join(srcDir, "config.env")] },
    }
    const workspace: Partial<Workspace> = {}

    const result = applyFileOpsForWorkspace(
      source,
      workspace as Workspace,
      wsRoot
    )
    expect(result.ok).toBe(true)
    // File should appear at wsRoot/config.env (basename of absolute path)
    expect(existsSync(join(wsRoot, "config.env"))).toBe(true)
  })

  test("files.sync materializes files and directories as real filesystem entries", () => {
    const wsRoot = join(tmp, "workspace-root")
    mkdir(tmp, "workspace-root")
    write(wsRoot, "source/file.txt", "sync file\n")
    write(wsRoot, "source/dir/nested.txt", "sync nested\n")

    const result = applyFileOpsForWorkspace(
      { files: { sync: [
        { source: "source/file.txt", target: "target/file.txt" },
        { source: "source/dir", target: "target/dir" },
      ] } },
      { repos: [] } as Partial<Workspace> as Workspace,
      wsRoot
    )

    expect(result.ok).toBe(true)
    expect(readFileSync(join(wsRoot, "target/file.txt"), "utf-8")).toBe("sync file\n")
    expect(readFileSync(join(wsRoot, "target/dir/nested.txt"), "utf-8")).toBe("sync nested\n")
    expect(lstatSync(join(wsRoot, "target/file.txt")).isSymbolicLink()).toBe(false)
    expect(lstatSync(join(wsRoot, "target/dir")).isSymbolicLink()).toBe(false)
  })

  test("files.sync supports absolute source paths and explicit relative targets", () => {
    const wsRoot = join(tmp, "workspace-root")
    const sourceRoot = join(tmp, "outside-source")
    mkdir(tmp, "workspace-root")
    write(sourceRoot, "file.txt", "absolute source\n")

    const result = applyFileOpsForWorkspace(
      { files: { sync: [{ source: join(sourceRoot, "file.txt"), target: "synced/file.txt" }] } },
      { repos: [] } as Partial<Workspace> as Workspace,
      wsRoot
    )

    expect(result.ok).toBe(true)
    expect(readFileSync(join(wsRoot, "synced/file.txt"), "utf-8")).toBe("absolute source\n")
  })

  test("files.sync rejects missing sources and unsafe or existing targets", () => {
    const wsRoot = join(tmp, "workspace-root")
    mkdir(tmp, "workspace-root")
    write(wsRoot, "source/file.txt", "data\n")
    write(wsRoot, "existing-file.txt", "existing\n")
    mkdir(wsRoot, "existing-dir")
    symlinkSync(join(wsRoot, "source/file.txt"), join(wsRoot, "existing-link"))
    symlinkSync(join(wsRoot, "missing-target"), join(wsRoot, "dangling-link"))

    const workspace = { repos: [] } as Partial<Workspace> as Workspace
    const fail = (source: string, target: string) => applyFileOpsForWorkspace(
      { files: { sync: [{ source, target }] } },
      workspace,
      wsRoot
    )

    expect(fail("missing.txt", "target/missing.txt")).toMatchObject({ ok: false })
    expect(fail("source/file.txt", "")).toMatchObject({ ok: false })
    expect(fail("source/file.txt", "/absolute.txt")).toMatchObject({ ok: false })
    expect(fail("source/file.txt", "../escape.txt")).toMatchObject({ ok: false })
    expect(fail("source/file.txt", "safe/../../escape.txt")).toMatchObject({ ok: false })
    expect(fail("source/file.txt", "existing-file.txt")).toMatchObject({ ok: false })
    expect(fail("source/file.txt", "existing-dir")).toMatchObject({ ok: false })
    expect(fail("source/file.txt", "existing-link")).toMatchObject({ ok: false })
    expect(fail("source/file.txt", "dangling-link")).toMatchObject({ ok: false })
  })
})

// --- applyFileOpsForRepo ---

describe("applyFileOpsForRepo", () => {
  let tmp: string

  beforeEach(() => { tmp = makeTmpDir("files-repoLevel") })
  afterEach(() => cleanup(tmp))

  // FILES-14: per-repo level resolves relative source against main_path, applies to task_path
  test("FILES-14: per-repo copy resolves relative src against main_path, applies to task_path", () => {
    const mainPath = join(tmp, "main-repo")
    const taskPath = join(tmp, "task-repo")
    mkdir(tmp, "main-repo")
    mkdir(tmp, "task-repo")
    // Create data.bin in the main clone (source)
    write(mainPath, "data.bin", "binary content")

    const source: FileOpsRepoSource = {
      files: { copy: ["data.bin"] },
      path: mainPath,
    }
    const wsRepo: Partial<WorkspaceRepo> = {
      main_path: mainPath,
      task_path: taskPath,
      files: undefined,
    }

    const result = applyFileOpsForRepo(source, wsRepo as WorkspaceRepo)
    expect(result.ok).toBe(true)
    // data.bin should appear at task_path
    expect(existsSync(join(taskPath, "data.bin"))).toBe(true)
    expect(readFileSync(join(taskPath, "data.bin"), "utf-8")).toBe("binary content")
  })

  test("FILES-14: workspace repo files merged with source repo files additively", () => {
    const mainPath = join(tmp, "main-repo")
    const taskPath = join(tmp, "task-repo")
    mkdir(tmp, "main-repo")
    mkdir(tmp, "task-repo")
    write(mainPath, "source-file.txt", "from source")
    write(mainPath, "ws-file.txt", "from workspace")

    const source: FileOpsRepoSource = {
      files: { copy: ["source-file.txt"] },
      path: mainPath,
    }
    const wsRepo: Partial<WorkspaceRepo> = {
      main_path: mainPath,
      task_path: taskPath,
      files: { copy: ["ws-file.txt"] },
    }

    const result = applyFileOpsForRepo(source, wsRepo as WorkspaceRepo)
    expect(result.ok).toBe(true)
    expect(existsSync(join(taskPath, "source-file.txt"))).toBe(true)
    expect(existsSync(join(taskPath, "ws-file.txt"))).toBe(true)
  })
})

// --- warnExternalFiles ---

describe("warnExternalFiles", () => {
  let tmp: string

  beforeEach(() => { tmp = makeTmpDir("files-warnExternal") })
  afterEach(() => cleanup(tmp))

  function makeWorkspace(files?: { copy?: string[]; symlink?: string[] }, repos?: Array<{
    name: string; repo?: string; mode: "worktree" | "trunk"; main_path: string; task_path: string; files?: { copy?: string[]; symlink?: string[] }
  }>): Workspace {
    return {
      name: "test-ws",
      schema_version: "1",
      branch: "feature/test",
      created: new Date().toISOString(),
      repos: (repos ?? []).map(r => ({
        name: r.name,
        repo: r.repo ?? "test-repo",
        type: "other" as const,
        mode: r.mode,
        main_path: r.main_path,
        task_path: r.task_path,
        files: r.files,
      })),
      files,
    }
  }

  // Test 1 (FILES-16 basic): returns empty array when all destinations are inside wsInstanceRoot
  test("FILES-16 basic: returns empty array when all file ops resolve inside workspace root", () => {
    const wsDir = join(tmp, "tasks", "test-ws")
    const tasksDir = join(tmp, "tasks")

    const workspace = makeWorkspace({ copy: ["internal-file.txt"] })

    const warnings = warnExternalFiles(workspace, wsDir, tasksDir)
    expect(warnings).toEqual([])
  })

  // Test 2 (FILES-16 external absolute): returns warning for absolute destination outside workspace
  test("FILES-16 external absolute: returns warning for absolute dest outside wsInstanceRoot", () => {
    const wsDir = join(tmp, "tasks", "test-ws")
    const tasksDir = join(tmp, "tasks")

    // /tmp/outside/secrets is outside wsDir
    const workspace = makeWorkspace({ symlink: ["/tmp/outside/secrets"] })

    const warnings = warnExternalFiles(workspace, wsDir, tasksDir)
    expect(warnings.length).toBeGreaterThanOrEqual(1)
    expect(warnings[0]).toMatch(/Warning: external destination/)
    expect(warnings[0]).toContain("secrets")
  })

  // Test 3 (FILES-16 external home): returns warning for ~/ entry outside workspace root
  test("FILES-16 external home: returns warning for ~/.secrets entry outside workspace root", () => {
    const wsDir = join(tmp, "tasks", "test-ws")
    const tasksDir = join(tmp, "tasks")

    const workspace = makeWorkspace({ symlink: ["~/.secrets"] })

    const warnings = warnExternalFiles(workspace, wsDir, tasksDir)
    expect(warnings.length).toBeGreaterThanOrEqual(1)
    expect(warnings[0]).toMatch(/Warning: external destination/)
    expect(warnings[0]).toContain(".secrets")
  })

  // Test 4 (FILES-16 per-repo external): returns warning for per-repo file dest outside repo.task_path
  test("FILES-16 per-repo external: returns warning for per-repo file dest outside repo task_path", () => {
    const wsDir = join(tmp, "tasks", "test-ws")
    const tasksDir = join(tmp, "tasks")
    const repoMainPath = join(tmp, "main", "repo-0")
    const repoTaskPath = join(tasksDir, "test-ws", "repo-0")

    // The repo has a file that symlinks to an absolute external path
    const workspace = makeWorkspace(undefined, [{
      name: "repo-0",
      repo: "test-repo",
      mode: "worktree",
      main_path: repoMainPath,
      task_path: repoTaskPath,
      files: { symlink: ["/etc/hosts"] },
    }])

    const warnings = warnExternalFiles(workspace, wsDir, tasksDir)
    expect(warnings.length).toBeGreaterThanOrEqual(1)
    expect(warnings[0]).toMatch(/Warning: external destination/)
    expect(warnings[0]).toContain("hosts")
  })

  // Test 5 (FILES-16 target-level): returns folder-level path for directory destination
  test("FILES-16 target-level: returns the destination path (not files inside) for external dest", () => {
    const wsDir = join(tmp, "tasks", "test-ws")
    const tasksDir = join(tmp, "tasks")

    // Absolute external directory path
    const workspace = makeWorkspace({ copy: ["/usr/local/share/models"] })

    const warnings = warnExternalFiles(workspace, wsDir, tasksDir)
    expect(warnings.length).toBeGreaterThanOrEqual(1)
    // Should reference the directory-level destination, not files inside
    expect(warnings[0]).toMatch(/Warning: external destination/)
    expect(warnings[0]).toContain("models")
  })

  // Test 6 (FILES-16 no files): returns empty array when workspace has no files config
  test("FILES-16 no files: returns empty array when no files config present", () => {
    const wsDir = join(tmp, "tasks", "test-ws")
    const tasksDir = join(tmp, "tasks")

    const workspace = makeWorkspace(undefined)

    const warnings = warnExternalFiles(workspace, wsDir, tasksDir)
    expect(warnings).toEqual([])
  })
})

// --- idempotent re-application ---

describe("idempotent re-application", () => {
  let tmp: string

  beforeEach(() => { tmp = makeTmpDir("files-idempotent") })
  afterEach(() => cleanup(tmp))

  // IDEMPOTENT-01: copy twice is safe
  test("IDEMPOTENT-01: applyEntry copy called twice returns ok:true on second call", () => {
    write(tmp, "src/file.txt", "content")
    const src = join(tmp, "src/file.txt")
    const dst = join(tmp, "dst/file.txt")

    // First apply
    const r1 = applyEntry("copy", src, dst)
    expect(r1.ok).toBe(true)
    expect(existsSync(dst)).toBe(true)

    // Second apply — should skip silently (dst exists)
    const r2 = applyEntry("copy", src, dst)
    expect(r2.ok).toBe(true)
    // Content should be unchanged
    expect(readFileSync(dst, "utf-8")).toBe("content")
  })

  // IDEMPOTENT-02: symlink twice is safe
  test("IDEMPOTENT-02: applyEntry symlink called twice returns ok:true on second call", () => {
    write(tmp, "src/file.txt", "content")
    const src = join(tmp, "src/file.txt")
    const dst = join(tmp, "dst/file.txt")

    // First apply
    const r1 = applyEntry("symlink", src, dst)
    expect(r1.ok).toBe(true)
    expect(lstatSync(dst).isSymbolicLink()).toBe(true)

    // Second apply — should skip silently (dst symlink exists)
    const r2 = applyEntry("symlink", src, dst)
    expect(r2.ok).toBe(true)
    // Still a symlink
    expect(lstatSync(dst).isSymbolicLink()).toBe(true)
  })
})
