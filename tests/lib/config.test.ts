import { describe, test, expect, beforeEach, afterEach } from "bun:test"
import { join } from "path"
import { mkdirSync, writeFileSync, rmSync } from "fs"
import { StackSchema, WorkspaceSchema, WorkspaceRepoSchema, formatZodError, listStacks, listWorkspaces } from "../../src/lib/config"
import { STACKS_DIR, WORKSPACES_DIR } from "../../src/lib/paths"
import { makeTmpDir, cleanup } from "../helpers"

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

    const stack = StackSchema.parse({
      name: "test-stack",
      description: "My stack",
      repos: [{ name: "repo-a", path: "/main/repo-a", type: "java", default_mode: "worktree", default_branch: "develop" }],
    })

    writeStack(stack)
    const loaded = readStack("test-stack")

    expect(loaded.name).toBe("test-stack")
    expect(loaded.description).toBe("My stack")
    expect(loaded.repos).toHaveLength(1)
    expect(loaded.repos[0].name).toBe("repo-a")
    expect(loaded.repos[0].default_branch).toBe("develop")
  })
})

// --- formatZodError ---

describe("formatZodError", () => {
  test("formats field-path error messages", () => {
    const result = StackSchema.safeParse({ name: 123 })
    expect(result.success).toBe(false)
    if (!result.success) {
      const msg = formatZodError(result.error)
      // Should contain the field path and/or the error description
      expect(msg.toLowerCase()).toMatch(/name|expected string/)
    }
  })

  test("formats nested path errors with dot-separated path", () => {
    const result = WorkspaceSchema.safeParse({
      name: "x",
      branch: "b",
      created: "d",
      repos: [{ name: "r" }],
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      const msg = formatZodError(result.error)
      // Nested path should use dot notation (e.g. repos.0.stack)
      expect(msg).toMatch(/repos\.0\./)
    }
  })

  test("joins multiple errors with semicolons", () => {
    // name is required, branch is required, created is required
    const result = WorkspaceSchema.safeParse({})
    expect(result.success).toBe(false)
    if (!result.success) {
      const msg = formatZodError(result.error)
      // Multiple errors should be joined with "; "
      expect(msg).toContain(";")
    }
  })
})

// --- schema_version ---

describe("schema_version", () => {
  test("defaults to '1' when absent in StackSchema", () => {
    const stack = StackSchema.parse({ name: "test" })
    expect(stack.schema_version).toBe("1")
  })

  test("defaults to '1' when absent in WorkspaceSchema", () => {
    const ws = WorkspaceSchema.parse({ name: "w", branch: "b", created: "d" })
    expect(ws.schema_version).toBe("1")
  })

  test("preserves explicit schema_version in StackSchema", () => {
    const stack = StackSchema.parse({ name: "test", schema_version: "2" })
    expect(stack.schema_version).toBe("2")
  })

  test("preserves explicit schema_version in WorkspaceSchema", () => {
    const ws = WorkspaceSchema.parse({ name: "w", branch: "b", created: "d", schema_version: "3" })
    expect(ws.schema_version).toBe("3")
  })
})

// --- CONF-02: minimal YAML shape guard ---

describe("CONF-02: minimal YAML shape guard", () => {
  test("minimal stack (only required fields) still parses", () => {
    expect(() => StackSchema.parse({ name: "minimal" })).not.toThrow()
  })

  test("minimal workspace (only required fields) still parses", () => {
    expect(() => WorkspaceSchema.parse({ name: "w", branch: "main", created: "2026-01-01" })).not.toThrow()
  })
})

// --- corrupt YAML handling (CONF-01) ---
// Note: STACKS_DIR and WORKSPACES_DIR are resolved at module load time from the real HOME.
// Tests write files directly to these dirs with unique test-prefixed names to avoid
// interfering with real user data, then clean them up in afterEach.

describe("corrupt YAML handling", () => {
  const TEST_PREFIX = "_test-corrupt-"
  let createdStackFiles: string[] = []
  let createdWorkspaceFiles: string[] = []

  beforeEach(() => {
    createdStackFiles = []
    createdWorkspaceFiles = []
    mkdirSync(STACKS_DIR, { recursive: true })
    mkdirSync(WORKSPACES_DIR, { recursive: true })
  })

  afterEach(() => {
    for (const f of createdStackFiles) {
      try { rmSync(f) } catch { /* ignore */ }
    }
    for (const f of createdWorkspaceFiles) {
      try { rmSync(f) } catch { /* ignore */ }
    }
  })

  function writeStackFile(name: string, content: string): string {
    const p = join(STACKS_DIR, `${TEST_PREFIX}${name}.yml`)
    writeFileSync(p, content, "utf-8")
    createdStackFiles.push(p)
    return p
  }

  function writeWorkspaceFile(name: string, content: string): string {
    const p = join(WORKSPACES_DIR, `${TEST_PREFIX}${name}.yml`)
    writeFileSync(p, content, "utf-8")
    createdWorkspaceFiles.push(p)
    return p
  }

  test("listStacks skips corrupt stack YAML and returns only valid ones", () => {
    // Valid stack
    writeStackFile("good", "name: \"_test-corrupt-good\"\n")
    // Schema-invalid stack (name must be a string)
    writeStackFile("bad", "name: 9999\nrepos: []\n")

    const stacks = listStacks()
    const names = stacks.map((s) => s.name)

    expect(names).toContain("_test-corrupt-good")
    expect(names).not.toContain("_test-corrupt-bad")
    // Total should not include the bad one relative to what we added
    expect(names.filter((n) => n.startsWith(TEST_PREFIX))).toHaveLength(1)
  })

  test("listWorkspaces skips corrupt workspace YAML and returns only valid ones", () => {
    // Valid workspace
    writeWorkspaceFile("good", "name: \"_test-corrupt-good-ws\"\nbranch: main\ncreated: \"2026-01-01\"\n")
    // Invalid workspace (missing branch and created)
    writeWorkspaceFile("bad", "name: \"_test-corrupt-bad-ws\"\n")

    const workspaces = listWorkspaces()
    const names = workspaces.map((w) => w.name)

    expect(names).toContain("_test-corrupt-good-ws")
    expect(names).not.toContain("_test-corrupt-bad-ws")
    expect(names.filter((n) => n.startsWith("_test-corrupt"))).toHaveLength(1)
  })

  test("listStacks handles syntactically invalid YAML without throwing", () => {
    writeStackFile("syntax-err", ": invalid: yaml: [[")

    let result: ReturnType<typeof listStacks> | undefined
    expect(() => {
      result = listStacks()
    }).not.toThrow()
    // Syntactically invalid YAML is skipped
    const names = (result ?? []).map((s) => s.name)
    expect(names).not.toContain(`${TEST_PREFIX}syntax-err`)
  })
})
