import { join } from "node:path"
import { z } from "zod"
import { SECURE_LIMITS, SecureScopesSchema, type SecureScope } from "@git-stacks/protocol"

import { identityFingerprint, type ServiceIdentity } from "./identity.js"
import { SignedPinSetSchema, verifySignedPinSet, type SignedPinSet } from "./certificates.js"
import { readProtectedJson, writeProtectedJson } from "./protected-store.js"
import { OneUseTokenStore } from "./tokens.js"

export const TargetRecordSchema = z.strictObject({
  version: z.literal(1),
  id: z.string().uuid(),
  name: z.string().min(1).max(96),
  service_id: z.string().uuid(),
  public_key: z.string().min(1),
  fingerprint: z.string().min(20),
  pin_set: SignedPinSetSchema,
  scopes: SecureScopesSchema,
  created_at: z.string().datetime({ offset: true }),
  updated_at: z.string().datetime({ offset: true }),
})
export type TargetRecord = z.infer<typeof TargetRecordSchema>

const TargetRegistrySchema = z.strictObject({ version: z.literal(1), targets: z.array(TargetRecordSchema).max(64) })

export class TargetRegistry {
  private readonly path: string
  constructor(serviceRoot: string) { this.path = join(serviceRoot, "trust", "targets.json") }

  list(): TargetRecord[] { return [...this.read().targets].sort((a, b) => a.name.localeCompare(b.name)) }
  get(id: string): TargetRecord | undefined { return this.read().targets.find((target) => target.id === id) }

  save(record: TargetRecord): TargetRecord {
    const parsed = TargetRecordSchema.parse(record)
    const registry = this.read()
    const existing = registry.targets.find((target) => target.id === parsed.id)
    if (existing && existing.service_id !== parsed.service_id) throw new Error("Target service identity cannot change without trust reset")
    if (existing && parsed.pin_set.generation < existing.pin_set.generation) throw new Error("Target pin generation rollback")
    const targets = registry.targets.filter((target) => target.id !== parsed.id)
    targets.push(parsed)
    writeProtectedJson(this.path, TargetRegistrySchema.parse({ version: 1, targets }))
    return parsed
  }

  remove(id: string): boolean {
    const registry = this.read()
    const targets = registry.targets.filter((target) => target.id !== id)
    if (targets.length === registry.targets.length) return false
    writeProtectedJson(this.path, { version: 1, targets })
    return true
  }

  updatePins(id: string, pinSet: unknown): TargetRecord {
    const target = this.get(id)
    if (!target) throw new Error("Target not found")
    const verified = verifySignedPinSet(pinSet, target.public_key, target.pin_set.generation)
    return this.save({ ...target, pin_set: verified, updated_at: new Date().toISOString() })
  }

  private read(): z.infer<typeof TargetRegistrySchema> {
    return readProtectedJson(this.path, (value) => TargetRegistrySchema.parse(value)) ?? { version: 1, targets: [] }
  }
}

export const PairingBundleSchema = z.strictObject({
  version: z.literal(1),
  target_id: z.string().uuid(),
  target_name: z.string().min(1).max(96),
  service_id: z.string().uuid(),
  service_public_key: z.string().min(1),
  service_fingerprint: z.string().min(20),
  listener_epoch: z.string().uuid(),
  pin_set: SignedPinSetSchema,
  requested_scopes: SecureScopesSchema,
  token: z.string().regex(/^[A-Za-z0-9_-]{43,}$/),
  expires_at: z.string().datetime({ offset: true }),
})
export type PairingBundle = z.infer<typeof PairingBundleSchema>

const PairedHelperSchema = z.strictObject({
  version: z.literal(1),
  helper_id: z.string().uuid(),
  public_key: z.string().min(1),
  fingerprint: z.string().min(20),
  scopes: SecureScopesSchema,
  paired_at: z.string().datetime({ offset: true }),
  revoked_at: z.string().datetime({ offset: true }).optional(),
})
export type PairedHelper = z.infer<typeof PairedHelperSchema>
const PairedHelpersSchema = z.strictObject({ version: z.literal(1), helpers: z.array(PairedHelperSchema).max(128) })

export class PairingAuthority {
  private readonly pending = new OneUseTokenStore<{ scopes: SecureScope[]; targetId: string }>()
  private readonly path: string

