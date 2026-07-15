import { describe, expect, test } from "bun:test"
import { readFileSync } from "fs"
import { join } from "path"
import {
  TerminalLaunchResolutionRequestSchema,
  TerminalLaunchResolutionSchema,
  SignalSchema,
  DiscoveryResponseSchema,
  ErrorCodeSchema,
  ErrorEnvelopeSchema,
  ServiceEventSchema,
  WorkspaceSnapshotResponseSchema,
  WorkspaceCreationRequestSchema,
  WorkspaceCreationCatalogSchema,
  CLIENT_MODEL_LIMITS,
} from "../../../packages/protocol/src/service"

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

  test("closes request timeout errors over the strict golden envelope", () => {
    const timeout = fixture("request-timeout-error.json")
    expect(ErrorEnvelopeSchema.parse(timeout) as unknown).toEqual(timeout)
    expect(ErrorCodeSchema.parse("request_timeout")).toBe("request_timeout")
    expect(() => ErrorEnvelopeSchema.parse({ ...(timeout as object), details: "late adapter text" })).toThrow()
    const envelope = timeout as { error: Record<string, unknown> }
    expect(() => ErrorEnvelopeSchema.parse({ ...envelope, error: { ...envelope.error, code: "handler_timeout" } })).toThrow()
    expect(() => ErrorEnvelopeSchema.parse({ ...envelope, error: { ...envelope.error, stack: "secret" } })).toThrow()
  })

  test("disambiguates duplicate command labels with stable identities and scope", () => {
    const named = (fixture("workspace-snapshot.json") as any).workspace.launch.named[0]
    expect(named.id).toBe("cmd_0123456789abcdef")
    expect(() => WorkspaceSnapshotResponseSchema.parse({
      ...(fixture("workspace-snapshot.json") as object),
      workspace: { ...(fixture("workspace-snapshot.json") as any).workspace, launch: { ...(fixture("workspace-snapshot.json") as any).workspace.launch, named: [named, { ...named, id: "cmd_fedcba9876543210", scope: "repository", repository_id: "018f47f4-5ab1-7c2d-8e90-abcdef012345" }] } },
    })).not.toThrow()
    expect(() => WorkspaceSnapshotResponseSchema.parse({ ...(fixture("workspace-snapshot.json") as object), workspace: { ...(fixture("workspace-snapshot.json") as any).workspace, launch: { ...(fixture("workspace-snapshot.json") as any).workspace.launch, named: [{ ...named, id: "test" }] } } })).toThrow()
  })

  test("validates fresh terminal launch requests and forbids secret-bearing resolutions", () => {
    const request = { workspace_id: "018f47f4-5ab1-7c2d-8e90-123456789abc", repository_id: "018f47f4-5ab1-7c2d-8e90-abcdef012345", command_id: "cmd_0123456789abcdef", expected_revision: "7" }
    expect(TerminalLaunchResolutionRequestSchema.parse(request)).toEqual(request)
    const resolution = { resolved: true, revision: "7", launch: { argv: ["bun", "test"], cwd: "/work", environment: { NODE_ENV: "test" }, ports: {}, configuration: { command_id: request.command_id, shell: false }, redacted: ["TOKEN"] } } as const
    expect(TerminalLaunchResolutionSchema.parse(resolution)).toEqual(JSON.parse(JSON.stringify(resolution)))
    expect(() => TerminalLaunchResolutionSchema.parse({ ...resolution, launch: { ...resolution.launch, references: { TOKEN: "secret://token" } } })).toThrow()
  })

  test("validates activity states and strict signal identity nesting", () => {
    for (const state of ["working", "waiting", "completed", "failed", "idle"] as const) {
      expect(SignalSchema.parse({ version: 1, kind: "activity", id: `sig_0123456789abcde${state.length}`, state, workspace_id: "018f47f4-5ab1-7c2d-8e90-123456789abc", repository_id: "018f47f4-5ab1-7c2d-8e90-abcdef012345", surface_id: "018f47f4-5ab1-7c2d-8e90-abcdef012346", session_id: "session-a", source: "claude", title: state, occurred_at: "2026-07-11T00:00:00.000Z" }).state).toBe(state)
    }
    expect(() => SignalSchema.parse({ version: 1, kind: "activity", id: "sig_0123456789abcdef", state: "waiting", workspace_id: "018f47f4-5ab1-7c2d-8e90-123456789abc", surface_id: "018f47f4-5ab1-7c2d-8e90-abcdef012345", session_id: "session-a", source: "claude", title: "question", occurred_at: "2026-07-11T00:00:00.000Z" })).toThrow()
  })

  test("locks workspace creation sources and client capacity", () => {
    expect(WorkspaceCreationRequestSchema.parse({ name: "demo", branch: "topic", source: { kind: "template", template: "full" } }).source.kind).toBe("template")
    expect(WorkspaceCreationRequestSchema.parse({ name: "demo", branch: "topic", source: { kind: "repositories", repositories: ["app"] } }).source.kind).toBe("repositories")
    expect(() => WorkspaceCreationRequestSchema.parse({ name: "demo", branch: "topic", source: { kind: "repositories", repositories: [] } })).toThrow()
    expect(() => WorkspaceCreationRequestSchema.parse({ name: "demo", branch: "topic", source: { kind: "repositories", repositories: ["app", "app"] } })).toThrow()
    expect(() => WorkspaceCreationRequestSchema.parse({ name: "demo", branch: "topic", source: { kind: "template", template: "full", local_path: "/secret" } })).toThrow()
    expect(WorkspaceCreationCatalogSchema.parse({ templates: [], repositories: [], client_model: CLIENT_MODEL_LIMITS }).client_model).toEqual(CLIENT_MODEL_LIMITS)
  })

  test("measures workspace names by well-formed UTF-8 bytes", () => {
    const request = (name: string) => ({ name, branch: "topic", source: { kind: "repositories", repositories: ["app"] } })
    expect(() => WorkspaceCreationRequestSchema.parse(request("😀".repeat(24)))).not.toThrow()
    expect(() => WorkspaceCreationRequestSchema.parse(request("😀".repeat(24) + "a"))).toThrow()
    expect(() => WorkspaceCreationRequestSchema.parse(request("\ud800"))).toThrow()
  })
})
