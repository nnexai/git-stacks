import { join } from "path"
import { writeFileSync, mkdirSync, existsSync } from "fs"
import type { Workspace, WorkspaceRepo } from "./config"

function modulesXml(repos: WorkspaceRepo[]): string {
  const entries = repos
    .map((r) => {
      const imlPath = `$PROJECT_DIR$/${r.name}/${r.name}.iml`
      return `      <module fileurl="file://${imlPath}" filepath="${imlPath}" />`
    })
    .join("\n")

  return `<?xml version="1.0" encoding="UTF-8"?>
<project version="4">
  <component name="ProjectModuleManager">
    <modules>
${entries}
    </modules>
  </component>
</project>`
}

// Minimal stub — IntelliJ will regenerate from Maven/Gradle on first open
function minimalIml(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<module type="JAVA_MODULE" version="4">
  <component name="NewModuleRootManager" inherit-compiler-output="true">
    <exclude-output />
    <content url="file://$MODULE_DIR$" />
    <orderEntry type="inheritedJdk" />
    <orderEntry type="sourceFolder" forTests="false" />
  </component>
</module>`
}

export function generateIntellijProject(workspace: Workspace, tasksDir: string): string | null {
  const javaRepos = workspace.repos.filter((r) => r.type === "java")
  if (javaRepos.length === 0) return null

  const projectDir = join(tasksDir, workspace.name)
  const ideaDir = join(projectDir, ".idea")
  if (!existsSync(ideaDir)) mkdirSync(ideaDir, { recursive: true })

  writeFileSync(join(ideaDir, "modules.xml"), modulesXml(javaRepos), "utf-8")

  // Write stub .iml files only if they don't already exist (IntelliJ may have generated them)
  for (const repo of javaRepos) {
    const imlPath = join(repo.task_path, `${repo.name}.iml`)
    if (!existsSync(imlPath)) {
      writeFileSync(imlPath, minimalIml(), "utf-8")
    }
  }

  return projectDir
}
