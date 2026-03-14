import { describe, test, expect, beforeEach, afterEach } from "bun:test"
import { join } from "path"
import { StackSchema, WorkspaceSchema, WorkspaceRepoSchema } from "../../src/lib/config"
import { makeTmpDir, cleanup, write } from "../helpers"

// --- Schema parsing ---

describe("StackSchema", () => {
  test("parses a minimal stack", () => {
    const stack = StackSchema.parse({ name: "my-stack" })
    expect(stack.name).toBe("my-stack")
    expect(stack.repos).toEqual([])
    expect(stack.description).toBeUndefined()
  })

  test("applies defaults to repos", () => {
    const stack = StackSchema.parse({
      name: "x",
      repos: [{ name: "svc", path: "/some/path" }],
    })
    expect(stack.repos[0].type).toBe("other")
    expect(stack.repos[0].default_mode).toBe("worktree")
    expect(stack.repos[0].default_branch).toBe("main")
  })

  test("preserves explicit repo values", () => {
    const stack = StackSchema.parse({
      name: "x",
      repos: [{ name: "svc", path: "/p", type: "java", default_mode: "trunk", default_branch: "development" }],
    })
    expect(stack.repos[0].type).toBe("java")
    expect(stack.repos[0].default_mode).toBe("trunk")
    expect(stack.repos[0].default_branch).toBe("development")
  })

  test("rejects invalid repo type", () => {
    expect(() =>
      StackSchema.parse({ name: "x", repos: [{ name: "r", path: "/p", type: "python" }] })
    ).toThrow()
  })
})

describe("WorkspaceSchema", () => {
  test("parses a minimal workspace", () => {
    const ws = WorkspaceSchema.parse({ name: "WEB-1234", branch: "feature/x", created: "2026-01-01" })
    expect(ws.name).toBe("WEB-1234")
    expect(ws.repos).toEqual([])
    expect(ws.cmux_workspace_id).toBeUndefined()
  })

  test("preserves cmux_workspace_id", () => {
    const ws = WorkspaceSchema.parse({
      name: "ws", branch: "main", created: "2026-01-01",
      cmux_workspace_id: "workspace:3",
    })
    expect(ws.cmux_workspace_id).toBe("workspace:3")
  })
})

describe("WorkspaceRepoSchema", () => {
  test("parses a worktree repo", () => {
    const repo = WorkspaceRepoSchema.parse({
      name: "svc", stack: "platform", type: "java",
      mode: "worktree", main_path: "/main/svc", task_path: "/tasks/ws/svc",
    })
    expect(repo.name).toBe("svc")
    expect(repo.mode).toBe("worktree")
  })

  test("parses a trunk repo", () => {
    const repo = WorkspaceRepoSchema.parse({
      name: "lib", stack: "platform", type: "typescript",
      mode: "trunk", main_path: "/main/lib", task_path: "/main/lib",
    })
    expect(repo.mode).toBe("trunk")
    expect(repo.task_path).toBe(repo.main_path)
  })
})

// --- Read/write round-trip ---

describe("stack file I/O", () => {
  let tmp: string

  beforeEach(() => { tmp = makeTmpDir("config") })
  afterEach(() => cleanup(tmp))

  test("writeStack + readStack round-trips correctly", async () => {
    // Dynamically set config dir to tmp
    process.env.HOME = tmp
    const { writeStack, readStack } = await import("../../src/lib/config")

    const stack = {
      name: "test-stack",
      description: "My stack",
      repos: [{ name: "repo-a", path: "/main/repo-a", type: "java" as const, default_mode: "worktree" as const, default_branch: "develop" }],
    }

    writeStack(stack)
    const loaded = readStack("test-stack")

    expect(loaded.name).toBe("test-stack")
    expect(loaded.description).toBe("My stack")
    expect(loaded.repos).toHaveLength(1)
    expect(loaded.repos[0].name).toBe("repo-a")
    expect(loaded.repos[0].default_branch).toBe("develop")
  })
})
