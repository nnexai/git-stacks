// Canonical implementation owned by @git-stacks/core.
import { existsSync, lstatSync, readFileSync, writeFileSync } from "fs"
import { join, resolve } from "path"
import { getRepoPath, isWorktreeRepo, readGlobalConfig, type GlobalConfig, type Workspace, type WorkspaceRepo } from "./config"
import { logDebug, timeOperation } from "./observability"
import { getTasksDir } from "./paths"
import { buildResolvers, parseSecretRef, resolveSecrets } from "./secrets"

const OBS_CATEGORY = "workspace-env"

export type BuildWorkspaceEnvOptions = {
  triggeredBy: string
  config?: GlobalConfig
  skipSecrets?: boolean
  onWarn?: (message: string) => void
}

type EnvironmentLayer = Record<string, string | number | null | undefined>

export type WorkspaceEnvironmentLayers = {
  inherited?: EnvironmentLayer
  initialized?: EnvironmentLayer
  global?: EnvironmentLayer
  workspace?: EnvironmentLayer
  repository?: EnvironmentLayer
  ports?: EnvironmentLayer
  secrets?: EnvironmentLayer
  reserved?: EnvironmentLayer
}

function applyEnvironmentLayer(
  target: Record<string, string>,
  layer: EnvironmentLayer | undefined,
  allowReserved: boolean,
): void {
  for (const [key, value] of Object.entries(layer ?? {})) {
    if (value === undefined || value === null || (!allowReserved && key.startsWith("GS_"))) continue
    target[key] = String(value)
  }
}

export function composeWorkspaceEnvironment(layers: WorkspaceEnvironmentLayers): Record<string, string> {
  const environment: Record<string, string> = {}
  applyEnvironmentLayer(environment, layers.inherited, false)
  applyEnvironmentLayer(environment, layers.initialized, false)
  applyEnvironmentLayer(environment, layers.global, false)
  applyEnvironmentLayer(environment, layers.workspace, false)
  applyEnvironmentLayer(environment, layers.repository, false)
  applyEnvironmentLayer(environment, layers.ports, false)
  applyEnvironmentLayer(environment, layers.secrets, false)
  applyEnvironmentLayer(environment, layers.reserved, true)
  return environment
}

export function mergeEnv(workspace: Workspace): Record<string, string> {
  const merged: Record<string, string> = {}
  if (workspace.env) Object.assign(merged, workspace.env)
  // Inject resolved ports as env vars (PORT-INJECT-01)
  if (workspace.ports) {
    for (const [key, value] of Object.entries(workspace.ports)) {
      if (typeof value === "number") {
        merged[key] = String(value)
      }
    }
  }
  return merged
}

export function buildBaseEnv(
  workspace: Workspace,
  tasksDir: string,
  triggeredBy: string
): Record<string, string> {
  return composeWorkspaceEnvironment({
    workspace: workspace.env,
    ports: workspace.ports,
    reserved: {
      GS_WORKSPACE_NAME: workspace.name,
      GS_WORKSPACE_BRANCH: workspace.branch,
      GS_WORKSPACE_PATH: tasksDir,
      GS_TRIGGERED_BY: triggeredBy,
    },
  })
}

export function buildRepoEnv(
  baseEnv: Record<string, string>,
  repo: WorkspaceRepo
): Record<string, string> {
  const inheritedReserved = Object.fromEntries(
    Object.entries(baseEnv).filter(([key]) => key.startsWith("GS_")),
  )
  return composeWorkspaceEnvironment({
    workspace: baseEnv,
    reserved: {
      ...inheritedReserved,
      GS_REPO_NAME: repo.name,
      GS_REPO_PATH: getRepoPath(repo),
      GS_REPO_CLONE_PATH: repo.main_path,
    },
  })
}

