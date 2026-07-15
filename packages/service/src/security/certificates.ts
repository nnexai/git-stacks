import "reflect-metadata"

import { createHash, createPrivateKey, createPublicKey, randomBytes, X509Certificate as NodeX509Certificate } from "node:crypto"
import { join } from "node:path"
import { z } from "zod"
import {
  BasicConstraintsExtension,
  ExtendedKeyUsage,
  ExtendedKeyUsageExtension,
  KeyUsageFlags,
  KeyUsagesExtension,
  PemConverter,
  SubjectAlternativeNameExtension,
  SubjectKeyIdentifierExtension,
  X509Certificate,
  X509CertificateGenerator,
  cryptoProvider,
} from "@peculiar/x509"
import { encodeCanonical } from "@git-stacks/protocol"

import { readProtectedFile, readProtectedJson, writeProtectedFile, writeProtectedJson } from "./protected-store.js"
import { signIdentity, verifyIdentity, type ServiceIdentity } from "./identity.js"

const CertificateMetadataSchema = z.strictObject({
  version: z.literal(1),
  generation: z.number().int().positive(),
  hash: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  not_before: z.string().datetime({ offset: true }),
  not_after: z.string().datetime({ offset: true }),
})

const TransportCertificateSchema = z.strictObject({
  certPem: z.string().min(1), keyPem: z.string().min(1),
  hash: z.string().regex(/^[A-Za-z0-9_-]{43}$/), generation: z.number().int().positive(),
  notBefore: z.string().datetime({ offset: true }), notAfter: z.string().datetime({ offset: true }),
})
const CertificateRolloverSchema = z.strictObject({
  version: z.literal(1), current: TransportCertificateSchema, next: TransportCertificateSchema,
})

export interface TransportCertificate {
  certPem: string
  keyPem: string
  hash: string
  generation: number
  notBefore: string
  notAfter: string
}

export const SignedPinSetSchema = z.strictObject({
  version: z.literal(1),
  service_id: z.string().uuid(),
  endpoint: z.string().url(),
  alternate_endpoint: z.string().url().optional(),
  hashes: z.array(z.string().regex(/^[A-Za-z0-9_-]{43}$/)).min(1).max(2),
  generation: z.number().int().positive(),
  issued_at: z.string().datetime({ offset: true }),
  expires_at: z.string().datetime({ offset: true }),
  protocol: z.literal("git-stacks/2"),
  signature: z.string().regex(/^[A-Za-z0-9_-]+$/),
}).superRefine((value, context) => {
  const endpoint = new URL(value.endpoint)
  if (endpoint.protocol !== "https:") context.addIssue({ code: "custom", path: ["endpoint"], message: "Pin endpoint must use HTTPS" })
  if (value.alternate_endpoint) {
    const alternate = new URL(value.alternate_endpoint)
    if (alternate.protocol !== "https:") context.addIssue({ code: "custom", path: ["alternate_endpoint"], message: "Alternate pin endpoint must use HTTPS" })
    if (alternate.href === endpoint.href) context.addIssue({ code: "custom", path: ["alternate_endpoint"], message: "Alternate pin endpoint must differ" })
  }
  if (new Set(value.hashes).size !== value.hashes.length) context.addIssue({ code: "custom", path: ["hashes"], message: "Certificate hashes must be unique" })
})
export type SignedPinSet = z.infer<typeof SignedPinSetSchema>

