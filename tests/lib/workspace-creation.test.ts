import { describe, expect, mock, test } from "bun:test"
import type { RepoRegistryEntry, Template } from "@/lib/config"
import { createWorkspaceFromRequest, getWorkspaceCreationCatalog, planWorkspaceCreation } from "@/lib/workspace-creation"

const registry: RepoRegistryEntry[] = [
  { name: "app", schema_version: "1", local_path: "/repos/app", default_branch: "main", type: "typescript", is_dir: false },
  { name: "docs", schema_version: "1", local_path: "/repos/docs", default_branch: "main", type: "other", is_dir: true },
]

const template: Template = {
  name: "full", schema_version: "1", repos: [{ repo: "app", mode: "worktree", commands: { dev: "bun dev" } }],
  hooks: { pre_create: ["prepare"] }, commands: { start: "run" }, env: { MODE: "dev" }, env_file: ".env",
  files: { copy: ["a"] }, ports: { web: 3000 }, labels: ["team:app"],
  integrations: { vscode: { enabled: true } },
}

function deps(overrides: Record<string, unknown> = {}) {
  return {
    readRegistry: () => registry,
    composeTemplates: mock(() => template),
    workspaceExists: mock(() => false),
    getTasksDir: () => "/tasks",
    validateBranch: mock(async () => true),
    createWorkspace: mock(async (inputs: any) => ({ ok: true as const, workspace: { ...inputs, name: inputs.wsName, schema_version: "1", created: "2026-01-01" } })),
    ...overrides,
  }
}

describe("planWorkspaceCreation", () => {
  test("resolves the full template snapshot", async () => {
    const result = await planWorkspaceCreation({ name: "demo", branch: "feature/demo", source: { kind: "template", template: "full" } }, deps())
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.plan.inputs).toMatchObject({
      wsName: "demo", branch: "feature/demo", templateName: "full", templateLabels: ["team:app"],
      wsHooks: template.hooks, wsCommands: template.commands, wsEnv: template.env, wsEnvFile: ".env",
      wsFiles: template.files, wsPorts: template.ports, wsIntegrationSettings: template.integrations,
      repos: [{ name: "app", mode: "worktree", task_path: "/tasks/demo/app", commands: { dev: "bun dev" } }],
    })
  })

  test("preserves direct repository order and maps directory entries", async () => {
    const result = await planWorkspaceCreation({ name: "demo", branch: "topic", source: { kind: "repositories", repositories: ["docs", "app"] } }, deps())
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.plan.inputs.repos).toMatchObject([{ name: "docs", mode: "dir" }, { name: "app", mode: "worktree" }])
  })

  for (const [label, request, code] of [
    ["invalid name", { name: "../bad", branch: "topic", source: { kind: "repositories", repositories: ["app"] } }, "invalid_name"],
    ["empty source", { name: "demo", branch: "topic", source: { kind: "repositories", repositories: [] } }, "invalid_source"],
    ["duplicates", { name: "demo", branch: "topic", source: { kind: "repositories", repositories: ["app", "app"] } }, "invalid_source"],
    ["missing repository", { name: "demo", branch: "topic", source: { kind: "repositories", repositories: ["missing"] } }, "not_found"],
  ] as const) {
    test(`rejects ${label}`, async () => {
      const result = await planWorkspaceCreation(request as any, deps())
      expect(result).toMatchObject({ ok: false, code })
    })
  }

  test("rejects invalid branches and existing workspaces", async () => {
    expect(await planWorkspaceCreation({ name: "demo", branch: "bad", source: { kind: "repositories", repositories: ["app"] } }, deps({ validateBranch: async () => false }))).toMatchObject({ code: "invalid_branch" })
    expect(await planWorkspaceCreation({ name: "demo", branch: "topic", source: { kind: "repositories", repositories: ["app"] } }, deps({ workspaceExists: () => true }))).toMatchObject({ code: "already_exists" })
  })

  test("reports missing templates without mutation", async () => {
    const create = mock(async () => { throw new Error("must not run") })
    const result = await createWorkspaceFromRequest({ name: "demo", branch: "topic", source: { kind: "template", template: "missing" } }, undefined, deps({ composeTemplates: () => { throw new Error("missing") }, createWorkspace: create }))
    expect(result).toMatchObject({ ok: false, code: "not_found" })
    expect(create).not.toHaveBeenCalled()
  })
})

describe("createWorkspaceFromRequest", () => {
  test("preserves lifecycle failure and rollback errors", async () => {
    const result = await createWorkspaceFromRequest(
      { name: "demo", branch: "topic", source: { kind: "repositories", repositories: ["app"] } }, undefined,
      deps({ createWorkspace: async () => ({ ok: false, error: "hook failed", rollbackErrors: ["remove failed"] }) }),
    )
    expect(result).toEqual({ ok: false, code: "creation_failed", error: "hook failed", rollbackErrors: ["remove failed"] })
  })
})

describe("getWorkspaceCreationCatalog", () => {
  test("projects sorted display metadata without paths or executable configuration", () => {
    const catalog = getWorkspaceCreationCatalog({ listTemplates: () => [template], readRegistry: () => registry })
    expect(catalog.templates).toEqual([{ name: "full", repository_count: 1, command_count: 2, labels: ["team:app"] }])
    expect(catalog.repositories.map((repo) => repo.name)).toEqual(["app", "docs"])
    expect(JSON.stringify(catalog)).not.toContain("/repos/")
    expect(JSON.stringify(catalog)).not.toContain("prepare")
    expect(JSON.stringify(catalog)).not.toContain("MODE")
  })
})
