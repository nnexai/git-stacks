import { z } from "zod"

import { spawn } from "../node-runtime"
import { NameSchema, type GlobalConfig, type RepoRegistryEntry, type Template } from "../config"
import {
  parseReviewedForgeSourceUrl,
  type ReviewedForgeHostConfig,
  type ReviewedForgeProvider,
  type ReviewedForgeUrl,
} from "./forge-source"

const DEFAULT_TIMEOUT_MS = 15_000
const DEFAULT_MAX_OUTPUT_BYTES = 256 * 1024
const fullSha = z.string().regex(/^[0-9a-f]{40,64}$/i).transform((value) => value.toLowerCase())

export type ForgeCommandRequest = {
  argv: readonly string[]
  cwd?: string
  env?: Readonly<Record<string, string>>
  signal?: AbortSignal
  timeout_ms: number
  max_output_bytes: number
}

export type ForgeCommandResult = { exit_code: number; stdout: string; stderr: string }
export type ForgeCommandRunner = (request: ForgeCommandRequest) => Promise<ForgeCommandResult>

type CodedError = Error & { code: string }

function codedError(code: string): CodedError {
  return Object.assign(new Error(code), { code })
}

async function readBounded(
  stream: ReadableStream<Uint8Array> | null,
  maxBytes: number,
  onLimit: () => void,
): Promise<string> {
  if (!stream) return ""
  const reader = stream.getReader()
  const chunks: Uint8Array[] = []
  let bytes = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      bytes += value.byteLength
      if (bytes > maxBytes) {
        onLimit()
        throw codedError("FORGE_OUTPUT_LIMIT")
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }
  const output = new Uint8Array(bytes)
  let offset = 0
  for (const chunk of chunks) { output.set(chunk, offset); offset += chunk.byteLength }
  return new TextDecoder().decode(output)
}

/** Production argv-only runner. Provider credentials remain in gh/glab auth stores. */
export const runForgeCommand: ForgeCommandRunner = async (request) => {
  if (request.signal?.aborted) throw codedError("ABORT_ERR")
  const proc = spawn(request.argv, {
    cwd: request.cwd,
    env: { ...process.env, ...request.env },
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
    isolatedProcessGroup: true,
  })
  const stop = () => { proc.killGroup("SIGKILL") }
  const abort = () => stop()
  request.signal?.addEventListener("abort", abort, { once: true })
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const timedOut = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => { stop(); reject(codedError("FORGE_TIMEOUT")) }, request.timeout_ms)
      timer.unref()
    })
    const stdout = readBounded(proc.stdout, request.max_output_bytes, stop)
    const stderr = readBounded(proc.stderr, request.max_output_bytes, stop)
    const [exitCode, out, err] = await Promise.race([
      Promise.all([proc.exited, stdout, stderr]),
      timedOut,
    ])
    if (request.signal?.aborted) throw codedError("ABORT_ERR")
    return { exit_code: exitCode, stdout: out, stderr: err }
  } finally {
    if (timer) clearTimeout(timer)
    request.signal?.removeEventListener("abort", abort)
  }
}

export type ForgeFetchCoordinates = { https?: string; ssh?: string }
export type ForgeRepositoryIdentity = {
  host: string
  path: string
  web_url: string
  fetch?: ForgeFetchCoordinates
}

export type TrustedForgeChange = {
  provider: ReviewedForgeProvider
  change_kind: "pull_request" | "merge_request"
  change_number: number
  canonical_url: string
  host: string
  source: {
    repository: ForgeRepositoryIdentity
    fetch: ForgeFetchCoordinates
    branch: string
    ref: string
    sha: string
  }
  target: { repository: ForgeRepositoryIdentity; branch: string; sha: string }
  cross_repository: boolean
}

export type ForgeResolverFailureCode =
  | "malformed_url"
  | "unsupported_host"
  | "cli_unavailable"
  | "auth_required"
  | "change_not_found"
  | "change_closed"
  | "rate_limited"
  | "provider_unavailable"
  | "provider_response_invalid"
  | "request_timeout"
  | "cancelled"