async function generateCertificate(generation: number, hostnames: string[], validityDays: number, startsAt = Date.now()): Promise<TransportCertificate> {
  if (validityDays <= 0 || validityDays > 10) throw new Error("Transport certificate validity must be between one and ten days")
  const crypto = globalThis.crypto
  cryptoProvider.set(crypto)
  const algorithm = { name: "ECDSA", namedCurve: "P-256", hash: "SHA-256" } as const
  const keys = await crypto.subtle.generateKey(algorithm, true, ["sign", "verify"])
  const notBefore = new Date(startsAt - 5 * 60_000)
  const notAfter = new Date(startsAt + validityDays * 24 * 60 * 60_000)
  const sans = hostnames.map((value) => /^\d{1,3}(?:\.\d{1,3}){3}$/.test(value)
    ? { type: "ip" as const, value }
    : { type: "dns" as const, value })
  const certificate = await X509CertificateGenerator.createSelfSigned({
    serialNumber: randomBytes(16).toString("hex"),
    name: "CN=git-stacks-service",
    notBefore,
    notAfter,
    signingAlgorithm: algorithm,
    keys,
    extensions: [
      new BasicConstraintsExtension(false, undefined, true),
      new KeyUsagesExtension(KeyUsageFlags.digitalSignature, true),
      new ExtendedKeyUsageExtension([ExtendedKeyUsage.serverAuth]),
      new SubjectAlternativeNameExtension(sans),
      await SubjectKeyIdentifierExtension.create(keys.publicKey),
    ],
  }, crypto)
  const privateKey = await crypto.subtle.exportKey("pkcs8", keys.privateKey)
  return {
    certPem: certificate.toString("pem"),
    keyPem: PemConverter.encode(privateKey, PemConverter.PrivateKeyTag),
    hash: createHash("sha256").update(new Uint8Array(certificate.rawData)).digest("base64url"),
    generation,
    notBefore: notBefore.toISOString(),
    notAfter: notAfter.toISOString(),
  }
}

export class CertificateStore {
  private readonly rolloverPath: string
  constructor(
    private readonly serviceRoot: string,
    private readonly hostnames = ["127.0.0.1", "localhost"],
    private readonly namespace = "transport",
    private readonly now = () => Date.now(),
  ) { this.rolloverPath = join(serviceRoot, "trust", namespace, "rollover.json") }

  async loadOrCreate(): Promise<TransportCertificate> {
    return (await this.loadRollover()).current
  }

  async loadRollover(): Promise<{ current: TransportCertificate; next: TransportCertificate }> {
    const stored = readProtectedJson(this.rolloverPath, (value) => CertificateRolloverSchema.parse(value))
    let current: TransportCertificate
    let next: TransportCertificate
    if (stored) {
      current = this.verifyCertificate(stored.current)
      next = this.verifyCertificate(stored.next)
    } else {
      current = await this.loadLegacyOrCreate()
      const nextStart = Date.parse(current.notAfter) - 3 * 24 * 60 * 60_000
      next = await generateCertificate(current.generation + 1, this.hostnames, 10, nextStart)
    }
    while (Date.parse(current.notAfter) <= this.now()) {
      if (Date.parse(next.notAfter) <= this.now()) throw new Error("Transport certificate rollover expired while the service was offline")
      current = next
      next = await generateCertificate(current.generation + 1, this.hostnames, 10, Date.parse(current.notAfter) - 3 * 24 * 60 * 60_000)
    }
    writeProtectedJson(this.rolloverPath, { version: 1, current, next })
    this.writeLegacyCurrent(current)
    return { current, next }
  }

  async advance(expectedGeneration: number): Promise<{ current: TransportCertificate; next: TransportCertificate }> {
    const rollover = await this.loadRollover()
    if (rollover.current.generation !== expectedGeneration) return rollover
    if (this.now() < Date.parse(rollover.current.notAfter)) throw new Error("Transport certificate cannot advance before expiry")
    const current = rollover.next
    const next = await generateCertificate(current.generation + 1, this.hostnames, 10, Date.parse(current.notAfter) - 3 * 24 * 60 * 60_000)
    writeProtectedJson(this.rolloverPath, { version: 1, current, next })
    this.writeLegacyCurrent(current)
    return { current, next }
  }

  private async loadLegacyOrCreate(): Promise<TransportCertificate> {
    const root = join(this.serviceRoot, "trust", this.namespace)
    const metadata = readProtectedJson(join(root, "certificate.json"), (value) => CertificateMetadataSchema.parse(value))
    const certPem = readProtectedFile(join(root, "certificate.pem"))
    const keyPem = readProtectedFile(join(root, "certificate.key"))
    if ((metadata === null) !== (certPem === null) || (metadata === null) !== (keyPem === null)) throw new Error("Transport certificate record is inconsistent")
    if (metadata && certPem && keyPem) {
      const parsed = new X509Certificate(certPem)
      const hash = createHash("sha256").update(new Uint8Array(parsed.rawData)).digest("base64url")
      if (hash !== metadata.hash || Math.abs(parsed.notAfter.getTime() - Date.parse(metadata.not_after)) >= 1_000) throw new Error("Transport certificate metadata mismatch")
      if (parsed.notAfter.getTime() > this.now()) return {
        certPem, keyPem, hash, generation: metadata.generation,
        notBefore: metadata.not_before, notAfter: metadata.not_after,
      }
      return this.rotate(metadata.generation + 1)
    }
    return this.rotate(1)
  }

