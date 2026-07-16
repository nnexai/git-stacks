export type ForgeSourceId = "github" | "gitlab" | "gitea"

export type ForgeSourceChangeType = "mr" | "pr"

export type ForgeSourceParsed = {
  ok: true
  forge: ForgeSourceId
  changeType: ForgeSourceChangeType
  changeNumber: number
  baseUrl: string
  repoPath: string
  webUrl: string
}

export type ForgeSourceParseError =
  | { ok: false; error: "unsupported_forge" }
  | { ok: false; error: "url_parse_failed" }

export type ForgeSourceParseResult = ForgeSourceParsed | ForgeSourceParseError

export type ReviewedForgeProvider = "github" | "gitlab"

export type ReviewedForgeUrl = {
  ok: true
  provider: ReviewedForgeProvider
  change_kind: "pull_request" | "merge_request"
  change_number: number
  host: string
  base_url: string
  target_repository_path: string
  canonical_url: string
}

export type ReviewedForgeUrlFailure = {
  ok: false
  error: "malformed_url" | "unsupported_host"
}

export type ReviewedForgeHostConfig = Partial<Record<ReviewedForgeProvider, readonly string[]>>

export type ForgeSourceResolutionError =
  | "unsupported_forge"
  | "url_parse_failed"
  | "repo_not_matched"
  | "ambiguous_repo"
  | "template_repo_missing"
  | "not_worktree_mode"
  | "cli_unavailable"
  | "auth_required"
  | "metadata_unavailable"
  | "branch_conflict"

export type ForgeSourceResolutionFailure = {
  ok: false
  error: ForgeSourceResolutionError
}

export type ForgeSourceResolution = {
  forge: ForgeSourceId
  changeType: ForgeSourceChangeType
  changeNumber: number
  baseUrl: string
  repoPath: string
  webUrl: string
  source: {
    branch: string
    ref: string
    repoPath?: string
    sha?: string
    remoteUrl?: string
  }
  target: {
    branch: string
    repoPath?: string
    sha?: string
  }
  matchedRepo: {
    registryName: string
    templateRepoName: string
    workspaceRepoMode: "worktree" | "trunk" | "dir"
    mainPath?: string
  }
  metadataForWorkspace: {
    forge: ForgeSourceId
    baseUrl: string
    repoPath: string
    changeType: ForgeSourceChangeType
    changeNumber: number
    sourceBranch?: string
    sourceRef?: string
    targetBranch?: string
  }
  confidence: "url" | "cli" | "explicit-config"
}

function parsePositiveInt(raw: string): number | null {
  if (!/^\d+$/.test(raw)) return null
  const n = Number(raw)
  return Number.isSafeInteger(n) && n > 0 ? n : null
}

function configuredHostSet(hosts: readonly string[] | undefined): Set<string> {
  const result = new Set<string>()
  for (const value of hosts ?? []) {
    try {
      const parsed = value.includes("://") ? new URL(value) : new URL(`https://${value}`)
      if (!parsed.username && !parsed.password && parsed.pathname === "/") result.add(parsed.host.toLowerCase())
    } catch {
      // Invalid configuration never widens the host allowlist.
    }
  }
  return result
}

function safePathSegments(pathname: string): string[] | null {
  try {
    const segments = pathname.split("/").filter(Boolean).map((segment) => decodeURIComponent(segment))
    if (segments.some((segment) => !segment || segment === "." || segment === ".." || segment.includes("/"))) return null
    return segments
  } catch {
    return null
  }
}

