import { createHash, randomBytes } from "node:crypto"
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs"
import { join } from "node:path"

const HOST = "127.0.0.1"
const PORT = Number(process.env.PORT ?? 0)
const DELEGATION_MAX_MS = 5 * 60_000
const root = new URL(".", import.meta.url).pathname
const stateDir = join(root, ".state")
const identityPath = join(stateDir, "helper-identity.json")
const cookieName = "git_stacks_spike_012"
const serviceAudience = `git-stacks-service:${randomBytes(12).toString("base64url")}`

type StoredIdentity = { privateJwk: JsonWebKey; publicJwk: JsonWebKey }
type HelperIdentity = { privateKey: CryptoKey; publicKey: CryptoKey; id: string; created: boolean }
type Delegation = {
  v: 1
  id: string
  audience: string
  origin: string
  keyId: string
  publicKeySpki: string
  scopes: string[]
  issuedAt: number
  expiresAt: number
}
type DelegationToken = { delegation: Delegation; signature: string }
type SocketData = {
  origin: string
  stage: "initial" | "challenge" | "authenticated"
  delegation?: Delegation
  publicKey?: CryptoKey
  nonce?: string
}

function b64url(bytes: ArrayBuffer | Uint8Array): string {
  return Buffer.from(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)).toString("base64url")
}

function fromB64url(value: string): Uint8Array<ArrayBuffer> {
  const decoded = Buffer.from(value, "base64url")
  const copy = new Uint8Array(decoded.byteLength)
  copy.set(decoded)
  return copy
}

function digest(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("base64url")
}

function canonicalDelegation(value: Delegation): Uint8Array<ArrayBuffer> {
  return new TextEncoder().encode(JSON.stringify([value.v, value.id, value.audience, value.origin, value.keyId, value.publicKeySpki, value.scopes, value.issuedAt, value.expiresAt]))
}

function canonicalProof(delegationId: string, nonce: string): Uint8Array<ArrayBuffer> {
  return new TextEncoder().encode(JSON.stringify([1, delegationId, nonce, serviceAudience]))
}

function json(value: unknown, status = 200, headers?: HeadersInit): Response {
  return Response.json(value, { status, headers: { "cache-control": "no-store", ...headers } })
}

function log(event: string, fields: Record<string, unknown> = {}): void {
  console.log(JSON.stringify({ at: new Date().toISOString(), event, ...fields }))
}

async function loadHelperIdentity(): Promise<HelperIdentity> {
  mkdirSync(stateDir, { recursive: true, mode: 0o700 })
  let stored: StoredIdentity
  let created = false
  if (existsSync(identityPath)) {
    stored = JSON.parse(readFileSync(identityPath, "utf8")) as StoredIdentity
  } else {
    const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"])
    stored = {
      privateJwk: await crypto.subtle.exportKey("jwk", pair.privateKey),
      publicJwk: await crypto.subtle.exportKey("jwk", pair.publicKey),
    }
    const temporary = `${identityPath}.${process.pid}.${randomBytes(4).toString("hex")}`
    writeFileSync(temporary, JSON.stringify(stored), { encoding: "utf8", mode: 0o600, flag: "wx" })
    renameSync(temporary, identityPath)
    chmodSync(identityPath, 0o600)
    created = true
  }
  const privateKey = await crypto.subtle.importKey("jwk", stored.privateJwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"])
  const publicKey = await crypto.subtle.importKey("jwk", stored.publicJwk, { name: "ECDSA", namedCurve: "P-256" }, true, ["verify"])
  const spki = await crypto.subtle.exportKey("spki", publicKey)
  return { privateKey, publicKey, id: digest(new Uint8Array(spki)), created }
}

const helper = await loadHelperIdentity()
const pairingCode = randomBytes(32).toString("base64url")
const pairingDigest = digest(pairingCode)
let pairingAvailable = true
const principalCredential = randomBytes(32).toString("base64url")
const principalDigest = digest(principalCredential)
let baseOrigin = ""

function cookie(request: Request): string | undefined {
  const header = request.headers.get("cookie") ?? ""
  for (const item of header.split(";")) {
    const [name, ...rest] = item.trim().split("=")
    if (name === cookieName) return rest.join("=")
  }
  return undefined
}

function isPaired(request: Request): boolean {
  const credential = cookie(request)
  return typeof credential === "string" && digest(credential) === principalDigest
}

function browserRequestAllowed(request: Request): boolean {
  const url = new URL(request.url)
  return url.origin === baseOrigin
    && request.headers.get("host") === new URL(baseOrigin).host
    && (request.headers.get("origin") === null || request.headers.get("origin") === baseOrigin)
    && request.headers.get("sec-fetch-site") !== "cross-site"
}

async function issueDelegation(request: Request): Promise<Response> {
  const body = await request.json().catch(() => null) as { publicKeySpki?: unknown; keyId?: unknown; ttlMs?: unknown } | null
  if (!body || typeof body.publicKeySpki !== "string" || typeof body.keyId !== "string") return json({ error: "invalid_request" }, 400)
  const spki = fromB64url(body.publicKeySpki)
  if (spki.byteLength > 512 || digest(spki) !== body.keyId) return json({ error: "invalid_public_key" }, 400)
  try {
    await crypto.subtle.importKey("spki", spki, { name: "ECDSA", namedCurve: "P-256" }, true, ["verify"])
  } catch {
    return json({ error: "invalid_public_key" }, 400)
  }
  const requestedTtl = typeof body.ttlMs === "number" ? body.ttlMs : 60_000
  const ttlMs = Math.max(50, Math.min(DELEGATION_MAX_MS, Math.floor(requestedTtl)))
  const issuedAt = Date.now()
  const delegation: Delegation = {
    v: 1,
    id: randomBytes(16).toString("base64url"),
    audience: serviceAudience,
    origin: baseOrigin,
    keyId: body.keyId,
    publicKeySpki: body.publicKeySpki,
    scopes: ["terminal:read", "terminal:write"],
    issuedAt,
    expiresAt: issuedAt + ttlMs,
  }
  const signature = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, helper.privateKey, canonicalDelegation(delegation))
  log("delegation.issued", { id: delegation.id, keyId: delegation.keyId, ttlMs })
  return json({ delegation, signature: b64url(signature) } satisfies DelegationToken)
}

