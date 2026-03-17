import { mkdirSync, writeFileSync, rmSync } from "fs"
import { join, dirname } from "path"
import { execSync } from "child_process"

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
