import { describe, expect, test } from "bun:test"
import type { WorkspaceSnapshotResponse } from "../../packages/protocol/src/service"
import { projectWebOperation, projectWebSnapshot, projectWebTerminalSignals } from "../../packages/service/src/web/projection"

const workspaceId = "11111111-1111-4111-8111-111111111111"
const repositoryId = "22222222-2222-4222-8222-222222222222"

describe("browser-safe service projection", () => {
  test("omits paths, commands, environment, secret references, ports, and launch details", () => {
    const trusted = [{
      protocol: "v1", request_id: "req_abcdefghijklmnop", ok: true, revision: "7", generated_at: "2026-07-13T12:00:00.000Z",
      workspace: {
        id: workspaceId, name: "demo", branch: "feature/web", labels: ["active"], pinned: true, priority: 12,
        repositories: [{ id: repositoryId, name: "repo", mode: "worktree", path: "/secret/path" }],
        status: [{ repository_id: repositoryId, name: "repo", exists: true, dirty: true, branch: "feature/web", default_branch: "main", mode: "worktree", ahead: 1, behind: 2, additions: 3, removals: 4, remote: "available", degraded: false }],
        file_status: { total: 1, ok: 0, warnings: 1, errors: 0, attention: 1 },
        launch: {
          commands: ["SECRET_COMMAND"], environment: { TOKEN: "SECRET_ENV" }, redacted: ["TOKEN"], references: { TOKEN: "vault:path" }, cwd: "/secret/cwd", ports: { api: 9999 },
          named: [{ id: "cmd_abcdefghijklmnop", name: "Tests", scope: "repository", repository_id: repositoryId, steps: [{ bucket: "main", scope: "repo", command: "SECRET_STEP", cwd: "/secret/step", repository_id: repositoryId, repository_name: "repo", environment: { TOKEN: "SECRET_STEP_ENV" } }] }],
        },
      },
    }] as WorkspaceSnapshotResponse[]
    const projected = projectWebSnapshot(trusted)
    expect(projected.revision).toBe("7")
    expect(projected.pinned_workspace_ids).toEqual([workspaceId])
    expect(projected.workspaces[0]?.priority).toBe(12)
    expect(projected.workspaces[0]?.commands).toEqual([{ id: "cmd_abcdefghijklmnop", name: "Tests", scope: "repository", repository_id: repositoryId }])
    const encoded = JSON.stringify(projected)
    for (const secret of ["/secret/path", "SECRET_COMMAND", "SECRET_ENV", "vault:path", "/secret/cwd", "9999", "SECRET_STEP", "SECRET_STEP_ENV"]) expect(encoded).not.toContain(secret)
  })

  test("allowlists operation progress, result, and error fields", () => {
    const operation = projectWebOperation({
      operation_id: "op_abcdefghijklmnop", state: "succeeded", accepted_at: "2026-07-13T12:00:00.000Z", started_at: "2026-07-13T12:00:01.000Z", finished_at: "2026-07-13T12:00:02.000Z", completed_steps: ["secret-step"],
      result: { workspace_name: "demo", snapshot_changed: true, path: "/secret/result", env: "TOKEN" },
    })
    expect(operation.result).toEqual({ workspace_name: "demo", snapshot_changed: true })
    expect(JSON.stringify(operation)).not.toContain("secret-step")
    expect(JSON.stringify(operation)).not.toContain("/secret/result")
  })

  test("exposes activity only while its service-owned browser tab still exists", () => {
    const liveSurface = "33333333-3333-4333-8333-333333333333"
    const staleSurface = "44444444-4444-4444-8444-444444444444"
    const common = { version: 1 as const, source: "codex" as const, workspace_id: workspaceId, repository_id: repositoryId, session_id: "agent", state: "working" as const, occurred_at: "2026-07-14T10:00:00.000Z" }
    const signals = [
      { ...common, kind: "activity" as const, id: "sig_0123456789abcdef", surface_id: liveSurface },
      { ...common, kind: "activity" as const, id: "sig_1123456789abcdef", surface_id: staleSurface },
      { ...common, kind: "notification" as const, id: "sig_2123456789abcdef", title: "Keep unread", surface_id: undefined, session_id: undefined, state: undefined },
    ]

    expect(projectWebTerminalSignals(signals, new Set([liveSurface])).map((signal) => signal.id)).toEqual([
      "sig_0123456789abcdef",
      "sig_2123456789abcdef",
    ])
  })
})
