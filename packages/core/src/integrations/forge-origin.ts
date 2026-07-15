/** Parse HTTPS and SCP-style Git remotes into a normalized exact origin. */

export function parseForgeOrigin(remote: string): { host: string; baseUrl: string; repoPath: string } | null {
  const trimmed = remote.trim()
  try {
    const url = new URL(trimmed)
    const repoPath = url.pathname.replace(/^\/+|\/+$/g, "").replace(/\.git$/, "")
    return repoPath ? { host: url.hostname.toLowerCase(), baseUrl: `${url.protocol}//${url.host}`, repoPath } : null
  } catch {
    const match = trimmed.match(/^(?:[^@\s]+@)?([^:\s/]+):(.+)$/)
    if (!match) return null
    const repoPath = match[2].replace(/^\/+|\/+$/g, "").replace(/\.git$/, "")
    return repoPath ? { host: match[1].toLowerCase(), baseUrl: `ssh://${match[1].toLowerCase()}`, repoPath } : null
  }
}

export function remoteHasExactHost(remote: string, host: string): boolean {
  return parseForgeOrigin(remote)?.host === host.toLowerCase()
}