export type ForgeResolverFailure = {
  ok: false
  error: ForgeResolverFailureCode
  provider?: ReviewedForgeProvider
  retryable?: boolean
}

export type ForgeProviderResolution = { ok: true; change: TrustedForgeChange } | ForgeResolverFailure

export type ForgeSourceMatchConfidence = "explicit-metadata" | "integration-base-url" | "remote-inference"
export type ForgeSourceCandidate = {
  registry_name: string
  template_name: string
  template_repository_name: string
  mode: "worktree"
  confidence: ForgeSourceMatchConfidence
}
export type ForgeSourceMatchResult =
  | { ok: true; match: ForgeSourceCandidate; candidates: ForgeSourceCandidate[]; suggested_name: string }
  | { ok: false; error: "repo_not_matched" | "ambiguous_repo" | "template_repo_missing" | "not_worktree_mode" }

export type ForgeSourceMatchInput = {
  registry: readonly RepoRegistryEntry[]
  templates: readonly Template[]
  config?: GlobalConfig
  remote_urls?: Readonly<Record<string, readonly string[]>>
  template_name?: string
  repository_name?: string
  existing_workspace_names?: readonly string[]
}

export type ResolveForgeChangeInput = {
  url: string
  configured_hosts?: ReviewedForgeHostConfig
  runner?: ForgeCommandRunner
  signal?: AbortSignal
  timeout_ms?: number
  max_output_bytes?: number
}

function canonicalHost(value: string | undefined): string | undefined {
  if (!value) return undefined
  try { return new URL(value).host.toLowerCase() } catch { return undefined }
}

function configuredIntegration(input: ForgeSourceMatchInput, provider: ReviewedForgeProvider): { enabled: boolean; host?: string } {
  const raw = input.config?.integrations?.[provider]
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { enabled: true }
  const value = raw as { enabled?: unknown; base_url?: unknown }
  return {
    enabled: value.enabled !== false,
    ...(typeof value.base_url === "string" ? { host: canonicalHost(value.base_url) } : {}),
  }
}

function canonicalRemote(remote: string): { host: string; path: string } | null {
  const scp = /^(?:[^@\s]+@)?([^:/\s]+):(.+)$/.exec(remote)
  if (scp && !remote.includes("://")) {
    return { host: scp[1].toLowerCase(), path: scp[2].replace(/^\/+|\/+$/g, "").replace(/\.git$/i, "") }
  }
  try {
    const url = new URL(remote)
    return { host: url.host.toLowerCase(), path: url.pathname.replace(/^\/+|\/+$/g, "").replace(/\.git$/i, "") }
  } catch {
    return null
  }
}

function registryConfidence(
  change: TrustedForgeChange,
  entry: RepoRegistryEntry,
  input: ForgeSourceMatchInput,
): ForgeSourceMatchConfidence | null {
  const metadata = entry.forge_metadata
  const targetPath = change.target.repository.path.toLowerCase()
  if (metadata?.forge === change.provider && metadata.repo_path?.toLowerCase() === targetPath) {
    const metadataHost = canonicalHost(metadata.base_url)
    if (metadataHost === change.host) return "explicit-metadata"
    const integration = configuredIntegration(input, change.provider)
    if (!metadata.base_url && integration.enabled && integration.host === change.host) return "integration-base-url"
    if (!metadata.base_url && change.host === `${change.provider}.com`) return "integration-base-url"
  }

  const integration = configuredIntegration(input, change.provider)
  if (!integration.enabled || (integration.host && integration.host !== change.host)) return null
  const remotes = input.remote_urls?.[entry.name] ?? []
  const matches = remotes
    .slice(0, 8)
    .map(canonicalRemote)
    .filter((remote): remote is { host: string; path: string } => remote !== null)
    .some((remote) => remote.host === change.host && remote.path.toLowerCase() === targetPath)
  return matches ? "remote-inference" : null
}

