import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { existsSync, readFileSync } from "fs"
import { join } from "path"
import { parse } from "yaml"
import {
  applyTestGitEnv,
  cleanup,
  createConfigFixture,
  formatCliFailure,
  makeRepoWithRemote,
  makeTmpDir,
  runCli,
  writeRegistryFixture,
  writeTemplateFixture,
  writeWorkspaceFixture,
} from "../helpers"

function expectSuccessful(result: ReturnType<typeof runCli>) {
  expect(result.stderr, formatCliFailure(result)).toBe("")
  expect(result.exitCode, formatCliFailure(result)).toBe(0)
}

function workspacePath(configDir: string, name = "edge-ws") {
  return join(configDir, "workspaces", `${name}.yml`)
}

function readWorkspaceYaml(configDir: string, name = "edge-ws") {
  return readFileSync(workspacePath(configDir, name), "utf8")
}

function readWorkspace(configDir: string, name = "edge-ws") {
  return parse(readWorkspaceYaml(configDir, name)) as {
    name: string
    branch: string
    template?: string
    repos: Array<Record<string, string>>
    hooks?: Record<string, string[]>
    env?: Record<string, string>
    env_file?: string
    files?: Record<string, string[]>
    settings?: { integrations?: Record<string, unknown> }
    last_opened?: string
  }
}

function withoutLastOpened(workspace: ReturnType<typeof readWorkspace>) {
  const clone = structuredClone(workspace)
  delete clone.last_opened
  return clone
}

function templateYaml(repoNames: string[], extras = "") {
  const repos = repoNames.map((repo) => `  - repo: ${repo}\n    mode: worktree\n`).join("")
  return `name: edge-template\nrepos:\n${repos}${extras}`
}

function workspaceYaml(repo: ReturnType<typeof makeRepoWithRemote>, extras = "") {
  return [
    'schema_version: "1"',
    "name: edge-ws",
    "branch: feat/edge-ws",
    'created: "2024-01-01"',
    "template: edge-template",
    "repos:",
    "  - name: api",
    "    repo: api",
    "    type: other",
    "    mode: worktree",
    `    main_path: ${repo.mainPath}`,
    "    base_branch: main",
    `    task_path: ${repo.taskPath}`,
    extras.trimEnd(),
    "",
  ].filter(Boolean).join("\n")
}

function writeApiRegistry(configDir: string, repo: ReturnType<typeof makeRepoWithRemote>) {
  writeRegistryFixture(configDir, [
    "- name: api",
    `  local_path: ${repo.mainPath}`,
    "  default_branch: main",
    "  type: other",
    "",
  ].join("\n"))
}

