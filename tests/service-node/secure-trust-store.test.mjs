import assert from "node:assert/strict"
import { chmod, lstat, mkdtemp, rm, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"

import {
  CertificateStore,
  IdentityStore,
  createSignedPinSet,
  verifySignedPinSet,
} from "../../packages/service/dist/index.js"

test("protected identity and short-lived transport certificate survive restart and reject rollback", async () => {
  const root = await mkdtemp(join(tmpdir(), "git-stacks-trust-"))
  try {
    const identity = new IdentityStore(root).loadOrCreate()
    assert.deepEqual(new IdentityStore(root).loadOrCreate(), identity)
    const store = new CertificateStore(root)
    const rollover = await store.loadRollover()
    const certificate = rollover.current
    const reloaded = await new CertificateStore(root).loadOrCreate()
    assert.equal(reloaded.hash, certificate.hash)
    assert.ok(Date.parse(certificate.notAfter) - Date.parse(certificate.notBefore) <= 11 * 24 * 60 * 60_000)
    assert.equal(rollover.next.generation, certificate.generation + 1)
    assert.ok(Date.parse(rollover.next.notBefore) < Date.parse(certificate.notAfter))
    const pinSet = createSignedPinSet(
      identity, "https://127.0.0.1:4433/git-stacks", certificate, [],
      { endpoint: "https://127.0.0.1:4434/git-stacks", certificate: rollover.next },
    )
    assert.equal(pinSet.alternate_endpoint, "https://127.0.0.1:4434/git-stacks")
    assert.deepEqual(pinSet.hashes, [certificate.hash, rollover.next.hash])
    assert.deepEqual(verifySignedPinSet(pinSet, identity.publicKeyPem, certificate.generation), pinSet)
    assert.throws(() => verifySignedPinSet(pinSet, identity.publicKeyPem, pinSet.generation + 1), /rollback/)
    const advanced = await new CertificateStore(root, ["127.0.0.1", "localhost"], "transport", () => Date.parse(certificate.notAfter) + 1).loadRollover()
    assert.equal(advanced.current.generation, rollover.next.generation)
    assert.equal(advanced.next.generation, rollover.next.generation + 1)
    for (const path of [
      join(root, "trust", "authority", "identity.key"),
      join(root, "trust", "authority", "identity.json"),
      join(root, "trust", "transport", "certificate.key"),
    ]) assert.equal((await lstat(path)).mode & 0o777, 0o600)

    const metadata = join(root, "trust", "authority", "identity.json")
    await chmod(metadata, 0o644)
    assert.throws(() => new IdentityStore(root).loadOrCreate(), /permissions/)
  } finally { await rm(root, { recursive: true, force: true }) }
})

test("protected identity refuses a symlinked key record", async () => {
  const root = await mkdtemp(join(tmpdir(), "git-stacks-trust-link-"))
  const outside = join(root, "outside")
  try {
    const authority = join(root, "trust", "authority")
    await writeFile(outside, "not a key", { mode: 0o600 })
    new IdentityStore(root).loadOrCreate()
    await rm(join(authority, "identity.key"))
    await symlink(outside, join(authority, "identity.key"))
    assert.throws(() => new IdentityStore(root).loadOrCreate(), /Unsafe protected file/)
  } finally { await rm(root, { recursive: true, force: true }) }
})

test("identity uses an available OS credential store and fails closed if it later disappears", async () => {
  const root = await mkdtemp(join(tmpdir(), "git-stacks-trust-os-"))
  const values = new Map()
  const store = {
    kind: "os",
    get: (account) => values.get(account) ?? null,
    set: (account, value) => { values.set(account, value) },
    delete: (account) => values.delete(account),
  }
  try {
    const identity = new IdentityStore(root, "os-test", store).loadOrCreate()
    assert.equal(values.size, 1)
    await assert.rejects(lstat(join(root, "trust", "os-test", "identity.key")), { code: "ENOENT" })
    assert.deepEqual(new IdentityStore(root, "os-test", store).loadOrCreate(), identity)
    assert.throws(() => new IdentityStore(root, "os-test", null).loadOrCreate(), /credential store is unavailable/)
    values.clear()
    assert.throws(() => new IdentityStore(root, "os-test", store).loadOrCreate(), /private key is missing/)
  } finally { await rm(root, { recursive: true, force: true }) }
})