  async rotate(generation: number): Promise<TransportCertificate> {
    const certificate = await generateCertificate(generation, this.hostnames, 10)
    this.writeLegacyCurrent(certificate)
    return certificate
  }

  private writeLegacyCurrent(certificate: TransportCertificate): void {
    const root = join(this.serviceRoot, "trust", this.namespace)
    writeProtectedFile(join(root, "certificate.key"), certificate.keyPem)
    writeProtectedFile(join(root, "certificate.pem"), certificate.certPem)
    writeProtectedJson(join(root, "certificate.json"), {
      version: 1, generation: certificate.generation, hash: certificate.hash,
      not_before: certificate.notBefore, not_after: certificate.notAfter,
    })
  }

  private verifyCertificate(certificate: TransportCertificate): TransportCertificate {
    const parsed = new X509Certificate(certificate.certPem)
    const nodeCertificate = new NodeX509Certificate(certificate.certPem)
    const hash = createHash("sha256").update(new Uint8Array(parsed.rawData)).digest("base64url")
    const privatePublic = createPublicKey(createPrivateKey(certificate.keyPem)).export({ type: "spki", format: "der" })
    const certificatePublic = nodeCertificate.publicKey.export({ type: "spki", format: "der" })
    if (hash !== certificate.hash
      || !privatePublic.equals(certificatePublic)
      || Math.abs(parsed.notBefore.getTime() - Date.parse(certificate.notBefore)) >= 1_000
      || Math.abs(parsed.notAfter.getTime() - Date.parse(certificate.notAfter)) >= 1_000) throw new Error("Transport rollover certificate metadata mismatch")
    return TransportCertificateSchema.parse(certificate)
  }
}

function unsignedPinSet(value: SignedPinSet): Omit<SignedPinSet, "signature"> {
  const { signature: _signature, ...unsigned } = value
  return unsigned
}

export function createSignedPinSet(
  identity: ServiceIdentity,
  endpoint: string,
  certificate: TransportCertificate,
  additionalHashes: string[] = [],
  alternate?: { endpoint: string; certificate: TransportCertificate },
): SignedPinSet {
  const latest = alternate?.certificate ?? certificate
  const unsigned = {
    version: 1 as const,
    service_id: identity.id,
    endpoint,
    ...(alternate ? { alternate_endpoint: alternate.endpoint } : {}),
    hashes: [...new Set([certificate.hash, ...additionalHashes, ...(alternate ? [alternate.certificate.hash] : [])])].slice(0, 2),
    generation: Math.max(certificate.generation, latest.generation),
    issued_at: new Date().toISOString(),
    expires_at: latest.notAfter,
    protocol: "git-stacks/2" as const,
  }
  return SignedPinSetSchema.parse({ ...unsigned, signature: signIdentity(identity, encodeCanonical(unsigned)) })
}

export function verifySignedPinSet(value: unknown, publicKeyPem: string, minimumGeneration = 0): SignedPinSet {
  const pinSet = SignedPinSetSchema.parse(value)
  const issuedAt = Date.parse(pinSet.issued_at)
  const expiresAt = Date.parse(pinSet.expires_at)
  const now = Date.now()
  if (pinSet.generation < minimumGeneration) throw new Error("Certificate pin generation rollback")
  if (!verifyIdentity(publicKeyPem, encodeCanonical(unsignedPinSet(pinSet)), pinSet.signature)) throw new Error("Certificate pin signature is invalid")
  if (issuedAt > now + 5 * 60_000) throw new Error("Certificate pin set was issued in the future")
  if (expiresAt <= now) throw new Error("Certificate pin set is expired")
  if (expiresAt <= issuedAt || expiresAt - issuedAt > 18 * 24 * 60 * 60_000) throw new Error("Certificate pin set validity is invalid")
  return pinSet
}
