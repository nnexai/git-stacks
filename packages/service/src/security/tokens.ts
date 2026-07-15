import { randomBytes, timingSafeEqual } from "node:crypto"

export interface OneUseTokenRecord<T> {
  token: string
  expiresAt: number
  value: T
}

export class OneUseTokenStore<T> {
  private readonly records = new Map<string, OneUseTokenRecord<T>>()

  issue(value: T, ttlMs: number, bytes = 32): OneUseTokenRecord<T> {
    if (bytes < 32) throw new Error("One-use tokens require at least 256 bits")
    this.sweep()
    if (this.records.size >= 256) throw Object.assign(new Error("One-use token capacity reached"), { code: "capacity_exceeded" })
    const record = { token: randomBytes(bytes).toString("base64url"), expiresAt: Date.now() + ttlMs, value }
    this.records.set(record.token, record)
    return record
  }

  consume(token: string): OneUseTokenRecord<T> | null {
    const match = this.inspect(token)
    if (!match) return null
    this.records.delete(match.token)
    return match
  }

  inspect(token: string): OneUseTokenRecord<T> | null {
    if (typeof token !== "string" || token.length < 32) return null
    this.sweep()
    let match: OneUseTokenRecord<T> | undefined
    for (const record of this.records.values()) {
      const expected = Buffer.from(record.token)
      const presented = Buffer.from(token)
      if (expected.length === presented.length && timingSafeEqual(expected, presented)) match = record
    }
    if (!match) return null
    return match
  }

  revokeAll(): void { this.records.clear() }
  get size(): number { this.sweep(); return this.records.size }

  private sweep(): void {
    const now = Date.now()
    for (const [token, record] of this.records) if (record.expiresAt <= now) this.records.delete(token)
  }
}
