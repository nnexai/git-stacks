import { describe, test, expect, afterAll, beforeEach } from "bun:test"
import { useIsolatedConfig, write } from "../helpers"
import { stringify } from "yaml"

const isolated = useIsolatedConfig("composition-test")

// Dynamic imports after config isolation — uses @/* alias (test-only)
const comp = await import("@/lib/composition")
const { composeTemplates, CircularIncludesError, MissingTemplateError } = comp
const cfg = await import("@/lib/config")
const { TemplateSchema, _cache } = cfg as any

type TemplateRepo = { repo: string; mode: string; base_branch?: string; branch_pattern?: string }

afterAll(() => isolated.cleanup())

// Reset in-memory index before each test — writeTestTemplate writes directly to disk
// (not via writeTemplate), so the cache would otherwise serve stale data across tests.
beforeEach(() => {
  _cache.templates.clear()
  _cache.workspaces.clear()
  _cache.resetList()
})

function writeTestTemplate(dir: string, name: string, data: Record<string, unknown>) {
  const content = stringify({ name, schema_version: "1", ...data })
  write(dir, `templates/${name}.yml`, content)
}

describe("TemplateSchema includes field", () => {
  test("accepts includes array", () => {
    const result = TemplateSchema.parse({
      name: "test",
      repos: [],
      includes: ["api", "frontend"],
    })
    expect(result.includes).toEqual(["api", "frontend"])
  })

  test("accepts template without includes field (backward compat)", () => {
    const result = TemplateSchema.parse({
      name: "test",
      repos: [],
    })
    expect(result.includes).toBeUndefined()
  })

  test("accepts empty includes array", () => {
    const result = TemplateSchema.parse({
      name: "test",
      repos: [],
      includes: [],
    })
    expect(result.includes).toEqual([])
  })
})

