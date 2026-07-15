import { afterAll, afterEach, beforeEach, describe, expect, mock, test } from "@test/api"
import { runProcessSync } from "../process"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs"
import { join } from "path"
import { execSync } from "child_process"
import {
  applyTestGitEnv,
  cleanup,
  gitExecOptions,
  makeRealWorkspaceFixture,
  makeRepoWithRemote,
  makeWorkspaceFixture,
  makeTmpDir,
  useIsolatedConfig,
  writeProbeScript,
  realCleanWorkspace as cleanWorkspace,
  realCache,
  realCloseWorkspace as closeWorkspace,
  realIsWorktreeRegistered as isWorktreeRegistered,
  realMergeWorkspace as mergeWorkspace,
  realReadWorkspace as readWorkspace,
  realWriteGlobalConfig as writeGlobalConfig,
  realRemoveWorkspace as removeWorkspace,
  realRenameWorkspace as renameWorkspace,
  realWorkspaceExists as workspaceExists,
  realWorkspacePath as workspacePath,
  realRunHooks,
  realRunHooksCaptured,
  lifecycleRealExec,
  tmuxRealExec,
} from "../helpers"

const isolated = useIsolatedConfig("workspace-ops-real-fixture")

mock.module("@/lib/lifecycle", () => ({
  runHooks: realRunHooks,
  runHooksCaptured: realRunHooksCaptured,
  _exec: lifecycleRealExec,
}))

afterAll(() => isolated.cleanup())

let tmpDir: string
let gitEnvDir: string
let restoreGitEnv: (() => void) | undefined

beforeEach(() => {
  realCache.workspaces.clear()
  realCache.resetList()
  gitEnvDir = makeTmpDir("workspace-ops-real-git-env")
  restoreGitEnv = applyTestGitEnv(gitEnvDir)
  tmpDir = makeTmpDir("workspace-ops-real")
})

afterEach(() => {
  realCache.workspaces.clear()
  realCache.resetList()
  restoreGitEnv?.()
  cleanup(gitEnvDir)
  cleanup(tmpDir)
})

function workspaceFile(name: string): string {
  return workspacePath(name)
}

function commitIn(path: string, file: string, content: string, message: string) {
  writeFileSync(join(path, file), content)
  execSync("git add .", gitExecOptions(path, tmpDir))
  execSync(`git commit -m ${JSON.stringify(message)}`, gitExecOptions(path, tmpDir))
}

