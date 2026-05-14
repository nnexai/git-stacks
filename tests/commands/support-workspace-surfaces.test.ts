import { describe, expect, test } from "bun:test"
import { existsSync, readFileSync } from "fs"
import { join } from "path"
import {
  cleanup,
  createConfigFixture,
  fakeEditorEnv,
  formatCliFailure,
  makeTmpDir,
  mkdir,
  runCli,
  write,
  writeRegistryFixture,
  writeTemplateFixture,
  writeWorkspaceFixture,
} from "../helpers"

function expectSuccess(result: ReturnType<typeof runCli>) {
  expect(result.exitCode, formatCliFailure(result)).toBe(0)
}

function setupSupportFixture(baseDir: string) {
  const wsRoot = join(baseDir, "workspaces")
  const configDir = createConfigFixture(baseDir, wsRoot)
  const apiTaskPath = join(wsRoot, "tasks", "support-ws", "api")
  const docsMainPath = join(wsRoot, "main", "docs")
  const missingTaskPath = join(wsRoot, "tasks", "support-ws", "missing")

  mkdir(baseDir, "workspaces", "tasks", "support-ws", "api")
  mkdir(baseDir, "workspaces", "main", "docs")
  write(baseDir, "workspaces/tasks/support-ws/api/README.md", "api\n")
  write(baseDir, "workspaces/main/docs/README.md", "docs\n")

  writeRegistryFixture(
    configDir,
    [
      "- name: api",
      `  local_path: ${apiTaskPath}`,
      "  default_branch: main",
      "  type: other",
      "- name: docs",
      `  local_path: ${docsMainPath}`,
      "  default_branch: main",
      "  type: other",
      "",
    ].join("\n")
  )

  const workspacePath = writeWorkspaceFixture(
    configDir,
    "support-ws.yml",
    [
      'schema_version: "1"',
      "name: support-ws",
      "branch: feat/support",
      'created: "2024-01-01"',
      "env:",
      "  API_URL: https://support.test",
      "repos:",
      "  - name: api",
      "    repo: api",
      "    type: other",
      "    mode: worktree",
      `    main_path: ${apiTaskPath}`,
      `    task_path: ${apiTaskPath}`,
      "    base_branch: main",
      "  - name: docs",
      "    repo: docs",
      "    type: other",
      "    mode: trunk",
      `    main_path: ${docsMainPath}`,
      "    base_branch: main",
      "  - name: missing",
      "    repo: missing",
      "    type: other",
      "    mode: worktree",
      `    main_path: ${join(wsRoot, "main", "missing")}`,
      `    task_path: ${missingTaskPath}`,
      "    base_branch: main",
      "",
    ].join("\n")
  )

  const templatePath = writeTemplateFixture(
    configDir,
    "support-template.yml",
    [
      'schema_version: "1"',
      "name: support-template",
      "repos:",
      "  - repo: api",
      "    mode: worktree",
      "",
    ].join("\n")
  )

  return {
    apiTaskPath,
    configDir,
    configPath: join(configDir, "config.yml"),
    docsMainPath,
    registryPath: join(configDir, "registry.yml"),
    templatePath,
    workspacePath,
  }
}

function readCapture(path: string): string[] {
  return readFileSync(path, "utf8").trim().split("\n").filter(Boolean)
}

