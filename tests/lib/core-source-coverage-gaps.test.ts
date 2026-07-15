import { afterEach, beforeEach, describe, expect, test } from "@test/api"
import { execSync } from "child_process"
import { mkdirSync, writeFileSync } from "fs"
import { join } from "path"
import {
  applyTestGitEnv,
  cleanup,
  gitExecOptions,
  makeRepoWithRemote,
  makeTmpDir,
} from "../helpers"
import { isBranchGoneOnRemote, mergeBranchFF } from "../../packages/core/src/git"
import { checkConflicts, findContiguousBlock } from "../../packages/core/src/ports"
import type { Workspace } from "../../packages/core/src/config"
import {
  buildKeychainCommand,
  buildResolvers,
  parseKeychainPath,
} from "../../packages/core/src/secrets"

let tmpDir: string
let gitEnvDir: string
let restoreGitEnv: (() => void) | undefined

beforeEach(() => {
  gitEnvDir = makeTmpDir("core-source-gaps-env")
  restoreGitEnv = applyTestGitEnv(gitEnvDir)
  tmpDir = makeTmpDir("core-source-gaps")
})

afterEach(() => {
  restoreGitEnv?.()
  cleanup(gitEnvDir)
  cleanup(tmpDir)
})

function commitFile(repoPath: string, fileName: string, content: string, message: string) {
  writeFileSync(join(repoPath, fileName), content)
  execSync("git add .", gitExecOptions(repoPath, tmpDir))
  execSync(`git commit -m ${JSON.stringify(message)}`, gitExecOptions(repoPath, tmpDir))
}

function makeWorkspace(
  name: string,
  ports?: Record<string, number | null>,
  opts: {
    envFile?: string
    repos?: Workspace["repos"]
  } = {}
): Workspace {
  return {
    schema_version: "1",
    name,
    branch: "main",
    created: "2026-01-01",
    repos: opts.repos ?? [],
    env_file: opts.envFile,
    ports,
  }
}

describe("core source coverage gaps: secrets", () => {
  test("parseKeychainPath rejects malformed key=value lists with missing equals in a later pair", () => {
    expect(() => parseKeychainPath("service=api,broken")).toThrow(
      "Invalid keychain attribute 'broken'"
    )
  })

  test("buildKeychainCommand rejects unsupported platforms before spawning", () => {
    expect(() => buildKeychainCommand([{ key: "service", value: "api" }], "freebsd" as NodeJS.Platform))
      .toThrow("keychain resolver not supported on freebsd")
  })

  test("buildResolvers deduplicates configured resolvers and ignores unknown ids", () => {
    const resolvers = buildResolvers({
      workspace_root: "/tmp/workspaces",
      integrations: {},
      ports: { range_start: 10000, range_end: 65000 },
      secrets: { resolvers: ["env", "env", "unknown", "cmd", "cmd"] },
    })

    expect(resolvers.map((resolver) => resolver.id)).toEqual(["env", "cmd"])
  })
})

describe("core source coverage gaps: ports", () => {
  test("checkConflicts ignores comments and malformed env_file lines before detecting a later port collision", () => {
    const repoDir = join(tmpDir, "repo")
    mkdirSync(repoDir, { recursive: true })
    writeFileSync(
      join(repoDir, ".env"),
      ["# comment", "", "MALFORMED", "OTHER=value", "APP_PORT=3000"].join("\n")
    )

    const result = checkConflicts(
      makeWorkspace("with-env-file", { APP_PORT: null }, {
        envFile: ".env",
        repos: [{
          name: "api",
          repo: "api",
          type: "other",
          mode: "worktree",
          main_path: repoDir,
          task_path: repoDir,
          base_branch: "main",
        }],
      }),
      ["APP_PORT"]
    )

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain("env_file")
  })

  test("findContiguousBlock returns null when no bounded range can fit the requested block", () => {
    expect(findContiguousBlock([{ start: 40000, end: 40000 }], 2, 40000, 40001)).toBeNull()
  })
})

describe("core source coverage gaps: git", () => {
  test("isBranchGoneOnRemote distinguishes missing and present remote branches", async () => {
    const branch = "feat/gone-remote"
    const { mainPath, taskPath } = makeRepoWithRemote(tmpDir, "api", branch)

    expect(await isBranchGoneOnRemote(mainPath, branch)).toEqual({ status: "missing" })

    commitFile(taskPath, "feature.txt", "feature\n", "feature branch")
    execSync(`git push -u origin ${branch}`, gitExecOptions(taskPath, tmpDir))

    expect(await isBranchGoneOnRemote(mainPath, branch)).toEqual({ status: "present" })
  })

  test("isBranchGoneOnRemote preserves operational ls-remote errors", async () => {
    const branch = "feat/remote-error"
    const { mainPath } = makeRepoWithRemote(tmpDir, "broken-origin", branch)
    execSync(
      "git remote set-url origin /nonexistent/remote/that/cannot-be-opened",
      gitExecOptions(mainPath, tmpDir)
    )

    const result = await isBranchGoneOnRemote(mainPath, branch)

    expect(result.status).toBe("error")
    if (result.status === "error") {
      expect(result.error).toContain("/nonexistent/remote/that/cannot-be-opened")
    }
  })

  test("mergeBranchFF returns ok for a real merge and aborts cleanly on conflict", async () => {
    const success = makeRepoWithRemote(tmpDir, "merge-ok", "feat/merge-ok")
    commitFile(success.taskPath, "feature.txt", "feature\n", "feature branch")

    expect(await mergeBranchFF(success.mainPath, "feat/merge-ok")).toEqual({ ok: true })

    const conflict = makeRepoWithRemote(tmpDir, "merge-conflict", "feat/merge-conflict")
    commitFile(conflict.mainPath, "README.md", "main change\n", "main change")
    commitFile(conflict.taskPath, "README.md", "branch change\n", "branch change")

    const result = await mergeBranchFF(conflict.mainPath, "feat/merge-conflict")

    expect(result.ok).toBe(false)
    expect(execSync("git status --porcelain", gitExecOptions(conflict.mainPath, tmpDir)).toString()).toBe("")
  })
})
