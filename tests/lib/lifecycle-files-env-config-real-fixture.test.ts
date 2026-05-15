import { afterAll, afterEach, beforeEach, describe, expect, test } from "bun:test"
import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "fs"
import { join } from "path"
import {
  cleanup,
  makeFileTree,
  makeTmpDir,
  realCache,
  realReadGlobalConfig,
  realReadWorkspace,
  realRunHooks,
  realRunHooksCaptured,
  realWorkspacePath,
  realWriteGlobalConfig,
  realWriteWorkspace,
  useIsolatedConfig,
} from "../helpers"
import { applyFileOpsForRepo, applyFileOpsForWorkspace, warnExternalFiles } from "../../src/lib/files"
import { buildWorkspaceEnv, mergeEnv, writeEnvFiles } from "../../src/lib/workspace-env"
import { buildResolvers, resolveSecrets } from "../../src/lib/secrets"
import { allocatePorts } from "../../src/lib/ports"
import type { GlobalConfig, Workspace, WorkspaceRepo } from "../../src/lib/config"

type CapturedLine = { line: string; stream: "stdout" | "stderr" }

const isolated = useIsolatedConfig("lifecycle-files-env-config-real")

afterAll(() => isolated.cleanup())

let tmpDir: string

beforeEach(() => {
  realCache.workspaces.clear()
  realCache.templates.clear()
  realCache.resetList()
  tmpDir = makeTmpDir("lifecycle-files-env-config")
})

afterEach(() => {
  realCache.workspaces.clear()
  realCache.templates.clear()
  realCache.resetList()
  cleanup(tmpDir)
})

describe("lifecycle hooks with real subprocesses", () => {
  test("runHooks executes in the requested cwd with explicit env values", async () => {
    const artifact = join(tmpDir, "hook-env.txt")
    await realRunHooks([
      `printf "PWD=%s\\nVALUE=%s\\n" "$PWD" "$PHASE85_VALUE" > ${artifact}`,
    ], tmpDir, { PHASE85_VALUE: "from-env" })

    const content = readFileSync(artifact, "utf8")
    expect(content).toContain(`PWD=${tmpDir}`)
    expect(content).toContain("VALUE=from-env")
  })

  test("runHooksCaptured records stdout lines in command order and preserves stream tags", async () => {
    const lines: CapturedLine[] = []
    const results = await realRunHooksCaptured([
      "echo first && echo err-one >&2",
      "echo second",
    ], tmpDir, {}, (line: CapturedLine) => lines.push(line))

    expect(results.map((result: { exitCode: number }) => result.exitCode)).toEqual([0, 0])
    expect(lines.filter((line) => line.stream === "stdout").map((line) => line.line)).toEqual(["first", "second"])
    expect(lines).toContainEqual({ line: "err-one", stream: "stderr" })
  })

  test("runHooksCaptured stops after failure and preserves prior output", async () => {
    const lines: CapturedLine[] = []
    const results = await realRunHooksCaptured([
      "echo before",
      "echo fail >&2; exit 9",
      "echo after",
    ], tmpDir, {}, (line: CapturedLine) => lines.push(line))

    expect(results).toHaveLength(2)
    expect(results[0]).toMatchObject({ exitCode: 0, failed: false })
    expect(results[1]).toMatchObject({ exitCode: 9, failed: true })
    expect(lines).toEqual([
      { line: "before", stream: "stdout" },
      { line: "fail", stream: "stderr" },
    ])
  })
})

