import { describe, test, expect, beforeEach, afterEach, afterAll, mock } from "bun:test"
import { join } from "path"
import { mkdirSync, writeFileSync } from "fs"
import {
  WorkspaceSchema,
  WorkspaceRepoSchema,
  RepoRegistryEntrySchema,
  TemplateSchema,
  formatZodError,
  expandBranchPattern,
} from "../../src/lib/config"
import { makeTmpDir, cleanup, useIsolatedConfig } from "../helpers"

const isolated = useIsolatedConfig("config-test")

// --- Schema parsing ---

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

  test("parses workspace with template field", () => {
    const ws = WorkspaceSchema.parse({ name: "ws", branch: "b", created: "d", template: "my-app" })
    expect(ws.template).toBe("my-app")
  })

  test("parses workspace without template field (backward compat)", () => {
    const ws = WorkspaceSchema.parse({ name: "ws", branch: "b", created: "d" })
    expect(ws.template).toBeUndefined()
  })
})

describe("WorkspaceRepoSchema", () => {
  test("parses a worktree repo", () => {
    const repo = WorkspaceRepoSchema.parse({
      name: "svc", repo: "platform", type: "java",
      mode: "worktree", main_path: "/main/svc", task_path: "/tasks/ws/svc",
    })
    expect(repo.name).toBe("svc")
    expect(repo.mode).toBe("worktree")
    expect(repo.repo).toBe("platform")
  })

  test("parses a trunk repo", () => {
    const repo = WorkspaceRepoSchema.parse({
      name: "lib", repo: "platform", type: "typescript",
      mode: "trunk", main_path: "/main/lib", task_path: "/main/lib",
    })
    expect(repo.mode).toBe("trunk")
    expect(repo.task_path).toBe(repo.main_path)
  })
})

// --- RepoRegistryEntrySchema ---

describe("RepoRegistryEntrySchema", () => {
  test("parses a minimal registry entry", () => {
    const entry = RepoRegistryEntrySchema.parse({ name: "api", local_path: "/home/dev/api" })
    expect(entry.name).toBe("api")
    expect(entry.local_path).toBe("/home/dev/api")
    expect(entry.default_branch).toBe("main")
    expect(entry.type).toBe("other")
    expect(entry.schema_version).toBe("1")
  })

  test("preserves explicit values", () => {
    const entry = RepoRegistryEntrySchema.parse({
      name: "api", local_path: "/dev/api", default_branch: "develop", type: "java",
    })
    expect(entry.default_branch).toBe("develop")
    expect(entry.type).toBe("java")
  })
})

// --- TemplateSchema ---

describe("TemplateSchema", () => {
  test("parses a minimal template", () => {
    const tpl = TemplateSchema.parse({ name: "my-app" })
    expect(tpl.name).toBe("my-app")
    expect(tpl.repos).toEqual([])
    expect(tpl.schema_version).toBe("1")
  })

  test("parses template with repos and hooks", () => {
    const tpl = TemplateSchema.parse({
      name: "my-app",
      description: "Main app",
      repos: [
        { repo: "api", mode: "worktree", base_branch: "develop", branch_pattern: "feature/<workspace-name>" },
        { repo: "web", mode: "trunk" },
      ],
      hooks: { post_open: ["bun install"] },
      env: { NODE_ENV: "development" },
    })
    expect(tpl.repos).toHaveLength(2)
    expect(tpl.repos[0].repo).toBe("api")
    expect(tpl.repos[0].branch_pattern).toBe("feature/<workspace-name>")
    expect(tpl.hooks?.post_open).toEqual(["bun install"])
  })
})

// --- expandBranchPattern ---

