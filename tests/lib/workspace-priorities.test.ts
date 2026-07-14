import { describe, expect, test } from "bun:test"
import { WorkspaceSchema, type Workspace } from "../../src/lib/config"
import { setWorkspacePriorities } from "../../src/lib/workspace-priorities"

const workspace = (id: string, name: string, priority?: number): Workspace => ({
  id, name, schema_version: "1", branch: "main", created: "2026-07-13", repos: [],
  ...(priority === undefined ? {} : { priority }),
})

describe("workspace priority metadata", () => {
  test("accepts a signed 32-bit priority", () => {
    expect(WorkspaceSchema.parse({ name: "first", branch: "main", created: "2026-07-13", priority: 12 })).toMatchObject({ priority: 12 })
    expect(() => WorkspaceSchema.parse({ name: "too-large", branch: "main", created: "2026-07-13", priority: 2147483648 })).toThrow()
  })

  test("writes changed priorities and removes the neutral value", () => {
    const first = workspace("11111111-1111-4111-8111-111111111111", "first", 4)
    const second = workspace("22222222-2222-4222-8222-222222222222", "second")
    const written: Workspace[] = []

    setWorkspacePriorities([
      { workspace_id: first.id!, priority: 0 },
      { workspace_id: second.id!, priority: 5 },
    ], { listWorkspaces: () => [first, second], writeWorkspace: (value) => written.push(value) })

    expect(written).toEqual([
      expect.not.objectContaining({ priority: expect.anything() }),
      expect.objectContaining({ id: second.id, priority: 5 }),
    ])
  })

  test("rejects identities that are not backed by a workspace definition", () => {
    expect(() => setWorkspacePriorities([{ workspace_id: "33333333-3333-4333-8333-333333333333", priority: 1 }], { listWorkspaces: () => [], writeWorkspace: () => {} })).toThrow("Unknown workspace identity")
  })
})