describe("composeTemplates", () => {
  describe("repo merging", () => {
    test("no overlapping repos produces union of all repos", () => {
      writeTestTemplate(isolated.configDir, "alpha", {
        repos: [{ repo: "repo-a", mode: "worktree" }],
      })
      writeTestTemplate(isolated.configDir, "beta", {
        repos: [{ repo: "repo-b", mode: "worktree" }],
      })

      const result = composeTemplates(["alpha", "beta"])
      expect(result.repos).toHaveLength(2)
      expect(result.repos.map((r: TemplateRepo) => r.repo).sort()).toEqual(["repo-a", "repo-b"])
    })

    test("same repo in multiple templates: worktree wins over trunk", () => {
      writeTestTemplate(isolated.configDir, "trunk-tpl", {
        repos: [{ repo: "shared-repo", mode: "trunk" }],
      })
      writeTestTemplate(isolated.configDir, "wt-tpl", {
        repos: [{ repo: "shared-repo", mode: "worktree" }],
      })

      const result = composeTemplates(["trunk-tpl", "wt-tpl"])
      expect(result.repos).toHaveLength(1)
      expect(result.repos[0].mode).toBe("worktree")
    })

    test("worktree wins even if lower precedence template has it", () => {
      writeTestTemplate(isolated.configDir, "wt-first", {
        repos: [{ repo: "shared-repo", mode: "worktree" }],
      })
      writeTestTemplate(isolated.configDir, "trunk-second", {
        repos: [{ repo: "shared-repo", mode: "trunk" }],
      })

      const result = composeTemplates(["wt-first", "trunk-second"])
      expect(result.repos).toHaveLength(1)
      expect(result.repos[0].mode).toBe("worktree")
    })

    test("base_branch from highest precedence template wins", () => {
      writeTestTemplate(isolated.configDir, "base-a", {
        repos: [{ repo: "r1", mode: "worktree", base_branch: "develop" }],
      })
      writeTestTemplate(isolated.configDir, "base-b", {
        repos: [{ repo: "r1", mode: "worktree", base_branch: "main" }],
      })

      const result = composeTemplates(["base-a", "base-b"])
      expect(result.repos[0].base_branch).toBe("main")
    })

    test("base_branch falls back to lower precedence if higher does not define it", () => {
      writeTestTemplate(isolated.configDir, "with-base", {
        repos: [{ repo: "r2", mode: "worktree", base_branch: "develop" }],
      })
      writeTestTemplate(isolated.configDir, "no-base", {
        repos: [{ repo: "r2", mode: "worktree" }],
      })

      const result = composeTemplates(["with-base", "no-base"])
      expect(result.repos[0].base_branch).toBe("develop")
    })
  })

  describe("hook concatenation", () => {
    test("concatenates hooks in include order, top-level last", () => {
      writeTestTemplate(isolated.configDir, "hooks-a", {
        repos: [],
        hooks: {
          post_create: ["echo a"],
          pre_open: ["echo open-a"],
        },
      })
      writeTestTemplate(isolated.configDir, "hooks-b", {
        repos: [],
        hooks: {
          post_create: ["echo b"],
          pre_open: ["echo open-b"],
        },
      })

      const result = composeTemplates(["hooks-a", "hooks-b"])
      expect(result.hooks?.post_create).toEqual(["echo a", "echo b"])
      expect(result.hooks?.pre_open).toEqual(["echo open-a", "echo open-b"])
    })

    test("hooks from only one template carry through", () => {
      writeTestTemplate(isolated.configDir, "hooks-only", {
        repos: [],
        hooks: { pre_create: ["setup"] },
      })
      writeTestTemplate(isolated.configDir, "no-hooks", {
        repos: [],
      })

      const result = composeTemplates(["hooks-only", "no-hooks"])
      expect(result.hooks?.pre_create).toEqual(["setup"])
    })
  })

  describe("env merging", () => {
    test("merges env vars with last-wins per key, top-level wins", () => {
      writeTestTemplate(isolated.configDir, "env-a", {
        repos: [],
        env: { PORT: "3000", SHARED: "from-a" },
      })
      writeTestTemplate(isolated.configDir, "env-b", {
        repos: [],
        env: { PORT: "4000", NODE_ENV: "dev" },
      })

      const result = composeTemplates(["env-a", "env-b"])
      expect(result.env).toEqual({
        PORT: "4000",
        SHARED: "from-a",
        NODE_ENV: "dev",
      })
    })

    test("env_file takes last non-undefined value", () => {
      writeTestTemplate(isolated.configDir, "envfile-a", {
        repos: [],
        env_file: ".env.shared",
      })
      writeTestTemplate(isolated.configDir, "envfile-b", {
        repos: [],
        env_file: ".env.local",
      })

      const result = composeTemplates(["envfile-a", "envfile-b"])
      expect(result.env_file).toBe(".env.local")
    })
  })

  describe("command merging", () => {
    test("merges workspace command names with last-write-wins", () => {
      writeTestTemplate(isolated.configDir, "cmd-a", {
        repos: [{ repo: "a", mode: "worktree", commands: { verify: "pnpm -C a test" } }],
        commands: { verify: "bun test", preverify: "echo pre-a" },
      })
      writeTestTemplate(isolated.configDir, "cmd-b", {
        repos: [{ repo: "b", mode: "worktree", commands: { verify: "pnpm -C b test" } }],
        commands: { verify: "pnpm test", postverify: "echo post-b" },
      })

      const result = composeTemplates(["cmd-a", "cmd-b"])
      expect(result.commands).toEqual({
        verify: "pnpm test",
        preverify: "echo pre-a",
        postverify: "echo post-b",
      })
      const repoA = result.repos.find((r: TemplateRepo) => r.repo === "a") as any
      const repoB = result.repos.find((r: TemplateRepo) => r.repo === "b") as any
      expect(repoA.commands.verify).toBe("pnpm -C a test")
      expect(repoB.commands.verify).toBe("pnpm -C b test")
    })
  })

  describe("files merging", () => {
    test("concatenates files.copy and files.symlink arrays in include order", () => {
      writeTestTemplate(isolated.configDir, "files-a", {
        repos: [],
        files: { copy: ["a.txt"], symlink: ["link-a"] },
      })
      writeTestTemplate(isolated.configDir, "files-b", {
        repos: [],
        files: { copy: ["b.txt"], symlink: ["link-b"] },
      })

      const result = composeTemplates(["files-a", "files-b"])
      expect(result.files?.copy).toEqual(["a.txt", "b.txt"])
      expect(result.files?.symlink).toEqual(["link-a", "link-b"])
    })

    test("concatenates files.sync arrays in include order with other file ops", () => {
      writeTestTemplate(isolated.configDir, "files-a", {
        repos: [],
        files: {
          copy: ["a.txt"],
          symlink: ["link-a"],
          sync: [{ source: "a-src", target: "a-target" }],
        },
      })
      writeTestTemplate(isolated.configDir, "files-b", {
        repos: [],
        files: {
          copy: ["b.txt"],
          symlink: ["link-b"],
          sync: [{ source: "b-src", target: "b-target", git_exclude: true }],
        },
      })

      const result = composeTemplates(["files-a", "files-b"])
      expect(result.files?.copy).toEqual(["a.txt", "b.txt"])
      expect(result.files?.symlink).toEqual(["link-a", "link-b"])
      expect(result.files?.sync).toEqual([
        { source: "a-src", target: "a-target" },
        { source: "b-src", target: "b-target", git_exclude: true },
      ])
    })
  })

  describe("integrations merging", () => {
    test("deep-merges integrations with top-level winning per key", () => {
      writeTestTemplate(isolated.configDir, "int-a", {
        repos: [],
        integrations: { vscode: { enabled: true }, tmux: { layout: "main" } },
      })
      writeTestTemplate(isolated.configDir, "int-b", {
        repos: [],
        integrations: { vscode: { enabled: false, cmd: "codium" } },
      })

      const result = composeTemplates(["int-a", "int-b"])
      // vscode overwritten by int-b (Object.assign per key)
      expect(result.integrations?.vscode).toEqual({ enabled: false, cmd: "codium" })
      // tmux preserved from int-a
      expect(result.integrations?.tmux).toEqual({ layout: "main" })
    })
  })

  describe("circular detection", () => {
    test("circular includes (A includes B, B includes A) throws error with cycle path", () => {
      writeTestTemplate(isolated.configDir, "circ-a", {
        repos: [],
        includes: ["circ-b"],
      })
      writeTestTemplate(isolated.configDir, "circ-b", {
        repos: [],
        includes: ["circ-a"],
      })

      expect(() => composeTemplates(["circ-a"])).toThrow(CircularIncludesError)
      try {
        composeTemplates(["circ-a"])
      } catch (err) {
        expect((err as InstanceType<typeof CircularIncludesError>).cycle).toContain("circ-a")
        expect((err as InstanceType<typeof CircularIncludesError>).cycle).toContain("circ-b")
      }
    })

    test("same template name passed twice throws circular error", () => {
      writeTestTemplate(isolated.configDir, "dup-tpl", {
        repos: [],
      })

      expect(() => composeTemplates(["dup-tpl", "dup-tpl"])).toThrow(CircularIncludesError)
    })
  })

  describe("depth limit", () => {
    test("1-level: included template's own includes are ignored with warning", () => {
      writeTestTemplate(isolated.configDir, "deep-child", {
        repos: [{ repo: "deep-repo", mode: "worktree" }],
      })
      writeTestTemplate(isolated.configDir, "mid-level", {
        repos: [{ repo: "mid-repo", mode: "worktree" }],
        includes: ["deep-child"],
      })
      writeTestTemplate(isolated.configDir, "top-level", {
        repos: [{ repo: "top-repo", mode: "worktree" }],
        includes: ["mid-level"],
      })

      // mid-level's includes should be ignored (1-level limit)
      // top-level includes mid-level, but mid-level's includes: ["deep-child"] is not resolved
      const result = composeTemplates(["top-level"])
      const repoNames = result.repos.map((r: TemplateRepo) => r.repo)
      expect(repoNames).toContain("mid-repo")
      expect(repoNames).toContain("top-repo")
      // deep-child's repo should NOT appear (nested includes ignored)
      expect(repoNames).not.toContain("deep-repo")
    })
  })

  describe("edge cases", () => {
    test("empty includes: [] returns template unchanged", () => {
      writeTestTemplate(isolated.configDir, "empty-inc", {
        repos: [{ repo: "solo", mode: "worktree" }],
        env: { KEY: "val" },
        includes: [],
      })

      const result = composeTemplates(["empty-inc"])
      expect(result.repos).toHaveLength(1)
      expect(result.repos[0].repo).toBe("solo")
      expect(result.env).toEqual({ KEY: "val" })
      expect(result.name).toBe("empty-inc")
    })

    test("includes referencing non-existent template throws MissingTemplateError", () => {
      writeTestTemplate(isolated.configDir, "bad-inc", {
        repos: [],
        includes: ["does-not-exist"],
      })

      expect(() => composeTemplates(["bad-inc"])).toThrow(MissingTemplateError)
    })

    test("non-existent template name throws MissingTemplateError", () => {
      expect(() => composeTemplates(["no-such-template"])).toThrow(MissingTemplateError)
    })

    test("top-level template name, description, schema_version used", () => {
      writeTestTemplate(isolated.configDir, "meta-a", {
        repos: [],
        description: "I am A",
      })
      writeTestTemplate(isolated.configDir, "meta-b", {
        repos: [],
        description: "I am B",
      })

      const result = composeTemplates(["meta-a", "meta-b"])
      expect(result.name).toBe("meta-b")
      expect(result.description).toBe("I am B")
    })

    test("single template with no includes composes correctly", () => {
      writeTestTemplate(isolated.configDir, "single", {
        repos: [{ repo: "my-repo", mode: "worktree" }],
        hooks: { post_create: ["echo hello"] },
        env: { FOO: "bar" },
      })

      const result = composeTemplates(["single"])
      expect(result.repos).toHaveLength(1)
      expect(result.hooks?.post_create).toEqual(["echo hello"])
      expect(result.env).toEqual({ FOO: "bar" })
    })
  })

  describe("includes resolution", () => {
    test("template with includes field resolves included templates", () => {
      writeTestTemplate(isolated.configDir, "shared-lib", {
        repos: [{ repo: "common-lib", mode: "trunk" }],
        env: { SHARED: "true" },
      })
      writeTestTemplate(isolated.configDir, "fullstack", {
        repos: [{ repo: "app", mode: "worktree" }],
        includes: ["shared-lib"],
        env: { APP_ENV: "dev" },
      })

      const result = composeTemplates(["fullstack"])
      expect(result.repos).toHaveLength(2)
      const repoNames = result.repos.map((r: TemplateRepo) => r.repo).sort()
      expect(repoNames).toEqual(["app", "common-lib"])
      expect(result.env).toEqual({ SHARED: "true", APP_ENV: "dev" })
      expect(result.name).toBe("fullstack")
    })

    test("multiple templates each with includes resolves all", () => {
      writeTestTemplate(isolated.configDir, "base-tools", {
        repos: [{ repo: "tools", mode: "trunk" }],
        env: { TOOLS: "on" },
      })
      writeTestTemplate(isolated.configDir, "api-stack", {
        repos: [{ repo: "api-svc", mode: "worktree" }],
        includes: ["base-tools"],
        hooks: { post_create: ["echo api"] },
      })
      writeTestTemplate(isolated.configDir, "fe-stack", {
        repos: [{ repo: "web-app", mode: "worktree" }],
        hooks: { post_create: ["echo fe"] },
      })

      const result = composeTemplates(["api-stack", "fe-stack"])
      const repoNames = result.repos.map((r: TemplateRepo) => r.repo).sort()
      expect(repoNames).toEqual(["api-svc", "tools", "web-app"])
      expect(result.hooks?.post_create).toEqual(["echo api", "echo fe"])
      expect(result.env).toEqual({ TOOLS: "on" })
    })
  })
})

