import { describe, expect, test } from "bun:test"
import { planWorkspaceRecreate } from "@/lib/workspace-recreate"
import type { RepoRegistryEntry, Template, Workspace } from "@/lib/config"

const registry: RepoRegistryEntry[] = [{
  name: "api", schema_version: "1", local_path: "/repos/api", default_branch: "main", type: "typescript", is_dir: false,
}]

function workspace(): Workspace {
  return {
    name: "edge", schema_version: "1", branch: "feature/edge", created: "2026-01-01",
    description: "user description", template: "edge-template", labels: ["team:core"],
    cmux_workspace_id: "runtime", last_opened: "2026-01-02T00:00:00.000Z",
    settings: { integrations: { old: { enabled: true } } },
    repos: [{
      name: "api", repo: "api", type: "other", mode: "worktree", main_path: "/old/api",
      task_path: "/tasks/edge/api", base_branch: "legacy", commands: { check: "old" },
    }],
  }
}

describe("planWorkspaceRecreate", () => {
  test("applies template and registry operational state while preserving identity/runtime state", () => {
    const template: Template = {
      name: "edge-template", schema_version: "1",
      repos: [{ repo: "api", mode: "trunk", base_branch: "release", commands: { check: "new" } }],
      hooks: { pre_open: ["echo open"] }, env: { API: "template" }, ports: { web: 3000 },
    }

    const plan = planWorkspaceRecreate(workspace(), template, registry, "/tasks")

    expect(plan.desired).toMatchObject({
      name: "edge", branch: "feature/edge", created: "2026-01-01", description: "user description",
      labels: ["team:core"], cmux_workspace_id: "runtime", last_opened: "2026-01-02T00:00:00.000Z",
      hooks: { pre_open: ["echo open"] }, env: { API: "template" }, ports: { web: 3000 },
    })
    expect(plan.desired.settings).toBeUndefined()
    expect(plan.desired.repos).toEqual([{
      name: "api", repo: "api", type: "typescript", mode: "trunk", main_path: "/repos/api",
      task_path: "/repos/api", base_branch: "release", commands: { check: "new" },
    }])
    expect(plan.worktreeOperations).toMatchObject([{
      kind: "remove", repo: { name: "api", task_path: "/tasks/edge/api" },
    }])
  })

  test("fails before mutation when a composed template repo is absent from the registry", () => {
    expect(() => planWorkspaceRecreate(workspace(), {
      name: "edge-template", schema_version: "1", repos: [{ repo: "missing", mode: "worktree" }],
    }, registry, "/tasks")).toThrow("missing registry repos: missing")
  })
})
