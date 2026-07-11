import { afterEach, describe, expect, test } from "bun:test"
import { chmodSync, lstatSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "fs"
import { join } from "path"
import { tmpdir } from "os"
import {
  provisionOfficialClient,
  readOfficialClientCredential,
  revokeCredential,
  verifyCredential,
} from "../../../src/lib/service/credentials"

const roots: string[] = []
function root(): string {
  const path = join(tmpdir(), `git-stacks-credentials-${crypto.randomUUID()}`)
  roots.push(path)
  return path
}

afterEach(() => {
  for (const path of roots.splice(0)) rmSync(path, { recursive: true, force: true })
})

describe("official client credentials", () => {
  test("provisions stable isolated credentials with owner-only storage", () => {
    const serviceRoot = root()
    const tokens = [Buffer.alloc(32, 1), Buffer.alloc(32, 2)]
    const options = { serviceRoot, randomBytes: () => tokens.shift()!, now: () => new Date("2026-07-11T00:00:00Z") }
    const first = provisionOfficialClient("linux", options)
    const reused = provisionOfficialClient("linux", options)
    const other = provisionOfficialClient("macos", options)

    expect(reused).toEqual(first)
    expect(other.token).not.toBe(first.token)
    expect(lstatSync(join(serviceRoot, "credentials")).mode & 0o777).toBe(0o700)
    expect(lstatSync(join(serviceRoot, "credentials", "linux.json")).mode & 0o777).toBe(0o600)
    expect(readOfficialClientCredential("linux", { serviceRoot })).toEqual(first)
  })

  test("revokes only the selected client and requires explicit replacement", () => {
    const serviceRoot = root()
    let byte = 3
    const options = { serviceRoot, randomBytes: () => Buffer.alloc(32, byte++) }
    const linux = provisionOfficialClient("linux", options)
    const macos = provisionOfficialClient("macos", options)
    revokeCredential("linux", { serviceRoot })

    expect(verifyCredential(linux.token, { serviceRoot })).toBeNull()
    expect(verifyCredential(macos.token, { serviceRoot })?.clientId).toBe("macos")
    expect(() => provisionOfficialClient("linux", options)).toThrow(/replacement/i)
    const replacement = provisionOfficialClient("linux", { ...options, replaceRevoked: true })
    expect(replacement.token).not.toBe(linux.token)
  })

  test("rejects corrupt, permissive, and symlinked credential paths without exposing tokens", () => {
    const serviceRoot = root()
    mkdirSync(join(serviceRoot, "credentials"), { recursive: true, mode: 0o700 })
    writeFileSync(join(serviceRoot, "credentials", "bad.json"), "not-json", { mode: 0o600 })
    expect(() => readOfficialClientCredential("bad", { serviceRoot })).toThrow(/invalid credential record/i)

    const unsafe = join(serviceRoot, "credentials", "unsafe.json")
    writeFileSync(unsafe, JSON.stringify({ clientId: "unsafe", token: "secret-value", revoked: false }), { mode: 0o600 })
    chmodSync(unsafe, 0o644)
    expect(() => readOfficialClientCredential("unsafe", { serviceRoot })).toThrow(/permissions/i)

    const target = join(serviceRoot, "target.json")
    writeFileSync(target, "secret-value", { mode: 0o600 })
    symlinkSync(target, join(serviceRoot, "credentials", "linked.json"))
    expect(() => readOfficialClientCredential("linked", { serviceRoot })).toThrow(/symlink/i)
    expect(readFileSync(target, "utf8")).toBe("secret-value")
  })

  test("uses constant-time compatible matching and returns no secret context", () => {
    const serviceRoot = root()
    const issued = provisionOfficialClient("linux", { serviceRoot, randomBytes: () => Buffer.alloc(32, 9) })
    expect(verifyCredential(`${issued.token}x`, { serviceRoot })).toBeNull()
    expect(verifyCredential("wrong", { serviceRoot })).toBeNull()
    expect(verifyCredential(issued.token, { serviceRoot })).toEqual({ clientId: "linux", capabilities: ["service:v1"] })
  })
})