describe("workspace lifecycle real fixtures", () => {
  test("clean dry-run preserves worktree, workspace YAML, and local branch", async () => {
    const { repo, branch, wsName } = makeRealWorkspaceFixture(tmpDir, isolated.configDir, "clean-dry")

    const result = await cleanWorkspace(wsName, { dryRun: true, force: true })

    expect(result.ok).toBe(true)
    expect(existsSync(repo.taskPath)).toBe(true)
    expect(workspaceExists(wsName)).toBe(true)
    expect(execSync(`git -C ${repo.mainPath} rev-parse --verify ${branch}`, gitExecOptions(repo.mainPath, tmpDir)).toString().trim().length).toBeGreaterThan(0)
  })

  test("clean force removes a registered worktree but keeps workspace YAML", async () => {
    const { repo, wsName } = makeRealWorkspaceFixture(tmpDir, isolated.configDir, "clean-force")

    const result = await cleanWorkspace(wsName, { force: true })

    expect(result.ok).toBe(true)
    expect(await isWorktreeRegistered(repo.mainPath, repo.taskPath)).toBe(false)
    expect(await isWorktreeRegistered(repo.mainPath, repo.taskPath)).toBe(false)
    expect(workspaceExists(wsName)).toBe(true)
  })

  test("remove dry-run preserves worktree and workspace YAML", async () => {
    const { repo, wsName } = makeRealWorkspaceFixture(tmpDir, isolated.configDir, "remove-dry")

    const result = await removeWorkspace(wsName, { dryRun: true, force: true })

    expect(result.ok).toBe(true)
    expect(existsSync(repo.taskPath)).toBe(true)
    expect(existsSync(workspaceFile(wsName))).toBe(true)
  })

  test("remove force deletes the task folder and workspace YAML", async () => {
    const { repo, wsName } = makeRealWorkspaceFixture(tmpDir, isolated.configDir, "remove-force")

    const result = await removeWorkspace(wsName, { force: true })

    expect(result.ok).toBe(true)
    expect(await isWorktreeRegistered(repo.mainPath, repo.taskPath)).toBe(false)
    expect(existsSync(workspaceFile(wsName))).toBe(false)
    expect(workspaceExists(wsName)).toBe(false)
  })

  test("merge dry-run leaves branch, worktree, and workspace YAML intact", async () => {
    const { repo, branch, wsName } = makeRealWorkspaceFixture(tmpDir, isolated.configDir, "merge-dry")
    commitIn(repo.taskPath, "feature.txt", "feature\n", "feature commit")

    const result = await mergeWorkspace(wsName, { dryRun: true, force: true })

    expect(result.ok).toBe(true)
    expect(existsSync(repo.taskPath)).toBe(true)
    expect(workspaceExists(wsName)).toBe(true)
    expect(execSync(`git -C ${repo.mainPath} rev-parse --verify ${branch}`, gitExecOptions(repo.mainPath, tmpDir)).toString().trim().length).toBeGreaterThan(0)
  })

  test("merge force merges the feature branch, removes worktree and YAML, and deletes local branch", async () => {
    const { repo, branch, wsName } = makeRealWorkspaceFixture(tmpDir, isolated.configDir, "merge-force")
    commitIn(repo.taskPath, "feature.txt", "feature\n", "feature commit")

    const result = await mergeWorkspace(wsName, { force: true })

    expect(result.ok).toBe(true)
    expect(await isWorktreeRegistered(repo.mainPath, repo.taskPath)).toBe(false)
    expect(workspaceExists(wsName)).toBe(false)
    expect(execSync(`git -C ${repo.mainPath} log --oneline main`, gitExecOptions(repo.mainPath, tmpDir)).toString()).toContain("feature commit")
    const branchLookup = runProcessSync(["git", "-C", repo.mainPath, "rev-parse", "--verify", branch], {
      env: gitExecOptions(repo.mainPath, tmpDir).env,
      stdout: "pipe",
      stderr: "pipe",
    })
    expect(branchLookup.exitCode).not.toBe(0)
  })

  test("a later repo preflight error leaves hooks, integrations, worktrees, base refs, and YAML untouched", async () => {
    const wsName = "merge-preflight-error"
    const branch = `feat/${wsName}`
    const first = makeRepoWithRemote(tmpDir, "preflight-first", branch)
    const second = makeRepoWithRemote(tmpDir, "preflight-second", branch)
    const wsRoot = join(tmpDir, "workspaces")
    const hookLog = join(tmpDir, "merge-preflight-hooks.log")
    const hookScript = writeProbeScript(tmpDir, "merge-preflight-hook.sh", hookLog, ["GS_TRIGGERED_BY"])
    mkdirSync(join(wsRoot, "tasks"), { recursive: true })

    makeWorkspaceFixture(isolated.configDir, wsName, [
      { name: "first", mainPath: first.mainPath, taskPath: first.taskPath },
      {
        name: "second",
        mainPath: second.mainPath,
        taskPath: second.taskPath,
        baseBranch: "missing-base",
      },
    ], {
      wsRoot,
      branch,
      hooks: {
        pre_close: [hookScript],
        pre_clean: [hookScript],
        pre_merge: [hookScript],
      },
    })
    writeGlobalConfig({
      workspace_root: wsRoot,
      integrations: { tmux: { enabled: true } },
    })
    realCache.workspaces.clear()
    realCache.resetList()

    commitIn(first.taskPath, "first-feature.txt", "feature\n", "first feature")
    const firstBaseBefore = execSync("git rev-parse main", gitExecOptions(first.mainPath, tmpDir)).toString().trim()
    const secondBaseBefore = execSync("git rev-parse main", gitExecOptions(second.mainPath, tmpDir)).toString().trim()
    const yamlBefore = readFileSync(workspaceFile(wsName), "utf8")
    const tmuxCalls: string[][] = []
    const originalTmuxRun = tmuxRealExec.run
    tmuxRealExec.run = async (args: string[]) => {
      tmuxCalls.push(args)
      return { exitCode: 0, stdout: "" }
    }

    let result: Awaited<ReturnType<typeof mergeWorkspace>>
    try {
      result = await mergeWorkspace(wsName, { force: true })
    } finally {
      tmuxRealExec.run = originalTmuxRun
    }

    expect(result.ok).toBe(false)
    expect(result.error).toContain("second")
    expect(result.error).toContain("missing-base")
    expect(existsSync(hookLog)).toBe(false)
    expect(tmuxCalls).toEqual([])
    expect(existsSync(first.taskPath)).toBe(true)
    expect(existsSync(second.taskPath)).toBe(true)
    expect(await isWorktreeRegistered(first.mainPath, first.taskPath)).toBe(true)
    expect(await isWorktreeRegistered(second.mainPath, second.taskPath)).toBe(true)
    expect(execSync("git rev-parse main", gitExecOptions(first.mainPath, tmpDir)).toString().trim()).toBe(firstBaseBefore)
    expect(execSync("git rev-parse main", gitExecOptions(second.mainPath, tmpDir)).toString().trim()).toBe(secondBaseBefore)
    expect(readFileSync(workspaceFile(wsName), "utf8")).toBe(yamlBefore)
  })

  test("rename re-registers worktrees and updates workspace identity", async () => {
    const { repo, wsName, wsRoot } = makeRealWorkspaceFixture(tmpDir, isolated.configDir, "rename-old")
    const nextName = "rename-new"
    const nextPath = join(wsRoot, "tasks", nextName, "api")

    const result = await renameWorkspace(wsName, nextName, { force: true })

    expect(result.ok).toBe(true)
    expect(workspaceExists(wsName)).toBe(false)
    expect(workspaceExists(nextName)).toBe(true)
    expect(await isWorktreeRegistered(repo.mainPath, repo.taskPath)).toBe(false)
    expect(existsSync(nextPath)).toBe(true)
    expect(await isWorktreeRegistered(repo.mainPath, nextPath)).toBe(true)
    const ws = readWorkspace(nextName)
    expect(ws.name).toBe(nextName)
    expect(ws.repos[0]?.task_path).toBe(nextPath)
  })

  test("missing task_path clean skips safely without deleting unrelated files", async () => {
    const { repo, wsName, wsRoot } = makeRealWorkspaceFixture(tmpDir, isolated.configDir, "missing-task")
    cleanup(repo.taskPath)
    const unrelated = join(wsRoot, "tasks", "unrelated", "keep.txt")
    mkdirSync(join(wsRoot, "tasks", "unrelated"), { recursive: true })
    writeFileSync(unrelated, "keep\n")

    const result = await cleanWorkspace(wsName, { force: true })

    expect(result.ok).toBe(true)
    expect(existsSync(unrelated)).toBe(true)
    expect(workspaceExists(wsName)).toBe(true)
  })

  test("pre-clean hook failure preserves prior probe output and the worktree", async () => {
    const probeFile = join(tmpDir, "hook-probe.txt")
    const okScript = writeProbeScript(tmpDir, "ok.sh", probeFile, ["GS_WORKSPACE_NAME", "GS_TRIGGERED_BY"])
    const failScript = join(tmpDir, "fail.sh")
    writeFileSync(failScript, "#!/bin/sh\necho FAIL >&2\nexit 7\n")
    execSync(`chmod +x ${failScript}`)
    const { repo, wsName } = makeRealWorkspaceFixture(tmpDir, isolated.configDir, "hook-rollback", {
      hooks: { pre_clean: [okScript, failScript] },
    })

    const result = await cleanWorkspace(wsName, { force: true, captured: true })

    expect(result.ok).toBe(false)
    expect(result.error).toContain("pre_clean hook failed")
    expect(existsSync(repo.taskPath)).toBe(true)
    expect(existsSync(probeFile), result.error).toBe(true)
    const probe = readFileSync(probeFile, "utf8")
    expect(probe).toContain(`GS_WORKSPACE_NAME=${wsName}`)
    expect(probe).toContain("GS_TRIGGERED_BY=clean")
  })

  test("a later repository pre-clean failure stops before any worktree mutation", async () => {
    const wsName = "prepare-barrier"
    const branch = `feat/${wsName}`
    const first = makeRepoWithRemote(tmpDir, "prepare-first", branch)
    const second = makeRepoWithRemote(tmpDir, "prepare-second", branch)
    const wsRoot = join(tmpDir, "workspaces")
    const firstLog = join(tmpDir, "prepare-first.log")
    const firstHook = writeProbeScript(tmpDir, "prepare-first.sh", firstLog, ["GS_TRIGGERED_BY"])
    const failHook = join(tmpDir, "prepare-second-fail.sh")
    writeFileSync(failHook, "#!/bin/sh\nexit 17\n")
    execSync(`chmod +x ${failHook}`)
    makeWorkspaceFixture(isolated.configDir, wsName, [
      { name: "first", mainPath: first.mainPath, taskPath: first.taskPath, hooks: { pre_clean: [firstHook] } },
      { name: "second", mainPath: second.mainPath, taskPath: second.taskPath, hooks: { pre_clean: [failHook] } },
    ], { wsRoot, branch })
    realCache.workspaces.clear()
    realCache.resetList()

    const result = await cleanWorkspace(wsName, { force: true, captured: true })

    expect(result.ok).toBe(false)
    expect(result.error).toContain("pre_clean[second]")
    expect(existsSync(firstLog)).toBe(true)
    expect(await isWorktreeRegistered(first.mainPath, first.taskPath)).toBe(true)
    expect(await isWorktreeRegistered(second.mainPath, second.taskPath)).toBe(true)
    expect(workspaceExists(wsName)).toBe(true)
  })

  test("post-clean hook failures are warnings after committed cleanup", async () => {
    const failHook = join(tmpDir, "post-clean-fail.sh")
    writeFileSync(failHook, "#!/bin/sh\nexit 9\n")
    execSync(`chmod +x ${failHook}`)
    const { repo, wsName } = makeRealWorkspaceFixture(tmpDir, isolated.configDir, "post-clean-warning", {
      hooks: { post_clean: [failHook] },
    })
    const messages: string[] = []

    const result = await cleanWorkspace(wsName, { force: true, captured: true }, (message: string) => messages.push(message))

    expect(result.ok).toBe(true)
    expect(await isWorktreeRegistered(repo.mainPath, repo.taskPath)).toBe(false)
    expect(messages.some((message) => message.includes("warning: post_clean hook failed"))).toBe(true)
  })

  test("close succeeds when the workspace task folder is already missing", async () => {
    const { wsName, wsRoot } = makeRealWorkspaceFixture(tmpDir, isolated.configDir, "close-missing")
    cleanup(join(wsRoot, "tasks", wsName))

    const result = await closeWorkspace(wsName, { captured: true })

    expect(result.ok).toBe(true)
  })
})