describe("expandBranchPattern", () => {
  test("replaces <workspace-name> with actual name", () => {
    expect(expandBranchPattern("feature/<workspace-name>", "JIRA-123")).toBe("feature/JIRA-123")
  })

  test("replaces multiple occurrences", () => {
    expect(expandBranchPattern("<workspace-name>/<workspace-name>", "fix")).toBe("fix/fix")
  })

  test("returns pattern unchanged if no placeholder", () => {
    expect(expandBranchPattern("feature/static", "ws")).toBe("feature/static")
  })
})

// --- Read/write round-trip ---

describe("workspace file I/O", () => {
  let tmp: string

  beforeEach(() => { tmp = makeTmpDir("config") })
  afterEach(() => cleanup(tmp))

  test("writeWorkspace + readWorkspace round-trips correctly", async () => {
    // Redirect WORKSPACES_DIR to temp dir to avoid writing to real config.
    // process.env.HOME has no effect — paths.ts resolves at import time.
    const wsDir = join(tmp, "workspaces")
    mkdirSync(wsDir, { recursive: true })

    mock.module("@/lib/paths", () => ({
      HOME: tmp,
      WS_CONFIG_DIR: tmp,
      WORKSPACES_DIR: wsDir,
      GLOBAL_CONFIG_FILE: join(tmp, "config.yml"),
      REGISTRY_FILE: join(tmp, "registry.yml"),
      TEMPLATES_DIR: join(tmp, "templates"),
      MESSAGES_DIR: join(tmp, "messages"),
      DEFAULT_WORKSPACE_ROOT: join(tmp, "workspaces-root"),
      getMainDir: (r: string) => join(r, "main"),
      getTasksDir: (r: string) => join(r, "tasks"),
      expandHome: (p: string) => p.startsWith("~/") ? join(tmp, p.slice(2)) : p,
    }))

    const { writeWorkspace, readWorkspace } = await import(
      // @ts-ignore — cache-busting for isolated paths mock
      "@/lib/config?io-roundtrip-test"
    )

    const ws = WorkspaceSchema.parse({
      name: "test-workspace",
      description: "My workspace",
      branch: "feature/test",
      created: "2026-01-01",
      template: "my-app",
    })

    writeWorkspace(ws)
    const loaded = readWorkspace("test-workspace")

    expect(loaded.name).toBe("test-workspace")
    expect(loaded.description).toBe("My workspace")
    expect(loaded.branch).toBe("feature/test")
    expect(loaded.template).toBe("my-app")
  })
})

// --- formatZodError ---

