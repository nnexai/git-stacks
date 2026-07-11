import { describe, expect, test } from "bun:test"
import type { Workspace } from "../../../src/lib/config"
import {
  SnapshotBusyError,
  createSnapshotBuilder,
  type SnapshotRevisionStore,
} from "../../../src/lib/service/snapshot"

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
    getWorkspaceStatus: async () => [{ name: "git-stacks", exists: true, dirty: false, branch: "feature/alpha", mode: "worktree" as const, ahead: 0, behind: 0 }],
    getWorkspaceFileStatus: () => ({ summary: { total: 0, ok: 0, warnings: 0, errors: 0, attention: 0, sections: 2, byState: {}, byType: {} }, warnings: [], errors: [] }),
    listManualCommands: () => ["dev"],
    planManualCommand: () => [],
    buildWorkspaceEnv: async () => ({}),
    config: { workspace_root: "/tasks", integrations: {}, ports: { range_start: 10000, range_end: 65000 } },
    revisionStore: new MemoryStore(),
    clock: () => new Date("2026-07-11T10:00:00.000Z"),
    ...overrides,
  }
}

describe("authoritative service snapshots", () => {
  test("retries a raced generation and never returns mixed inputs", async () => {
    const fingerprints = ["a", "b", "c", "c"]
    let statusReads = 0
    const builder = createSnapshotBuilder(dependencies({
      fingerprint: async () => fingerprints.shift()!,
      getWorkspaceStatus: async () => {
        statusReads++
        return [{ name: "git-stacks", exists: true, dirty: statusReads === 1, branch: "feature/alpha", mode: "worktree", ahead: 0, behind: 0 }]
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
      getWorkspaceStatus: async () => [{ name: "git-stacks", exists: true, dirty, branch: "feature/alpha", mode: "worktree", ahead: 0, behind: 0 }],
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

  test("reports one aggregate revision for a current authoritative build", async () => {
    const builder = createSnapshotBuilder(dependencies({
      listWorkspaceNames: () => ["alpha", "beta"],
      ensureWorkspaceIdentity: (name: string) => workspace(name),
      getWorkspaceStatus: async (entry: Workspace) => [{ name: "git-stacks", exists: true, dirty: entry.name === "beta", branch: "feature/alpha", mode: "worktree", ahead: 0, behind: 0 }],
    }))
    expect(await builder.currentRevision()).toBe("1")
  })

  test("does not invent a snapshot revision when no workspaces exist", async () => {
    const builder = createSnapshotBuilder(dependencies({ listWorkspaceNames: () => [] }))
    expect(await builder.currentRevision()).toBe("0")
  })
})
