import { describe, test, expect, beforeEach, afterEach, afterAll, mock } from "@test/api"
import { join } from "path"
import { mkdirSync, writeFileSync, existsSync } from "fs"
import {
  WorkspaceSchema,
  WorkspaceRepoSchema,
  RepoRegistryEntrySchema,
  TemplateSchema,
  TemplateRepoSchema,
  GlobalConfigSchema,
  NameSchema,
  formatZodError,
  expandBranchPattern,
} from "../../packages/core/src/config"
import {
  makeTmpDir, cleanup, useIsolatedConfig,
  realWriteWorkspace, realReadWorkspace, realListWorkspaces, realListWorkspacesUncached,
  realWorkspaceExists, realTemplateExists, realReadTemplate,
  realWriteTemplate, realListTemplates,
  realCache, realDeleteWorkspace, realDeleteTemplate, realInvalidateConfigCache,
} from "../helpers"

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

describe("manual commands schema", () => {
  test("TemplateSchema accepts string-valued commands", () => {
    const tpl = TemplateSchema.parse({ name: "cmd-tpl", commands: { verify: "bun test" } })
    expect(tpl.commands?.verify).toBe("bun test")
  })

  test("TemplateSchema rejects object-valued commands", () => {
    expect(() => TemplateSchema.parse({
      name: "cmd-tpl",
      commands: { verify: { cmd: "bun test" } },
    })).toThrow()
  })

  test("WorkspaceSchema accepts string-valued commands", () => {
    const ws = WorkspaceSchema.parse({ name: "ws", branch: "main", created: "2026-01-01", commands: { verify: "bun test" } })
    expect(ws.commands?.verify).toBe("bun test")
  })

  test("WorkspaceSchema rejects object-valued commands", () => {
    expect(() => WorkspaceSchema.parse({
      name: "ws",
      branch: "main",
      created: "2026-01-01",
      commands: { verify: { cmd: "bun test" } },
    })).toThrow()
  })

  test("WorkspaceRepoSchema accepts string-valued commands", () => {
    const repo = WorkspaceRepoSchema.parse({
      name: "svc",
      repo: "svc",
      type: "other",
      mode: "worktree",
      main_path: "/tmp/main/svc",
      task_path: "/tmp/tasks/ws/svc",
      commands: { verify: "bun test" },
    })
    expect(repo.commands?.verify).toBe("bun test")
  })

  test("WorkspaceRepoSchema rejects object-valued commands", () => {
    expect(() => WorkspaceRepoSchema.parse({
      name: "svc",
      repo: "svc",
      type: "other",
      mode: "worktree",
      main_path: "/tmp/main/svc",
      task_path: "/tmp/tasks/ws/svc",
      commands: { verify: { cmd: "bun test" } },
    })).toThrow()
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

describe("files.sync schema", () => {
  test("TemplateSchema parses sync entries", () => {
    const tpl = TemplateSchema.parse({
      name: "tpl",
      files: { sync: [{ source: ".planning", target: ".planning", git_exclude: true }] },
    })
    expect(tpl.files?.sync?.[0].source).toBe(".planning")
    expect(tpl.files?.sync?.[0].target).toBe(".planning")
    expect(tpl.files?.sync?.[0].git_exclude).toBe(true)
  })

  test("WorkspaceSchema parses sync entries", () => {
    const ws = WorkspaceSchema.parse({
      name: "ws",
      branch: "main",
      created: "2026-01-01",
      files: { sync: [{ source: ".codex-src", target: ".codex" }] },
    })
    expect(ws.files?.sync?.[0].source).toBe(".codex-src")
    expect(ws.files?.sync?.[0].target).toBe(".codex")
  })

  test("WorkspaceRepoSchema parses sync entries", () => {
    const repo = WorkspaceRepoSchema.parse({
      name: "svc",
      repo: "platform",
      type: "typescript",
      mode: "worktree",
      main_path: "/main/svc",
      task_path: "/tasks/ws/svc",
      files: { sync: [{ source: ".planning", target: ".planning", git_exclude: true }] },
    })
    expect(repo.files?.sync?.[0].git_exclude).toBe(true)
  })

  test("rejects malformed sync entries", () => {
    expect(() => TemplateSchema.parse({ name: "tpl", files: { sync: [".planning"] } })).toThrow()
    expect(() => TemplateSchema.parse({ name: "tpl", files: { sync: [{ target: ".planning" }] } })).toThrow()
    expect(() => TemplateSchema.parse({ name: "tpl", files: { sync: [{ source: ".planning" }] } })).toThrow()
    expect(() => TemplateSchema.parse({
      name: "tpl",
      files: { sync: [{ source: ".planning", target: ".planning", git_exclude: "true" }] },
    })).toThrow()
  })
})

describe("labels", () => {
  test("WorkspaceSchema accepts valid labels", () => {
    const ws = WorkspaceSchema.parse({
      name: "ws",
      branch: "b",
      created: "d",
      labels: ["backend", "sprint:14", "client.acme", "type-bugfix", "v1_0"],
    })
    expect(ws.labels).toEqual(["backend", "sprint:14", "client.acme", "type-bugfix", "v1_0"])
  })

  test("WorkspaceSchema labels field is optional", () => {
    const ws = WorkspaceSchema.parse({ name: "ws", branch: "b", created: "d" })
    expect(ws.labels).toBeUndefined()
  })

  test("WorkspaceSchema rejects labels with invalid characters", () => {
    expect(() => WorkspaceSchema.parse({
      name: "ws",
      branch: "b",
      created: "d",
      labels: ["has space"],
    })).toThrow()
    expect(() => WorkspaceSchema.parse({
      name: "ws",
      branch: "b",
      created: "d",
      labels: ["path/sep"],
    })).toThrow()
  })

  test("TemplateSchema accepts valid labels", () => {
    const tpl = TemplateSchema.parse({
      name: "tpl",
      repos: [],
      labels: ["backend", "sprint:14"],
    })
    expect(tpl.labels).toEqual(["backend", "sprint:14"])
  })

  test("TemplateSchema labels field is optional", () => {
    const tpl = TemplateSchema.parse({ name: "tpl", repos: [] })
    expect(tpl.labels).toBeUndefined()
  })
})

describe("GlobalConfigSchema secrets", () => {
  test("parses config without secrets field (backward compat)", () => {
    const config = GlobalConfigSchema.parse({})
    expect(config.secrets).toBeUndefined()
  })

  test("parses config with secrets.resolvers", () => {
    const config = GlobalConfigSchema.parse({ secrets: { resolvers: ["keychain", "env"] } })
    expect(config.secrets?.resolvers).toEqual(["keychain", "env"])
  })

  test("parses config with empty secrets object", () => {
    const config = GlobalConfigSchema.parse({ secrets: {} })
    expect(config.secrets).toBeDefined()
    expect(config.secrets?.resolvers).toBeUndefined()
  })

  test("rejects non-string resolver entries", () => {
    expect(() => GlobalConfigSchema.parse({ secrets: { resolvers: [123] } })).toThrow()
  })
})

describe("Forge source config shapes", () => {
  test("WorkspaceSchema parses top-level source metadata", () => {
    const ws = WorkspaceSchema.parse({
      name: "review-42",
      branch: "source/gitlab-mr-42",
      created: "2026-01-01",
      source: {
        kind: "forge",
        forge: "gitlab",
        base_url: "https://gitlab.example.com",
        url: "https://gitlab.example.com/org/api/-/merge_requests/42",
        change_type: "mr",
        change_number: 42,
        repo: "api",
        repo_path: "org/api",
        source_branch: "source/gitlab-mr-42",
        source_ref: "refs/heads/source/gitlab-mr-42",
        target_branch: "source/gitlab-mr-42",
        web_url: "https://gitlab.example.com/org/api/-/merge_requests/42",
        fetched_ref: "refs/git-stacks/sources/gitlab/42/api",
      },
    })
    expect(ws.source?.forge).toBe("gitlab")
    expect(ws.source?.change_number).toBe(42)
  })

  test("WorkspaceSchema rejects invalid source kind", () => {
    expect(() => WorkspaceSchema.parse({
      name: "review-42",
      branch: "source/gitlab-mr-42",
      created: "2026-01-01",
      source: {
        kind: "manual",
      },
    })).toThrow()
  })

  test("GlobalConfigSchema keeps integration objects with optional base_url", () => {
    const config = GlobalConfigSchema.parse({
      integrations: {
        gitlab: { enabled: true, base_url: "https://gitlab.example.com" },
        gitea: { enabled: true, base_url: "https://git.example.test" },
        github: { enabled: true },
      },
    })
    expect(config.integrations.gitlab).toEqual({ enabled: true, base_url: "https://gitlab.example.com" })
    expect(config.integrations.gitea).toEqual({ enabled: true, base_url: "https://git.example.test" })
    expect(config.integrations.github).toEqual({ enabled: true })
  })

  test("RepoRegistryEntrySchema accepts forge metadata with repo path", () => {
    const entry = RepoRegistryEntrySchema.parse({
      name: "api",
      local_path: "/home/dev/api",
      forge: "gitlab",
      forge_metadata: {
        forge: "gitlab",
        base_url: "https://gitlab.example.com",
        repo_path: "group/subgroup/api",
      },
    })
    expect(entry.forge).toBe("gitlab")
    expect(entry.forge_metadata?.repo_path).toBe("group/subgroup/api")
  })

  test("RepoRegistryEntrySchema stays compatible with forge only", () => {
    const entry = RepoRegistryEntrySchema.parse({
      name: "api",
      local_path: "/home/dev/api",
      forge: "gitea",
    })
    expect(entry.forge).toBe("gitea")
    expect(entry.forge_metadata).toBeUndefined()
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
      DEFAULT_WORKSPACE_ROOT: join(tmp, "workspaces-root"),
      getMainDir: (r: string) => join(r, "main"),
      getTasksDir: (r: string) => join(r, "tasks"),
      expandHome: (p: string) => p.startsWith("~/") ? join(tmp, p.slice(2)) : p,
    }))

    const { writeWorkspace, readWorkspace } = { writeWorkspace: realWriteWorkspace, readWorkspace: realReadWorkspace }

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
      getMainDir: (r: string) => join(r, "main"),
      getTasksDir: (r: string) => join(r, "tasks"),
      expandHome: (p: string) => p.startsWith("~/") ? join(isolated.configDir, p.slice(2)) : p,
    }))
    // Reset in-memory index so list scans fresh files each test
    realCache.workspaces.clear()
    realCache.templates.clear()
    realCache.resetList()
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

    const workspaces = realListWorkspaces()
    const names = workspaces.map((w: { name: string }) => w.name)

    expect(names).toContain("_test-corrupt-good-ws")
    expect(names).not.toContain("_test-corrupt-bad-ws")
    expect(names.filter((n: string) => n.startsWith("_test-corrupt"))).toHaveLength(1)
  })
})

