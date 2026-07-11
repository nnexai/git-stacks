import { describe, expect, test } from "bun:test"
import { readFileSync } from "fs"
import { join } from "path"
import {
  DiscoveryResponseSchema,
  ErrorEnvelopeSchema,
  ServiceEventSchema,
  WorkspaceSnapshotResponseSchema,
} from "../../../src/lib/service/contract"

const fixtures = join(import.meta.dir, "../../fixtures/service-v1")
const fixture = (name: string): unknown => JSON.parse(readFileSync(join(fixtures, name), "utf8"))

describe("service v1 contract", () => {
  test("parses and exactly round-trips golden fixtures", () => {
    for (const [name, schema] of [
      ["discovery.json", DiscoveryResponseSchema],
      ["workspace-snapshot.json", WorkspaceSnapshotResponseSchema],
    ] as const) {
      const value = fixture(name)
      expect(schema.parse(value) as unknown).toEqual(value)
    }
  })

  test("rejects unknown fields and malformed opaque values", () => {
    expect(() => DiscoveryResponseSchema.parse({ ...(fixture("discovery.json") as object), extra: true })).toThrow()
    const snapshot = fixture("workspace-snapshot.json") as Record<string, unknown>
    expect(() => WorkspaceSnapshotResponseSchema.parse({ ...snapshot, workspace: { ...(snapshot.workspace as object), id: "name" } })).toThrow()
    expect(() => ServiceEventSchema.parse({ protocol: "v1", sequence: "01", timestamp: "2026-07-11T00:00:00.000Z", type: "control", control: { kind: "heartbeat" } })).toThrow()
  })

  test("rejects sensitive and undeclared error data", () => {
    const base = { protocol: "v1", request_id: "req_0123456789abcdef", ok: false, error: { code: "internal_error", message: "Request failed" } } as const
    expect(ErrorEnvelopeSchema.parse(base)).toEqual(base)
    expect(() => ErrorEnvelopeSchema.parse({ ...base, stack: "secret" })).toThrow()
    expect(() => ErrorEnvelopeSchema.parse({ ...base, error: { ...base.error, credential: "bearer" } })).toThrow()
  })
})
