import { describe, expect, test } from "vitest"

import {
  buildAttentionCandidates,
  selectNextAttentionTarget,
  type AttentionInput,
} from "@git-stacks/client"

const workspaces: AttentionInput["workspaces"] = [
  {
    id: "workspace-beta",
    name: "Beta",
    activity_at: "2026-07-14T00:00:00.000Z",
    priority: 0,
    repositories: [{ id: "repo-z", name: "Zulu" }],
  },
  {
    id: "workspace-alpha",
    name: "Alpha",
    activity_at: "2026-07-13T00:00:00.000Z",
    pinned: true,
    priority: 0,
    repositories: [{ id: "repo-b", name: "Beta" }, { id: "repo-a", name: "Alpha" }],
  },
]

const terminal = (id: string, workspaceId: string, repositoryId: string, surfaceId: string, state = "running") => ({
  id, workspace_id: workspaceId, repository_id: repositoryId, surface_id: surfaceId, state,
})

const signal = (id: string, workspaceId: string, repositoryId?: string, surfaceId?: string, overrides: Record<string, unknown> = {}) => ({
  version: 1 as const,
  id,
  kind: "activity" as const,
  source: "codex" as const,
  workspace_id: workspaceId,
  repository_id: repositoryId,
  surface_id: surfaceId,
  session_id: `session-${id}`,
  state: "waiting" as const,
  occurred_at: "2026-07-16T10:00:00.000Z",
  ...overrides,
})

const baseInput = (): AttentionInput => ({
  workspaces,
  signals: [],
  terminals: [
    terminal("term-a1", "workspace-alpha", "repo-a", "surface-a1"),
    terminal("term-a2", "workspace-alpha", "repo-a", "surface-a2"),
    terminal("term-b1", "workspace-alpha", "repo-b", "surface-b1"),
    terminal("term-z1", "workspace-beta", "repo-z", "surface-z1"),
  ],
  tabOrder: ["term-a2", "term-a1", "term-b1", "term-z1"],
})

describe("client Next Attention semantics", () => {
  test("keeps only needs-attention signals with active workspace and repository membership", () => {
    const input = baseInput()
    input.signals = [
      signal("valid", "workspace-alpha", "repo-a"),
      signal("completed", "workspace-alpha", "repo-b", "surface-b1", { state: "completed" }),
      signal("working", "workspace-alpha", "repo-a", undefined, { state: "working" }),
      signal("removed-workspace", "workspace-removed", "repo-a"),
      signal("missing-repository", "workspace-alpha", "repo-removed"),
      signal("workspace-only", "workspace-alpha"),
      signal("dismissed", "workspace-alpha", "repo-b"),
    ]
    input.dismissedSignalIds = ["dismissed"]

    expect(buildAttentionCandidates(input).map(({ signal }) => signal.id)).toEqual(["valid", "completed"])
  })

  test("resolves live named terminals, keeps repository-only targets, and skips stale or ended surfaces", () => {
    const input = baseInput()
    input.signals = [
      signal("repo", "workspace-alpha", "repo-a"),
      signal("live", "workspace-alpha", "repo-a", "surface-a1"),
      signal("missing", "workspace-alpha", "repo-a", "surface-gone"),
      signal("ended", "workspace-alpha", "repo-a", "surface-ended"),
    ]
    input.terminals = [...input.terminals, terminal("term-ended", "workspace-alpha", "repo-a", "surface-ended", "ended")]

    expect(buildAttentionCandidates(input).map(({ target }) => target)).toEqual([
      { workspaceId: "workspace-alpha", repositoryId: "repo-a" },
      { workspaceId: "workspace-alpha", repositoryId: "repo-a", terminalId: "term-a1", surfaceId: "surface-a1" },
    ])
  })

  test("orders workspace successor, repository, and terminal tab tiers deterministically", () => {
    const input = baseInput()
    input.signals = [
      signal("z", "workspace-beta", "repo-z", "surface-z1"),
      signal("b", "workspace-alpha", "repo-b", "surface-b1"),
      signal("a1", "workspace-alpha", "repo-a", "surface-a1"),
      signal("a2", "workspace-alpha", "repo-a", "surface-a2"),
    ]

    expect(buildAttentionCandidates(input).map(({ signal }) => signal.id)).toEqual(["a2", "a1", "b", "z"])
  })

  test("deduplicates target using severity, recency, then stable signal ID", () => {
    const input = baseInput()
    input.signals = [
      signal("waiting-new", "workspace-alpha", "repo-a", "surface-a1", { occurred_at: "2026-07-16T12:00:00.000Z" }),
      signal("failed-old", "workspace-alpha", "repo-a", "surface-a1", { state: "failed", occurred_at: "2026-07-16T09:00:00.000Z" }),
      signal("failed-new-z", "workspace-alpha", "repo-a", "surface-a1", { state: "failed", occurred_at: "2026-07-16T11:00:00.000Z" }),
      signal("failed-new-a", "workspace-alpha", "repo-a", "surface-a1", { state: "failed", occurred_at: "2026-07-16T11:00:00.000Z" }),
    ]

    expect(buildAttentionCandidates(input)).toHaveLength(1)
    expect(buildAttentionCandidates(input)[0]?.signal.id).toBe("failed-new-a")
  })

  test("starts after the current exact target, wraps once, and returns empty without mutation", () => {
    const input = baseInput()
    input.signals = [
      signal("a2", "workspace-alpha", "repo-a", "surface-a2"),
      signal("a1", "workspace-alpha", "repo-a", "surface-a1"),
      signal("z", "workspace-beta", "repo-z", "surface-z1"),
    ]
    input.current = { workspaceId: "workspace-alpha", repositoryId: "repo-a", terminalId: "term-a2" }
    const original = structuredClone(input)

    expect(selectNextAttentionTarget(input)).toMatchObject({ target: { terminalId: "term-a1" } })
    input.current = { workspaceId: "workspace-beta", repositoryId: "repo-z", terminalId: "term-z1" }
    expect(selectNextAttentionTarget(input)).toMatchObject({ target: { terminalId: "term-a2" } })
    expect(original.signals).toEqual(input.signals)

    const empty = baseInput()
    empty.signals = [signal("working", "workspace-alpha", "repo-a", undefined, { state: "working" })]
    expect(selectNextAttentionTarget(empty)).toBeUndefined()
    expect(empty.signals[0]?.state).toBe("working")
  })
})
