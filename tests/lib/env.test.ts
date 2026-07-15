import { describe, test, expect } from "@test/api"
import { formatEnvTable, formatEnvShell, formatEnvDotenv, formatEnvJson, formatEnv, detectRepoFromCwd } from "../../packages/core/src/env"
import type { Workspace } from "../../packages/core/src/config"

// --- Helpers ---

function makeWorkspace(overrides: Partial<Workspace> = {}): Workspace {
  return {
    name: "test-ws",
    branch: "feature/test",
    repos: [],
    hooks: undefined,
    env: undefined,
    env_file: undefined,
    files: undefined,
    integrations: undefined,
    ports: undefined,
    settings: undefined,
    ...overrides,
  } as unknown as Workspace
}

// --- Tests ---

describe("formatEnvTable", () => {
  test("sorts keys alphabetically", () => {
    const result = formatEnvTable({ Z: "last", A: "first" })
    const lines = result.split("\n")
    expect(lines[0]).toMatch(/^A/)
    expect(lines[1]).toMatch(/^Z/)
  })

  test("aligns columns", () => {
    const result = formatEnvTable({ SHORT: "1", LONGER_KEY: "2" })
    const lines = result.split("\n")
    // Both lines should have values starting at the same column
    const col1 = lines[0].indexOf("1")
    const col2 = lines[1].indexOf("2")
    expect(col1).toBe(col2)
  })

  test("handles empty record", () => {
    expect(formatEnvTable({})).toBe("")
  })
})

describe("formatEnvShell", () => {
  test("rejects invalid programmatic export identifiers", () => {
    expect(() => formatEnvShell({ "BAD-NAME": "value" })).toThrow("Invalid shell environment identifier")
  })
  test("exports simple values unquoted", () => {
    expect(formatEnvShell({ KEY: "simple" })).toBe("export KEY=simple")
  })

  test("quotes values with spaces", () => {
    expect(formatEnvShell({ KEY: "hello world" })).toBe('export KEY="hello world"')
  })

  test("escapes double quotes inside quoted values", () => {
    expect(formatEnvShell({ KEY: 'say "hi"' })).toBe('export KEY="say \\"hi\\""')
  })

  test("escapes dollar signs", () => {
    expect(formatEnvShell({ KEY: "cost $5" })).toBe('export KEY="cost \\$5"')
  })

  test("sorts keys alphabetically", () => {
    const result = formatEnvShell({ B: "2", A: "1" })
    const lines = result.split("\n")
    expect(lines[0]).toContain("A")
    expect(lines[1]).toContain("B")
  })
})

describe("formatEnvDotenv", () => {
  test("outputs simple values unquoted", () => {
    expect(formatEnvDotenv({ KEY: "simple" })).toBe("KEY=simple")
  })

  test("quotes values with spaces", () => {
    expect(formatEnvDotenv({ KEY: "hello world" })).toBe('KEY="hello world"')
  })

  test("escapes double quotes", () => {
    expect(formatEnvDotenv({ KEY: 'say "hi"' })).toBe('KEY="say \\"hi\\""')
  })

  test("sorts keys alphabetically", () => {
    const result = formatEnvDotenv({ B: "2", A: "1" })
    const lines = result.split("\n")
    expect(lines[0]).toContain("A")
    expect(lines[1]).toContain("B")
  })
})

describe("formatEnvJson", () => {
  test("outputs valid JSON", () => {
    const result = formatEnvJson({ KEY: "value" })
    const parsed = JSON.parse(result)
    expect(parsed).toEqual({ KEY: "value" })
  })

  test("sorts keys", () => {
    const result = formatEnvJson({ B: "2", A: "1" })
    const parsed = JSON.parse(result)
    expect(Object.keys(parsed)).toEqual(["A", "B"])
  })

  test("pretty-prints with 2-space indent", () => {
    const result = formatEnvJson({ KEY: "value" })
    expect(result).toContain("\n")
    expect(result).toContain('  "')
  })
})

describe("formatEnv", () => {
  test("dispatches to table", () => {
    expect(formatEnv({ K: "v" }, "table")).toBe(formatEnvTable({ K: "v" }))
  })

  test("dispatches to shell", () => {
    expect(formatEnv({ K: "v" }, "shell")).toBe(formatEnvShell({ K: "v" }))
  })

  test("dispatches to dotenv", () => {
    expect(formatEnv({ K: "v" }, "dotenv")).toBe(formatEnvDotenv({ K: "v" }))
  })

  test("dispatches to json", () => {
    expect(formatEnv({ K: "v" }, "json")).toBe(formatEnvJson({ K: "v" }))
  })
})

describe("detectRepoFromCwd", () => {
  test("detects repo from CWD inside task_path", () => {
    const ws = makeWorkspace({
      repos: [
        {
          name: "api",
          repo: "api",
          type: "typescript",
          mode: "worktree",
          main_path: "/tmp/main/api",
          task_path: "/tmp/tasks/ws/api",
        },
      ],
    })
    expect(detectRepoFromCwd(ws, "/tmp/tasks/ws/api/src")).toBe("api")
  })

  test("detects repo when CWD equals task_path exactly", () => {
    const ws = makeWorkspace({
      repos: [
        {
          name: "api",
          repo: "api",
          type: "typescript",
          mode: "worktree",
          main_path: "/tmp/main/api",
          task_path: "/tmp/tasks/ws/api",
        },
      ],
    })
    expect(detectRepoFromCwd(ws, "/tmp/tasks/ws/api")).toBe("api")
  })

  test("returns null for unmatched CWD", () => {
    const ws = makeWorkspace({
      repos: [
        {
          name: "api",
          repo: "api",
          type: "typescript",
          mode: "worktree",
          main_path: "/tmp/main/api",
          task_path: "/tmp/tasks/ws/api",
        },
      ],
    })
    expect(detectRepoFromCwd(ws, "/some/other/path")).toBeNull()
  })

  test("skips trunk repos", () => {
    const ws = makeWorkspace({
      repos: [
        {
          name: "api",
          repo: "api",
          type: "typescript",
          mode: "trunk",
          main_path: "/tmp/tasks/ws/api",
          task_path: "/tmp/tasks/ws/api",
        },
      ],
    })
    expect(detectRepoFromCwd(ws, "/tmp/tasks/ws/api/src")).toBeNull()
  })

  test("picks longest match for nested repo paths", () => {
    const ws = makeWorkspace({
      repos: [
        {
          name: "parent",
          repo: "parent",
          type: "typescript",
          mode: "worktree",
          main_path: "/tmp/main/parent",
          task_path: "/tmp/tasks/ws",
        },
        {
          name: "child",
          repo: "child",
          type: "typescript",
          mode: "worktree",
          main_path: "/tmp/main/child",
          task_path: "/tmp/tasks/ws/child",
        },
      ],
    })
    expect(detectRepoFromCwd(ws, "/tmp/tasks/ws/child/src")).toBe("child")
  })
})