/** Strict GitHub/GitLab URL parser for the service-backed reviewed-create flow. */
export function parseReviewedForgeSourceUrl(
  raw: string,
  configuredHosts: ReviewedForgeHostConfig = {},
): ReviewedForgeUrl | ReviewedForgeUrlFailure {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return { ok: false, error: "malformed_url" }
  }
  if ((url.protocol !== "https:" && url.protocol !== "http:") || url.username || url.password) {
    return { ok: false, error: "malformed_url" }
  }
  const parts = safePathSegments(url.pathname)
  if (!parts) return { ok: false, error: "malformed_url" }

  const host = url.host.toLowerCase()
  const githubHosts = configuredHostSet(configuredHosts.github)
  githubHosts.add("github.com")
  const gitlabHosts = configuredHostSet(configuredHosts.gitlab)
  gitlabHosts.add("gitlab.com")

  if (githubHosts.has(host)) {
    if (parts.length !== 4 || parts[2] !== "pull") return { ok: false, error: "malformed_url" }
    const changeNumber = parsePositiveInt(parts[3])
    if (!changeNumber) return { ok: false, error: "malformed_url" }
    const path = `${parts[0]}/${parts[1]}`
    return {
      ok: true,
      provider: "github",
      change_kind: "pull_request",
      change_number: changeNumber,
      host,
      base_url: `${url.protocol}//${url.host}`,
      target_repository_path: path,
      canonical_url: `${url.protocol}//${url.host}/${path}/pull/${changeNumber}`,
    }
  }

  if (gitlabHosts.has(host)) {
    const marker = parts.lastIndexOf("-")
    if (marker < 1 || marker + 3 !== parts.length || parts[marker + 1] !== "merge_requests") {
      return { ok: false, error: "malformed_url" }
    }
    const changeNumber = parsePositiveInt(parts[marker + 2])
    if (!changeNumber) return { ok: false, error: "malformed_url" }
    const path = parts.slice(0, marker).join("/")
    return {
      ok: true,
      provider: "gitlab",
      change_kind: "merge_request",
      change_number: changeNumber,
      host,
      base_url: `${url.protocol}//${url.host}`,
      target_repository_path: path,
      canonical_url: `${url.protocol}//${url.host}/${path}/-/merge_requests/${changeNumber}`,
    }
  }

  return { ok: false, error: "unsupported_host" }
}

export function parseForgeSourceUrl(raw: string): ForgeSourceParseResult {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return { ok: false, error: "url_parse_failed" }
  }

  const baseUrl = `${url.protocol}//${url.host}`
  const parts = url.pathname.split("/").filter(Boolean)
  const host = url.hostname.toLowerCase()

  if (parts.length === 0) {
    return { ok: false, error: "url_parse_failed" }
  }

  const gitlabMarker = parts.indexOf("-")
  if (gitlabMarker >= 0 && parts[gitlabMarker + 1] === "merge_requests") {
    const repoParts = parts.slice(0, gitlabMarker)
    const numberPart = parts[gitlabMarker + 2]
    const changeNumber = numberPart ? parsePositiveInt(numberPart) : null
    if (repoParts.length === 0 || !changeNumber) {
      return { ok: false, error: "url_parse_failed" }
    }
    return {
      ok: true,
      forge: "gitlab",
      changeType: "mr",
      changeNumber,
      baseUrl,
      repoPath: repoParts.join("/"),
      webUrl: raw,
    }
  }

  if (parts.length >= 4 && parts[2] === "pull") {
    const changeNumber = parsePositiveInt(parts[3])
    if (!changeNumber) {
      return { ok: false, error: "url_parse_failed" }
    }
    return {
      ok: true,
      forge: host === "github.com" ? "github" : "gitea",
      changeType: "pr",
      changeNumber,
      baseUrl,
      repoPath: `${parts[0]}/${parts[1]}`,
      webUrl: raw,
    }
  }

  if (parts.length >= 4 && parts[2] === "pulls") {
    const changeNumber = parsePositiveInt(parts[3])
    if (!changeNumber) {
      return { ok: false, error: "url_parse_failed" }
    }
    return {
      ok: true,
      forge: host === "github.com" ? "github" : "gitea",
      changeType: "pr",
      changeNumber,
      baseUrl,
      repoPath: `${parts[0]}/${parts[1]}`,
      webUrl: raw,
    }
  }

  if (host.includes("github")) {
    return { ok: false, error: "url_parse_failed" }
  }

  if (host.includes("gitlab") || host.includes("gitea") || host.includes("git")) {
    return { ok: false, error: "url_parse_failed" }
  }

  return { ok: false, error: "unsupported_forge" }
}
