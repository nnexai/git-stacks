import type { GlobalConfig } from "./config"

export interface SecretResolver {
  id: string
  resolve(path: string): Promise<string>
}

export const REF_PATTERN = /^\$\{\{\s*(\w+):(.+?)\s*\}\}$/

const DEFAULT_RESOLVER_IDS = ["keychain", "env"] as const

const KEYCHAIN_TIMEOUT_MS = 10_000
const CMD_TIMEOUT_MS = 10_000

type ExecResult = { ok: true; stdout: string } | { ok: false; stdout: string; error: string }

export function parseSecretRef(value: string): { id: string; path: string } | null {
  const match = value.match(REF_PATTERN)
  if (!match) return null
  return { id: match[1], path: match[2].trim() }
}

function parseKeychainPath(path: string): { service: string; account: string } {
  const slashIndex = path.indexOf("/")
  if (slashIndex === -1) {
    throw new Error(`Invalid keychain path '${path}' — expected 'service/account'`)
  }
  return {
    service: path.slice(0, slashIndex),
    account: path.slice(slashIndex + 1),
  }
}

async function execWithTimeout(cmd: string[], timeoutMs: number): Promise<ExecResult> {
  try {
    const proc = Bun.spawn(cmd, { stdout: "pipe", stderr: "pipe" })
    const stdoutPromise = proc.stdout ? new Response(proc.stdout).text() : Promise.resolve("")
    const stderrPromise = proc.stderr ? new Response(proc.stderr).text() : Promise.resolve("")

    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      try {
        proc.kill()
      } catch {
        // ignore kill races
      }
    }, timeoutMs)

    try {
      const exitCode = await proc.exited
      clearTimeout(timer)
      const [stdout, stderr] = await Promise.all([stdoutPromise, stderrPromise])

      if (timedOut) {
        return { ok: false, stdout: "", error: `timeout after ${timeoutMs / 1000}s` }
      }

      if (exitCode !== 0) {
        return {
          ok: false,
          stdout: "",
          error: `exit ${exitCode}: ${stderr.trim() || stdout.trim() || "command failed"}`,
        }
      }

      return { ok: true, stdout }
    } catch (err) {
      clearTimeout(timer)
      if (timedOut) {
        return { ok: false, stdout: "", error: `timeout after ${timeoutMs / 1000}s` }
      }
      return { ok: false, stdout: "", error: err instanceof Error ? err.message : String(err) }
    }
  } catch (err) {
    return { ok: false, stdout: "", error: err instanceof Error ? err.message : String(err) }
  }
}

export const envResolver: SecretResolver = {
  id: "env",
  async resolve(path: string): Promise<string> {
    const value = process.env[path]
    if (value === undefined) {
      throw new Error(`Environment variable '${path}' is not set`)
    }
    return value
  },
}

export const keychainResolver: SecretResolver = {
  id: "keychain",
  async resolve(path: string): Promise<string> {
    const { service, account } = parseKeychainPath(path)
    const cmd = process.platform === "darwin"
      ? ["security", "find-generic-password", "-s", service, "-a", account, "-w"]
      : process.platform === "linux"
        ? ["secret-tool", "lookup", "service", service, "account", account]
        : null

    if (!cmd) {
      throw new Error(`keychain resolver not supported on ${process.platform}`)
    }

    const result = await execWithTimeout(cmd, KEYCHAIN_TIMEOUT_MS)
    if (!result.ok) {
      if (process.platform === "linux" && /not found|no such file|enoent/i.test(result.error)) {
        throw new Error("secret-tool not found. Install libsecret-tools.")
      }
      throw new Error(`Failed to resolve keychain:${path}: ${result.error}`)
    }

    return result.stdout.trim()
  },
}

export const cmdResolver: SecretResolver = {
  id: "cmd",
  async resolve(path: string): Promise<string> {
    const result = await execWithTimeout(["sh", "-c", path], CMD_TIMEOUT_MS)
    if (!result.ok) {
      throw new Error(`Failed to resolve cmd:${path}: ${result.error}`)
    }
    return result.stdout.trim()
  },
}

const RESOLVER_REGISTRY: Record<string, SecretResolver> = {
  keychain: keychainResolver,
  env: envResolver,
  cmd: cmdResolver,
}

export async function resolveSecrets(
  rawEnv: Record<string, string>,
  resolvers: SecretResolver[]
): Promise<Record<string, string>> {
  const entries = await Promise.all(
    Object.entries(rawEnv).map(async ([key, value]) => {
      const ref = parseSecretRef(value)
      if (!ref) return [key, value] as const

      const resolver = resolvers.find((candidate) => candidate.id === ref.id)
      if (!resolver) {
        throw new Error(
          `No resolver for '${ref.id}' (referenced by ${key}). Available resolvers: ${resolvers.map((candidate) => candidate.id).join(", ") || "none"}. Enable it in config.yml secrets.resolvers.`
        )
      }

      return [key, await resolver.resolve(ref.path)] as const
    })
  )

  return Object.fromEntries(entries)
}

export function buildResolvers(config: GlobalConfig): SecretResolver[] {
  const enabledIds = config.secrets?.resolvers ?? [...DEFAULT_RESOLVER_IDS]
  const seen = new Set<string>()
  const resolvers: SecretResolver[] = []

  for (const id of enabledIds) {
    if (seen.has(id)) continue
    seen.add(id)
    const resolver = RESOLVER_REGISTRY[id]
    if (resolver) resolvers.push(resolver)
  }

  return resolvers
}