export function suggestForgeWorkspaceName(
  change: TrustedForgeChange,
  existingNames: readonly string[] = [],
): string {
  const repository = change.target.repository.path.split("/").at(-1) ?? "review"
  const kind = change.provider === "gitlab" ? "mr" : "pr"
  const branch = change.source.branch.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^[.-]+|[.-]+$/g, "")
  let base = `${repository}-${kind}-${change.change_number}${branch ? `-${branch}` : ""}`
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[.-]+|[.-]+$/g, "")
  if (!NameSchema.safeParse(base).success) base = `review-${kind}-${change.change_number}`
  const occupied = new Set(existingNames)
  if (!occupied.has(base)) return base
  let suffix = 2
  while (occupied.has(`${base}-${suffix}`)) suffix += 1
  return `${base}-${suffix}`
}

export function matchForgeSourceRepository(
  change: TrustedForgeChange,
  input: ForgeSourceMatchInput,
): ForgeSourceMatchResult {
  const ranked = input.registry
    .filter((entry) => !input.repository_name || entry.name === input.repository_name)
    .map((entry) => ({ entry, confidence: registryConfidence(change, entry, input) }))
    .filter((candidate): candidate is { entry: RepoRegistryEntry; confidence: ForgeSourceMatchConfidence } => candidate.confidence !== null)
  if (ranked.length === 0) return { ok: false, error: "repo_not_matched" }

  const rank: Record<ForgeSourceMatchConfidence, number> = {
    "explicit-metadata": 3,
    "integration-base-url": 2,
    "remote-inference": 1,
  }
  const strongest = Math.max(...ranked.map((candidate) => rank[candidate.confidence]))
  const repositoryMatches = ranked.filter((candidate) => rank[candidate.confidence] === strongest)
  if (repositoryMatches.length !== 1) return { ok: false, error: "ambiguous_repo" }
  const repositoryMatch = repositoryMatches[0]

  const templates = input.template_name
    ? input.templates.filter((template) => template.name === input.template_name)
    : [...input.templates]
  const matchingTemplateRepos = templates.flatMap((template) => template.repos
    .filter((repo) => repo.repo === repositoryMatch.entry.name)
    .map((repo) => ({ template, repo })))
  if (matchingTemplateRepos.length === 0) return { ok: false, error: "template_repo_missing" }
  if (matchingTemplateRepos.some(({ repo }) => repositoryMatch.entry.is_dir || (repo.mode ?? "worktree") !== "worktree")) {
    return { ok: false, error: "not_worktree_mode" }
  }

  const candidates = matchingTemplateRepos.map(({ template, repo }) => ({
    registry_name: repositoryMatch.entry.name,
    template_name: template.name,
    template_repository_name: repo.repo,
    mode: "worktree" as const,
    confidence: repositoryMatch.confidence,
  }))
  return {
    ok: true,
    match: candidates[0],
    candidates,
    suggested_name: suggestForgeWorkspaceName(change, input.existing_workspace_names),
  }
}

const githubRepository = z.object({
  nameWithOwner: z.string().min(3),
  url: z.string().url(),
  sshUrl: z.string().min(1),
})
const githubPayload = z.object({
  data: z.object({
    repository: z.object({
      pullRequest: z.object({
        number: z.number().int().positive(),
        url: z.string().url(),
        state: z.string(),
        isDraft: z.boolean(),
        baseRefName: z.string().min(1),
        baseRefOid: fullSha,
        headRefName: z.string().min(1),
        headRefOid: fullSha,
        isCrossRepository: z.boolean(),
        baseRepository: githubRepository,
        headRepository: githubRepository.nullable(),
      }).nullable(),
    }),
  }),
})

const gitlabMrPayload = z.object({
  iid: z.number().int().positive(),
  state: z.string(),
  web_url: z.string().url(),
  sha: fullSha,
  source_branch: z.string().min(1),
  source_project_id: z.number().int().positive().nullable(),
  target_branch: z.string().min(1),
  target_project_id: z.number().int().positive(),
  diff_refs: z.object({ head_sha: fullSha, base_sha: fullSha }).nullable().optional(),
})
const gitlabProjectPayload = z.object({
  id: z.number().int().positive(),
  path_with_namespace: z.string().min(1),
  ssh_url_to_repo: z.string().min(1),
  http_url_to_repo: z.string().url(),
  web_url: z.string().url(),
})