async function resolveWorkspaceEnvVars(
  workspace: Workspace,
  config: GlobalConfig,
  opts: { skipSecrets?: boolean; onWarn?: (message: string) => void }
): Promise<Record<string, string>> {
  const mergedEnvVars = mergeEnv(workspace)

  if (opts.skipSecrets) {
    const resolvedEnvVars: Record<string, string> = {}
    for (const [key, value] of Object.entries(mergedEnvVars)) {
      const ref = parseSecretRef(value)
      if (ref) {
        opts.onWarn?.(`Skipping secret: ${key} (${ref.id}:${ref.path})`)
        resolvedEnvVars[key] = ""
      } else {
        resolvedEnvVars[key] = value
      }
    }
    return resolvedEnvVars
  }

  return await resolveSecrets(mergedEnvVars, buildResolvers(config))
}

export async function buildWorkspaceEnv(
  workspace: Workspace,
  opts: BuildWorkspaceEnvOptions
): Promise<Record<string, string>> {
  return timeOperation(OBS_CATEGORY, "buildWorkspaceEnv", async () => {
    const config = opts.config ?? readGlobalConfig()
    const tasksDir = join(getTasksDir(config.workspace_root), workspace.name)
    logDebug(OBS_CATEGORY, "buildWorkspaceEnv.resolveSecrets: start")
    const resolvedEnvVars = await timeOperation(
      OBS_CATEGORY,
      "buildWorkspaceEnv.resolveSecrets",
      () => resolveWorkspaceEnvVars(workspace, config, opts)
    )
    return composeWorkspaceEnvironment({
      workspace: resolvedEnvVars,
      reserved: {
        GS_WORKSPACE_NAME: workspace.name,
        GS_WORKSPACE_BRANCH: workspace.branch,
        GS_WORKSPACE_PATH: tasksDir,
        GS_TRIGGERED_BY: opts.triggeredBy,
      },
    })
  })
}

export function writeEnvFiles(
  workspace: Workspace,
  mergedEnv: Record<string, string>,
  onWarn?: (msg: string) => void
): void {
  return timeOperation(OBS_CATEGORY, "writeEnvFiles", () => {
    const envFileName = workspace.env_file
    if (!envFileName) return

    for (const repo of workspace.repos.filter(isWorktreeRepo)) {
      if (!existsSync(repo.task_path)) continue

      // Per D-08/D-09: reject env_file paths that escape repo root
      const resolvedTarget = resolve(repo.task_path, envFileName)
      const resolvedRoot = resolve(repo.task_path)
      if (!resolvedTarget.startsWith(resolvedRoot + "/") && resolvedTarget !== resolvedRoot) {
        onWarn?.(`skipping env file write: '${envFileName}' resolves outside repo root '${repo.task_path}'`)
        continue
      }

      const targetPath = resolvedTarget

      // Guard: if the env file is a symlink, skip and warn — never write through a symlink
      try {
        const stat = lstatSync(targetPath)
        if (stat.isSymbolicLink()) {
          onWarn?.(`skipping env file write: ${targetPath} is a symlink`)
          continue
        }
      } catch {
        // targetPath does not exist yet — fall through to create it
      }

      let content: string
      if (existsSync(targetPath)) {
        // Merge: walk existing lines, update matching config keys in-place, preserve rest
        const existing = readFileSync(targetPath, "utf-8")
        const written = new Set<string>()
        const lines = existing.replace(/\n$/, "").split("\n").map((line) => {
          const m = line.match(/^([^=\s#][^=]*)=(.*)$/)
          if (m && m[1] in mergedEnv) {
            written.add(m[1])
            return `${m[1]}=${mergedEnv[m[1]]}`
          }
          return line
        })
        // Append config keys not already in the file
        for (const [k, v] of Object.entries(mergedEnv)) {
          if (!written.has(k)) lines.push(`${k}=${v}`)
        }
        content = lines.join("\n") + "\n"
      } else {
        content = Object.entries(mergedEnv).map(([k, v]) => `${k}=${v}`).join("\n") + "\n"
      }

      writeFileSync(targetPath, content, "utf-8")
    }
  })
}
