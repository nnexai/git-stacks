const FORBIDDEN_EXACT = ["SSLKEYLOGFILE", "DEBUG_TRACE"] as const

/**
 * Refuse process-wide diagnostics that can make an otherwise encrypted
 * carrier recordable or expose protocol payloads. This check intentionally
 * runs before any listener or client is created.
 */
export function assertSecureTransportEnvironment(environment: NodeJS.ProcessEnv = process.env): void {
  for (const name of FORBIDDEN_EXACT) {
    if (environment[name]) throw new Error(`${name} is incompatible with secure git-stacks transport`)
  }
  const nodeOptions = environment.NODE_OPTIONS ?? ""
  if (/(?:^|\s)--tls-keylog(?:=|\s|$)/.test(nodeOptions)) throw new Error("NODE_OPTIONS TLS key logging is incompatible with secure git-stacks transport")
  const debug = environment.DEBUG ?? ""
  if (/(?:^|[\s,])(?:webtransport|quiche)(?::|\*|,|\s|$)/i.test(debug)) throw new Error("WebTransport debug logging is incompatible with secure git-stacks transport")
}