const GITHUB_QUERY = "query($owner:String!,$name:String!,$number:Int!){repository(owner:$owner,name:$name){pullRequest(number:$number){number url state isDraft baseRefName baseRefOid headRefName headRefOid isCrossRepository baseRepository{nameWithOwner url sshUrl} headRepository{nameWithOwner url sshUrl}}}}"

function failure(error: ForgeResolverFailureCode, provider?: ReviewedForgeProvider): ForgeResolverFailure {
  const retryable = !["malformed_url", "unsupported_host", "cli_unavailable", "change_closed"].includes(error)
  return { ok: false, error, ...(provider ? { provider } : {}), retryable }
}

function classifyThrown(error: unknown, provider: ReviewedForgeProvider): ForgeResolverFailure {
  const code = error && typeof error === "object" && "code" in error ? String(error.code) : ""
  if (code === "ENOENT") return failure("cli_unavailable", provider)
  if (code === "FORGE_TIMEOUT") return failure("request_timeout", provider)
  if (code === "ABORT_ERR") return failure("cancelled", provider)
  return failure("provider_response_invalid", provider)
}

function classifyExit(result: ForgeCommandResult, provider: ReviewedForgeProvider): ForgeResolverFailure {
  const text = result.stderr.toLowerCase()
  if (/auth|login|unauthori[sz]ed|forbidden|\b401\b|\b403\b/.test(text)) return failure("auth_required", provider)
  if (/not found|\b404\b/.test(text)) return failure("change_not_found", provider)
  if (/rate.?limit|\b429\b/.test(text)) return failure("rate_limited", provider)
  if (/\b5\d\d\b|unavailable|timed? out/.test(text)) return failure("provider_unavailable", provider)
  return failure("provider_response_invalid", provider)
}

async function invoke(
  parsed: ReviewedForgeUrl,
  runner: ForgeCommandRunner,
  argv: readonly string[],
  input: ResolveForgeChangeInput,
): Promise<ForgeCommandResult | ForgeResolverFailure> {
  try {
    const result = await runner({
      argv,
      env: { GH_PROMPT_DISABLED: "1", GLAB_PROMPT_DISABLED: "1", NO_COLOR: "1" },
      signal: input.signal,
      timeout_ms: input.timeout_ms ?? DEFAULT_TIMEOUT_MS,
      max_output_bytes: input.max_output_bytes ?? DEFAULT_MAX_OUTPUT_BYTES,
    })
    return result.exit_code === 0 ? result : classifyExit(result, parsed.provider)
  } catch (error) {
    return classifyThrown(error, parsed.provider)
  }
}

function parseJson(raw: string): unknown | undefined {
  try { return JSON.parse(raw) } catch { return undefined }
}

function githubFetch(repository: z.infer<typeof githubRepository>): ForgeFetchCoordinates {
  return { https: `${repository.url.replace(/\/$/, "")}.git`, ssh: repository.sshUrl }
}