describe("formatZodError", () => {
  test("formats field-path error messages", () => {
    const result = WorkspaceSchema.safeParse({ name: 123 })
    expect(result.success).toBe(false)
    if (!result.success) {
      const msg = formatZodError(result.error)
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
      // Nested path should use dot notation (e.g. repos.0.repo)
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
  test("defaults to '1' when absent in WorkspaceSchema", () => {
    const ws = WorkspaceSchema.parse({ name: "w", branch: "b", created: "d" })
    expect(ws.schema_version).toBe("1")
  })

  test("preserves explicit schema_version in WorkspaceSchema", () => {
    const ws = WorkspaceSchema.parse({ name: "w", branch: "b", created: "d", schema_version: "3" })
    expect(ws.schema_version).toBe("3")
  })

  test("defaults to '1' when absent in TemplateSchema", () => {
    const tpl = TemplateSchema.parse({ name: "t" })
    expect(tpl.schema_version).toBe("1")
  })
})

// --- CONF-02: minimal YAML shape guard ---

describe("CONF-02: minimal YAML shape guard", () => {
  test("minimal workspace (only required fields) still parses", () => {
    expect(() => WorkspaceSchema.parse({ name: "w", branch: "main", created: "2026-01-01" })).not.toThrow()
  })
})

// --- corrupt YAML handling (CONF-01) ---
// Uses isolated config dir via useIsolatedConfig — no writes to real ~/.config/git-stacks.

describe("corrupt YAML handling", () => {
  const TEST_PREFIX = "_test-corrupt-"
  const wsDir = join(isolated.configDir, "workspaces")

  beforeEach(() => {
    mkdirSync(wsDir, { recursive: true })
    // Re-establish isolated mock in case the "workspace file I/O" test overrode it
    mock.module("@/lib/paths", () => ({
      HOME: isolated.configDir,
      DEFAULT_WORKSPACE_ROOT: join(isolated.configDir, "ws-root"),
      WS_CONFIG_DIR: isolated.configDir,
      WORKSPACES_DIR: wsDir,
      GLOBAL_CONFIG_FILE: join(isolated.configDir, "config.yml"),
      REGISTRY_FILE: join(isolated.configDir, "registry.yml"),
      TEMPLATES_DIR: join(isolated.configDir, "templates"),
      MESSAGES_DIR: join(isolated.configDir, "messages"),
      getMainDir: (r: string) => join(r, "main"),
      getTasksDir: (r: string) => join(r, "tasks"),
      expandHome: (p: string) => p.startsWith("~/") ? join(isolated.configDir, p.slice(2)) : p,
    }))
  })

  function writeWorkspaceFile(name: string, content: string): string {
    const p = join(wsDir, `${TEST_PREFIX}${name}.yml`)
    writeFileSync(p, content, "utf-8")
    return p
  }

  test("listWorkspaces skips corrupt workspace YAML and returns only valid ones", async () => {
    // Valid workspace
    writeWorkspaceFile("good", "name: \"_test-corrupt-good-ws\"\nbranch: main\ncreated: \"2026-01-01\"\n")
    // Invalid workspace (missing branch and created)
    writeWorkspaceFile("bad", "name: \"_test-corrupt-bad-ws\"\n")

    // @ts-ignore — cache-busting for isolated paths mock
    const { listWorkspaces } = await import("@/lib/config?corrupt-test")
    const workspaces = listWorkspaces()
    const names = workspaces.map((w: { name: string }) => w.name)

    expect(names).toContain("_test-corrupt-good-ws")
    expect(names).not.toContain("_test-corrupt-bad-ws")
    expect(names.filter((n: string) => n.startsWith("_test-corrupt"))).toHaveLength(1)
  })
})

afterAll(() => isolated.cleanup())

// --- FilesSchema extensions ---

describe("FilesSchema extensions", () => {
  // SCHEMA-02: WorkspaceSchema backward compat — files: absent
  test("SCHEMA-02: WorkspaceSchema parses without files: field (backward compat)", () => {
    const result = WorkspaceSchema.parse({ name: "w", branch: "b", created: "2026-01-01" })
    expect(result.files).toBeUndefined()
  })

  // SCHEMA-03: WorkspaceRepoSchema backward compat — files: absent
  test("SCHEMA-03: WorkspaceRepoSchema parses without files: field (backward compat)", () => {
    const result = WorkspaceRepoSchema.parse({
      name: "r",
      repo: "s",
      type: "other",
      mode: "worktree",
      main_path: "/m",
      task_path: "/t",
    })
    expect(result.files).toBeUndefined()
  })

  // SCHEMA-04: WorkspaceSchema parses with files: present
  test("SCHEMA-04: WorkspaceSchema parses with files: present", () => {
    const result = WorkspaceSchema.parse({
      name: "w",
      branch: "b",
      created: "2026-01-01",
      files: { copy: [".env"], symlink: ["node_modules"] },
    })
    expect(result.files?.copy).toEqual([".env"])
    expect(result.files?.symlink).toEqual(["node_modules"])
  })

  test("SCHEMA-04: WorkspaceRepoSchema parses with files: present", () => {
    const result = WorkspaceRepoSchema.parse({
      name: "r",
      repo: "s",
      type: "other",
      mode: "worktree",
      main_path: "/m",
      task_path: "/t",
      files: { copy: [".env"], symlink: ["node_modules"] },
    })
    expect(result.files?.copy).toEqual([".env"])
    expect(result.files?.symlink).toEqual(["node_modules"])
  })
})
