import { createHash, randomBytes } from "node:crypto"
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs"
import { join } from "node:path"

const HOST = "127.0.0.1"
const GRACE_MS = 1_000
const HEARTBEAT_MS = 150
const TOKEN_MAX_MS = 5 * 60_000
const root = new URL(".", import.meta.url).pathname
const stateDir = join(root, ".state")
const identityPath = join(stateDir, "helper-identity.json")
const serviceAudience = `git-stacks-remote:${randomBytes(12).toString("base64url")}`

type StoredIdentity = { privateJwk: JsonWebKey; publicJwk: JsonWebKey }
type Delegation = {
  v: 1
  id: string
  audience: string
  origin: string
  epoch: string
  keyId: string
  publicKeySpki: string
  scopes: string[]
  issuedAt: number
  expiresAt: number
}
type Token = { delegation: Delegation; signature: string }
type EpochState = { status: "active" | "revoked" | "expired"; lastHeartbeat: number }
type SocketData = { stage: "initial" | "challenge" | "authenticated"; delegation?: Delegation; publicKey?: CryptoKey; nonce?: string }

function b64url(value: ArrayBuffer | Uint8Array): string {
  return Buffer.from(value instanceof Uint8Array ? value : new Uint8Array(value)).toString("base64url")
}

function fromB64url(value: string): Uint8Array<ArrayBuffer> {
  const source = Buffer.from(value, "base64url")
  const result = new Uint8Array(source.byteLength)
  result.set(source)
  return result
}

function digest(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("base64url")
}

function canonicalDelegation(value: Delegation): Uint8Array<ArrayBuffer> {
  return new TextEncoder().encode(JSON.stringify([
    value.v, value.id, value.audience, value.origin, value.epoch, value.keyId,
    value.publicKeySpki, value.scopes, value.issuedAt, value.expiresAt,
  ]))
}

function canonicalProof(value: Delegation, nonce: string): Uint8Array<ArrayBuffer> {
  return new TextEncoder().encode(JSON.stringify([1, value.id, value.epoch, nonce, serviceAudience]))
}

function json(value: unknown, status = 200, headers?: HeadersInit): Response {
  return Response.json(value, { status, headers: { "cache-control": "no-store", ...headers } })
}

function log(event: string, fields: Record<string, unknown> = {}): void {
  console.log(JSON.stringify({ at: new Date().toISOString(), event, ...fields }))
}

async function loadIdentity(): Promise<{ privateKey: CryptoKey; publicKey: CryptoKey; id: string }> {
  mkdirSync(stateDir, { recursive: true, mode: 0o700 })
  let stored: StoredIdentity
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
  }
  const privateKey = await crypto.subtle.importKey("jwk", stored.privateJwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"])
  const publicKey = await crypto.subtle.importKey("jwk", stored.publicJwk, { name: "ECDSA", namedCurve: "P-256" }, true, ["verify"])
  const spki = await crypto.subtle.exportKey("spki", publicKey)
  return { privateKey, publicKey, id: digest(new Uint8Array(spki)) }
}

const helperIdentity = await loadIdentity()
const epochs = new Map<string, EpochState>()
let currentEpoch = ""
let heartbeatEnabled = true

function registerEpoch(): string {
  currentEpoch = randomBytes(24).toString("base64url")
  epochs.set(currentEpoch, { status: "active", lastHeartbeat: Date.now() })
  heartbeatEnabled = true
  log("epoch.registered", { epoch: currentEpoch })
  return currentEpoch
}

function heartbeat(): void {
  const state = epochs.get(currentEpoch)
  if (heartbeatEnabled && state?.status === "active") state.lastHeartbeat = Date.now()
}

function epochError(epoch: string): string | undefined {
  const state = epochs.get(epoch)
  if (!state) return "epoch_unknown"
  if (state.status === "revoked") return "epoch_revoked"
  if (state.status === "expired") return "epoch_expired"
  if (Date.now() - state.lastHeartbeat > GRACE_MS) {
    state.status = "expired"
    log("epoch.expired", { epoch })
    return "epoch_expired"
  }
  return undefined
}

registerEpoch()
const heartbeatTimer = setInterval(heartbeat, HEARTBEAT_MS)

let helperOrigin = ""
let principal = randomBytes(32).toString("base64url")
const pairingCode = randomBytes(32).toString("base64url")
let pairingAvailable = true
let attacker: ReturnType<typeof Bun.spawn> | undefined

function browserAllowed(request: Request): boolean {
  const url = new URL(request.url)
  return url.origin === helperOrigin
    && request.headers.get("host") === new URL(helperOrigin).host
    && (request.headers.get("origin") === null || request.headers.get("origin") === helperOrigin)
    && request.headers.get("sec-fetch-site") !== "cross-site"
}

function isPaired(request: Request): boolean {
  const header = request.headers.get("cookie") ?? ""
  return header.split(";").some((part) => part.trim() === `gs_spike_013=${principal}`)
}

