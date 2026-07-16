import { afterEach, describe, expect, test } from "@test/api"
import { existsSync, unlinkSync } from "fs"

import {
  inspectWorkspaceDefinition,
  WorkspaceSchema,
  readWorkspace,
  updateWorkspaceGuarded,
  workspacePath,
  writeWorkspace,
  type Workspace,
} from "../../packages/core/src/config"

const created: string[] = []

function remember(workspace: Workspace): Workspace {
  created.push(workspace.name)
  writeWorkspace(workspace)
  return workspace
}

afterEach(() => {
  for (const name of created.splice(0)) {
    const path = workspacePath(name)
    if (existsSync(path)) unlinkSync(path)
  }
})

describe("workspace archive persistence", () => {
  test("archive fields are a canonical paired state while omitted fields remain active", () => {
    const active = { name: "archive-schema-active", branch: "main", created: "2026-07-16" }

    expect(WorkspaceSchema.parse(active)).not.toHaveProperty("archived")
    expect(() => WorkspaceSchema.parse({ ...active, archived: false })).toThrow()
    expect(() => WorkspaceSchema.parse({ ...active, archived: true })).toThrow()
    expect(() => WorkspaceSchema.parse({ ...active, archived_at: "2026-07-16T06:00:00.000Z" })).toThrow()
    expect(WorkspaceSchema.parse({
      ...active,
      archived: true,
      archived_at: "2026-07-16T06:00:00.000Z",
    })).toMatchObject({ archived: true, archived_at: "2026-07-16T06:00:00.000Z" })
  })

  test("PHASE123_RED core archive removal contract", async () => {
    const { archiveWorkspace, unarchiveWorkspace } = await import("../../packages/core/src/workspace-archive")
    const original = remember(WorkspaceSchema.parse({
      id: "11111111-1111-4111-8111-111111111111",
      name: "phase123-archive-contract",
      schema_version: "1",
      description: "preserve every non-terminal field",
      branch: "feature/archive",
      created: "2026-07-01",
      last_opened: "2026-07-15T10:00:00.000Z",
      template: "full-stack",
      settings: { integrations: { editor: { enabled: true } } },
      repos: [],
      env: { FEATURE_FLAG: "true" },
      files: { copy: [".env.example"] },
      labels: ["phase:123"],
      pinned: true,
      priority: 42,
      commands: { verify: "npm test" },
    }))
    const firstTimestamp = "2026-07-16T06:01:02.003Z"

    const archived = archiveWorkspace(original.name, { clock: () => new Date(firstTimestamp) })
    expect(archived).toEqual({ ...original, archived: true, archived_at: firstTimestamp })

    const repeated = archiveWorkspace(original.name, { clock: () => new Date("2027-01-01T00:00:00.000Z") })
    expect(repeated.archived_at).toBe(firstTimestamp)
    expect(readWorkspace(original.name)).toEqual(repeated)

    const active = unarchiveWorkspace(original.name)
    expect(active).toEqual(original)
    expect(readWorkspace(original.name)).toEqual(original)
  })

  test("archive rejects a same-name replacement with a different stable ID", async () => {
    const { archiveWorkspace } = await import("../../packages/core/src/workspace-archive")
    const original = remember(WorkspaceSchema.parse({
      id: "22222222-2222-4222-8222-222222222222",
      name: "phase123-same-name-replacement",
      branch: "feature/original",
      created: "2026-07-16",
    }))
    const replacement = WorkspaceSchema.parse({
      ...original,
      id: "33333333-3333-4333-8333-333333333333",
      branch: "feature/replacement",
    })
    writeWorkspace(replacement)

    expect(() => archiveWorkspace(original.name, { expectedId: original.id })).toThrow("identity changed")
    expect(readWorkspace(original.name)).toEqual(replacement)
    expect(readWorkspace(original.name)).not.toHaveProperty("archived")
  })

  test("guarded mutation rejects a same-ID definition edit after inspection", () => {
    const original = remember(WorkspaceSchema.parse({
      id: "44444444-4444-4444-8444-444444444444",
      name: "phase123-fingerprint-guard",
      branch: "feature/original",
      created: "2026-07-16",
    }))
    const guard = inspectWorkspaceDefinition(original.name, original.id)
    const externallyEdited = { ...original, description: "edited after inspection" }
    writeWorkspace(externallyEdited)

    expect(() => updateWorkspaceGuarded(guard, (workspace) => ({
      ...workspace,
      archived: true,
      archived_at: "2026-07-16T12:00:00.000Z",
    }))).toThrow("changed since inspection")
    expect(readWorkspace(original.name)).toEqual(externallyEdited)
    expect(readWorkspace(original.name)).not.toHaveProperty("archived")
  })

  test("guarded mutation never follows a stable ID to a renamed definition", () => {
    const original = remember(WorkspaceSchema.parse({
      id: "55555555-5555-4555-8555-555555555555",
      name: "phase123-rename-original",
      branch: "feature/original",
      created: "2026-07-16",
    }))
    const guard = inspectWorkspaceDefinition(original.name, original.id)
    unlinkSync(workspacePath(original.name))
    const renamed = remember({ ...original, name: "phase123-rename-successor" })

    expect(() => updateWorkspaceGuarded(guard, (workspace) => ({
      ...workspace,
      archived: true,
      archived_at: "2026-07-16T12:00:00.000Z",
    }))).toThrow("changed or disappeared")
    expect(readWorkspace(renamed.name)).toEqual(renamed)
    expect(readWorkspace(renamed.name)).not.toHaveProperty("archived")
  })
})
