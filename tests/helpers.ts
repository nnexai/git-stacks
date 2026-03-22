import { mkdirSync, writeFileSync, rmSync } from "fs"
import { join, dirname } from "path"
import { execSync } from "child_process"
import { mock } from "bun:test"

export function makeTmpDir(prefix = "ws-test"): string {
  const dir = join("/tmp", `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  mkdirSync(dir, { recursive: true })
  return dir
}

export function cleanup(dir: string) {
  rmSync(dir, { recursive: true, force: true })
}

export function mkdir(base: string, ...parts: string[]) {
  mkdirSync(join(base, ...parts), { recursive: true })
}

export function touch(base: string, ...parts: string[]) {
  const p = join(base, ...parts)
  mkdirSync(join(p, ".."), { recursive: true })
  writeFileSync(p, "")
}

export function write(base: string, rel: string, content: string) {
  const p = join(base, rel)
  mkdirSync(join(p, ".."), { recursive: true })
  writeFileSync(p, content)
}

/**
 * Create a directory tree from a flat map of relative paths to contents.
 * Paths ending with "/" create directories. Others create files with the given content.
 * Example: makeFileTree(base, { "a/b.txt": "hello", "c/": "" })
 */
export function makeFileTree(base: string, entries: Record<string, string>) {
  for (const [rel, content] of Object.entries(entries)) {
    if (rel.endsWith("/")) {
      mkdirSync(join(base, rel), { recursive: true })
    } else {
      const full = join(base, rel)
      mkdirSync(dirname(full), { recursive: true })
      writeFileSync(full, content)
    }
  }
}

export function makeGitRepo(base: string, name = "repo"): string {
  const repoPath = join(base, name)
  mkdirSync(repoPath, { recursive: true })
  const opts = { cwd: repoPath, stdio: "pipe" as const }
  execSync("git init -b main", opts)
  execSync('git config user.email "test@example.com"', opts)
  execSync('git config user.name "Test User"', opts)
  writeFileSync(join(repoPath, "README.md"), "init\n")
  execSync("git add .", opts)
  execSync('git commit -m "init"', opts)
  return repoPath
}

/**
 * Create an isolated config directory and mock @/lib/paths to use it.
 * Call this at the top level of test files (before describe blocks) or in beforeEach.
 * Returns { configDir, cleanup } — caller must call cleanup() in afterEach/afterAll.
 *
 * IMPORTANT: Because paths.ts constants are evaluated at import time, any module
 * that imports from @/lib/paths or @/lib/config must be dynamically imported with
 * a cache-busting query string AFTER calling this function.
 */
export function useIsolatedConfig(prefix = "isolated-config"): { configDir: string; cleanup: () => void } {
  const configDir = makeTmpDir(prefix)
  mkdirSync(join(configDir, "workspaces"), { recursive: true })
  mkdirSync(join(configDir, "templates"), { recursive: true })
  mkdirSync(join(configDir, "messages"), { recursive: true })

  mock.module("@/lib/paths", () => ({
    HOME: configDir,
    DEFAULT_WORKSPACE_ROOT: join(configDir, "ws-root"),
    WS_CONFIG_DIR: configDir,
    WORKSPACES_DIR: join(configDir, "workspaces"),
    GLOBAL_CONFIG_FILE: join(configDir, "config.yml"),
    REGISTRY_FILE: join(configDir, "registry.yml"),
    TEMPLATES_DIR: join(configDir, "templates"),
    MESSAGES_DIR: join(configDir, "messages"),
    getMainDir: (wsRoot: string) => join(wsRoot, "main"),
    getTasksDir: (wsRoot: string) => join(wsRoot, "tasks"),
    expandHome: (p: string) => p.startsWith("~/") ? join(configDir, p.slice(2)) : p,
  }))

  return {
    configDir,
    cleanup: () => cleanup(configDir),
  }
}