  constructor(serviceRoot: string, private readonly identity: ServiceIdentity) {
    this.path = join(serviceRoot, "trust", "paired-helpers.json")
  }

  createBundle(input: { name: string; pinSet: SignedPinSet; listenerEpoch: string; scopes: SecureScope[] }): PairingBundle {
    const targetId = crypto.randomUUID()
    const requestedScopes = SecureScopesSchema.parse(input.scopes)
    const issued = this.pending.issue({ scopes: requestedScopes, targetId }, SECURE_LIMITS.pairingTokenTtlMs)
    return PairingBundleSchema.parse({
      version: 1,
      target_id: targetId,
      target_name: input.name,
      service_id: this.identity.id,
      service_public_key: this.identity.publicKeyPem,
      service_fingerprint: this.identity.fingerprint,
      listener_epoch: input.listenerEpoch,
      pin_set: input.pinSet,
      requested_scopes: requestedScopes,
      token: issued.token,
      expires_at: new Date(issued.expiresAt).toISOString(),
    })
  }

  prepare(token: string, helper: { id: string; publicKeyPem: string; requestedScopes: SecureScope[] }): PairedHelper {
    const pending = this.pending.inspect(token)
    if (!pending) throw Object.assign(new Error("Pairing token is invalid or expired"), { code: "unauthorized" })
    const requested = new Set(SecureScopesSchema.parse(helper.requestedScopes))
    const scopes = pending.value.scopes.filter((scope) => requested.has(scope))
    const record = PairedHelperSchema.parse({
      version: 1,
      helper_id: helper.id,
      public_key: helper.publicKeyPem,
      fingerprint: identityFingerprint(helper.publicKeyPem),
      scopes,
      paired_at: new Date().toISOString(),
    })
    return record
  }

  commit(token: string, record: PairedHelper): PairedHelper {
    if (!this.pending.consume(token)) throw Object.assign(new Error("Pairing token was already used or expired"), { code: "unauthorized" })
    const parsed = PairedHelperSchema.parse(record)
    const registry = this.read()
    writeProtectedJson(this.path, { version: 1, helpers: [...registry.helpers.filter((item) => item.helper_id !== parsed.helper_id), parsed] })
    return parsed
  }

  accept(token: string, helper: { id: string; publicKeyPem: string; requestedScopes: SecureScope[] }): PairedHelper {
    return this.commit(token, this.prepare(token, helper))
  }

  find(id: string): PairedHelper | undefined { return this.read().helpers.find((helper) => helper.helper_id === id && !helper.revoked_at) }
  list(): PairedHelper[] { return this.read().helpers.map((helper) => ({ ...helper })) }

  revoke(id: string): boolean {
    const registry = this.read()
    const helper = registry.helpers.find((item) => item.helper_id === id && !item.revoked_at)
    if (!helper) return false
    writeProtectedJson(this.path, { version: 1, helpers: registry.helpers.map((item) => item.helper_id === id ? { ...item, revoked_at: new Date().toISOString() } : item) })
    return true
  }

  private read(): z.infer<typeof PairedHelpersSchema> {
    return readProtectedJson(this.path, (value) => PairedHelpersSchema.parse(value)) ?? { version: 1, helpers: [] }
  }
}

export function targetFromBundle(bundleValue: unknown, helperIdentity: ServiceIdentity): TargetRecord {
  const bundle = PairingBundleSchema.parse(bundleValue)
  if (Date.parse(bundle.expires_at) <= Date.now()) throw new Error("Pairing bundle is expired")
  if (identityFingerprint(bundle.service_public_key) !== bundle.service_fingerprint) throw new Error("Pairing service fingerprint mismatch")
  const pinSet = verifySignedPinSet(bundle.pin_set, bundle.service_public_key)
  if (pinSet.service_id !== bundle.service_id) throw new Error("Pairing pin set service mismatch")
  const now = new Date().toISOString()
  void helperIdentity
  return TargetRecordSchema.parse({
    version: 1,
    id: bundle.target_id,
    name: bundle.target_name,
    service_id: bundle.service_id,
    public_key: bundle.service_public_key,
    fingerprint: bundle.service_fingerprint,
    pin_set: pinSet,
    scopes: bundle.requested_scopes,
    created_at: now,
    updated_at: now,
  })
}