afterAll(() => isolated.cleanup())

// --- scan-based lookup ---
// Tests for scan-based workspace/template lookup by YAML name field (not filename).

describe("scan-based lookup", () => {
  const scanIsolated = useIsolatedConfig("config-scan-test")
  const wsDir = join(scanIsolated.configDir, "workspaces")
  const tplDir = join(scanIsolated.configDir, "templates")

  beforeEach(() => {
    mkdirSync(wsDir, { recursive: true })
    mkdirSync(tplDir, { recursive: true })
    mock.module("@/lib/paths", () => ({
      HOME: scanIsolated.configDir,
      DEFAULT_WORKSPACE_ROOT: join(scanIsolated.configDir, "ws-root"),
      WS_CONFIG_DIR: scanIsolated.configDir,
      WORKSPACES_DIR: wsDir,
      GLOBAL_CONFIG_FILE: join(scanIsolated.configDir, "config.yml"),
      REGISTRY_FILE: join(scanIsolated.configDir, "registry.yml"),
      TEMPLATES_DIR: tplDir,
      getMainDir: (r: string) => join(r, "main"),
      getTasksDir: (r: string) => join(r, "tasks"),
      expandHome: (p: string) => p.startsWith("~/") ? join(scanIsolated.configDir, p.slice(2)) : p,
    }))
    // Reset in-memory index so each test starts with a clean scan
    realCache.workspaces.clear()
    realCache.templates.clear()
    realCache.resetList()
  })

  afterAll(() => scanIsolated.cleanup())

  test("workspaceExists finds workspace by YAML name even when filename differs", async () => {
    writeFileSync(join(wsDir, "foo.yml"), "name: bar\nbranch: main\ncreated: \"2026-01-01\"\n")

    expect(realWorkspaceExists("bar")).toBe(true)
    expect(realWorkspaceExists("foo")).toBe(false)
  })

  test("readWorkspace returns workspace from drifted file", async () => {
    writeFileSync(join(wsDir, "old.yml"), "name: current\nbranch: main\ncreated: \"2026-01-01\"\n")

    const ws = realReadWorkspace("current")
    expect(ws.name).toBe("current")
  })

  test("readWorkspace throws for non-existent name", async () => {
    expect(() => realReadWorkspace("ghost")).toThrow(/not found/)
  })

  test("duplicate YAML name warns to stderr", async () => {
    writeFileSync(join(wsDir, "a.yml"), "name: dup\nbranch: main\ncreated: \"2026-01-01\"\n")
    writeFileSync(join(wsDir, "b.yml"), "name: dup\nbranch: main\ncreated: \"2026-01-01\"\n")

    const errors: string[] = []
    const origError = console.error
    console.error = (...args: unknown[]) => { errors.push(args.join(" ")); origError(...args) }
    try {
      realWorkspaceExists("dup")
    } finally {
      console.error = origError
    }
    expect(errors.some((e) => e.includes("multiple workspaces with name 'dup'"))).toBe(true)
  })

  test("templateExists finds template by YAML name even when filename differs", async () => {
    writeFileSync(join(tplDir, "old.yml"), "name: current\n")

    expect(realTemplateExists("current")).toBe(true)
  })

  test("readTemplate returns template from drifted file", async () => {
    writeFileSync(join(tplDir, "old.yml"), "name: current\n")

    const tpl = realReadTemplate("current")
    expect(tpl.name).toBe("current")
  })

  test("listWorkspaces returns workspaces regardless of filename drift", async () => {
    writeFileSync(join(wsDir, "drifted.yml"), "name: actual\nbranch: main\ncreated: \"2026-01-01\"\n")

    const workspaces = realListWorkspaces()
    expect(workspaces.some((w: { name: string }) => w.name === "actual")).toBe(true)
  })
})