async function issueDelegation(request: Request): Promise<Response> {
  const body = await request.json().catch(() => null) as { keyId?: unknown; publicKeySpki?: unknown } | null
  if (!body || typeof body.keyId !== "string" || typeof body.publicKeySpki !== "string") return json({ error: "invalid_request" }, 400)
  const spki = fromB64url(body.publicKeySpki)
  if (digest(spki) !== body.keyId) return json({ error: "invalid_key" }, 400)
  try { await crypto.subtle.importKey("spki", spki, { name: "ECDSA", namedCurve: "P-256" }, true, ["verify"]) } catch { return json({ error: "invalid_key" }, 400) }
  if (epochError(currentEpoch)) return json({ error: "helper_epoch_inactive" }, 503)
  const issuedAt = Date.now()
  const delegation: Delegation = {
    v: 1,
    id: randomBytes(16).toString("base64url"),
    audience: serviceAudience,
    origin: helperOrigin,
    epoch: currentEpoch,
    keyId: body.keyId,
    publicKeySpki: body.publicKeySpki,
    scopes: ["terminal:read", "terminal:write"],
    issuedAt,
    expiresAt: issuedAt + 60_000,
  }
  const signature = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, helperIdentity.privateKey, canonicalDelegation(delegation))
  log("delegation.issued", { id: delegation.id, epoch: delegation.epoch })
  return json({ delegation, signature: b64url(signature) } satisfies Token)
}

async function validateToken(token: Token): Promise<{ delegation: Delegation; publicKey: CryptoKey } | { error: string }> {
  const value = token?.delegation
  if (!value || typeof token.signature !== "string") return { error: "malformed_delegation" }
  const valid = await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, helperIdentity.publicKey, fromB64url(token.signature), canonicalDelegation(value)).catch(() => false)
  if (!valid) return { error: "invalid_delegation_signature" }
  if (value.v !== 1 || value.audience !== serviceAudience || value.origin !== helperOrigin) return { error: "delegation_context_mismatch" }
  const epochFailure = epochError(value.epoch)
  if (epochFailure) return { error: epochFailure }
  const now = Date.now()
  if (value.issuedAt > now + 5_000 || value.expiresAt <= now || value.expiresAt - value.issuedAt > TOKEN_MAX_MS) return { error: "delegation_expired" }
  if (value.scopes.join(",") !== "terminal:read,terminal:write") return { error: "invalid_scope" }
  const spki = fromB64url(value.publicKeySpki)
  if (digest(spki) !== value.keyId) return { error: "delegation_key_mismatch" }
  try {
    return { delegation: value, publicKey: await crypto.subtle.importKey("spki", spki, { name: "ECDSA", namedCurve: "P-256" }, true, ["verify"]) }
  } catch {
    return { error: "invalid_public_key" }
  }
}

const verifier = Bun.serve<SocketData>({
  hostname: HOST,
  port: 0,
  fetch(request, server) {
    const url = new URL(request.url)
    if (url.pathname !== "/verify" || request.headers.get("origin") !== helperOrigin) return new Response("Forbidden", { status: 403 })
    if (!server.upgrade(request, { data: { stage: "initial" } })) return new Response("Upgrade failed", { status: 400 })
    return undefined
  },
  websocket: {
    async message(socket, raw) {
      if (typeof raw !== "string") return socket.close(1003, "Text required")
      let message: { type?: string; token?: Token; signature?: string }
      try { message = JSON.parse(raw) as typeof message } catch { return socket.close(1003, "Invalid JSON") }
      if (message.type === "auth-init" && socket.data.stage === "initial" && message.token) {
        const checked = await validateToken(message.token)
        if ("error" in checked) {
          log("auth.rejected", { error: checked.error, epoch: message.token.delegation?.epoch })
          socket.send(JSON.stringify({ type: "auth-error", error: checked.error }))
          return socket.close(1008, checked.error)
        }
        socket.data.delegation = checked.delegation
        socket.data.publicKey = checked.publicKey
        socket.data.nonce = randomBytes(32).toString("base64url")
        socket.data.stage = "challenge"
        socket.send(JSON.stringify({ type: "challenge", nonce: socket.data.nonce }))
        return
      }
      if (message.type === "proof" && socket.data.stage === "challenge" && socket.data.delegation && socket.data.publicKey && socket.data.nonce && typeof message.signature === "string") {
        const liveError = epochError(socket.data.delegation.epoch)
        const valid = !liveError && await crypto.subtle.verify(
          { name: "ECDSA", hash: "SHA-256" }, socket.data.publicKey,
          fromB64url(message.signature), canonicalProof(socket.data.delegation, socket.data.nonce),
        ).catch(() => false)
        if (!valid) {
          const error = liveError ?? "invalid_proof"
          log("auth.rejected", { error, epoch: socket.data.delegation.epoch })
          socket.send(JSON.stringify({ type: "auth-error", error }))
          return socket.close(1008, error)
        }
        socket.data.nonce = undefined
        socket.data.stage = "authenticated"
        log("auth.accepted", { id: socket.data.delegation.id, epoch: socket.data.delegation.epoch })
        socket.send(JSON.stringify({ type: "auth-ok", id: socket.data.delegation.id }))
        return
      }
      socket.send(JSON.stringify({ type: "auth-error", error: "protocol_state" }))
      socket.close(1008, "protocol_state")
    },
  },
})

