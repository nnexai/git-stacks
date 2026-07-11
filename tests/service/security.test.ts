import { afterEach, describe, expect, test } from "bun:test"
import { rmSync } from "fs"
import { join } from "path"
import { tmpdir } from "os"
import {
  authenticateAdmission,
  provisionOfficialClient,
  revokeCredential,
  UNAUTHENTICATED_RESPONSE,
} from "../../src/lib/service/credentials"

const roots: string[] = []
function root(): string {
  const path = join(tmpdir(), `git-stacks-security-${crypto.randomUUID()}`)
  roots.push(path)
  return path
}

afterEach(() => {
  for (const path of roots.splice(0)) rmSync(path, { recursive: true, force: true })
})

describe("service authentication admission", () => {
  test("publishes exact HTTP resource bounds", async () => {
    const server = await import("../../src/service/server")
    expect(server.MAX_BODY_BYTES).toBe(256 * 1024)
    expect(server.RATE_LIMIT_PER_MINUTE).toBe(60)
    expect(server.RATE_LIMIT_BURST).toBe(20)
    expect(server.REQUEST_TIMEOUT_SECONDS).toBe(30)
  })

  test("returns one generic rejection for every unauthenticated bearer shape", () => {
    const serviceRoot = root()
    const issued = provisionOfficialClient("linux", { serviceRoot, randomBytes: () => Buffer.alloc(32, 4) })
    const rejected = [
      undefined,
      "",
      "Basic abc",
      "Bearer",
      "Bearer ",
      "Bearer unknown",
      `bearer ${issued.token}`,
      `Bearer ${issued.token} extra`,
    ].map((authorization) => authenticateAdmission(authorization, { serviceRoot }))
    revokeCredential("linux", { serviceRoot })
    rejected.push(authenticateAdmission(`Bearer ${issued.token}`, { serviceRoot }))

    for (const result of rejected) expect(result).toEqual(UNAUTHENTICATED_RESPONSE)
  })

  test("authenticates before route, body, capability, and rate evaluation", () => {
    const serviceRoot = root()
    const calls: string[] = []
    const route = (authorization: string | undefined, path: string, body: string) => {
      const admission = authenticateAdmission(authorization, { serviceRoot })
      if (!admission.ok) return admission
      calls.push(`route:${path}`, `body:${body}`, `rate:${admission.client.clientId}`)
      return { ok: true as const }
    }

    expect(route(undefined, "/v1/real", "{")).toEqual(UNAUTHENTICATED_RESPONSE)
    expect(route("Bearer wrong", "/v1/unknown", "invalid")).toEqual(UNAUTHENTICATED_RESPONSE)
    expect(calls).toEqual([])
  })

  test("returns a stable secret-free authenticated context", () => {
    const serviceRoot = root()
    const issued = provisionOfficialClient("linux", { serviceRoot, randomBytes: () => Buffer.alloc(32, 5) })
    expect(authenticateAdmission(`Bearer ${issued.token}`, { serviceRoot })).toEqual({
      ok: true,
      client: { clientId: "linux", capabilities: ["service:v1"] },
    })
    expect(JSON.stringify(authenticateAdmission(`Bearer ${issued.token}`, { serviceRoot }))).not.toContain(issued.token)
  })
})