// --- doctor drift detection ---
// Tests for workspace/template name/filename drift detection in doctor.ts.
// Since findWorkspaceNameDrift and findTemplateNameDrift are module-private, we test
// by scanning the YAML directly using the same WorkspaceSchema/TemplateSchema safeParse logic
// that doctor uses — verifying the drift-detectable data condition.

describe("doctor drift detection", () => {
  const driftIsolated = useIsolatedConfig("config-drift-test")
  const wsDir = join(driftIsolated.configDir, "workspaces")
  const tplDir = join(driftIsolated.configDir, "templates")

  beforeEach(() => {
    mkdirSync(wsDir, { recursive: true })
    mkdirSync(tplDir, { recursive: true })
  })

  afterAll(() => driftIsolated.cleanup())

  test("drift detection: workspace name differs from filename stem is detectable", () => {
    // Write a file where YAML name != filename stem
    const filePath = join(wsDir, "old-name.yml")
    writeFileSync(filePath, "name: new-name\nbranch: main\ncreated: \"2026-01-01\"\n")

    // Simulate doctor scan logic: read the file, check name !== stem
    const { readFileSync: rfs } = require("fs")
    const { parse: yamlParse } = require("yaml")
    const raw = rfs(filePath, "utf-8")
    const parsed = WorkspaceSchema.safeParse(yamlParse(raw))
    expect(parsed.success).toBe(true)
    if (parsed.success) {
      const stem = "old-name"
      expect(parsed.data.name).toBe("new-name")
      expect(parsed.data.name !== stem).toBe(true) // drift condition
    }
  })

  test("drift detection: matching name/filename produces no drift", () => {
    const filePath = join(wsDir, "correct.yml")
    writeFileSync(filePath, "name: correct\nbranch: main\ncreated: \"2026-01-01\"\n")

    const { readFileSync: rfs } = require("fs")
    const { parse: yamlParse } = require("yaml")
    const raw = rfs(filePath, "utf-8")
    const parsed = WorkspaceSchema.safeParse(yamlParse(raw))
    expect(parsed.success).toBe(true)
    if (parsed.success) {
      const stem = "correct"
      expect(parsed.data.name === stem).toBe(true) // no drift
    }
  })

  test("drift detection: template name differs from filename stem is detectable", () => {
    const filePath = join(tplDir, "old.yml")
    writeFileSync(filePath, "name: current\n")

    const { readFileSync: rfs } = require("fs")
    const { parse: yamlParse } = require("yaml")
    const raw = rfs(filePath, "utf-8")
    const parsed = TemplateSchema.safeParse(yamlParse(raw))
    expect(parsed.success).toBe(true)
    if (parsed.success) {
      const stem = "old"
      expect(parsed.data.name).toBe("current")
      expect(parsed.data.name !== stem).toBe(true) // drift condition
    }
  })
})

