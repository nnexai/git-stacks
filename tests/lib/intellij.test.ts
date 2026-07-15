import { describe, test, expect, beforeEach, afterEach } from "bun:test"
import { join } from "path"
import { existsSync, readFileSync } from "fs"
import { generateIntellijProject } from "../../packages/core/src/intellij"
import { makeTmpDir, cleanup, mkdir, touch } from "../helpers"
import type { Workspace } from "../../packages/core/src/config"

let tmp: string
beforeEach(() => { tmp = makeTmpDir("intellij") })
afterEach(() => cleanup(tmp))

function makeWorkspace(repos: Workspace["repos"]): Workspace {
  return { name: "WEB-1234", schema_version: "1", branch: "feature/WEB-1234", created: "2026-01-01", repos }
}

const javaRepo = (name: string, taskPath: string) => ({
  name,
  repo: "platform",
  type: "java" as const,
  mode: "worktree" as const,
  main_path: `/main/${name}`,
  task_path: taskPath,
})

const tsRepo = (name: string) => ({
  name,
  repo: "platform",
  type: "typescript" as const,
  mode: "worktree" as const,
  main_path: `/main/${name}`,
  task_path: `/tasks/WEB-1234/${name}`,
})

describe("generateIntellijProject", () => {
  test("returns null when no java repos", () => {
    const ws = makeWorkspace([tsRepo("frontend")])
    expect(generateIntellijProject(ws, tmp)).toBeNull()
  })

  test("returns project dir path for java repos", () => {
    const taskPath = join(tmp, "WEB-1234", "auth-service")
    mkdir(tmp, "WEB-1234", "auth-service")
    const ws = makeWorkspace([javaRepo("auth-service", taskPath)])
    const result = generateIntellijProject(ws, tmp)
    expect(result).toBe(join(tmp, "WEB-1234"))
  })

  test("creates .idea/modules.xml", () => {
    const taskPath = join(tmp, "WEB-1234", "auth-service")
    mkdir(tmp, "WEB-1234", "auth-service")
    const ws = makeWorkspace([javaRepo("auth-service", taskPath)])
    generateIntellijProject(ws, tmp)
    const modulesXml = join(tmp, "WEB-1234", ".idea", "modules.xml")
    expect(existsSync(modulesXml)).toBeTrue()
  })

  test("modules.xml contains module entries for each java repo", () => {
    const taskPath1 = join(tmp, "WEB-1234", "auth-service")
    const taskPath2 = join(tmp, "WEB-1234", "api-gateway")
    mkdir(tmp, "WEB-1234", "auth-service")
    mkdir(tmp, "WEB-1234", "api-gateway")
    const ws = makeWorkspace([
      javaRepo("auth-service", taskPath1),
      javaRepo("api-gateway", taskPath2),
    ])
    generateIntellijProject(ws, tmp)
    const xml = readFileSync(join(tmp, "WEB-1234", ".idea", "modules.xml"), "utf-8")
    expect(xml).toContain("auth-service/auth-service.iml")
    expect(xml).toContain("api-gateway/api-gateway.iml")
  })

  test("ignores typescript repos in intellij project", () => {
    const javaPath = join(tmp, "WEB-1234", "auth-service")
    mkdir(tmp, "WEB-1234", "auth-service")
    const ws = makeWorkspace([javaRepo("auth-service", javaPath), tsRepo("frontend")])
    generateIntellijProject(ws, tmp)
    const xml = readFileSync(join(tmp, "WEB-1234", ".idea", "modules.xml"), "utf-8")
    expect(xml).toContain("auth-service")
    expect(xml).not.toContain("frontend")
  })

  test("creates stub .iml when not already present", () => {
    const taskPath = join(tmp, "WEB-1234", "auth-service")
    mkdir(tmp, "WEB-1234", "auth-service")
    const ws = makeWorkspace([javaRepo("auth-service", taskPath)])
    generateIntellijProject(ws, tmp)
    const iml = join(taskPath, "auth-service.iml")
    expect(existsSync(iml)).toBeTrue()
    expect(readFileSync(iml, "utf-8")).toContain("JAVA_MODULE")
  })

  test("does not overwrite existing .iml", () => {
    const taskPath = join(tmp, "WEB-1234", "auth-service")
    mkdir(tmp, "WEB-1234", "auth-service")
    // Pre-create .iml with custom content
    touch(tmp, "WEB-1234/auth-service/auth-service.iml")
    const iml = join(taskPath, "auth-service.iml")
    const customContent = "<module>custom</module>"
    require("fs").writeFileSync(iml, customContent)

    const ws = makeWorkspace([javaRepo("auth-service", taskPath)])
    generateIntellijProject(ws, tmp)
    expect(readFileSync(iml, "utf-8")).toBe(customContent)
  })
})
