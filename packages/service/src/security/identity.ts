import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync, sign, verify } from "node:crypto"
import { existsSync } from "node:fs"
import { join } from "node:path"
import { z } from "zod"

import { assertPrivateDirectory, readProtectedFile, readProtectedJson, writeProtectedFile, writeProtectedJson } from "./protected-store.js"
import { discoverOsCredentialStore, type PrivateKeyCredentialStore } from "./credential-store.js"

const IdentityMetadataSchema = z.strictObject({
  version: z.literal(1),
  id: z.string().uuid(),
  public_key: z.string().min(1),
  fingerprint: z.string().regex(/^[A-Z2-7]{4}(?:-[A-Z2-7]{4})+$/),
  created_at: z.string().datetime({ offset: true }),
  private_key_store: z.enum(["file", "os"]).default("file"),
  private_key_account: z.string().regex(/^[a-f0-9]{64}$/).optional(),
}).refine((value) => value.private_key_store === "os" ? value.private_key_account !== undefined : value.private_key_account === undefined, {
  message: "OS identity records require one credential account",
})

export interface ServiceIdentity {
  id: string
  publicKeyPem: string
  privateKeyPem: string
  fingerprint: string
  createdAt: string
}

function base32(bytes: Uint8Array): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"
  let bits = 0
  let value = 0
  let output = ""
  for (const byte of bytes) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      output += alphabet[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits) output += alphabet[(value << (5 - bits)) & 31]
  return output
}

export function identityFingerprint(publicKeyPem: string): string {
  const der = createPublicKey(publicKeyPem).export({ type: "spki", format: "der" })
  return base32(createHash("sha256").update(der).digest()).match(/.{1,4}/g)!.join("-")
}

export class IdentityStore {
  private readonly root: string
  private readonly credentialStore: PrivateKeyCredentialStore | null

  constructor(serviceRoot: string, namespace = "authority", credentialStore: PrivateKeyCredentialStore | null | undefined = undefined) {
    this.root = join(serviceRoot, "trust", namespace)
    this.credentialStore = credentialStore === undefined ? discoverOsCredentialStore() : credentialStore
  }

  loadOrCreate(): ServiceIdentity {
    assertPrivateDirectory(this.root)
    const metadataPath = join(this.root, "identity.json")
    const privatePath = join(this.root, "identity.key")
    const metadata = readProtectedJson(metadataPath, (value) => IdentityMetadataSchema.parse(value))
    const filePrivateKey = readProtectedFile(privatePath)
    let privateKeyPem: string | null = filePrivateKey
    if (metadata?.private_key_store === "os") {
      if (filePrivateKey !== null) throw new Error("OS identity unexpectedly has a file private key")
      if (!this.credentialStore) throw new Error("The identity OS credential store is unavailable or locked")
      try { privateKeyPem = this.credentialStore.get(metadata.private_key_account!) } catch (error) {
        throw new Error("The identity OS credential store is unavailable or locked", { cause: error })
      }
      if (privateKeyPem === null) throw new Error("The identity private key is missing from the OS credential store")
    }
    if (metadata?.private_key_store === "file" && filePrivateKey === null) throw new Error("Identity metadata and private key are inconsistent")
    if (metadata === null && filePrivateKey !== null) throw new Error("Identity metadata and private key are inconsistent")
    if (metadata && privateKeyPem) {
      const derived = createPublicKey(createPrivateKey(privateKeyPem)).export({ type: "spki", format: "pem" }).toString()
      if (derived !== metadata.public_key || identityFingerprint(derived) !== metadata.fingerprint) throw new Error("Identity key does not match protected metadata")
      return { id: metadata.id, publicKeyPem: metadata.public_key, privateKeyPem, fingerprint: metadata.fingerprint, createdAt: metadata.created_at }
    }
    const pair = generateKeyPairSync("ec", { namedCurve: "prime256v1" })
    const publicKeyPem = pair.publicKey.export({ type: "spki", format: "pem" }).toString()
    const generatedPrivateKey = pair.privateKey.export({ type: "pkcs8", format: "pem" }).toString()
    const record = {
      version: 1 as const,
      id: crypto.randomUUID(),
      public_key: publicKeyPem,
      fingerprint: identityFingerprint(publicKeyPem),
      created_at: new Date().toISOString(),
      private_key_store: "file" as "file" | "os",
    }
    if (existsSync(metadataPath) || existsSync(privatePath)) throw new Error("Identity creation raced with another process")
    const account = createHash("sha256").update(`${this.root}\0${record.id}`).digest("hex")
    if (this.credentialStore) {
      try {
        this.credentialStore.set(account, generatedPrivateKey)
        record.private_key_store = "os"
        Object.assign(record, { private_key_account: account })
      } catch { writeProtectedFile(privatePath, generatedPrivateKey, { replace: false }) }
    } else writeProtectedFile(privatePath, generatedPrivateKey, { replace: false })
    try { writeProtectedJson(metadataPath, record, { replace: false }) } catch (error) {
      if (record.private_key_store === "os") {
        try { this.credentialStore?.delete(account) } catch {}
      }
      throw new Error("Identity metadata write failed after private key creation; manual recovery required", { cause: error })
    }
    return { id: record.id, publicKeyPem, privateKeyPem: generatedPrivateKey, fingerprint: record.fingerprint, createdAt: record.created_at }
  }
}

export function signIdentity(identity: Pick<ServiceIdentity, "privateKeyPem">, payload: Uint8Array): string {
  return sign("sha256", payload, createPrivateKey(identity.privateKeyPem)).toString("base64url")
}

export function verifyIdentity(publicKeyPem: string, payload: Uint8Array, signature: string): boolean {
  try { return verify("sha256", payload, createPublicKey(publicKeyPem), Buffer.from(signature, "base64url")) } catch { return false }
}
