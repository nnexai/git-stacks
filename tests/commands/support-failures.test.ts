import { describe, expect, test } from "bun:test"
import { existsSync, readFileSync, writeFileSync } from "fs"
import { join } from "path"
import {
  cleanup,
  createConfigFixture,
  fakeEditorEnv,
  formatCliFailure,
  makeRepoWithRemote,
  makeTmpDir,
  makeWorkspaceFixture,
  runCli,
  writeWorkspaceFixture,
} from "../helpers"

describe("representative support command failures", () => {
  test("malformed input: completion rejects unknown shell", () => {
    const baseDir = makeTmpDir("failure-completion")
    try {
      const result = runCli(["completion", "powershell"], { baseDir })

      expect(result.exitCode).toBe(1)
      expect(result.stderr).toContain("Unknown shell 'powershell'. Supported: bash, zsh, fish")
    } finally {
      cleanup(baseDir)
    }
  })

  test("missing entity: integration config show rejects missing workspace", () => {
    const baseDir = makeTmpDir("failure-integration-missing")
    try {
      const configDir = createConfigFixture(baseDir)
      const result = runCli(["integration", "vscode", "config", "show", "missing-ws"], {
        baseDir,
        configDir,
      })

      expect(result.exitCode).toBe(1)
      expect(result.stderr).toContain("Workspace 'missing-ws' not found.")
    } finally {
      cleanup(baseDir)
    }
  })

  test("missing path: paths reports when all workspace repo paths are absent", () => {
    const baseDir = makeTmpDir("failure-paths")
    try {
      const configDir = createConfigFixture(baseDir)
      writeWorkspaceFixture(
        configDir,
        "broken-ws.yml",
        [
          'schema_version: "1"',
          "name: broken-ws",
          "branch: feat/broken",
          'created: "2024-01-01"',
          "repos:",
          "  - name: missing",
          "    repo: missing",
          "    type: other",
          "    mode: worktree",
          `    main_path: ${join(baseDir, "missing-main")}`,
          `    task_path: ${join(baseDir, "missing-task")}`,
          "    base_branch: main",
          "",
        ].join("\n")
      )

      const result = runCli(["paths", "broken-ws"], { baseDir, configDir })

      expect(result.exitCode).toBe(1)
      expect(result.stderr).toContain("warning: skipping missing:")
      expect(result.stderr).toContain("No paths to output")
    } finally {
      cleanup(baseDir)
    }
  })

  test("validation failure: workspace edit --yaml warns after fake editor writes invalid YAML", () => {
    const baseDir = makeTmpDir("failure-validation")
    try {
      const configDir = createConfigFixture(baseDir)
      const workspacePath = writeWorkspaceFixture(
        configDir,
        "broken-ws.yml",
        [
          'schema_version: "1"',
          "name: broken-ws",
          "branch: feat/broken",
          'created: "2024-01-01"',
          "repos: []",
          "",
        ].join("\n")
      )
      const capturePath = join(baseDir, "editor-capture.txt")
      const result = runCli(["edit", "broken-ws", "--yaml"], {
        baseDir,
        configDir,
        artifactPaths: [capturePath, workspacePath],
        env: fakeEditorEnv(capturePath, "mutate-invalid"),
      })

      expect(result.exitCode, formatCliFailure(result)).toBe(0)
      expect(result.stderr).toContain("Warning: file has validation errors:")
      expect(readFileSync(capturePath, "utf8").trim()).toBe(workspacePath)
    } finally {
      cleanup(baseDir)
    }
  })

  test("dirty repo: clean without --force stops at the confirmation guard", () => {
    const baseDir = makeTmpDir("failure-dirty")
    try {
      const configDir = join(baseDir, "config")
      const repo = makeRepoWithRemote(baseDir, "api", "feat/dirty-ws")
      makeWorkspaceFixture(configDir, "dirty-ws", [
        { name: "api", mainPath: repo.mainPath, taskPath: repo.taskPath },
      ], { wsRoot: join(baseDir, "workspaces") })
      writeFileSync(join(repo.taskPath, "dirty.txt"), "uncommitted")

      const result = runCli(["clean", "dirty-ws"], { baseDir, configDir })

      expect(result.exitCode).toBe(0)
      expect(result.stdout).toContain("Remove all worktrees for 'dirty-ws'")
      expect(existsSync(repo.taskPath)).toBe(true)
    } finally {
      cleanup(baseDir)
    }
  })

  test("environment-sensitive behavior: env reports missing env secret", () => {
    const baseDir = makeTmpDir("failure-env-secret")
    try {
      const configDir = createConfigFixture(baseDir)
      writeFileSync(
        join(configDir, "config.yml"),
        [
          `workspace_root: ${join(baseDir, "workspaces")}`,
          "secrets:",
          "  resolvers:",
          "    - env",
          "",
        ].join("\n")
      )
      writeWorkspaceFixture(
        configDir,
        "env-ws.yml",
        [
          'schema_version: "1"',
          "name: env-ws",
          "branch: feat/env",
          'created: "2024-01-01"',
          "env:",
          "  SECRET_TOKEN: ${{ env:MISSING_SECRET }}",
          "repos: []",
          "",
        ].join("\n")
      )

      const result = runCli(["env", "env-ws", "--format", "json"], { baseDir, configDir })

      expect(result.exitCode).toBe(1)
      expect(result.stderr).toContain("Secret resolution failed:")
      expect(result.stderr).toContain("MISSING_SECRET")
    } finally {
      cleanup(baseDir)
    }
  })

  test("permission/editor error: config --yaml reports fake editor failure", () => {
    const baseDir = makeTmpDir("failure-editor")
    try {
      const configDir = createConfigFixture(baseDir)
      const capturePath = join(baseDir, "editor-capture.txt")
      const result = runCli(["config", "--yaml"], {
        baseDir,
        configDir,
        artifactPaths: [capturePath, join(configDir, "config.yml")],
        env: fakeEditorEnv(capturePath, "fail"),
      })

      expect(result.exitCode).toBe(1)
      expect(result.stderr).toContain("Editor exited with code 17")
      expect(readFileSync(capturePath, "utf8").trim()).toBe(join(configDir, "config.yml"))
    } finally {
      cleanup(baseDir)
    }
  })

})