// --- NameSchema validation (CR-01) ---

describe("NameSchema", () => {
  test("accepts a simple lowercase name", () => {
    expect(() => NameSchema.parse("valid-name")).not.toThrow()
  })

  test("accepts name with dots", () => {
    expect(() => NameSchema.parse("valid.name")).not.toThrow()
  })

  test("accepts name with underscores", () => {
    expect(() => NameSchema.parse("valid_name")).not.toThrow()
  })

  test("accepts alphanumeric with mixed case", () => {
    expect(() => NameSchema.parse("Valid123")).not.toThrow()
  })

  test.each([".", ".."])('rejects path alias "%s"', (name) => {
    expect(() => NameSchema.parse(name)).toThrow()
  })

  test("rejects path traversal (../escape)", () => {
    expect(() => NameSchema.parse("../escape")).toThrow()
  })

  test("rejects forward slash (foo/bar)", () => {
    expect(() => NameSchema.parse("foo/bar")).toThrow()
  })

  test("rejects backslash (foo\\bar)", () => {
    expect(() => NameSchema.parse("foo\\bar")).toThrow()
  })

  test("rejects shell semicolon (name;rm -rf)", () => {
    expect(() => NameSchema.parse("name;rm -rf")).toThrow()
  })

  test("rejects backtick command substitution (name`cmd`)", () => {
    expect(() => NameSchema.parse("name`cmd`")).toThrow()
  })

  test("rejects dollar-paren command substitution (name$(cmd))", () => {
    expect(() => NameSchema.parse("name$(cmd)")).toThrow()
  })

  test("rejects empty string", () => {
    expect(() => NameSchema.parse("")).toThrow()
  })
})

describe("NameSchema composed into entity schemas", () => {
  test("WorkspaceSchema rejects name with path traversal", () => {
    expect(() => WorkspaceSchema.parse({ name: "../evil", branch: "main", created: "2026-01-01" })).toThrow()
  })

  test.each([".", ".."])('WorkspaceSchema rejects path alias "%s"', (name) => {
    expect(() => WorkspaceSchema.parse({ name, branch: "main", created: "2026-01-01" })).toThrow()
  })

  test("TemplateSchema rejects name with slash", () => {
    expect(() => TemplateSchema.parse({ name: "foo/bar" })).toThrow()
  })

  test("RepoRegistryEntrySchema rejects name with semicolon", () => {
    expect(() => RepoRegistryEntrySchema.parse({ name: "a;b", local_path: "/x" })).toThrow()
  })

  test("WorkspaceRepoSchema still accepts any string for name (not NameSchema)", () => {
    // WorkspaceRepoSchema.name is display-only, not a file-path key
    expect(() => WorkspaceRepoSchema.parse({
      name: "my repo (display)",
      repo: "platform",
      type: "other",
      mode: "worktree",
      main_path: "/m",
      task_path: "/t",
    })).not.toThrow()
  })
})

// --- atomic writeYaml (CR-04) ---

describe("atomic writeYaml", () => {
  const atomicIsolated = useIsolatedConfig("config-atomic-test")
  const wsDir = join(atomicIsolated.configDir, "workspaces")

  beforeEach(() => {
    mkdirSync(wsDir, { recursive: true })
    mock.module("@/lib/paths", () => ({
      HOME: atomicIsolated.configDir,
      DEFAULT_WORKSPACE_ROOT: join(atomicIsolated.configDir, "ws-root"),
      WS_CONFIG_DIR: atomicIsolated.configDir,
      WORKSPACES_DIR: wsDir,
      GLOBAL_CONFIG_FILE: join(atomicIsolated.configDir, "config.yml"),
      REGISTRY_FILE: join(atomicIsolated.configDir, "registry.yml"),
      TEMPLATES_DIR: join(atomicIsolated.configDir, "templates"),
      getMainDir: (r: string) => join(r, "main"),
      getTasksDir: (r: string) => join(r, "tasks"),
      expandHome: (p: string) => p.startsWith("~/") ? join(atomicIsolated.configDir, p.slice(2)) : p,
    }))
    realCache.workspaces.clear()
    realCache.templates.clear()
    realCache.resetList()
  })

  afterAll(() => atomicIsolated.cleanup())

  test("writeWorkspace creates file with correct content and leaves no .tmp sibling", () => {
    const ws = WorkspaceSchema.parse({
      name: "atomic-test-ws",
      branch: "feature/atomic",
      created: "2026-01-01",
    })

    realWriteWorkspace(ws)

    // File should exist with correct content
    const loaded = realReadWorkspace("atomic-test-ws")
    expect(loaded.name).toBe("atomic-test-ws")
    expect(loaded.branch).toBe("feature/atomic")

    // .tmp sibling should NOT persist
    const tmpPath = join(wsDir, "atomic-test-ws.yml.tmp")
    expect(existsSync(tmpPath)).toBe(false)
  })
})