async function resolveGitHub(
  parsed: ReviewedForgeUrl,
  runner: ForgeCommandRunner,
  input: ResolveForgeChangeInput,
): Promise<ForgeProviderResolution> {
  const [owner, name] = parsed.target_repository_path.split("/")
  const result = await invoke(parsed, runner, [
    "gh", "api", "graphql", "--hostname", parsed.host,
    "-f", `query=${GITHUB_QUERY}`,
    "-f", `owner=${owner}`,
    "-f", `name=${name}`,
    "-F", `number=${parsed.change_number}`,
  ], input)
  if (!("exit_code" in result)) return result
  const decoded = githubPayload.safeParse(parseJson(result.stdout))
  if (!decoded.success) return failure("provider_response_invalid", "github")
  const pull = decoded.data.data.repository.pullRequest
  if (!pull) return failure("change_not_found", "github")
  if (pull.state !== "OPEN") return failure("change_closed", "github")
  if (!pull.headRepository || pull.number !== parsed.change_number) return failure("provider_response_invalid", "github")
  return {
    ok: true,
    change: {
      provider: "github",
      change_kind: "pull_request",
      change_number: pull.number,
      canonical_url: parsed.canonical_url,
      host: parsed.host,
      source: {
        repository: {
          host: parsed.host,
          path: pull.headRepository.nameWithOwner,
          web_url: pull.headRepository.url,
        },
        fetch: githubFetch(pull.headRepository),
        branch: pull.headRefName,
        ref: `refs/heads/${pull.headRefName}`,
        sha: pull.headRefOid,
      },
      target: {
        repository: {
          host: parsed.host,
          path: pull.baseRepository.nameWithOwner,
          web_url: pull.baseRepository.url,
          fetch: githubFetch(pull.baseRepository),
        },
        branch: pull.baseRefName,
        sha: pull.baseRefOid,
      },
      cross_repository: pull.isCrossRepository,
    },
  }
}

async function resolveGitLab(
  parsed: ReviewedForgeUrl,
  runner: ForgeCommandRunner,
  input: ResolveForgeChangeInput,
): Promise<ForgeProviderResolution> {
  const targetPath = encodeURIComponent(parsed.target_repository_path)
  const mrResult = await invoke(parsed, runner, [
    "glab", "api", "--hostname", parsed.host,
    `projects/${targetPath}/merge_requests/${parsed.change_number}`,
  ], input)
  if (!("exit_code" in mrResult)) return mrResult
  const mrDecoded = gitlabMrPayload.safeParse(parseJson(mrResult.stdout))
  if (!mrDecoded.success) return failure("provider_response_invalid", "gitlab")
  const mr = mrDecoded.data
  if (mr.state !== "opened") return failure("change_closed", "gitlab")
  if (!mr.source_project_id || mr.iid !== parsed.change_number || !mr.diff_refs) {
    return failure("provider_response_invalid", "gitlab")
  }
  if (mr.diff_refs.head_sha !== mr.sha) return failure("provider_response_invalid", "gitlab")

  const projectResult = await invoke(parsed, runner, [
    "glab", "api", "--hostname", parsed.host, `projects/${mr.source_project_id}`,
  ], input)
  if (!("exit_code" in projectResult)) return projectResult
  const projectDecoded = gitlabProjectPayload.safeParse(parseJson(projectResult.stdout))
  if (!projectDecoded.success || projectDecoded.data.id !== mr.source_project_id) {
    return failure("provider_response_invalid", "gitlab")
  }
  const sourceProject = projectDecoded.data
  return {
    ok: true,
    change: {
      provider: "gitlab",
      change_kind: "merge_request",
      change_number: mr.iid,
      canonical_url: parsed.canonical_url,
      host: parsed.host,
      source: {
        repository: {
          host: parsed.host,
          path: sourceProject.path_with_namespace,
          web_url: sourceProject.web_url,
        },
        fetch: { https: sourceProject.http_url_to_repo, ssh: sourceProject.ssh_url_to_repo },
        branch: mr.source_branch,
        ref: `refs/heads/${mr.source_branch}`,
        sha: mr.sha,
      },
      target: {
        repository: { host: parsed.host, path: parsed.target_repository_path, web_url: parsed.base_url + "/" + parsed.target_repository_path },
        branch: mr.target_branch,
        sha: mr.diff_refs.base_sha,
      },
      cross_repository: mr.source_project_id !== mr.target_project_id,
    },
  }
}

export async function resolveForgeChangeSource(input: ResolveForgeChangeInput): Promise<ForgeProviderResolution> {
  const parsed = parseReviewedForgeSourceUrl(input.url, input.configured_hosts)
  if (!parsed.ok) return failure(parsed.error)
  const runner = input.runner ?? runForgeCommand
  return parsed.provider === "github"
    ? resolveGitHub(parsed, runner, input)
    : resolveGitLab(parsed, runner, input)
}