async function validateDelegation(token: DelegationToken, origin: string): Promise<{ delegation: Delegation; publicKey: CryptoKey } | { error: string }> {
  const value = token?.delegation
  if (!value || token.signature === undefined) return { error: "malformed_delegation" }
  const signatureValid = await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, helper.publicKey, fromB64url(token.signature), canonicalDelegation(value)).catch(() => false)
  if (!signatureValid) return { error: "invalid_delegation_signature" }
  const now = Date.now()
  if (value.v !== 1 || value.audience !== serviceAudience || value.origin !== origin) return { error: "delegation_context_mismatch" }
  if (value.issuedAt > now + 5_000 || value.expiresAt <= now || value.expiresAt - value.issuedAt > DELEGATION_MAX_MS) return { error: "delegation_expired" }
  if (value.scopes.join(",") !== "terminal:read,terminal:write") return { error: "invalid_scope" }
  const spki = fromB64url(value.publicKeySpki)
  if (digest(spki) !== value.keyId) return { error: "delegation_key_mismatch" }
  try {
    const publicKey = await crypto.subtle.importKey("spki", spki, { name: "ECDSA", namedCurve: "P-256" }, true, ["verify"])
    return { delegation: value, publicKey }
  } catch {
    return { error: "invalid_public_key" }
  }
}

const isolation = Bun.serve({
  hostname: HOST,
  port: 0,
  fetch() {
    return new Response(`<!doctype html><script>
      const request = indexedDB.open("git-stacks-spike-012", 1);
      request.onupgradeneeded = () => request.result.createObjectStore("identity");
      request.onsuccess = () => {
        const get = request.result.transaction("identity", "readonly").objectStore("identity").get("browser");
        get.onsuccess = () => parent.postMessage({ type: "isolation-result", found: Boolean(get.result) }, "*");
      };
    </script>`, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } })
  },
})