describe("files, env, secrets, ports, and config real fixtures", () => {
  test("file ops copy, symlink, glob, idempotency, and external warnings use real filesystem state", () => {
    const mainPath = join(tmpDir, "main-api")
    const taskPath = join(tmpDir, "workspaces", "tasks", "files-ws", "api")
    mkdirSync(mainPath, { recursive: true })
    mkdirSync(taskPath, { recursive: true })
    makeFileTree(mainPath, {
      "config/app.yml": "app: true\n",
      "secrets/token.txt": "secret\n",
      ".env.local": "A=1\n",
    })
    mkdirSync(join(taskPath, "config"), { recursive: true })
    writeFileSync(join(taskPath, "config", "app.yml"), "existing\n")

    const repo: WorkspaceRepo = {
      name: "api",
      repo: "api",
      type: "typescript",
      mode: "worktree",
      main_path: mainPath,
      task_path: taskPath,
      files: {
        copy: ["config/app.yml", ".env.*"],
        symlink: ["secrets/token.txt"],
      },
    }

    const result = applyFileOpsForRepo({ path: mainPath }, repo)

    expect(result.ok).toBe(true)
    expect(readFileSync(join(taskPath, "config", "app.yml"), "utf8")).toBe("existing\n")
    expect(readFileSync(join(taskPath, ".env.local"), "utf8")).toBe("A=1\n")
    expect(lstatSync(join(taskPath, "secrets", "token.txt")).isSymbolicLink()).toBe(true)

    const wsRoot = join(tmpDir, "workspaces")
    const workspace: Workspace = {
      name: "files-ws",
      schema_version: "1",
      branch: "feat/files",
      created: "2026-05-15",
      repos: [repo],
      files: {
        copy: [join(tmpDir, "outside.txt")],
        symlink: ["missing-*"],
      },
    }
    writeFileSync(join(tmpDir, "outside.txt"), "outside\n")

    const workspaceResult = applyFileOpsForWorkspace({ files: { copy: ["missing-*"] } }, workspace, join(wsRoot, "tasks", workspace.name))
    expect(workspaceResult.ok).toBe(true)
    if (workspaceResult.ok) {
      expect(workspaceResult.warnings?.[0]).toContain("matched no files")
    }
    expect(warnExternalFiles(workspace, join(wsRoot, "tasks", workspace.name), join(wsRoot, "tasks"))).toEqual([
      `Warning: external destination ${join(tmpDir, "outside.txt")} was not removed`,
    ])
  })

  test("workspace env resolves order, skips secrets on request, and writes env files safely", async () => {
    const taskPath = join(tmpDir, "workspaces", "tasks", "env-ws", "api")
    mkdirSync(taskPath, { recursive: true })
    const workspace: Workspace = {
      name: "env-ws",
      schema_version: "1",
      branch: "feat/env",
      created: "2026-05-15",
      repos: [{
        name: "api",
        repo: "api",
        type: "typescript",
        mode: "worktree",
        main_path: taskPath,
        task_path: taskPath,
      }],
      env: {
        DIRECT: "direct",
        TOKEN: "${{ env:PHASE85_SECRET }}",
      },
      env_file: ".env.local",
      ports: { APP_PORT: 45001 },
    }
    const config: GlobalConfig = {
      workspace_root: join(tmpDir, "workspaces"),
      integrations: {},
      ports: { range_start: 45000, range_end: 45100 },
      secrets: { resolvers: ["env"] },
    }
    process.env.PHASE85_SECRET = "resolved-secret"
    try {
      expect(mergeEnv(workspace)).toEqual({
        DIRECT: "direct",
        TOKEN: "${{ env:PHASE85_SECRET }}",
        APP_PORT: "45001",
      })

      const resolved = await buildWorkspaceEnv(workspace, { config, triggeredBy: "open" })
      expect(resolved).toMatchObject({
        GS_WORKSPACE_NAME: "env-ws",
        GS_WORKSPACE_BRANCH: "feat/env",
        GS_TRIGGERED_BY: "open",
        DIRECT: "direct",
        TOKEN: "resolved-secret",
        APP_PORT: "45001",
      })

      const warnings: string[] = []
      const skipped = await buildWorkspaceEnv(workspace, {
        config,
        triggeredBy: "open",
        skipSecrets: true,
        onWarn: (message) => warnings.push(message),
      })
      expect(skipped.TOKEN).toBe("")
      expect(warnings[0]).toContain("Skipping secret: TOKEN")

      writeFileSync(join(taskPath, ".env.local"), "KEEP=1\nDIRECT=old\n")
      writeEnvFiles(workspace, { DIRECT: "new", APP_PORT: "45001" })
      expect(readFileSync(join(taskPath, ".env.local"), "utf8")).toBe("KEEP=1\nDIRECT=new\nAPP_PORT=45001\n")
    } finally {
      delete process.env.PHASE85_SECRET
    }
  })

  test("cmd secrets use fixture-local executables and propagate failures", async () => {
    const command = join(tmpDir, "secret-command.sh")
    writeFileSync(command, "#!/bin/sh\nprintf fixture-secret\n")
    await realRunHooks([`chmod +x ${command}`], tmpDir, {})

    const config: GlobalConfig = {
      workspace_root: tmpDir,
      integrations: {},
      ports: { range_start: 40000, range_end: 40100 },
      secrets: { resolvers: ["cmd"] },
    }
    const resolved = await resolveSecrets({ TOKEN: `\${{ cmd:${command} }}` }, buildResolvers(config))
    expect(resolved).toEqual({ TOKEN: "fixture-secret" })

    await expect(resolveSecrets(
      { TOKEN: "${{ env:PHASE85_MISSING_SECRET }}" },
      buildResolvers({ ...config, secrets: { resolvers: ["env"] } })
    )).rejects.toThrow("PHASE85_MISSING_SECRET")
  })

  test("port allocation handles collisions and config writes round trip atomically", () => {
    const config: GlobalConfig = {
      workspace_root: join(tmpDir, "workspaces"),
      integrations: {},
      ports: { range_start: 46000, range_end: 46010 },
    }
    realWriteGlobalConfig(config)
    expect(realReadGlobalConfig()).toEqual(config)

    const existing: Workspace = {
      name: "existing",
      schema_version: "1",
      branch: "main",
      created: "2026-05-15",
      repos: [],
      ports: { API_PORT: 46000 },
    }
    realWriteWorkspace(existing)

    const next: Workspace = {
      name: "next",
      schema_version: "1",
      branch: "main",
      created: "2026-05-15",
      repos: [],
      ports: { API_PORT: 46000, WEB_PORT: null },
    }

    const blocked = allocatePorts(next, config, { reallocate: false })
    expect(blocked.ok).toBe(false)
    if (!blocked.ok) expect(blocked.error).toContain("API_PORT")

    const reallocated = allocatePorts(next, config, { reallocate: true })
    expect(reallocated.ok).toBe(true)
    if (reallocated.ok) {
      expect(new Set(Object.values(reallocated.workspace.ports ?? {}))).toEqual(new Set([46001, 46002]))
      expect(reallocated.workspace.ports?.API_PORT).not.toBe(46000)
      expect(reallocated.changed).toBe(true)
      realWriteWorkspace(reallocated.workspace)
    }
    expect(new Set(Object.values(realReadWorkspace("next").ports ?? {}))).toEqual(new Set([46001, 46002]))
    expect(readdirSync(join(isolated.configDir, "workspaces")).some((name) => name.endsWith(".tmp"))).toBe(false)

    writeFileSync(realWorkspacePath("legacy"), [
      "name: legacy",
      "branch: main",
      "created: '2026-05-15'",
      "repos: []",
      "",
    ].join("\n"))
    expect(realReadWorkspace("legacy").schema_version).toBe("1")
    expect(existsSync(join(isolated.configDir, "config.yml.tmp"))).toBe(false)
  })
})
