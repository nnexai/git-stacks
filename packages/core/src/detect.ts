// Canonical implementation owned by @git-stacks/core.
import { existsSync, readdirSync } from "fs"
import { join } from "path"
import type { RepoType } from "./config"

export interface ScanOptions {
  includeDirs?: boolean
}

export interface DiscoveredRepo {
  name: string
  path: string
  detectedType: RepoType
  isDir: boolean
}

export function detectRepoType(repoPath: string): RepoType {
  if (
    existsSync(join(repoPath, "pom.xml")) ||
    existsSync(join(repoPath, "build.gradle")) ||
    existsSync(join(repoPath, "build.gradle.kts"))
  ) {
    return "java"
  }
  if (existsSync(join(repoPath, "package.json"))) {
    return "typescript"
  }
  return "other"
}

export function scanForRepos(dir: string, options: ScanOptions = {}): DiscoveredRepo[] {
  if (!existsSync(dir)) return []

  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => {
      if (!e.isDirectory()) return false
      const hasGit = existsSync(join(dir, e.name, ".git"))
      if (hasGit) return true
      return !!options.includeDirs
    })
    .map((e) => {
      const repoPath = join(dir, e.name)
      const isDir = !existsSync(join(repoPath, ".git"))
      return { name: e.name, path: repoPath, detectedType: detectRepoType(repoPath), isDir }
    })
    .sort((a, b) => a.name.localeCompare(b.name))
}
