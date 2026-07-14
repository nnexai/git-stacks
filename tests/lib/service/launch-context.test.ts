import { describe, expect, test } from "bun:test"
import type { Workspace } from "../../../src/lib/config"
import { WorkspaceSnapshotResponseSchema } from "../../../src/lib/service/contract"
import { createSnapshotBuilder } from "../../../src/lib/service/snapshot"

const ws: Workspace & { id: string } = {
  id: "018f47f4-5ab1-7c2d-8e90-123456789abc",
  name: "alpha",
  schema_version: "1",
  branch: "feature/alpha",
  created: "2026-07-11T00:00:00.000Z",
  env: { NODE_ENV: "development", API_TOKEN: "${{ env:API_TOKEN }}" },
  ports: { APP_PORT: 4310 },
  commands: { predev: "prepare", dev: "bun dev", postdev: "cleanup" },
  repos: [{
    id: "018f47f4-5ab1-7c2d-8e90-abcdef012345",
    name: "git-stacks",
    repo: "git-stacks",
    type: "typescript",
    mode: "worktree",
    main_path: "/main/git-stacks",
    task_path: "/tasks/alpha/git-stacks",
    commands: { dev: "bun test --watch" },
  }],
}

function builder(overrides: Record<string, unknown> = {}) {
  return createSnapshotBuilder({
    listWorkspaceNames: () => ["alpha"],
    ensureWorkspaceIdentity: () => ws,
    fingerprint: () => "stable",
    getWorkspaceStatus: async () => [{ name: "git-stacks", exists: true, dirty: false, branch: "feature/alpha", mode: "worktree", ahead: 0, behind: 0, additions: 0, removals: 0, degraded: false }],
    getWorkspaceFileStatus: () => ({ summary: { total: 0, ok: 0, warnings: 0, errors: 0, attention: 0, sections: 2, byState: {}, byType: {} }, warnings: [], errors: [] }),
    listManualCommands: () => ["dev"],
    planManualCommand: () => [
      { bucket: "pre", scope: "workspace", commandName: "predev", shell: "prepare", cwd: "/tasks/alpha" },
      { bucket: "main", scope: "workspace", commandName: "dev", shell: "bun dev", cwd: "/tasks/alpha" },
      { bucket: "main", scope: "repo", commandName: "dev", shell: "bun test --watch", cwd: "/tasks/alpha/git-stacks", repoName: "git-stacks", repo: ws.repos[0] },
      { bucket: "post", scope: "workspace", commandName: "postdev", shell: "cleanup", cwd: "/tasks/alpha" },
    ],
    buildWorkspaceEnv: async () => ({
      GS_WORKSPACE_NAME: "alpha",
      GS_WORKSPACE_PATH: "/tasks/alpha",
      NODE_ENV: "development",
      API_TOKEN: "resolved-super-secret",
      APP_PORT: "4310",
    }),
    config: { workspace_root: "/tasks", integrations: {}, ports: { range_start: 10000, range_end: 65000 } },
    revisionStore: { update: () => "1" },
    clock: () => new Date("2026-07-11T10:00:00.000Z"),
    ...overrides,
  })
}

describe("service launch context projection", () => {
  test("projects ordered workspace and repository command steps without executing them", async () => {
    let planned = 0
    const instance = builder({
      planManualCommand: (_workspace: Workspace, name: string) => {
        planned++
        expect(name).toBe("dev")
        return [
          { bucket: "main", scope: "workspace", commandName: "dev", shell: "bun dev", cwd: "/tasks/alpha" },
          { bucket: "main", scope: "repo", commandName: "dev", shell: "bun test --watch", cwd: "/tasks/alpha/git-stacks", repoName: "git-stacks", repo: ws.repos[0] },
        ]
      },
    })
    const response = await instance.buildWorkspace("alpha", "req_0123456789abcdef")
    expect(planned).toBe(1)
    const launch = response.workspace.launch.named?.[0]
    expect(launch?.name).toBe("dev")
    expect(launch?.steps.map(({ environment: _, ...step }) => step)).toEqual([
      { bucket: "main", scope: "workspace", command: "bun dev", cwd: "/tasks/alpha" },
      { bucket: "main", scope: "repo", command: "bun test --watch", cwd: "/tasks/alpha/git-stacks", repository_id: ws.repos[0]!.id, repository_name: "git-stacks" },
    ])
    expect(launch?.steps[1]?.environment).toEqual(expect.objectContaining({ GS_REPO_NAME: "git-stacks", GS_REPO_PATH: "/tasks/alpha/git-stacks" }))
    expect(WorkspaceSnapshotResponseSchema.parse(response)).toEqual(response)
  })

  test("omits resolved secret values and exposes only reference metadata", async () => {
    const response = await builder().buildWorkspace("alpha", "req_0123456789abcdef")
    expect(response.workspace.launch.environment).toEqual(expect.objectContaining({ NODE_ENV: "development", APP_PORT: "4310" }))
    expect(response.workspace.launch.environment).not.toHaveProperty("API_TOKEN")
    expect(response.workspace.launch.redacted).toEqual(["API_TOKEN"])
    expect(response.workspace.launch.references).toEqual({ API_TOKEN: "env:API_TOKEN" })
    expect(JSON.stringify(response)).not.toContain("resolved-super-secret")
  })

  test("includes resolved ports and excludes hidden commands from named launches", async () => {
    const response = await builder().buildWorkspace("alpha", "req_0123456789abcdef")
    expect(response.workspace.launch.ports).toEqual({ APP_PORT: 4310 })
    expect(response.workspace.launch.commands).toEqual(["dev"])
    expect(response.workspace.launch.named?.map((entry) => entry.name)).toEqual(["dev"])
  })

  test("resolves the complete pre/main/post command plan for browser terminals", async () => {
    const instance = builder()
    const snapshot = await instance.buildWorkspace("alpha", "req_0123456789abcdef")
    const command = snapshot.workspace.launch.named?.[0]
    if (!command) throw new Error("expected command projection")
    const resolution = await instance.resolveTerminalLaunch({
      workspace_id: ws.id,
      repository_id: ws.repos[0]!.id!,
      command_id: command.id,
      expected_revision: snapshot.revision,
    })
    expect(resolution.resolved).toBe(true)
    if (!resolution.resolved) return
    expect(resolution.launch.argv.slice(0, 2)).toEqual(["/bin/sh", "-lc"])
    expect(resolution.launch.argv[2]).toContain("prepare")
    expect(resolution.launch.argv[2]).toContain("bun dev")
    expect(resolution.launch.argv[2]).toContain("bun test --watch")
    expect(resolution.launch.argv[2]).toContain("cleanup")
    expect(resolution.launch.argv[2]).toContain("/tasks/alpha/git-stacks")
  })
})
