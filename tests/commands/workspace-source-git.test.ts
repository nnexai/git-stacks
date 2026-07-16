import { afterEach, beforeEach, describe, expect, test } from "@test/api"
import { execSync } from "child_process"
import { mkdirSync, writeFileSync } from "fs"
import { join } from "path"
import { cleanup, createConfigFixture, fakeGitLabProviderEnv, formatCliFailure, gitExecOptions, makeTmpDir, runCli, writeRegistryFixture, writeTemplateFixture } from "../helpers"

function git(cwd: string, cmd: string): string {
  return execSync(`git ${cmd}`, { cwd, encoding: "utf8" }).trim()
}

describe("workspace source git handoff", () => {
  let baseDir: string
  let configDir: string
  let apiMain: string
  let webMain: string
  let apiBare: string
  let providerEnv: Record<string, string>

  beforeEach(() => {
    baseDir = makeTmpDir("workspace-source-git")
    configDir = createConfigFixture(baseDir)

    apiMain = join(baseDir, "repos", "api")
    webMain = join(baseDir, "repos", "web")
    apiBare = join(baseDir, "remotes", "api.git")
    mkdirSync(apiMain, { recursive: true })
    mkdirSync(webMain, { recursive: true })
    mkdirSync(join(baseDir, "remotes"), { recursive: true })

    git(apiMain, "init -q")
    git(apiMain, "config user.name 'Test User'")
    git(apiMain, "config user.email test@example.com")
    writeFileSync(join(apiMain, "README.md"), "api main\n")
    git(apiMain, "add README.md")
    git(apiMain, "commit -q -m init")
    git(apiMain, "branch -M main")
    git(baseDir, `init --bare -q ${apiBare}`)
    git(apiMain, `remote add origin ${apiBare}`)
    git(apiMain, "push -q -u origin main")
    git(apiMain, "checkout -q -b source/gitlab-mr-42")
    writeFileSync(join(apiMain, "README.md"), "api source\n")
    git(apiMain, "add README.md")
    git(apiMain, "commit -q -m source")
    git(apiMain, "push -q origin source/gitlab-mr-42")
    git(apiMain, "checkout -q main")
    const sourceSha = git(apiMain, "rev-parse source/gitlab-mr-42")
    const targetSha = git(apiMain, "rev-parse main")
    execSync(`git config --global url.file://${apiBare}.insteadOf https://gitlab.example.com/org/api.git`, gitExecOptions(apiMain, baseDir))
    providerEnv = fakeGitLabProviderEnv(baseDir, {
      targetPath: "org/api",
      sourceBranch: "source/gitlab-mr-42",
      sourceSha,
      targetSha,
    })

    git(webMain, "init -q")
    git(webMain, "config user.name 'Test User'")
    git(webMain, "config user.email test@example.com")
    writeFileSync(join(webMain, "README.md"), "web main\n")
    git(webMain, "add README.md")
    git(webMain, "commit -q -m init")
    git(webMain, "branch -M main")

    writeRegistryFixture(configDir, `- schema_version: "1"
  name: api
  local_path: ${apiMain}
  default_branch: main
  type: typescript
  forge: gitlab
  forge_metadata:
    forge: gitlab
    base_url: https://gitlab.example.com
    repo_path: org/api
- schema_version: "1"
  name: web
  local_path: ${webMain}
  default_branch: main
  type: typescript
  forge: gitlab
  forge_metadata:
    forge: gitlab
    base_url: https://gitlab.example.com
    repo_path: org/web
`)
    writeTemplateFixture(configDir, "review.yml", `schema_version: "1"
name: review
repos:
  - repo: api
    mode: worktree
  - repo: web
    mode: worktree
`)
  })

  afterEach(() => cleanup(baseDir))

  test("matched repo starts from fetched source ref while non-source repo uses workspace branch", () => {
    const sourceSha = git(apiMain, "rev-parse source/gitlab-mr-42")
    const result = runCli(
      [
        "new",
        "review-42",
        "--non-interactive",
        "--template",
        "review",
        "--source",
        "https://gitlab.example.com/org/api/-/merge_requests/42",
      ],
      { baseDir, configDir, env: providerEnv },
    )
    expect(result.exitCode, formatCliFailure(result)).toBe(0)

    const tasksRoot = join(baseDir, "ws-root", "tasks", "review-42")
    const apiTask = join(tasksRoot, "api")
    const webTask = join(tasksRoot, "web")
    const apiTaskSha = git(apiTask, "rev-parse HEAD")
    const webTaskBranch = git(webTask, "rev-parse --abbrev-ref HEAD")

    expect(apiTaskSha).toBe(sourceSha)
    expect(webTaskBranch).toBe("source/gitlab-mr-42")
  })
})