describe("workspace support command surfaces", () => {
  test("env supports explicit workspace, cwd detection, and repo-specific variables", () => {
    const baseDir = makeTmpDir("support-env")
    try {
      const fixture = setupSupportFixture(baseDir)

      const explicit = runCli(["env", "support-ws", "--repo", "api", "--format", "json"], {
        baseDir,
        configDir: fixture.configDir,
      })
      expectSuccess(explicit)
      expect(explicit.stderr).toBe("")
      expect(JSON.parse(explicit.stdout)).toMatchObject({
        API_URL: "https://support.test",
        GS_REPO_NAME: "api",
        GS_REPO_PATH: fixture.apiTaskPath,
        GS_TRIGGERED_BY: "env",
        GS_WORKSPACE_NAME: "support-ws",
      })

      const detected = runCli(["env", "--format", "json"], {
        baseDir,
        configDir: fixture.configDir,
        cwd: fixture.apiTaskPath,
      })
      expectSuccess(detected)
      expect(JSON.parse(detected.stdout)).toMatchObject({
        GS_REPO_NAME: "api",
        GS_REPO_PATH: fixture.apiTaskPath,
        GS_WORKSPACE_NAME: "support-ws",
      })
    } finally {
      cleanup(baseDir)
    }
  })

  test("paths supports explicit workspace, cwd detection, prefixes, and skipped repo warnings", () => {
    const baseDir = makeTmpDir("support-paths")
    try {
      const fixture = setupSupportFixture(baseDir)

      const explicit = runCli(["paths", "support-ws", "--prefix", "--add-dir"], {
        baseDir,
        configDir: fixture.configDir,
      })
      expectSuccess(explicit)
      expect(explicit.stdout).toContain(`--add-dir ${fixture.apiTaskPath}`)
      expect(explicit.stdout).toContain(`--add-dir ${fixture.docsMainPath}`)
      expect(explicit.stderr).toContain("warning: skipping missing:")

      const detected = runCli(["paths", "--filter", "worktree"], {
        baseDir,
        configDir: fixture.configDir,
        cwd: fixture.apiTaskPath,
      })
      expectSuccess(detected)
      expect(detected.stdout).toContain(fixture.apiTaskPath)
      expect(detected.stdout).not.toContain(fixture.docsMainPath)
      expect(detected.stderr).toContain("warning: skipping missing:")
    } finally {
      cleanup(baseDir)
    }
  })

  test("workspace edit --yaml launches fake editor and persists valid mutation", () => {
    const baseDir = makeTmpDir("support-workspace-edit")
    try {
      const fixture = setupSupportFixture(baseDir)
      const capturePath = join(baseDir, "editor-capture.txt")
      const result = runCli(["edit", "support-ws", "--yaml"], {
        baseDir,
        configDir: fixture.configDir,
        artifactPaths: [capturePath, fixture.workspacePath],
        env: fakeEditorEnv(capturePath),
      })

      expectSuccess(result)
      expect(result.stderr).not.toContain("Warning: file has validation errors")
      expect(readCapture(capturePath)).toEqual([fixture.workspacePath])
      expect(readFileSync(fixture.workspacePath, "utf8")).toContain("# fake-editor-mutated: true")
    } finally {
      cleanup(baseDir)
    }
  })

  test("template edit --yaml launches fake editor and persists valid mutation", () => {
    const baseDir = makeTmpDir("support-template-edit")
    try {
      const fixture = setupSupportFixture(baseDir)
      const capturePath = join(baseDir, "editor-capture.txt")
      const result = runCli(["template", "edit", "support-template", "--yaml"], {
        baseDir,
        configDir: fixture.configDir,
        artifactPaths: [capturePath, fixture.templatePath],
        env: fakeEditorEnv(capturePath),
      })

      expectSuccess(result)
      expect(result.stderr).not.toContain("Warning: file has validation errors")
      expect(readCapture(capturePath)).toEqual([fixture.templatePath])
      expect(readFileSync(fixture.templatePath, "utf8")).toContain("# fake-editor-mutated: true")
    } finally {
      cleanup(baseDir)
    }
  })

  test("config --yaml launches fake editor and persists valid mutation", () => {
    const baseDir = makeTmpDir("support-config-edit")
    try {
      const fixture = setupSupportFixture(baseDir)
      const capturePath = join(baseDir, "editor-capture.txt")
      const result = runCli(["config", "--yaml"], {
        baseDir,
        configDir: fixture.configDir,
        artifactPaths: [capturePath, fixture.configPath],
        env: fakeEditorEnv(capturePath),
      })

      expectSuccess(result)
      expect(result.stderr).not.toContain("Warning: file has validation errors")
      expect(readCapture(capturePath)).toEqual([fixture.configPath])
      expect(readFileSync(fixture.configPath, "utf8")).toContain("# fake-editor-mutated: true")
    } finally {
      cleanup(baseDir)
    }
  })

  test("repo --yaml launches fake editor and persists valid mutation", () => {
    const baseDir = makeTmpDir("support-repo-edit")
    try {
      const fixture = setupSupportFixture(baseDir)
      const capturePath = join(baseDir, "editor-capture.txt")
      const result = runCli(["repo", "--yaml"], {
        baseDir,
        configDir: fixture.configDir,
        artifactPaths: [capturePath, fixture.registryPath],
        env: fakeEditorEnv(capturePath),
      })

      expectSuccess(result)
      expect(result.stderr).not.toContain("Warning: file has validation errors")
      expect(readCapture(capturePath)).toEqual([fixture.registryPath])
      expect(readFileSync(fixture.registryPath, "utf8")).toContain("# fake-editor-mutated: true")
      expect(existsSync(fixture.registryPath)).toBe(true)
    } finally {
      cleanup(baseDir)
    }
  })
})
