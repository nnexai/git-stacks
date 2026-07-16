import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"
import {
  EntityIdSchema,
  OperationIdSchema,
  OperationSchema,
  ServiceEventSchema,
  WorkspaceLifecycleMutationSchema,
} from "../../packages/protocol/dist/index.js"
import {
  deduplicateProviderSessions,
  reduceServiceEvent,
  workspacePriorityOrder,
  workspaceSuccessorOrder,
} from "../../packages/client/dist/index.js"

const fixtures = JSON.parse(await readFile(new URL("./fixtures.json", import.meta.url), "utf8"))

test("protocol IDs and operation envelopes are stable", () => {
  assert.equal(EntityIdSchema.parse(fixtures.ids.entity), fixtures.ids.entity)
  assert.equal(OperationIdSchema.parse(fixtures.ids.operation), fixtures.ids.operation)
  assert.equal(EntityIdSchema.safeParse(fixtures.ids.invalid).success, false)
  assert.equal(OperationSchema.parse({
    operation_id: fixtures.ids.operation,
    state: "accepted",
    accepted_at: "2026-07-15T00:00:00.000Z",
  }).state, "accepted")
})

test("shared client priority and provider presentation is deterministic", () => {
  const ordered = [...fixtures.priorities].sort(workspacePriorityOrder).map(({ name }) => name)
  assert.deepEqual(ordered, fixtures.priorityOrder)
  const providers = deduplicateProviderSessions(fixtures.signals).map(({ source }) => source)
  assert.deepEqual(providers, fixtures.activeProviders)
})

test("shared lifecycle mutation and successor contracts survive package builds", () => {
  const base = { pinned: false, priority: 10, activity_at: "2026-07-10T00:00:00.000Z", name: "same", id: fixtures.ids.entity }
  assert.equal(workspaceSuccessorOrder({ ...base, pinned: true }, base) < 0, true)
  assert.equal(workspaceSuccessorOrder({ ...base, activity_at: "2026-07-11T00:00:00.000Z" }, base) < 0, true)
  assert.equal(WorkspaceLifecycleMutationSchema.safeParse({
    kind: "workspace.remove", workspace_id: fixtures.ids.entity, expected_revision: "4", confirmation_name: "alpha",
  }).success, false)
})

test("replay gaps advance the cursor and retain recovery bounds", () => {
  const event = ServiceEventSchema.parse({
    protocol: "v1",
    sequence: "12",
    timestamp: "2026-07-15T00:00:00.000Z",
    type: "control",
    control: {
      kind: "replay_gap",
      gap: { requested: "3", oldest_available: "8", newest_available: "12" },
    },
  })
  assert.deepEqual(reduceServiceEvent({ cursor: "3" }, event), {
    cursor: "12",
    replayGap: { requested: "3", oldestAvailable: "8", newestAvailable: "12" },
  })
})
