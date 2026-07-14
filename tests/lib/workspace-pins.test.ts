import { describe, expect, test } from "bun:test"
import { WorkspaceSchema, type Workspace } from "../../src/lib/config"
import { setWorkspacePins } from "../../src/lib/workspace-pins"

const workspace = (id: string, name: string, pinned?: boolean): Workspace => ({
  id, name, schema_version: "1", branch: "main", created: "2026-07-13", repos: [],
  ...(pinned === undefined ? {} : { pinned }),
})

describe("workspace definition pin metadata", () => {
  test("accepts pinning as simple workspace metadata", () => {
    expect(WorkspaceSchema.parse({ name: "pinned", branch: "main", created: "2026-07-13", pinned: true })).toMatchObject({ pinned: true })
  })

  test("writes pins into workspace definitions and removes stale pin fields", () => {
    const first = workspace("11111111-1111-4111-8111-111111111111", "first", true)
    const second = workspace("22222222-2222-4222-8222-222222222222", "second")
    const written: Workspace[] = []

    setWorkspacePins([second.id!], { listWorkspaces: () => [first, second], writeWorkspace: (value) => written.push(value) })
    expect(written).toEqual([expect.not.objectContaining({ pinned: true }), expect.objectContaining({ id: second.id, pinned: true })])

    written.length = 0
    setWorkspacePins([], { listWorkspaces: () => [first, second], writeWorkspace: (value) => written.push(value) })
    expect(written).toHaveLength(1)
    expect(written[0]).not.toHaveProperty("pinned")
  })

  test("rejects identities that are not backed by a workspace definition", () => {
    expect(() => setWorkspacePins(["33333333-3333-4333-8333-333333333333"], { listWorkspaces: () => [], writeWorkspace: () => {} })).toThrow("Unknown workspace identity")
  })
})
