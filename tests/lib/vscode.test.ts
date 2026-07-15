import { describe, test, expect, beforeEach, afterEach } from "@test/api"
import { readFileSync } from "fs"
import { generateCodeWorkspace } from "../../packages/core/src/vscode"
import { makeTmpDir, cleanup } from "../helpers"
import type { Workspace } from "../../packages/core/src/config"

let tmp: string
beforeEach(() => { tmp = makeTmpDir("vscode") })
afterEach(() => cleanup(tmp))

function makeWorkspace(overrides: Partial<Workspace> = {}): Workspace {
  return {
    name: "WEB-1234",
    schema_version: "1",
    branch: "feature/WEB-1234",
    created: "2026-01-01",
    repos: [
      {
        name: "auth-service",
        repo: "platform",
        type: "java",
        mode: "worktree",
        main_path: "/main/auth-service",
        task_path: "/tasks/WEB-1234/auth-service",
      },
      {
        name: "shared-lib",
        repo: "platform",
        type: "java",
        mode: "trunk",
        main_path: "/main/shared-lib",
        task_path: "/main/shared-lib",
      },
    ],
    ...overrides,
  }
}

describe("generateCodeWorkspace", () => {
  test("creates a .code-workspace file", () => {
    const outPath = generateCodeWorkspace(makeWorkspace(), tmp)
    expect(outPath.endsWith("WEB-1234.code-workspace")).toBe(true)
    const content = JSON.parse(readFileSync(outPath, "utf-8"))
    expect(content.folders).toHaveLength(2)
  })

  test("labels worktree folders with workspace name", () => {
    const outPath = generateCodeWorkspace(makeWorkspace(), tmp)
    const { folders } = JSON.parse(readFileSync(outPath, "utf-8"))
    const worktree = folders.find((f: { name: string }) => f.name.includes("[WEB-1234]"))
    expect(worktree).toBeDefined()
    expect(worktree.path).toBe("/tasks/WEB-1234/auth-service")
  })

  test("labels trunk folders with [trunk]", () => {
    const outPath = generateCodeWorkspace(makeWorkspace(), tmp)
    const { folders } = JSON.parse(readFileSync(outPath, "utf-8"))
    const trunk = folders.find((f: { name: string }) => f.name.includes("[trunk]"))
    expect(trunk).toBeDefined()
    expect(trunk.name).toBe("shared-lib [trunk]")
  })

  test("uses task_path for trunk repos", () => {
    const outPath = generateCodeWorkspace(makeWorkspace(), tmp)
    const { folders } = JSON.parse(readFileSync(outPath, "utf-8"))
    const trunk = folders.find((f: { name: string }) => f.name.includes("[trunk]"))
    expect(trunk.path).toBe("/main/shared-lib")
  })

  test("includes settings field", () => {
    const outPath = generateCodeWorkspace(makeWorkspace(), tmp)
    const content = JSON.parse(readFileSync(outPath, "utf-8"))
    expect(content.settings).toBeDefined()
  })
})