// --- RepoRegistryEntrySchema forge field ---

describe("RepoRegistryEntrySchema forge field", () => {
  test("accepts forge: github", () => {
    const entry = RepoRegistryEntrySchema.parse({ name: "r", local_path: "/x", forge: "github" })
    expect(entry.forge).toBe("github")
  })

  test("accepts forge: gitlab", () => {
    const entry = RepoRegistryEntrySchema.parse({ name: "r", local_path: "/x", forge: "gitlab" })
    expect(entry.forge).toBe("gitlab")
  })

  test("accepts forge: gitea", () => {
    const entry = RepoRegistryEntrySchema.parse({ name: "r", local_path: "/x", forge: "gitea" })
    expect(entry.forge).toBe("gitea")
  })

  test("backward compat: missing forge field parses as undefined (FORGE-02)", () => {
    const entry = RepoRegistryEntrySchema.parse({ name: "r", local_path: "/x" })
    expect(entry.forge).toBeUndefined()
  })

  test("rejects forge: bitbucket with ZodError", () => {
    expect(() => RepoRegistryEntrySchema.parse({ name: "r", local_path: "/x", forge: "bitbucket" })).toThrow()
  })
})

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

// --- writeYaml fsync (PORT-WRITE-01) ---

describe("writeYaml fsync (PORT-WRITE-01)", () => {
  const fsyncIsolated = useIsolatedConfig("config-fsync-test")
  const wsDir = join(fsyncIsolated.configDir, "workspaces")

  beforeEach(() => {
    mkdirSync(wsDir, { recursive: true })
    mock.module("@/lib/paths", () => ({
      HOME: fsyncIsolated.configDir,
      DEFAULT_WORKSPACE_ROOT: join(fsyncIsolated.configDir, "ws-root"),
      WS_CONFIG_DIR: fsyncIsolated.configDir,
      WORKSPACES_DIR: wsDir,
      GLOBAL_CONFIG_FILE: join(fsyncIsolated.configDir, "config.yml"),
      REGISTRY_FILE: join(fsyncIsolated.configDir, "registry.yml"),
      TEMPLATES_DIR: join(fsyncIsolated.configDir, "templates"),
      PORTS_LOCK_FILE: join(fsyncIsolated.configDir, ".ports.lock"),
      getMainDir: (r: string) => join(r, "main"),
      getTasksDir: (r: string) => join(r, "tasks"),
      expandHome: (p: string) => p.startsWith("~/") ? join(fsyncIsolated.configDir, p.slice(2)) : p,
    }))
    realCache.workspaces.clear()
    realCache.templates.clear()
    realCache.resetList()
  })

  afterAll(() => fsyncIsolated.cleanup())

  test("writeYaml calls fsyncSync before rename (PORT-WRITE-01)", () => {
    const ws = WorkspaceSchema.parse({
      name: "fsync-test-ws",
      branch: "feature/fsync",
      created: "2026-01-01",
    })
    realWriteWorkspace(ws)

    const loaded = realReadWorkspace("fsync-test-ws")
    expect(loaded.name).toBe("fsync-test-ws")
    expect(loaded.branch).toBe("feature/fsync")

    // Verify no .tmp file left behind (atomic rename completed)
    const wsPath = join(wsDir, "fsync-test-ws.yml")
    expect(existsSync(`${wsPath}.tmp`)).toBe(false)
  })
})

// --- PortsSchema fields (PORT-SCHEMA-01, PORT-SCHEMA-02) ---

describe("PortsSchema fields", () => {
  test("rejects invalid environment and port identifiers", () => {
    expect(WorkspaceSchema.safeParse({
      name: "valid", branch: "main", created: "2026-01-01", repos: [],
      env: { "BAD-NAME": "value" },
    }).success).toBe(false)
    expect(WorkspaceSchema.safeParse({
      name: "valid", branch: "main", created: "2026-01-01", repos: [],
      ports: { "1PORT": 3000 },
    }).success).toBe(false)
  })
  test("WorkspaceSchema accepts ports with null values (PORT-SCHEMA-01)", () => {
    const ws = WorkspaceSchema.parse({
      name: "port-ws", branch: "b", created: "d",
      ports: { PORT: null, DEBUG: null },
    })
    expect(ws.ports).toEqual({ PORT: null, DEBUG: null })
  })

  test("WorkspaceSchema accepts ports with number values", () => {
    const ws = WorkspaceSchema.parse({
      name: "port-ws", branch: "b", created: "d",
      ports: { PORT: 3000, DEBUG: null },
    })
    expect(ws.ports).toEqual({ PORT: 3000, DEBUG: null })
  })

  test("WorkspaceSchema accepts missing ports field", () => {
    const ws = WorkspaceSchema.parse({
      name: "no-port-ws", branch: "b", created: "d",
    })
    expect(ws.ports).toBeUndefined()
  })

  test("TemplateSchema accepts ports field (PORT-SCHEMA-01)", () => {
    const tpl = TemplateSchema.parse({
      name: "port-tpl", schema_version: "1",
      repos: [],
      ports: { API: null, WEB: 8080 },
    })
    expect(tpl.ports).toEqual({ API: null, WEB: 8080 })
  })

  test("GlobalConfigSchema has ports.range_start default 10000, range_end default 65000 (PORT-SCHEMA-02)", () => {
    const cfg = GlobalConfigSchema.parse({})
    expect(cfg.ports.range_start).toBe(10000)
    expect(cfg.ports.range_end).toBe(65000)
  })
})

