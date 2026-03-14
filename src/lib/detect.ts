import { existsSync, readdirSync } from "fs"
import { join } from "path"
import type { RepoType } from "./config"

export interface DiscoveredRepo {
  name: string
  path: string
  detectedType: RepoType
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

export function scanForRepos(dir: string): DiscoveredRepo[] {
  if (!existsSync(dir)) return []

  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && existsSync(join(dir, e.name, ".git")))
    .map((e) => {
      const repoPath = join(dir, e.name)
      return { name: e.name, path: repoPath, detectedType: detectRepoType(repoPath) }
    })
    .sort((a, b) => a.name.localeCompare(b.name))
}
