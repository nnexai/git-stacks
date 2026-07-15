import {

  chmodSync,
  closeSync,
  existsSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  renameSync,
  writeFileSync,
} from "fs"
import { randomBytes as cryptoRandomBytes, timingSafeEqual } from "crypto"
import { join } from "path"
import { z } from "zod"
import { WS_CONFIG_DIR } from "@git-stacks/core/paths"

const CLIENT_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/
const CredentialRecordSchema = z.object({
  clientId: z.string().regex(CLIENT_ID),
  token: z.string().min(1),
  createdAt: z.string().datetime(),
  revokedAt: z.string().datetime().optional(),
}).strict()

interface CredentialRecord extends z.infer<typeof CredentialRecordSchema> {}

export interface CredentialOptions {
  serviceRoot?: string
  randomBytes?: (size: number) => Uint8Array
  now?: () => Date
  replaceRevoked?: boolean
}

export interface OfficialClientCredential {
  clientId: string
  token: string
}

export interface AuthenticatedClient {
  clientId: string
  capabilities: ["service:v1"]
}

export const UNAUTHENTICATED_RESPONSE = Object.freeze({
  ok: false as const,
  status: 401 as const,
  body: Object.freeze({ error: "unauthenticated" as const }),
})

export type AdmissionResult =
  | typeof UNAUTHENTICATED_RESPONSE
  | { ok: true; client: AuthenticatedClient }

function root(options: CredentialOptions): string {
  return options.serviceRoot ?? join(WS_CONFIG_DIR, "service")
}

function validateClientId(clientId: string): void {
  if (!CLIENT_ID.test(clientId)) throw new Error("Invalid official client ID")
}

function assertProtected(path: string, kind: "directory" | "file"): void {
  const stat = lstatSync(path)
  if (stat.isSymbolicLink()) throw new Error(`Refusing symlinked credential ${kind}`)
  if (kind === "directory" ? !stat.isDirectory() : !stat.isFile()) throw new Error(`Invalid credential ${kind}`)
  if (typeof process.getuid === "function" && stat.uid !== process.getuid()) throw new Error(`Unsafe credential ${kind} ownership`)
  const expected = kind === "directory" ? 0o700 : 0o600
  if ((stat.mode & 0o777) !== expected) throw new Error(`Unsafe credential ${kind} permissions`)
}

function credentialsDir(options: CredentialOptions): string {
  const serviceRoot = root(options)
  if (!existsSync(serviceRoot)) mkdirSync(serviceRoot, { recursive: true, mode: 0o700 })
  assertProtected(serviceRoot, "directory")
  const dir = join(serviceRoot, "credentials")
  if (!existsSync(dir)) mkdirSync(dir, { mode: 0o700 })
  assertProtected(dir, "directory")
  return dir
}

function recordPath(clientId: string, options: CredentialOptions): string {
  validateClientId(clientId)
  return join(credentialsDir(options), `${clientId}.json`)
}

function parseRecord(path: string): CredentialRecord {
  assertProtected(path, "file")
  let value: unknown
  try {
    value = JSON.parse(readFileSync(path, "utf8"))
  } catch {
    throw new Error("Invalid credential record")
  }
  const parsed = CredentialRecordSchema.safeParse(value)
  if (!parsed.success) throw new Error("Invalid credential record")
  return parsed.data
}

function atomicWrite(path: string, value: unknown): void {
  const tmp = `${path}.${process.pid}.${crypto.randomUUID()}.tmp`
  const fd = openSync(tmp, "wx", 0o600)
  try {
    writeFileSync(fd, `${JSON.stringify(value)}\n`, "utf8")
    fsyncSync(fd)
  } finally {
    closeSync(fd)
  }
  renameSync(tmp, path)
  chmodSync(path, 0o600)
}

function updateMetadata(options: CredentialOptions): void {
  const dir = credentialsDir(options)
  const clients = readdirSync(dir)
    .filter((name) => name.endsWith(".json") && name !== "registry.json")
    .map((name) => parseRecord(join(dir, name)))
    .map(({ clientId, createdAt, revokedAt }) => ({ clientId, createdAt, ...(revokedAt ? { revokedAt } : {}) }))
    .sort((a, b) => a.clientId.localeCompare(b.clientId))
  atomicWrite(join(dir, "registry.json"), { clients })
}

export function readOfficialClientCredential(clientId: string, options: CredentialOptions = {}): OfficialClientCredential | null {
  const path = recordPath(clientId, options)
  if (!existsSync(path)) return null
  const record = parseRecord(path)
  if (record.revokedAt) return null
  return { clientId: record.clientId, token: record.token }
}

export function provisionOfficialClient(clientId: string, options: CredentialOptions = {}): OfficialClientCredential {
  const path = recordPath(clientId, options)
  if (existsSync(path)) {
    const current = parseRecord(path)
    if (!current.revokedAt) return { clientId: current.clientId, token: current.token }
    if (!options.replaceRevoked) throw new Error("Revoked credential requires explicit replacement")
  }
  const bytes = options.randomBytes?.(32) ?? cryptoRandomBytes(32)
  if (bytes.byteLength < 32) throw new Error("Credential randomness must contain at least 32 bytes")
  const record: CredentialRecord = {
    clientId,
    token: Buffer.from(bytes).toString("base64url"),
    createdAt: (options.now?.() ?? new Date()).toISOString(),
  }
  if (existsSync(path)) {
    atomicWrite(path, record)
    updateMetadata(options)
    return { clientId, token: record.token }
  }
  const fd = openSync(path, "wx", 0o600)
  try {
    writeFileSync(fd, `${JSON.stringify(record)}\n`, "utf8")
    fsyncSync(fd)
  } finally {
    closeSync(fd)
  }
  updateMetadata(options)
  return { clientId, token: record.token }
}

export function revokeCredential(clientId: string, options: CredentialOptions = {}): boolean {
  const path = recordPath(clientId, options)
  if (!existsSync(path)) return false
  const current = parseRecord(path)
  if (current.revokedAt) return false
  atomicWrite(path, { ...current, revokedAt: (options.now?.() ?? new Date()).toISOString() })
  updateMetadata(options)
  return true
}

export function verifyCredential(token: string, options: CredentialOptions = {}): AuthenticatedClient | null {
  if (typeof token !== "string" || token.length === 0) return null
  for (const name of readdirSync(credentialsDir(options))) {
    if (!name.endsWith(".json") || name === "registry.json") continue
    const record = parseRecord(join(credentialsDir(options), name))
    if (record.revokedAt) continue
    const presented = Buffer.from(token, "utf8")
    const expected = Buffer.from(record.token, "utf8")
    if (presented.length === expected.length && timingSafeEqual(presented, expected)) {
      return { clientId: record.clientId, capabilities: ["service:v1"] }
    }
  }
  return null
}

/** Authenticate a request before routing or parsing any other request data. */
export function authenticateAdmission(
  authorization: string | null | undefined,
  options: CredentialOptions = {},
): AdmissionResult {
  const match = typeof authorization === "string" ? /^Bearer ([^\s]+)$/.exec(authorization) : null
  if (!match) return UNAUTHENTICATED_RESPONSE
  const client = verifyCredential(match[1]!, options)
  return client ? { ok: true, client } : UNAUTHENTICATED_RESPONSE
}