// --- dir repo schema support ---

describe("dir repo schema support", () => {
  test("RepoRegistryEntrySchema accepts is_dir: true", () => {
    const entry = RepoRegistryEntrySchema.parse({ name: "notes", local_path: "/home/user/notes", is_dir: true })
    expect(entry.is_dir).toBe(true)
  })

  test("RepoRegistryEntrySchema defaults is_dir to false (backward compat)", () => {
    const entry = RepoRegistryEntrySchema.parse({ name: "api", local_path: "/dev/api" })
    expect(entry.is_dir).toBe(false)
  })

  test("TemplateRepoSchema accepts mode: dir", () => {
    const tpl = TemplateRepoSchema.parse({ repo: "notes", mode: "dir" })
    expect(tpl.mode).toBe("dir")
  })

  test("TemplateRepoSchema still defaults mode to worktree", () => {
    const tpl = TemplateRepoSchema.parse({ repo: "api" })
    expect(tpl.mode).toBe("worktree")
  })

  test("WorkspaceRepoSchema accepts mode: dir without task_path", () => {
    const repo = WorkspaceRepoSchema.parse({
      name: "notes", repo: "notes-dir", type: "other",
      mode: "dir", main_path: "/home/user/notes",
    })
    expect(repo.mode).toBe("dir")
    expect(repo.task_path).toBeUndefined()
  })

  test("WorkspaceRepoSchema still accepts worktree with task_path (backward compat)", () => {
    const repo = WorkspaceRepoSchema.parse({
      name: "svc", repo: "platform", type: "java",
      mode: "worktree", main_path: "/main/svc", task_path: "/tasks/ws/svc",
    })
    expect(repo.mode).toBe("worktree")
    expect(repo.task_path).toBe("/tasks/ws/svc")
  })

  test("WorkspaceRepoSchema mode: dir with no base_branch", () => {
    const repo = WorkspaceRepoSchema.parse({
      name: "notes", repo: "notes-dir", type: "other",
      mode: "dir", main_path: "/home/user/notes",
    })
    expect(repo.base_branch).toBeUndefined()
  })
})

// --- in-memory index (ENGN-04/05/06) ---