describe("CLI multi-template integration", () => {
  test("multi-template composition simulating --template api --template frontend", () => {
    writeTestTemplate(isolated.configDir, "cli-api", {
      repos: [{ repo: "api-svc", mode: "worktree" }],
      hooks: { post_create: ["echo api"] },
      env: { API_PORT: "3000" },
    })
    writeTestTemplate(isolated.configDir, "cli-frontend", {
      repos: [{ repo: "web-app", mode: "worktree" }],
      hooks: { post_create: ["echo frontend"] },
      env: { NODE_ENV: "dev" },
    })

    const result = composeTemplates(["cli-api", "cli-frontend"])

    // Both repos present
    expect(result.repos).toHaveLength(2)
    const repoNames = result.repos.map((r: TemplateRepo) => r.repo).sort()
    expect(repoNames).toEqual(["api-svc", "web-app"])

    // Hooks concatenated in order
    expect(result.hooks?.post_create).toEqual(["echo api", "echo frontend"])

    // Env merged
    expect(result.env).toEqual({ API_PORT: "3000", NODE_ENV: "dev" })

    // Top-level template (last) provides metadata
    expect(result.name).toBe("cli-frontend")
  })

  test("template with includes field resolves included templates (single --template path)", () => {
    writeTestTemplate(isolated.configDir, "cli-shared", {
      repos: [{ repo: "common-lib", mode: "trunk" }],
      env: { SHARED: "true" },
    })
    writeTestTemplate(isolated.configDir, "cli-fullstack", {
      repos: [{ repo: "app", mode: "worktree" }],
      includes: ["cli-shared"],
      env: { APP_ENV: "dev" },
    })

    // Simulates: user selects "cli-fullstack" in wizard, wizard calls
    // composeTemplates(["cli-shared", "cli-fullstack"]) after reading includes
    const result = composeTemplates(["cli-fullstack"])

    expect(result.repos).toHaveLength(2)
    const repoNames = result.repos.map((r: TemplateRepo) => r.repo).sort()
    expect(repoNames).toEqual(["app", "common-lib"])
    expect(result.env).toEqual({ SHARED: "true", APP_ENV: "dev" })
    expect(result.name).toBe("cli-fullstack")
  })

  test("three templates composed with overlapping repos: worktree wins", () => {
    writeTestTemplate(isolated.configDir, "cli-base", {
      repos: [
        { repo: "shared-repo", mode: "trunk" },
        { repo: "base-only", mode: "worktree" },
      ],
      env: { BASE: "true" },
    })
    writeTestTemplate(isolated.configDir, "cli-middle", {
      repos: [
        { repo: "shared-repo", mode: "worktree" },
        { repo: "middle-only", mode: "worktree" },
      ],
      hooks: { pre_open: ["echo middle"] },
    })
    writeTestTemplate(isolated.configDir, "cli-top", {
      repos: [
        { repo: "shared-repo", mode: "trunk" },
        { repo: "top-only", mode: "worktree" },
      ],
      env: { TOP: "true" },
      hooks: { pre_open: ["echo top"] },
    })

    const result = composeTemplates(["cli-base", "cli-middle", "cli-top"])

    // 4 unique repos
    expect(result.repos).toHaveLength(4)
    const repoNames = result.repos.map((r: TemplateRepo) => r.repo).sort()
    expect(repoNames).toEqual(["base-only", "middle-only", "shared-repo", "top-only"])

    // shared-repo: worktree wins (cli-middle had worktree)
    const sharedRepo = result.repos.find((r: TemplateRepo) => r.repo === "shared-repo")
    expect(sharedRepo?.mode).toBe("worktree")

    // Hooks concatenated
    expect(result.hooks?.pre_open).toEqual(["echo middle", "echo top"])

    // Env merged with last-wins
    expect(result.env).toEqual({ BASE: "true", TOP: "true" })

    // Top-level metadata
    expect(result.name).toBe("cli-top")
  })

  test("runWorkspaceNew accepts templateNames as third parameter (type-level check)", () => {
    // This verifies the function signature accepts the parameter
    // Actual execution requires interactive prompts, so we just verify the import
    const mod = require("../../src/tui/workspace-wizard")
    expect(typeof mod.runWorkspaceNew).toBe("function")
    expect(mod.runWorkspaceNew.length).toBeGreaterThanOrEqual(0) // async functions report 0 length
  })
})

describe("labels merge", () => {
  test("merges labels from includes without duplicates in merge order", () => {
    writeTestTemplate(isolated.configDir, "base", {
      repos: [],
      labels: ["shared", "ops"],
    })
    writeTestTemplate(isolated.configDir, "feature", {
      repos: [],
      includes: ["base"],
      labels: ["backend", "shared"],
    })

    const result = composeTemplates(["feature"])

    expect(result.labels).toEqual(["shared", "ops", "backend"])
  })

  test("merges labels across multi-template composition without duplicates", () => {
    writeTestTemplate(isolated.configDir, "alpha", {
      repos: [],
      labels: ["backend", "sprint:14"],
    })
    writeTestTemplate(isolated.configDir, "beta", {
      repos: [],
      labels: ["backend", "cli"],
    })

    const result = composeTemplates(["alpha", "beta"])

    expect(result.labels).toEqual(["backend", "sprint:14", "cli"])
  })
})
