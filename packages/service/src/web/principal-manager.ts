import { createHash, randomBytes } from "node:crypto"

import { WEB_COOKIE, type Signal } from "@git-stacks/protocol"

export const WEB_PAIRING_TTL_MS = 60_000
export const WEB_PRINCIPAL_IDLE_MS = 8 * 60 * 60 * 1_000
export const WEB_PRINCIPAL_HARD_MS = 24 * 60 * 60 * 1_000
export const WEB_MAX_PRINCIPALS = 8

type Pairing = { digest: string; expiresAt: number }
export type WebPrincipal = { id: string; digest: string; createdAt: number; lastSeenAt: number; expiresAt: number }

function digest(value: string): string { return createHash("sha256").update(value).digest("hex") }
function token(bytes = 32): string { return randomBytes(bytes).toString("base64url") }

export class WebPrincipalManager {
  private pairings = new Map<string, Pairing>()
  private principals = new Map<string, WebPrincipal>()
  private seenActivity = new Map<string, Map<string, string>>()

  constructor(private readonly now: () => number = Date.now, private readonly onExpired?: (principalId: string) => void) {}

  issue(origin: string): { url: string; expires_at: string } {
    this.prune()
    const code = token()
    const pairing: Pairing = { digest: digest(code), expiresAt: this.now() + WEB_PAIRING_TTL_MS }
    this.pairings.set(pairing.digest, pairing)
    const url = new URL("/web/", origin)
    url.hash = `pair=${encodeURIComponent(code)}`
    return { url: url.toString(), expires_at: new Date(pairing.expiresAt).toISOString() }
  }

  exchange(code: string, existing?: WebPrincipal): { principal: WebPrincipal; cookie?: string } | null {
    this.prune()
    const key = digest(code)
    const pairing = this.pairings.get(key)
    if (!pairing || pairing.expiresAt <= this.now()) return null
    this.pairings.delete(key)
    if (existing) return { principal: { ...existing } }
    if (this.principals.size >= WEB_MAX_PRINCIPALS) return null
    const credential = token()
    const createdAt = this.now()
    const principal: WebPrincipal = {
      id: `web_${token(12)}`,
      digest: digest(credential),
      createdAt,
      lastSeenAt: createdAt,
      expiresAt: createdAt + WEB_PRINCIPAL_HARD_MS,
    }
    this.principals.set(principal.digest, principal)
    return {
      principal: { ...principal },
      cookie: `${WEB_COOKIE}=${credential}; HttpOnly; SameSite=Strict; Path=/web; Max-Age=${Math.floor(WEB_PRINCIPAL_HARD_MS / 1000)}`,
    }
  }

  authenticate(request: Request): WebPrincipal | null {
    this.prune()
    const credential = this.cookie(request)
    if (!credential) return null
    const principal = this.principals.get(digest(credential))
    if (!principal) return null
    const timestamp = this.now()
    if (principal.expiresAt <= timestamp || timestamp - principal.lastSeenAt > WEB_PRINCIPAL_IDLE_MS) {
      this.principals.delete(principal.digest)
      return null
    }
    principal.lastSeenAt = timestamp
    return { ...principal }
  }

  revoke(request: Request): string | null {
    const credential = this.cookie(request)
    if (!credential) return null
    const key = digest(credential)
    const principal = this.principals.get(key)
    this.principals.delete(key)
    if (principal) this.seenActivity.delete(principal.id)
    return principal?.id ?? null
  }

  acknowledgeSurface(principalId: string, surfaceId: string, signals: Signal[]): number {
    const seen = this.seenActivity.get(principalId) ?? new Map<string, string>()
    let acknowledged = 0
    for (const signal of signals) {
      if (signal.kind !== "activity" || signal.surface_id !== surfaceId) continue
      seen.set(this.activityLane(signal), this.activityVersion(signal))
      acknowledged += 1
    }
    if (acknowledged) this.seenActivity.set(principalId, seen)
    return acknowledged
  }

  visibleSignals(principalId: string, signals: Signal[]): Signal[] {
    const seen = this.seenActivity.get(principalId)
    if (!seen) return signals
    return signals.filter((signal) => signal.kind !== "activity" || seen.get(this.activityLane(signal)) !== this.activityVersion(signal))
  }

  clearCookie(): string { return `${WEB_COOKIE}=; HttpOnly; SameSite=Strict; Path=/web; Max-Age=0` }
  get size(): number { this.prune(); return this.principals.size }
  sweep(): void { this.prune() }

  private cookie(request: Request): string | undefined {
    for (const part of (request.headers.get("cookie") ?? "").split(";")) {
      const [name, ...value] = part.trim().split("=")
      if (name === WEB_COOKIE) return value.join("=")
    }
    return undefined
  }

  private prune(): void {
    const timestamp = this.now()
    for (const [key, pairing] of this.pairings) if (pairing.expiresAt <= timestamp) this.pairings.delete(key)
    for (const [key, principal] of this.principals) {
      if (principal.expiresAt <= timestamp || timestamp - principal.lastSeenAt > WEB_PRINCIPAL_IDLE_MS) {
        this.principals.delete(key)
        this.seenActivity.delete(principal.id)
        this.onExpired?.(principal.id)
      }
    }
  }

  private activityLane(signal: Extract<Signal, { kind: "activity" }>): string {
    return `${signal.source}\0${signal.surface_id}`
  }

  private activityVersion(signal: Extract<Signal, { kind: "activity" }>): string {
    return `${signal.id}\0${signal.state}\0${signal.occurred_at}`
  }
}