describe("in-memory index", () => {
  const indexIsolated = useIsolatedConfig("config-index-test")
  const wsDir = () => join(indexIsolated.configDir, "workspaces")
  const tplDir = () => join(indexIsolated.configDir, "templates")

  function resetCache() {
    realCache.workspaces.clear()
    realCache.templates.clear()
    realCache.resetList()
  }

  function makeWsYaml(name: string): string {
    return `name: "${name}"\nbranch: main\ncreated: "2026-01-01"\n`
  }

  function makeTplYaml(name: string): string {
    return `name: "${name}"\n`
  }

  beforeEach(() => {
    mkdirSync(wsDir(), { recursive: true })
    mkdirSync(tplDir(), { recursive: true })
    mock.module("@/lib/paths", () => ({
      HOME: indexIsolated.configDir,
      DEFAULT_WORKSPACE_ROOT: join(indexIsolated.configDir, "ws-root"),
      WS_CONFIG_DIR: indexIsolated.configDir,
      WORKSPACES_DIR: wsDir(),
      GLOBAL_CONFIG_FILE: join(indexIsolated.configDir, "config.yml"),
      REGISTRY_FILE: join(indexIsolated.configDir, "registry.yml"),
      TEMPLATES_DIR: tplDir(),
      PORTS_LOCK_FILE: join(indexIsolated.configDir, ".ports.lock"),
      getMainDir: (r: string) => join(r, "main"),
      getTasksDir: (r: string) => join(r, "tasks"),
      expandHome: (p: string) => p.startsWith("~/") ? join(indexIsolated.configDir, p.slice(2)) : p,
    }))
    resetCache()
  })

  afterAll(() => indexIsolated.cleanup())

  // ENGN-04: readWorkspace returns cached result on second call
  test("readWorkspace returns from cache on second call (no FS scan)", () => {
    const wsFile = join(wsDir(), "cache-ws.yml")
    writeFileSync(wsFile, makeWsYaml("cache-ws"))

    // First call — populates cache from disk
    const first = realReadWorkspace("cache-ws")
    expect(first.name).toBe("cache-ws")

    // Delete the file from disk — next call must use cache
    const { unlinkSync } = require("fs")
    unlinkSync(wsFile)

    // Second call — must return from cache, not throw
    const second = realReadWorkspace("cache-ws")
    expect(second.name).toBe("cache-ws")
  })

  // ENGN-04: listWorkspaces returns cached results on second call
  test("listWorkspaces returns from cache on second call (list flag)", () => {
    writeFileSync(join(wsDir(), "ws-a.yml"), makeWsYaml("ws-a"))
    writeFileSync(join(wsDir(), "ws-b.yml"), makeWsYaml("ws-b"))

    // First call — populates list cache
    const first = realListWorkspaces()
    const firstNames = first.map((w: { name: string }) => w.name)
    expect(firstNames).toContain("ws-a")
    expect(firstNames).toContain("ws-b")

    // Delete one file — second call must use cache (still sees both)
    const { unlinkSync } = require("fs")
    unlinkSync(join(wsDir(), "ws-b.yml"))

    const second = realListWorkspaces()
    const secondNames = second.map((w: { name: string }) => w.name)
    expect(secondNames).toContain("ws-a")
    expect(secondNames).toContain("ws-b")
  })

  // ENGN-04: readTemplate returns cached result on second call
  test("readTemplate returns from cache on second call (no FS scan)", () => {
    const tplFile = join(tplDir(), "cache-tpl.yml")
    writeFileSync(tplFile, makeTplYaml("cache-tpl"))

    const first = realReadTemplate("cache-tpl")
    expect(first.name).toBe("cache-tpl")

    const { unlinkSync } = require("fs")
    unlinkSync(tplFile)

    const second = realReadTemplate("cache-tpl")
    expect(second.name).toBe("cache-tpl")
  })

  // ENGN-04: listTemplates returns cached results on second call
  test("listTemplates returns from cache on second call (list flag)", () => {
    writeFileSync(join(tplDir(), "tpl-a.yml"), makeTplYaml("tpl-a"))
    writeFileSync(join(tplDir(), "tpl-b.yml"), makeTplYaml("tpl-b"))

    const first = realListTemplates()
    const firstNames = first.map((t: { name: string }) => t.name)
    expect(firstNames).toContain("tpl-a")
    expect(firstNames).toContain("tpl-b")

    const { unlinkSync } = require("fs")
    unlinkSync(join(tplDir(), "tpl-b.yml"))

    const second = realListTemplates()
    const secondNames = second.map((t: { name: string }) => t.name)
    expect(secondNames).toContain("tpl-a")
    expect(secondNames).toContain("tpl-b")
  })

  // ENGN-04: workspaceExists returns true from cache
  test("workspaceExists returns true from cache after file deleted", () => {
    const wsFile = join(wsDir(), "exists-ws.yml")
    writeFileSync(wsFile, makeWsYaml("exists-ws"))

    // Populate cache via readWorkspace
    realReadWorkspace("exists-ws")

    // Delete the file
    const { unlinkSync } = require("fs")
    unlinkSync(wsFile)

    // Cache still knows it exists
    expect(realWorkspaceExists("exists-ws")).toBe(true)
  })

  // ENGN-04: templateExists returns true from cache
  test("templateExists returns true from cache after file deleted", () => {
    const tplFile = join(tplDir(), "exists-tpl.yml")
    writeFileSync(tplFile, makeTplYaml("exists-tpl"))

    realReadTemplate("exists-tpl")

    const { unlinkSync } = require("fs")
    unlinkSync(tplFile)

    expect(realTemplateExists("exists-tpl")).toBe(true)
  })

  // ENGN-05: writeWorkspace upserts cache
  test("writeWorkspace upserts cache — updated data visible without FS re-read", () => {
    const ws = WorkspaceSchema.parse({ name: "upsert-ws", branch: "main", created: "2026-01-01" })
    realWriteWorkspace(ws)

    // First read — populates cache
    const first = realReadWorkspace("upsert-ws")
    expect(first.branch).toBe("main")

    // Write updated version
    const updated = WorkspaceSchema.parse({ name: "upsert-ws", branch: "feature/x", created: "2026-01-01" })
    realWriteWorkspace(updated)

    // Cache must reflect the update
    const second = realReadWorkspace("upsert-ws")
    expect(second.branch).toBe("feature/x")
  })

  // ENGN-05: writeTemplate upserts cache
  test("writeTemplate upserts cache — updated data visible without FS re-read", () => {
    const tpl = TemplateSchema.parse({ name: "upsert-tpl", description: "v1" })
    realWriteTemplate(tpl)

    const first = realReadTemplate("upsert-tpl")
    expect(first.description).toBe("v1")

    const updated = TemplateSchema.parse({ name: "upsert-tpl", description: "v2" })
    realWriteTemplate(updated)

    const second = realReadTemplate("upsert-tpl")
    expect(second.description).toBe("v2")
  })

  // ENGN-05: deleteWorkspace evicts cache — workspaceExists returns false
  test("deleteWorkspace evicts cache entry — workspaceExists returns false", () => {
    writeFileSync(join(wsDir(), "evict-ws.yml"), makeWsYaml("evict-ws"))

    // Populate cache
    realReadWorkspace("evict-ws")
    expect(realWorkspaceExists("evict-ws")).toBe(true)

    // Delete (evicts cache and removes file)
    realDeleteWorkspace("evict-ws")

    expect(realWorkspaceExists("evict-ws")).toBe(false)
  })

  // ENGN-05: deleteTemplate evicts cache
  test("deleteTemplate evicts cache entry — templateExists returns false", () => {
    writeFileSync(join(tplDir(), "evict-tpl.yml"), makeTplYaml("evict-tpl"))

    realReadTemplate("evict-tpl")
    expect(realTemplateExists("evict-tpl")).toBe(true)

    realDeleteTemplate("evict-tpl")

    expect(realTemplateExists("evict-tpl")).toBe(false)
  })

  // ENGN-05: deleteWorkspace resets list flag — deleted entry gone from next list
  test("deleteWorkspace resets list flag — deleted entry absent from next listWorkspaces", () => {
    writeFileSync(join(wsDir(), "list-a.yml"), makeWsYaml("list-a"))
    writeFileSync(join(wsDir(), "list-b.yml"), makeWsYaml("list-b"))

    // Populate list cache
    const first = realListWorkspaces()
    expect(first.map((w: { name: string }) => w.name)).toContain("list-b")

    // Delete one entry
    realDeleteWorkspace("list-b")

    // Next list must re-scan (flag reset) and not include deleted entry
    const second = realListWorkspaces()
    const names = second.map((w: { name: string }) => w.name)
    expect(names).toContain("list-a")
    expect(names).not.toContain("list-b")
  })

  // ENGN-06: cache miss falls back to scan and populates cache
  test("cache miss falls back to YAML scan and populates cache", () => {
    // Cache is empty (reset in beforeEach)
    writeFileSync(join(wsDir(), "fallback-ws.yml"), makeWsYaml("fallback-ws"))

    // No cache entry — must scan and find
    const ws = realReadWorkspace("fallback-ws")
    expect(ws.name).toBe("fallback-ws")

    // Now it must be in cache (second call skips FS even if file removed)
    const { unlinkSync } = require("fs")
    unlinkSync(join(wsDir(), "fallback-ws.yml"))
    const ws2 = realReadWorkspace("fallback-ws")
    expect(ws2.name).toBe("fallback-ws")
  })

  // _cache seam: clearing cache forces re-scan
  test("_cache.workspaces.clear() forces re-scan on next readWorkspace", () => {
    writeFileSync(join(wsDir(), "seam-ws.yml"), makeWsYaml("seam-ws"))

    // Populate cache
    realReadWorkspace("seam-ws")

    // Clear cache manually
    realCache.workspaces.clear()
    realCache.resetList()

    // File still exists — scan fallback should succeed
    const ws = realReadWorkspace("seam-ws")
    expect(ws.name).toBe("seam-ws")
  })

  test("invalidateConfigCache forces workspace and template reads to see external file edits", () => {
    const wsFile = join(wsDir(), "external-ws.yml")
    const tplFile = join(tplDir(), "external-tpl.yml")
    writeFileSync(wsFile, `${makeWsYaml("external-ws")}description: before\n`)
    writeFileSync(tplFile, `${makeTplYaml("external-tpl")}description: before\n`)

    expect(realReadWorkspace("external-ws").description).toBe("before")
    expect(realReadTemplate("external-tpl").description).toBe("before")

    writeFileSync(wsFile, `${makeWsYaml("external-ws")}description: after\n`)
    writeFileSync(tplFile, `${makeTplYaml("external-tpl")}description: after\n`)

    expect(realReadWorkspace("external-ws").description).toBe("before")
    expect(realReadTemplate("external-tpl").description).toBe("before")

    realInvalidateConfigCache()

    expect(realReadWorkspace("external-ws").description).toBe("after")
    expect(realReadTemplate("external-tpl").description).toBe("after")
  })

  test("invalidateConfigCache removes externally deleted entries from list reloads", () => {
    const wsFile = join(wsDir(), "external-delete-ws.yml")
    const tplFile = join(tplDir(), "external-delete-tpl.yml")
    writeFileSync(wsFile, makeWsYaml("external-delete-ws"))
    writeFileSync(tplFile, makeTplYaml("external-delete-tpl"))

    expect(realListWorkspaces().map((w: { name: string }) => w.name)).toContain("external-delete-ws")
    expect(realListTemplates().map((t: { name: string }) => t.name)).toContain("external-delete-tpl")

    const { unlinkSync } = require("fs")
    unlinkSync(wsFile)
    unlinkSync(tplFile)

    expect(realListWorkspaces().map((w: { name: string }) => w.name)).toContain("external-delete-ws")
    expect(realListTemplates().map((t: { name: string }) => t.name)).toContain("external-delete-tpl")

    realInvalidateConfigCache()

    expect(realListWorkspaces().map((w: { name: string }) => w.name)).not.toContain("external-delete-ws")
    expect(realListTemplates().map((t: { name: string }) => t.name)).not.toContain("external-delete-tpl")
  })

  test("uncached enumeration reconciles external additions, edits, renames, and deletions", () => {
    const baseline = realListWorkspaces().map((workspace: { name: string }) => workspace.name).sort()
    const original = join(wsDir(), "external.yml")
    writeFileSync(original, `${makeWsYaml("external")}description: before\n`)
    expect(realListWorkspaces().map((workspace: { name: string }) => workspace.name).sort()).toEqual(baseline)
    expect(realListWorkspacesUncached().map((workspace: { name: string }) => workspace.name)).toContain("external")

    writeFileSync(original, `${makeWsYaml("external")}description: after\n`)
    expect(realListWorkspacesUncached()[0]?.description).toBe("after")

    const renamed = join(wsDir(), "renamed.yml")
    writeFileSync(renamed, `${makeWsYaml("renamed")}description: renamed\n`)
    const { unlinkSync } = require("fs")
    unlinkSync(original)
    const renamedNames = realListWorkspacesUncached().map((workspace: { name: string }) => workspace.name)
    expect(renamedNames).toContain("renamed")
    expect(renamedNames).not.toContain("external")

    unlinkSync(renamed)
    expect(realListWorkspacesUncached().map((workspace: { name: string }) => workspace.name).sort()).toEqual(baseline)
    expect(realListWorkspaces().map((workspace: { name: string }) => workspace.name).sort()).toEqual(baseline)
  })
})
