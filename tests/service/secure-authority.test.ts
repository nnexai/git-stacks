import { afterEach, describe, expect, test } from "@test/api"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { IdentityStore } from "../../packages/service/src/security/identity"
import { LocalSessionAuthority } from "../../packages/service/src/security/session-authority"
import { PairingAuthority } from "../../packages/service/src/security/targets"
import { assertSecureTransportEnvironment } from "../../packages/service/src/security/transport-environment"

const roots: string[] = []
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })

describe("secure authority lifecycle", () => {
  test("admits a replacement browser without waiting for a stale session writer", () => {
    const authority = new LocalSessionAuthority()
    let closeRequested = false
    authority.registerBrowserSession({ close: () => new Promise<void>(() => { closeRequested = true }) })
    const result = authority.registerBrowserSession({ close: async () => undefined })
    expect(result).toBeUndefined()
    expect(closeRequested).toBe(true)
  })

  test("commits a pairing only after proof and consumes its token atomically", () => {
    const root = mkdtempSync(join(tmpdir(), "git-stacks-pairing-")); roots.push(root)
    const authorityIdentity = new IdentityStore(root).loadOrCreate()
    const helperIdentity = new IdentityStore(root, "helper-test").loadOrCreate()
    const authority = new PairingAuthority(root, authorityIdentity)
    const bundle = authority.createBundle({
      name: "test",
      listenerEpoch: crypto.randomUUID(),
      scopes: ["snapshot.read"],
      pinSet: {
        version: 1, service_id: authorityIdentity.id, endpoint: "https://127.0.0.1:4433/git-stacks",
        hashes: ["A".repeat(43)], generation: 1, issued_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 60_000).toISOString(), protocol: "git-stacks/2", signature: "A",
      },
    })
    const candidate = authority.prepare(bundle.token, {
      id: helperIdentity.id, publicKeyPem: helperIdentity.publicKeyPem, requestedScopes: ["snapshot.read", "terminal.write"],
    })
    expect(authority.list()).toEqual([])
    expect(candidate.scopes).toEqual(["snapshot.read"])
    expect(authority.commit(bundle.token, candidate).helper_id).toBe(helperIdentity.id)
    expect(authority.list()).toHaveLength(1)
    expect(() => authority.commit(bundle.token, candidate)).toThrow(/already used or expired/)
  })

  test("rejects inherited transport key logging and payload tracing", () => {
    expect(() => assertSecureTransportEnvironment({ SSLKEYLOGFILE: "/tmp/keys" })).toThrow(/SSLKEYLOGFILE/)
    expect(() => assertSecureTransportEnvironment({ NODE_OPTIONS: "--tls-keylog=/tmp/keys" })).toThrow(/key logging/)
    expect(() => assertSecureTransportEnvironment({ DEBUG_TRACE: "1" })).toThrow(/DEBUG_TRACE/)
    expect(() => assertSecureTransportEnvironment({ DEBUG: "webtransport:*" })).toThrow(/debug logging/)
    expect(() => assertSecureTransportEnvironment({})).not.toThrow()
  })
})
