import { describe, expect, test } from "@test/api"
import type { Workspace } from "../../../packages/core/src/config"
import * as Protocol from "../../../packages/protocol/src/service"
import { CoreStateSchema, CoreWorkspaceSchema } from "../../../packages/service/src/policy/core-contract"
import {
  SnapshotBusyError,
  createSnapshotBuilder,
  type SnapshotRevisionStore,
} from "../../../packages/service/src/policy/snapshot"

const workspace = (name = "alpha"): Workspace & { id: string } => ({
  id: "018f47f4-5ab1-7c2d-8e90-123456789abc",
  name,
  schema_version: "1",
  branch: "feature/alpha",
  created: "2026-07-11T00:00:00.000Z",
  repos: [{
    id: "018f47f4-5ab1-7c2d-8e90-abcdef012345",
    name: "git-stacks",
    repo: "git-stacks",
    type: "typescript",
    mode: "worktree",
    main_path: "/main/git-stacks",
    task_path: "/tasks/alpha/git-stacks",
  }],
})

function cardinalityWorkspace(index: number, archived: boolean): Workspace & { id: string } {
  const suffix = String(index).padStart(2, "0")
  return {
    ...workspace(`${archived ? "archived" : "active"}-${suffix}`),
    id: `${archived ? "20000000" : "10000000"}-0000-4000-8000-${String(index).padStart(12, "0")}`,
    ...(archived ? {
      created: "2026-06-01T00:00:00.000Z",
      archived: true as const,
      archived_at: new Date(Date.UTC(2026, 6, index, 12)).toISOString(),
    } : {}),
  }
}

class MemoryStore implements SnapshotRevisionStore {
  state: { digest: string; revision: string } | null = null
  reads = 0
  writes = 0
  async update(digest: string) {
    this.reads++
    if (this.state?.digest === digest) return this.state.revision
    const revision = String(BigInt(this.state?.revision ?? "0") + 1n)
    this.state = { digest, revision }
    this.writes++
    return revision
  }
}

function dependencies(overrides: Record<string, unknown> = {}) {
  return {
    listWorkspaceNames: () => ["alpha"],
    ensureWorkspaceIdentity: () => workspace(),
    fingerprint: async () => "stable",
    getWorkspaceStatus: async () => [{ name: "git-stacks", exists: true, dirty: false, branch: "feature/alpha", mode: "worktree" as const, ahead: 0, behind: 0, additions: 0, removals: 0, degraded: false }],
    getWorkspaceFileStatus: () => ({ summary: { total: 0, ok: 0, warnings: 0, errors: 0, attention: 0, sections: 2, byState: {}, byType: {} }, warnings: [], errors: [] }),
    listManualCommands: () => ["dev"],
    planManualCommand: () => [],
    buildWorkspaceEnv: async () => ({}),
    ensureAgentSignals: () => {},
    config: { workspace_root: "/tasks", integrations: {}, ports: { range_start: 10000, range_end: 65000 } },
    revisionStore: new MemoryStore(),
    clock: () => new Date("2026-07-11T10:00:00.000Z"),
    ...overrides,
  }
}