let helper = Bun.serve({
  hostname: HOST,
  port: 0,
  async fetch(request) {
    const url = new URL(request.url)
    if (!browserAllowed(request)) return new Response("Forbidden", { status: 403 })
    if (url.pathname === "/pair" && request.method === "POST") {
      const body = await request.json().catch(() => null) as { code?: unknown } | null
      if (!body || typeof body.code !== "string" || !pairingAvailable || digest(body.code) !== digest(pairingCode)) return json({ error: "invalid_pairing" }, 401)
      pairingAvailable = false
      return json({ paired: true }, 200, { "set-cookie": `gs_spike_013=${principal}; HttpOnly; SameSite=Strict; Path=/` })
    }
    if (url.pathname === "/config") {
      if (!isPaired(request)) return json({ error: "unauthorized" }, 401)
      return json({ verifierWs: `ws://${verifier.hostname}:${verifier.port}/verify`, serviceAudience, helperId: helperIdentity.id, epoch: currentEpoch, graceMs: GRACE_MS, identityMode: (statSync(identityPath).mode & 0o777).toString(8) })
    }
    if (url.pathname === "/delegate" && request.method === "POST") {
      if (!isPaired(request)) return json({ error: "unauthorized" }, 401)
      return issueDelegation(request)
    }
    if (url.pathname === "/epoch/stop-heartbeats" && request.method === "POST") {
      if (!isPaired(request)) return json({ error: "unauthorized" }, 401)
      heartbeatEnabled = false
      log("heartbeat.stopped", { epoch: currentEpoch })
      return json({ epoch: currentEpoch, graceMs: GRACE_MS })
    }
    if (url.pathname === "/epoch/rotate" && request.method === "POST") {
      if (!isPaired(request)) return json({ error: "unauthorized" }, 401)
      return json({ epoch: registerEpoch() })
    }
    if (url.pathname === "/takeover" && request.method === "POST") {
      if (!isPaired(request)) return json({ error: "unauthorized" }, 401)
      const retiredEpoch = currentEpoch
      const state = epochs.get(retiredEpoch)
      if (state) state.status = "revoked"
      principal = randomBytes(32).toString("base64url")
      log("epoch.revoked", { epoch: retiredEpoch, reason: "clean_helper_shutdown" })
      setTimeout(() => {
        const port = helper.port
        helper.stop(true)
        attacker = Bun.spawn([process.execPath, join(root, "attacker.ts")], {
          cwd: root,
          env: { ...process.env, ATTACK_PORT: String(port), VERIFIER_WS: `ws://${verifier.hostname}:${verifier.port}/verify`, SERVICE_AUDIENCE: serviceAudience },
          stdout: "inherit",
          stderr: "inherit",
        })
      }, 40)
      return json({ retiredEpoch })
    }
    if (url.pathname === "/client.js") return new Response(Bun.file(join(root, "public/client.js")), { headers: { "content-type": "text/javascript; charset=utf-8", "cache-control": "no-store" } })
    if (url.pathname === "/app.css") return new Response(Bun.file(join(root, "public/app.css")), { headers: { "content-type": "text/css; charset=utf-8", "cache-control": "no-store" } })
    if (url.pathname === "/favicon.ico") return new Response(null, { status: 204 })
    if (url.pathname === "/" || url.pathname === "/web/") return new Response(Bun.file(join(root, "public/index.html")), { headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "content-security-policy": `default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self' ws://${verifier.hostname}:${verifier.port}; object-src 'none'; base-uri 'none'; frame-ancestors 'none'`,
    } })
    return new Response("Not found", { status: 404 })
  },
})

helperOrigin = helper.url.origin
log("spike.ready", { helperOrigin, verifier: verifier.url.origin, helperId: helperIdentity.id, epoch: currentEpoch, identityMode: (statSync(identityPath).mode & 0o777).toString(8) })
console.log(`Spike 013: ${helperOrigin}/web/#pair=${pairingCode}`)

async function shutdown(signal: string): Promise<void> {
  log("spike.shutdown", { signal })
  clearInterval(heartbeatTimer)
  attacker?.kill()
  helper.stop(true)
  verifier.stop(true)
  process.exit(0)
}

process.on("SIGINT", () => void shutdown("SIGINT"))
process.on("SIGTERM", () => void shutdown("SIGTERM"))
