import { join } from "path"
import { writeFileSync, mkdirSync, existsSync } from "fs"
import type { Workspace } from "./config"

interface CodeWorkspaceFolder {
  path: string
  name: string
}

interface CodeWorkspace {
  folders: CodeWorkspaceFolder[]
  settings: Record<string, unknown>
}

export function generateCodeWorkspace(workspace: Workspace, tasksDir: string): string {
  const folders: CodeWorkspaceFolder[] = workspace.repos.map((repo) => ({
    path: repo.task_path,
    name: repo.mode === "worktree" ? `${repo.name} [${workspace.name}]` : `${repo.name} [trunk]`,
  }))

  const codeWorkspace: CodeWorkspace = { folders, settings: {} }

  const outDir = join(tasksDir, workspace.name)
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true })

  const outPath = join(outDir, `${workspace.name}.code-workspace`)
  writeFileSync(outPath, JSON.stringify(codeWorkspace, null, 2), "utf-8")
  return outPath
}