describe("authoritative service snapshots", () => {
  test("PHASE123_RED catalog activity ordering contract", async () => {
    const archived = {
      ...workspace("archived"),
      id: "018f47f4-5ab1-7c2d-8e90-123456789abd",
      created: "2026-07-01T00:00:00.000Z",
      last_opened: "2026-07-10T00:00:00.000Z",
      archived: true as const,
      archived_at: "2026-07-12T00:00:00.000Z",
    }
    const active = {
      ...workspace("active"),
      id: "018f47f4-5ab1-7c2d-8e90-123456789abe",
      last_opened: "2026-07-11T09:30:00.000Z",
    }
    let activeProjectionReads = 0
    const builder = createSnapshotBuilder(dependencies({
      listWorkspaceNames: () => ["archived", "active"],
      ensureWorkspaceIdentity: (name: string) => name === "archived" ? archived : active,
      getWorkspaceStatus: async (entry: Workspace) => {
        if (entry.archived === true) throw new Error("archived definitions must not be projected")
        activeProjectionReads++
        return [{ name: "git-stacks", exists: true, dirty: false, branch: "feature/alpha", mode: "worktree", ahead: 0, behind: 0, additions: 0, removals: 0, degraded: false }]
      },
    })) as ReturnType<typeof createSnapshotBuilder> & { buildCatalog(): Promise<unknown> }

    const catalog = await builder.buildCatalog()
    const schema = (Protocol as Record<string, unknown>).WorkspaceCatalogSchema as { parse(value: unknown): Record<string, unknown> }
    const parsed = schema.parse(catalog)
    const activeResponse = (parsed.workspaces as Array<{ workspace: unknown }>)[0]!
    expect(activeProjectionReads).toBe(1)
    expect(parsed.workspaces).toEqual([expect.objectContaining({
      workspace: expect.objectContaining({ name: "active", activity_at: active.last_opened }),
    })])
    expect(parsed.archived_workspaces).toEqual([{
      id: archived.id,
      name: archived.name,
      activity_at: archived.archived_at,
    }])
    expect(CoreWorkspaceSchema.parse({ definition: active, projection: activeResponse.workspace }).projection.activity_at).toBe(active.last_opened)
  })

  test("preserves complete larger active and archived catalogs for trusted CoreState consumers", async () => {
    const active = Array.from({ length: 17 }, (_, index) => cardinalityWorkspace(index + 1, false))
    const archived = Array.from({ length: 18 }, (_, index) => cardinalityWorkspace(index + 1, true))
    const definitions = [...active, ...archived].reverse()
    const definitionsByName = new Map(definitions.map((entry) => [entry.name, entry]))
    const builder = createSnapshotBuilder(dependencies({
      listWorkspaceNames: () => definitions.map(({ name }) => name),
      ensureWorkspaceIdentity: (name: string) => definitionsByName.get(name)!,
    })) as ReturnType<typeof createSnapshotBuilder> & { buildCatalog(): Promise<unknown> }

    const catalog = Protocol.WorkspaceCatalogSchema.parse(await builder.buildCatalog())
    expect(catalog.workspaces.map(({ workspace: entry }) => entry.name)).toEqual(active.map(({ name }) => name))
    expect(catalog.archived_workspaces.map(({ name }) => name)).toEqual([...archived].reverse().map(({ name }) => name))

    const coreState = CoreStateSchema.parse({
      revision: catalog.revision,
      generated_at: catalog.generated_at,
      config: {},
      workspaces: catalog.workspaces.map(({ workspace: projection }) => ({
        definition: definitionsByName.get(projection.name),
        projection,
      })),
      archived_workspaces: catalog.archived_workspaces,
      templates: [],
      repositories: [],
    })
    expect(coreState.workspaces).toHaveLength(17)
    expect(coreState.archived_workspaces).toHaveLength(18)
    expect(coreState.workspaces.map(({ definition }) => definition.name)).toEqual(active.map(({ name }) => name))
    expect(coreState.archived_workspaces.map(({ name }) => name)).toEqual([...archived].reverse().map(({ name }) => name))
  })

  test("catalog revision advances through active, all-archived, and archive-only changes", async () => {
    const store = new MemoryStore()
    let definition: Workspace & { id: string } = workspace()
    const builder = createSnapshotBuilder(dependencies({
      revisionStore: store,
      ensureWorkspaceIdentity: () => definition,
    })) as ReturnType<typeof createSnapshotBuilder> & { buildCatalog(): Promise<{ revision: string; workspaces: unknown[]; archived_workspaces: unknown[] }> }

    const active = await builder.buildCatalog()
    definition = { ...definition, archived: true, archived_at: "2026-07-12T00:00:00.000Z" }
    const archived = await builder.buildCatalog()
    definition = { ...definition, archived_at: "2026-07-13T00:00:00.000Z" }
    const archiveOnlyChange = await builder.buildCatalog()

    expect(active.workspaces).toHaveLength(1)
    expect(archived.workspaces).toHaveLength(0)
    expect(archived.archived_workspaces).toHaveLength(1)
    expect(BigInt(archived.revision)).toBeGreaterThan(BigInt(active.revision))
    expect(BigInt(archiveOnlyChange.revision)).toBeGreaterThan(BigInt(archived.revision))
  })

  test("normalizes supported date-only created activity for catalog and core state", async () => {
    const store = new MemoryStore()
    let active = {
      ...workspace("active"),
      id: "018f47f4-5ab1-7c2d-8e90-123456789abe",
      created: "2026-07-14",
    }
    const olderArchived = {
      ...workspace("older-archived"),
      id: "018f47f4-5ab1-7c2d-8e90-123456789abf",
      created: "2026-07-01",
      archived: true as const,
      archived_at: "2026-07-12T10:00:00.000Z",
    }
    const newerArchived = {
      ...workspace("newer-archived"),
      id: "018f47f4-5ab1-7c2d-8e90-123456789ac0",
      created: "2026-07-15",
      archived: true as const,
      archived_at: "2026-07-13T10:00:00.000Z",
    }
    const builder = createSnapshotBuilder(dependencies({
      revisionStore: store,
      listWorkspaceNames: () => ["older-archived", "active", "newer-archived"],
      ensureWorkspaceIdentity: (name: string) => name === "active"
        ? active
        : name === "newer-archived" ? newerArchived : olderArchived,
    })) as ReturnType<typeof createSnapshotBuilder> & { buildCatalog(): Promise<{ revision: string; workspaces: Array<{ workspace: unknown }>; archived_workspaces: Array<{ name: string; activity_at: string }> }> }

    const first = await builder.buildCatalog()
    expect(first.workspaces[0]?.workspace).toEqual(expect.objectContaining({
      name: "active",
      activity_at: "2026-07-14T00:00:00.000Z",
    }))
    expect(CoreWorkspaceSchema.parse({ definition: active, projection: first.workspaces[0]!.workspace }).projection.activity_at)
      .toBe("2026-07-14T00:00:00.000Z")
    expect(first.archived_workspaces).toEqual([
      { id: newerArchived.id, name: newerArchived.name, activity_at: "2026-07-15T00:00:00.000Z" },
      { id: olderArchived.id, name: olderArchived.name, activity_at: olderArchived.archived_at },
    ])

    expect((await builder.buildCatalog()).revision).toBe(first.revision)
    active = { ...active, created: "2026-07-16" }
    expect(BigInt((await builder.buildCatalog()).revision)).toBeGreaterThan(BigInt(first.revision))
  })

  test("retries a raced generation and never returns mixed inputs", async () => {
    const fingerprints = ["a", "b", "c", "c"]
    let statusReads = 0
    const builder = createSnapshotBuilder(dependencies({
      fingerprint: async () => fingerprints.shift()!,
      getWorkspaceStatus: async () => {
        statusReads++
        return [{ name: "git-stacks", exists: true, dirty: statusReads === 1, branch: "feature/alpha", mode: "worktree", ahead: 0, behind: 0, additions: 0, removals: 0, degraded: false }]
      },
    }))

    const result = await builder.buildWorkspace("alpha", "req_0123456789abcdef")
    expect(statusReads).toBe(2)
    expect(result.workspace.status?.[0]?.dirty).toBe(false)
  })

  test("fails with structured snapshot_busy after three raced attempts", async () => {
    let generation = 0
    const builder = createSnapshotBuilder(dependencies({ fingerprint: async () => String(generation++) }))
    await expect(builder.buildWorkspace("alpha", "req_0123456789abcdef")).rejects.toBeInstanceOf(SnapshotBusyError)
    try {
      await builder.buildWorkspace("alpha", "req_0123456789abcdef")
    } catch (error) {
      expect((error as SnapshotBusyError).code).toBe("snapshot_busy")
      expect((error as SnapshotBusyError).attempts).toBe(3)
    }
  })

  test("reuses durable revision for equal projections and advances once for visible change", async () => {
    const store = new MemoryStore()
    let now = "2026-07-11T10:00:00.000Z"
    let dirty = false
    const deps = dependencies({
      revisionStore: store,
      clock: () => new Date(now),
      getWorkspaceStatus: async () => [{ name: "git-stacks", exists: true, dirty, branch: "feature/alpha", mode: "worktree", ahead: 0, behind: 0, additions: 0, removals: 0, degraded: false }],
    })

    expect((await createSnapshotBuilder(deps).buildWorkspace("alpha", "req_0123456789abcdef")).revision).toBe("1")
    now = "2026-07-11T11:00:00.000Z"
    const restarted = createSnapshotBuilder(deps)
    const same = await restarted.buildWorkspace("alpha", "req_0123456789abcdef")
    expect(same.revision).toBe("1")
    expect(same.generated_at).toBe(now)
    dirty = true
    expect((await restarted.buildWorkspace("alpha", "req_0123456789abcdef")).revision).toBe("2")
    expect(store.writes).toBe(2)
  })

  test("projects one or every identity-complete workspace from one generation", async () => {
    const builder = createSnapshotBuilder(dependencies({
      listWorkspaceNames: () => ["beta", "alpha"],
      ensureWorkspaceIdentity: (name: string) => workspace(name),
    }))
    expect((await builder.buildAll()).map((entry) => entry.workspace.name)).toEqual(["alpha", "beta"])
    const one = await builder.buildWorkspace("alpha", "req_0123456789abcdef")
    expect(one.workspace.repositories.map((repo) => repo.id)).toEqual(["018f47f4-5ab1-7c2d-8e90-abcdef012345"])
    expect(one.workspace.commands).toEqual(["dev"])
  })

  test("omits a workspace deleted during aggregate projection", async () => {
    const name = `missing-${Date.now()}`
    const builder = createSnapshotBuilder(dependencies({
      listWorkspaceNames: () => [name],
      ensureWorkspaceIdentity: () => {
        throw new Error(`Workspace '${name}' not found.`)
      },
    }))
    // The production disappearance classification uses the authoritative file.
    // This dependency-level test exercises the same aggregate omission through
    // a name that has no backing YAML.
    expect(await builder.buildAll()).toEqual([])
  })

  test("projects workspace labels for client sidebar grouping", async () => {
    const labeled = { ...workspace(), labels: ["client", "urgent"] }
    const builder = createSnapshotBuilder(dependencies({ ensureWorkspaceIdentity: () => labeled }))
    const snapshot = await builder.buildWorkspace("alpha", "req_labels_0123456789")
    expect(snapshot.workspace.labels).toEqual(["client", "urgent"])
  })

  test("reports one aggregate revision for a current authoritative build", async () => {
    const builder = createSnapshotBuilder(dependencies({
      listWorkspaceNames: () => ["alpha", "beta"],
      ensureWorkspaceIdentity: (name: string) => workspace(name),
      getWorkspaceStatus: async (entry: Workspace) => [{ name: "git-stacks", exists: true, dirty: entry.name === "beta", branch: "feature/alpha", mode: "worktree", ahead: 0, behind: 0, additions: 0, removals: 0, degraded: false }],
    }))
    expect(await builder.currentRevision()).toBe("1")
  })

  test("reloads global config between aggregate generations", async () => {
    let workspaceRoot = "/tasks-one"
    const builder = createSnapshotBuilder(dependencies({
      config: () => ({ workspace_root: workspaceRoot, integrations: {}, ports: { range_start: 10000, range_end: 65000 } }),
      planManualCommand: (_workspace: Workspace, _name: string, config: { workspace_root: string }) => [{
        bucket: "main", scope: "workspace", commandName: "dev", shell: "echo dev",
        cwd: `${config.workspace_root}/tasks/alpha`,
      }],
    }))

    const first = (await builder.buildAll())[0]!
    expect(first.workspace.launch.cwd).toBe("/tasks-one/tasks/alpha")
    expect(first.workspace.launch.named?.[0]?.steps[0]?.cwd).toBe("/tasks-one/tasks/alpha")

    workspaceRoot = "/tasks-two"
    const second = (await builder.buildAll())[0]!
    expect(second.workspace.launch.cwd).toBe("/tasks-two/tasks/alpha")
    expect(second.workspace.launch.named?.[0]?.steps[0]?.cwd).toBe("/tasks-two/tasks/alpha")
    expect(second.revision).not.toBe(first.revision)
  })

  test("resolves configured commands as separate typed user-shell steps", async () => {
    const installs: Array<[string, string]> = []
    const builder = createSnapshotBuilder(dependencies({
      planManualCommand: () => [{ bucket: "main", scope: "workspace", shell: "for i in 1 2; do echo $i; done", cwd: "/tasks/alpha", environment: {} }],
      ensureAgentSignals: (path: string, name: string) => installs.push([path, name]),
    }))
    const snapshot = (await builder.buildAll())[0]!
    const command = snapshot.workspace.launch.named![0]!
    const resolution = await builder.resolveTerminalLaunch({
      workspace_id: snapshot.workspace.id,
      repository_id: snapshot.workspace.repositories[0]!.id,
      command_id: command.id,
      expected_revision: snapshot.revision,
    })
    expect(resolution.resolved).toBe(true)
    if (resolution.resolved) {
      expect(resolution.launch.configuration.shell).toBe(false)
      if (!resolution.launch.configuration.shell) {
        expect(resolution.launch.steps).toEqual([expect.objectContaining({
          bucket: "main", scope: "workspace", command: "for i in 1 2; do echo $i; done", cwd: "/tasks/alpha",
        })])
      }
    }
    expect(installs).toEqual([["/tasks/alpha/git-stacks", "alpha"]])
  })

  test("resolves secrets and volatile shell inputs for each launch without changing the snapshot", async () => {
    let secret = "phase124-secret-a"
    let dynamic = { PATH: "/phase124/a/bin", SSH_AUTH_SOCK: "/tmp/phase124-a.sock" }
    const agentPaths: string[] = []
    const definition = { ...workspace(), env: { API_TOKEN: "${{ env:API_TOKEN }}" } }
    const builder = createSnapshotBuilder(dependencies({
      ensureWorkspaceIdentity: () => definition,
      planManualCommand: () => [{ bucket: "main", scope: "workspace", shell: "print-current-env", cwd: "/tasks/alpha", environment: {} }],
      buildWorkspaceEnv: async (_workspace: Workspace, options: { skipSecrets: boolean }) => options.skipSecrets
        ? { VISIBLE: "stable" }
        : { VISIBLE: "stable", API_TOKEN: secret },
      prepareAgentSignals: (_path: string, _name: string, environment: Record<string, string>) => {
        agentPaths.push(environment.PATH)
        return {}
      },
    }), {
      dynamicEnvironment: () => dynamic,
      shellEnvironment: () => ({ SHELL: "/bin/bash" }),
    })

    const snapshot = (await builder.buildAll())[0]!
    const projected = JSON.stringify(snapshot)
    expect(projected).not.toContain(secret)
    expect(projected).not.toContain(dynamic.PATH)
    expect(projected).not.toContain(dynamic.SSH_AUTH_SOCK)
    const commandId = snapshot.workspace.launch.named![0]!.id
    const request = {
      workspace_id: snapshot.workspace.id,
      repository_id: snapshot.workspace.repositories[0]!.id,
      command_id: commandId,
      expected_revision: snapshot.revision,
    }

    const launchA = await builder.resolveTerminalLaunch(request)
    secret = "phase124-secret-b"
    dynamic = { PATH: "/phase124/b/bin", SSH_AUTH_SOCK: "/tmp/phase124-b.sock" }
    const launchB = await builder.resolveTerminalLaunch(request)

    expect(launchA.resolved && !launchA.launch.configuration.shell ? launchA.launch.steps[0]?.environment : undefined).toMatchObject({
      API_TOKEN: "phase124-secret-a",
      PATH: "/phase124/a/bin",
      SSH_AUTH_SOCK: "/tmp/phase124-a.sock",
    })
    expect(launchB.resolved && !launchB.launch.configuration.shell ? launchB.launch.steps[0]?.environment : undefined).toMatchObject({
      API_TOKEN: "phase124-secret-b",
      PATH: "/phase124/b/bin",
      SSH_AUTH_SOCK: "/tmp/phase124-b.sock",
    })
    expect(agentPaths).toEqual(["/phase124/a/bin", "/phase124/b/bin"])
    expect((await builder.buildAll())[0]!.revision).toBe(snapshot.revision)
    expect(JSON.stringify(await builder.buildAll())).not.toContain("phase124-secret-b")
  })

  test("reuses the delivered aggregate when launching a terminal from its revision", async () => {
    let statusReads = 0
    const builder = createSnapshotBuilder(dependencies({
      getWorkspaceStatus: async () => {
        statusReads++
        return [{ name: "git-stacks", exists: true, dirty: false, branch: "feature/alpha", mode: "worktree", ahead: 0, behind: 0, additions: 0, removals: 0, degraded: false }]
      },
    }))
    const snapshot = (await builder.buildAll())[0]!
    expect(statusReads).toBe(1)

    const resolved = await builder.resolveTerminalLaunch({
      workspace_id: snapshot.workspace.id,
      repository_id: snapshot.workspace.repositories[0]!.id,
      expected_revision: snapshot.revision,
    })

    expect(resolved.resolved).toBe(true)
    if (resolved.resolved && resolved.launch.configuration.shell) {
      expect(resolved.launch.initialization).toEqual({
        kind: "post-init-environment",
        shell: expect.stringMatching(/^(bash|zsh|fish)$/),
      })
      expect(resolved.launch.argv[0]).toMatch(/\/(?:bash|zsh|fish)$/)
      expect(resolved.launch.argv).toContain(resolved.launch.initialization?.shell === "fish" ? "--interactive" : "-i")
    }
    expect(statusReads).toBe(1)

    await builder.resolveTerminalLaunch({
      workspace_id: snapshot.workspace.id,
      repository_id: snapshot.workspace.repositories[0]!.id,
      expected_revision: "999",
    })
    expect(statusReads).toBe(2)
  })

  test("configures agent signals for shells and degrades safely when setup fails", async () => {
    const installs: Array<[string, string]> = []
    const builder = createSnapshotBuilder(dependencies({
      ensureAgentSignals: (path: string, name: string) => installs.push([path, name]),
    }))
    const snapshot = (await builder.buildAll())[0]!
    const request = {
      workspace_id: snapshot.workspace.id,
      repository_id: snapshot.workspace.repositories[0]!.id,
      expected_revision: snapshot.revision,
    }
    expect((await builder.resolveTerminalLaunch(request)).resolved).toBe(true)
    expect(installs).toEqual([["/tasks/alpha/git-stacks", "alpha"]])

    const broken = createSnapshotBuilder(dependencies({
      ensureAgentSignals: () => { throw new Error("Cannot safely update .codex/hooks.json") },
    }))
    const brokenSnapshot = (await broken.buildAll())[0]!
    const degraded = await broken.resolveTerminalLaunch({ ...request, expected_revision: brokenSnapshot.revision })
    expect(degraded.resolved).toBe(true)
    if (degraded.resolved) expect(degraded.launch.environment).toMatchObject({
      GIT_STACKS_AGENT_SIGNALS: "degraded",
      GIT_STACKS_AGENT_INTEGRATION_HEALTH: "setup-failed",
      GIT_STACKS_AGENT_INTEGRATION_ERROR: "Cannot safely update .codex/hooks.json",
    })
  })

  test("assigns stable positive revisions to empty state and advances through A -> empty -> A", async () => {
    const store = new MemoryStore()
    let names: string[] = []
    const builder = createSnapshotBuilder(dependencies({ revisionStore: store, listWorkspaceNames: () => names }))
    expect(await builder.currentRevision()).toBe("1")
    expect(await builder.currentRevision()).toBe("1")
    names = ["alpha"]
    expect(await builder.currentRevision()).toBe("2")
    names = []
    expect(await builder.currentRevision()).toBe("3")
    names = ["alpha"]
    expect(await builder.currentRevision()).toBe("4")
  })
})