describe("workspace open --recreate", () => {
  let tmpDir: string
  let configDir: string
  let gitEnvDir: string
  let restoreGitEnv: (() => void) | undefined

  beforeEach(() => {
    gitEnvDir = makeTmpDir("workspace-recreate-git-env")
    restoreGitEnv = applyTestGitEnv(gitEnvDir)
    tmpDir = makeTmpDir("workspace-recreate")
    configDir = createConfigFixture(tmpDir)
  })

  afterEach(() => {
    restoreGitEnv?.()
    cleanup(gitEnvDir)
    cleanup(tmpDir)
  })

  test("missing template refuses recreate without mutating workspace YAML", () => {
    const repo = makeRepoWithRemote(tmpDir, "api", "feat/edge-ws")
    writeWorkspaceFixture(configDir, "edge-ws.yml", workspaceYaml(repo))
    const before = readWorkspaceYaml(configDir)

    const result = runCli(["open", "edge-ws", "--recreate", "--no-ide", "--no-cmux"], {
      baseDir: tmpDir,
      configDir,
    })

    expect(result.exitCode, formatCliFailure(result)).not.toBe(0)
    expect(result.stderr).toContain("Template 'edge-template' not found")
    expect(result.stderr).toContain("git-stacks template list")
    expect(readWorkspaceYaml(configDir)).toBe(before)
  })

  test("workspace without template refuses recreate without mutating workspace YAML", () => {
    const repo = makeRepoWithRemote(tmpDir, "api", "feat/edge-ws")
    writeWorkspaceFixture(
      configDir,
      "edge-ws.yml",
      workspaceYaml(repo).replace("template: edge-template\n", "")
    )
    const before = readWorkspaceYaml(configDir)

    const result = runCli(["open", "edge-ws", "--recreate", "--no-ide", "--no-cmux"], {
      baseDir: tmpDir,
      configDir,
    })

    expect(result.exitCode, formatCliFailure(result)).not.toBe(0)
    expect(result.stderr).toContain("has no template field")
    expect(result.stderr).toContain("only workspaces created from templates support --recreate")
    expect(readWorkspaceYaml(configDir)).toBe(before)
  })

  test("missing registry repo refuses recreate before mutating workspace YAML", () => {
    const repo = makeRepoWithRemote(tmpDir, "api", "feat/edge-ws")
    writeTemplateFixture(configDir, "edge-template.yml", templateYaml(["api"]))
    writeWorkspaceFixture(configDir, "edge-ws.yml", workspaceYaml(repo))
    const before = readWorkspaceYaml(configDir)

    const result = runCli(["open", "edge-ws", "--recreate", "--force", "--no-ide", "--no-cmux"], {
      baseDir: tmpDir,
      configDir,
    })

    expect(result.exitCode, formatCliFailure(result)).not.toBe(0)
    expect(result.stderr).toContain("missing registry repos: api")
    expect(readWorkspaceYaml(configDir)).toBe(before)
  })

  test("recreate detects registry-derived worktree path drift without mutating before confirmation", () => {
    const repo = makeRepoWithRemote(tmpDir, "api", "feat/edge-ws")
    writeApiRegistry(configDir, repo)
    writeTemplateFixture(configDir, "edge-template.yml", templateYaml(["api"]))
    writeWorkspaceFixture(configDir, "edge-ws.yml", workspaceYaml(repo))
    const before = readWorkspace(configDir)

    const result = runCli(["open", "edge-ws", "--recreate", "--no-ide", "--no-cmux"], {
      baseDir: tmpDir,
      configDir,
    })

    expectSuccessful(result)
    expect(result.stdout).toContain("Template changes detected")
    const after = readWorkspace(configDir)
    expect(withoutLastOpened(after)).toEqual(withoutLastOpened(before))
    expect(after.last_opened).toBeUndefined()
    expect(existsSync(repo.taskPath)).toBe(true)
  })

  test("non-force recreate with detected drift cancels without mutating workspace YAML", () => {
    const repo = makeRepoWithRemote(tmpDir, "api", "feat/edge-ws")
    writeApiRegistry(configDir, repo)
    writeTemplateFixture(configDir, "edge-template.yml", templateYaml(["api"], "env:\n  API_ENV: template\n"))
    writeWorkspaceFixture(configDir, "edge-ws.yml", workspaceYaml(repo))
    const before = readWorkspaceYaml(configDir)

    const result = runCli(["open", "edge-ws", "--recreate", "--no-ide", "--no-cmux"], {
      baseDir: tmpDir,
      configDir,
    })

    expect(result.exitCode, formatCliFailure(result)).toBe(0)
    expect(result.stdout).toContain("Template changes detected")
    expect(result.stdout).toContain("Apply these changes from template?")
    expect(readWorkspaceYaml(configDir)).toBe(before)
  })

  test("forced recreate adds template repos that are missing from workspace YAML", () => {
    const api = makeRepoWithRemote(tmpDir, "api", "feat/edge-ws")
    const docs = makeRepoWithRemote(tmpDir, "docs", "feat/edge-ws-docs")
    writeRegistryFixture(configDir, [
      `- name: api`,
      `  local_path: ${api.mainPath}`,
      `  default_branch: main`,
      `  type: other`,
      `- name: docs`,
      `  local_path: ${docs.mainPath}`,
      `  default_branch: main`,
      `  type: typescript`,
      "",
    ].join("\n"))
    writeTemplateFixture(configDir, "edge-template.yml", templateYaml(["api", "docs"]))
    writeWorkspaceFixture(configDir, "edge-ws.yml", workspaceYaml(api))

    const result = runCli(["open", "edge-ws", "--recreate", "--force", "--no-ide", "--no-cmux"], {
      baseDir: tmpDir,
      configDir,
    })

    expectSuccessful(result)
    const workspace = readWorkspace(configDir)
    expect(workspace.repos.map((repo) => repo.name)).toEqual(["api", "docs"])
    expect(workspace.repos[1]).toMatchObject({
      name: "docs",
      repo: "docs",
      type: "typescript",
      mode: "worktree",
      main_path: docs.mainPath,
      task_path: join(tmpDir, "ws-root", "tasks", "edge-ws", "docs"),
      base_branch: "main",
    })
    expect(workspace.name).toBe("edge-ws")
    expect(workspace.branch).toBe("feat/edge-ws")
    expect(workspace.template).toBe("edge-template")
  })

  test("forced recreate removes workspace repos that are no longer in template", () => {
    const api = makeRepoWithRemote(tmpDir, "api", "feat/edge-ws")
    const docs = makeRepoWithRemote(tmpDir, "docs", "feat/edge-ws-docs")
    writeRegistryFixture(configDir, [
      `- name: api`,
      `  local_path: ${api.mainPath}`,
      `  default_branch: main`,
      `  type: other`,
      "",
    ].join("\n"))
    writeTemplateFixture(configDir, "edge-template.yml", templateYaml(["api"]))
    writeWorkspaceFixture(configDir, "edge-ws.yml", [
      workspaceYaml(api).trimEnd(),
      "  - name: docs",
      "    repo: docs",
      "    type: typescript",
      "    mode: worktree",
      `    main_path: ${docs.mainPath}`,
      "    base_branch: main",
      `    task_path: ${docs.taskPath}`,
      "",
    ].join("\n"))

    const result = runCli(["open", "edge-ws", "--recreate", "--force", "--no-ide", "--no-cmux"], {
      baseDir: tmpDir,
      configDir,
    })

    expectSuccessful(result)
    expect(readWorkspace(configDir).repos.map((repo) => repo.name)).toEqual(["api"])
  })

  test("forced recreate copies template config drift while preserving identity fields", () => {
    const repo = makeRepoWithRemote(tmpDir, "api", "feat/edge-ws")
    writeApiRegistry(configDir, repo)
    writeTemplateFixture(configDir, "edge-template.yml", templateYaml(["api"], [
      "hooks:",
      "  pre_create:",
      "    - \"echo create\"",
      "env:",
      "  API_ENV: template",
      "env_file: .env.template",
      "files:",
      "  copy:",
      "    - README.md",
      "integrations:",
      "  vscode:",
      "    enabled: false",
      "",
    ].join("\n")))
    writeWorkspaceFixture(configDir, "edge-ws.yml", workspaceYaml(repo, [
      "hooks:",
      "  pre_create:",
      "    - \"echo old\"",
      "env:",
      "  API_ENV: old",
      "env_file: .env.old",
      "",
    ].join("\n")))

    const result = runCli(["open", "edge-ws", "--recreate", "--force", "--no-ide", "--no-cmux"], {
      baseDir: tmpDir,
      configDir,
    })

    expectSuccessful(result)
    const workspace = readWorkspace(configDir)
    expect(workspace.hooks).toEqual({ pre_create: ["echo create"] })
    expect(workspace.env).toEqual({ API_ENV: "template" })
    expect(workspace.env_file).toBe(".env.template")
    expect(workspace.files).toEqual({ copy: ["README.md"] })
    expect(workspace.settings?.integrations).toEqual({ vscode: { enabled: false } })
    expect(workspace.name).toBe("edge-ws")
    expect(workspace.branch).toBe("feat/edge-ws")
    expect(workspace.template).toBe("edge-template")
  })
})
