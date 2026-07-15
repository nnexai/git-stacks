import "reflect-metadata"
import { createHash, randomBytes } from "node:crypto"
import {
  BasicConstraintsExtension,
  ExtendedKeyUsage,
  ExtendedKeyUsageExtension,
  KeyUsageFlags,
  KeyUsagesExtension,
  PemConverter,
  SubjectAlternativeNameExtension,
  SubjectKeyIdentifierExtension,
  X509CertificateGenerator,
  cryptoProvider,
} from "@peculiar/x509"

const algorithm = { name: "ECDSA", namedCurve: "P-256", hash: "SHA-256" } as const

export type Certificate = { cert: string; key: string; hash: string }
export type AuthorityCertificate = { ca: string; cert: string; key: string }

export async function selfSigned(host: string, days = 10): Promise<Certificate> {
  cryptoProvider.set(crypto)
  const keys = await crypto.subtle.generateKey(algorithm, true, ["sign", "verify"])
  const now = Date.now()
  const certificate = await X509CertificateGenerator.createSelfSigned({
    serialNumber: randomBytes(16).toString("hex"),
    name: "CN=git-stacks.local",
    notBefore: new Date(now - 5 * 60_000),
    notAfter: new Date(now + days * 24 * 60 * 60_000),
    signingAlgorithm: algorithm,
    keys,
    extensions: [
      new BasicConstraintsExtension(false, undefined, true),
      new KeyUsagesExtension(KeyUsageFlags.digitalSignature, true),
      new ExtendedKeyUsageExtension([ExtendedKeyUsage.serverAuth]),
      new SubjectAlternativeNameExtension([{ type: "dns", value: "localhost" }, { type: "ip", value: host }]),
      await SubjectKeyIdentifierExtension.create(keys.publicKey),
    ],
  }, crypto)
  return {
    cert: certificate.toString("pem"),
    key: PemConverter.encode(await crypto.subtle.exportKey("pkcs8", keys.privateKey), PemConverter.PrivateKeyTag),
    hash: createHash("sha256").update(new Uint8Array(certificate.rawData)).digest("base64url"),
  }
}

export async function authoritySigned(host: string): Promise<AuthorityCertificate> {
  cryptoProvider.set(crypto)
  const caKeys = await crypto.subtle.generateKey(algorithm, true, ["sign", "verify"])
  const now = Date.now()
  const ca = await X509CertificateGenerator.createSelfSigned({
    serialNumber: randomBytes(16).toString("hex"),
    name: "CN=git-stacks-local-ca",
    notBefore: new Date(now - 5 * 60_000),
    notAfter: new Date(now + 365 * 24 * 60 * 60_000),
    signingAlgorithm: algorithm,
    keys: caKeys,
    extensions: [
      new BasicConstraintsExtension(true, 0, true),
      new KeyUsagesExtension(KeyUsageFlags.keyCertSign | KeyUsageFlags.cRLSign, true),
      await SubjectKeyIdentifierExtension.create(caKeys.publicKey),
    ],
  }, crypto)
  const leafKeys = await crypto.subtle.generateKey(algorithm, true, ["sign", "verify"])
  const leaf = await X509CertificateGenerator.create({
    serialNumber: randomBytes(16).toString("hex"),
    subject: "CN=localhost",
    issuer: "CN=git-stacks-local-ca",
    notBefore: new Date(now - 5 * 60_000),
    notAfter: new Date(now + 30 * 24 * 60 * 60_000),
    signingAlgorithm: algorithm,
    publicKey: leafKeys.publicKey,
    signingKey: caKeys.privateKey,
    extensions: [
      new BasicConstraintsExtension(false, undefined, true),
      new KeyUsagesExtension(KeyUsageFlags.digitalSignature, true),
      new ExtendedKeyUsageExtension([ExtendedKeyUsage.serverAuth]),
      new SubjectAlternativeNameExtension([{ type: "dns", value: "localhost" }, { type: "ip", value: host }]),
      await SubjectKeyIdentifierExtension.create(leafKeys.publicKey),
    ],
  }, crypto)
  return {
    ca: ca.toString("pem"),
    cert: leaf.toString("pem"),
    key: PemConverter.encode(await crypto.subtle.exportKey("pkcs8", leafKeys.privateKey), PemConverter.PrivateKeyTag),
  }
}