const server = Bun.serve<SocketData>({
  hostname: HOST,
  port: PORT,
  fetch: async (request, server) => {
    const url = new URL(request.url)
    if (url.pathname === "/verify") {
      if (!browserRequestAllowed(request) || !isPaired(request)) return new Response("Forbidden", { status: 403 })
      if (!server.upgrade(request, { data: { origin: baseOrigin, stage: "initial" } })) return new Response("Upgrade failed", { status: 400 })
      return undefined
    }
    if (!browserRequestAllowed(request)) return new Response("Forbidden", { status: 403 })
    if (url.pathname === "/pair" && request.method === "POST") {
      const body = await request.json().catch(() => null) as { code?: unknown } | null
      if (!body || typeof body.code !== "string" || !pairingAvailable || digest(body.code) !== pairingDigest) return json({ error: "invalid_or_consumed_pairing" }, 401)
      pairingAvailable = false
      log("pairing.consumed")
      return json({ paired: true }, 200, { "set-cookie": `${cookieName}=${principalCredential}; HttpOnly; SameSite=Strict; Path=/; Max-Age=600` })
    }
    if (url.pathname === "/delegate" && request.method === "POST") {
      if (!isPaired(request)) return json({ error: "unauthorized" }, 401)
      return issueDelegation(request)
    }
    if (url.pathname === "/config") {
      if (!isPaired(request)) return json({ error: "unauthorized" }, 401)
      return json({ serviceAudience, helperId: helper.id, helperCreated: helper.created, identityMode: (statSync(identityPath).mode & 0o777).toString(8), isolationOrigin: isolation.url.origin })
    }
    if (url.pathname === "/client.js") return new Response(Bun.file(join(root, "public/client.js")), { headers: { "content-type": "text/javascript; charset=utf-8", "cache-control": "no-store" } })
    if (url.pathname === "/app.css") return new Response(Bun.file(join(root, "public/app.css")), { headers: { "content-type": "text/css; charset=utf-8", "cache-control": "no-store" } })
    if (url.pathname === "/" || url.pathname === "/web/") {
      return new Response(Bun.file(join(root, "public/index.html")), { headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
        "content-security-policy": `default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self' ws:; frame-src ${isolation.url.origin}; object-src 'none'; base-uri 'none'; frame-ancestors 'none'`,
      } })
    }
    return new Response("Not found", { status: 404 })
  },
  websocket: {
    message: async (socket, raw) => {
      if (typeof raw !== "string") return socket.close(1003, "Text frames required")
      let message: { type?: string; token?: DelegationToken; signature?: string }
      try { message = JSON.parse(raw) as typeof message } catch { return socket.close(1003, "Invalid JSON") }
      if (message.type === "auth-init" && socket.data.stage === "initial" && message.token) {
        const validated = await validateDelegation(message.token, socket.data.origin)
        if ("error" in validated) {
          socket.send(JSON.stringify({ type: "auth-error", error: validated.error }))
          return socket.close(1008, validated.error)
        }
        socket.data.delegation = validated.delegation
        socket.data.publicKey = validated.publicKey
        socket.data.nonce = randomBytes(32).toString("base64url")
        socket.data.stage = "challenge"
        socket.send(JSON.stringify({ type: "challenge", nonce: socket.data.nonce }))
        return
      }
      if (message.type === "proof" && socket.data.stage === "challenge" && socket.data.delegation && socket.data.publicKey && socket.data.nonce && typeof message.signature === "string") {
        const valid = await crypto.subtle.verify(
          { name: "ECDSA", hash: "SHA-256" },
          socket.data.publicKey,
          fromB64url(message.signature),
          canonicalProof(socket.data.delegation.id, socket.data.nonce),
        ).catch(() => false)
        if (!valid) {
          socket.send(JSON.stringify({ type: "auth-error", error: "invalid_proof" }))
          return socket.close(1008, "invalid_proof")
        }
        socket.data.stage = "authenticated"
        log("browser.authenticated", { delegationId: socket.data.delegation.id, keyId: socket.data.delegation.keyId })
        socket.send(JSON.stringify({ type: "auth-ok", delegationId: socket.data.delegation.id }))
        return
      }
      socket.send(JSON.stringify({ type: "auth-error", error: socket.data.stage === "authenticated" ? "proof_replay" : "unexpected_message" }))
      socket.close(1008, "unexpected_message")
    },
  },
})

baseOrigin = server.url.origin
const pairingUrl = new URL("/web/", server.url)
pairingUrl.hash = `pair=${encodeURIComponent(pairingCode)}`
log("spike.ready", { pairingUrl: pairingUrl.toString(), helperId: helper.id, helperCreated: helper.created, identityMode: (statSync(identityPath).mode & 0o777).toString(8), isolationOrigin: isolation.url.origin })
console.log(`OPEN ${pairingUrl}`)

let stopping = false
async function stop(): Promise<void> {
  if (stopping) return
  stopping = true
  log("spike.stopping")
  await Promise.all([server.stop(true), isolation.stop(true)])
}

process.on("SIGINT", () => { void stop().then(() => process.exit(0)) })
process.on("SIGTERM", () => { void stop().then(() => process.exit(0)) })
