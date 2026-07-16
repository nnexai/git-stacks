import { describe, expect, test } from "@test/api"
import { readFileSync } from "fs"
import { join } from "path"
import * as serviceProtocol from "../../../packages/protocol/src/service"
import { SecureServiceRouter } from "../../../packages/service/src/secure/router"
import type { SecureSessionContext } from "../../../packages/service/src/security/session-authority"
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

const fixtures = join(import.meta.dirname, "../../fixtures/service-v1")
const fixture = (name: string): unknown => JSON.parse(readFileSync(join(fixtures, name), "utf8"))

describe("service v1 contract", () => {
  test("PHASE124_RED refresh authorization TUI ordering contract", () => {
    const schema = (serviceProtocol as Record<string, unknown>).DynamicEnvironmentRefreshSchema as
      | { safeParse(value: unknown): { success: boolean; data?: unknown } }
      | undefined
    const resultSchema = (serviceProtocol as Record<string, unknown>).DynamicEnvironmentRefreshResultSchema as
      | { safeParse(value: unknown): { success: boolean; data?: unknown } }
      | undefined
    const parse = (value: unknown) => schema?.safeParse(value)
    const pathAtLimit = "/opt/runtime/bin:".repeat(1_024).slice(0, 16_384)
    const socketAtLimit = `/tmp/${"s".repeat(4_091)}`

    const observations = {
      schema_exists: schema !== undefined,
      result_schema_exists: resultSchema !== undefined,
      replaces_allowlist: parse({ PATH: "/phase124/bin", SSH_AUTH_SOCK: "/tmp/phase124-agent.sock" })?.success === true,
      omission_means_clear: parse({})?.success === true,
      exact_path_bound: parse({ PATH: pathAtLimit })?.success === true
        && parse({ PATH: `${pathAtLimit}x` })?.success === false,
      exact_socket_bound: parse({ SSH_AUTH_SOCK: socketAtLimit })?.success === true
        && parse({ SSH_AUTH_SOCK: `${socketAtLimit}x` })?.success === false,
      rejects_unknown_keys: parse({ PATH: "/bin", TOKEN: "must-not-cross" })?.success === false,
      rejects_control_bytes: parse({ PATH: "/bin\0/hidden" })?.success === false,
      metadata_only_result: resultSchema?.safeParse({ updated: ["PATH"], cleared: ["SSH_AUTH_SOCK"] }).success === true
        && resultSchema.safeParse({ updated: ["PATH"], cleared: [], PATH: "/must/not/echo" }).success === false,
    }

    expect(observations, "PHASE124_RED refresh authorization TUI ordering contract").toEqual({
      schema_exists: true,
      result_schema_exists: true,
      replaces_allowlist: true,
      omission_means_clear: true,
      exact_path_bound: true,
      exact_socket_bound: true,
      rejects_unknown_keys: true,
      rejects_control_bytes: true,
      metadata_only_result: true,
    })
  })

  test("rejects every non-local refresh origin before parsing or storage", async () => {
    let parses = 0
    let replacements = 0
    const router = new SecureServiceRouter({
      snapshot: { buildAll: async () => [], buildWorkspace: async () => { throw new Error("unused") } },
      localTargetId: "local-service",
      parseDynamicEnvironmentRefresh: (value) => {
        parses += 1
        return serviceProtocol.DynamicEnvironmentRefreshSchema.safeParse(value)
      },
      dynamicEnvironment: {
        replace(value) {
          replacements += 1
          return {
            updated: (["PATH", "SSH_AUTH_SOCK"] as const).filter((key) => value[key] !== undefined),
            cleared: (["PATH", "SSH_AUTH_SOCK"] as const).filter((key) => value[key] === undefined),
          }
        },
      },
    })
    const context = (mode: SecureSessionContext["mode"], origin: SecureSessionContext["origin"], targetId = "local-service") => ({
      mode, origin, targetId, scopes: [], principalId: "test", sessionId: crypto.randomUUID(),
    }) as unknown as SecureSessionContext
    const request = (body: unknown) => ({ id: crypto.randomUUID(), method: "environment.refresh", body })
    for (const candidate of [
      context("browser", "local"),
      context("helper", "remote"),
      context("pairing", "remote"),
      context("tui", "remote"),
      context("tui", "local", "paired-remote"),
    ]) {
      await expect(router.request(candidate, request({ PATH: 42, TOKEN: "must-not-parse" }))).rejects.toMatchObject({ code: "unauthorized" })
    }
    expect({ parses, replacements }).toEqual({ parses: 0, replacements: 0 })
    await expect(router.request(context("tui", "local"), request({ PATH: "/trusted/bin" }))).resolves.toEqual({
      updated: ["PATH"], cleared: ["SSH_AUTH_SOCK"],
    })
    expect({ parses, replacements }).toEqual({ parses: 1, replacements: 1 })
    await router.stop()
  })

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
    const resolution = { resolved: true, revision: "7", launch: { steps: [{ bucket: "main", scope: "workspace", command: "bun test", cwd: "/work", environment: { NODE_ENV: "test" } }], ports: {}, configuration: { command_id: request.command_id, shell: false }, redacted: ["TOKEN"] } } as const
    expect(TerminalLaunchResolutionSchema.parse(resolution)).toEqual(JSON.parse(JSON.stringify(resolution)))
    expect(() => TerminalLaunchResolutionSchema.parse({ ...resolution, launch: { ...resolution.launch, references: { TOKEN: "secret://token" } } })).toThrow()
  })

  test("PHASE124_RED terminal steps SSH rotation contract", () => {
    const commandResolution = {
      resolved: true,
      revision: "7",
      launch: {
        steps: [
          { bucket: "pre", scope: "workspace", command: "prepare", cwd: "/work", environment: { PATH: "/phase124/bin" } },
          { bucket: "main", scope: "repo", command: "run --exact '$VALUE'", cwd: "/work/repo", repository_id: "018f47f4-5ab1-7c2d-8e90-abcdef012345", repository_name: "repo", environment: { SSH_AUTH_SOCK: "/tmp/phase124-agent.sock" } },
          { bucket: "post", scope: "workspace", command: "cleanup", cwd: "/work", environment: {} },
        ],
        ports: {},
        configuration: { command_id: "cmd_0123456789abcdef", shell: false },
        redacted: ["TOKEN"],
      },
    }
    expect(() => TerminalLaunchResolutionSchema.parse(commandResolution), "PHASE124_RED terminal steps SSH rotation contract").not.toThrow()
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
