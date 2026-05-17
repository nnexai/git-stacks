import { join } from "path"
import { getRepoPath, type GlobalConfig, type Workspace, type WorkspaceRepo } from "./config"
import { runShellSequence } from "./lifecycle"
import { getTasksDir } from "./paths"
import { buildRepoEnv, buildWorkspaceEnv } from "./workspace-env"

export type ManualCommandBucket = "pre" | "main" | "post"
export type ManualCommandScope = "workspace" | "repo"

export type ManualCommandStep = {
  bucket: ManualCommandBucket
  scope: ManualCommandScope
  commandName: string
  shell: string
  cwd: string
  repoName?: string
  repo?: WorkspaceRepo
}

export type RunManualCommandOptions = {
  config?: GlobalConfig
  skipSecrets?: boolean
}

export type RunManualCommandResult = {
  exitCode: number
  failedCommand?: string
  plan: ManualCommandStep[]
}

function isHiddenCommand(name: string): boolean {
  return name.startsWith("pre") || name.startsWith("post")
}

function workspaceCwd(workspace: Workspace, config?: GlobalConfig): string {
  if (!config) return process.cwd()
  return join(getTasksDir(config.workspace_root), workspace.name)
}

function resolveNames(targetName: string): Array<{ bucket: ManualCommandBucket; name: string }> {
  if (targetName.startsWith("pre") || targetName.startsWith("post")) {
    return [{ bucket: targetName.startsWith("pre") ? "pre" : "post", name: targetName }]
  }
  return [
    { bucket: "pre", name: `pre${targetName}` },
    { bucket: "main", name: targetName },
    { bucket: "post", name: `post${targetName}` },
  ]
}

export function listManualCommands(workspace: Workspace, opts?: { all?: boolean }): string[] {
  const names = new Set<string>()
  for (const n of Object.keys(workspace.commands ?? {})) names.add(n)
  for (const repo of workspace.repos) {
    for (const n of Object.keys(repo.commands ?? {})) names.add(n)
  }
  const sorted = [...names].sort()
  return opts?.all ? sorted : sorted.filter((n) => !isHiddenCommand(n))
}

export function planManualCommand(workspace: Workspace, targetName: string, config?: GlobalConfig): ManualCommandStep[] {
  const plan: ManualCommandStep[] = []
  const targets = resolveNames(targetName)
  const wsCwd = workspaceCwd(workspace, config)

  for (const target of targets) {
    const wsShell = workspace.commands?.[target.name]
    if (wsShell) {
      plan.push({
        bucket: target.bucket,
        scope: "workspace",
        commandName: target.name,
        shell: wsShell,
        cwd: wsCwd,
      })
    }
    for (const repo of workspace.repos) {
      const repoShell = repo.commands?.[target.name]
      if (!repoShell) continue
      plan.push({
        bucket: target.bucket,
        scope: "repo",
        commandName: target.name,
        shell: repoShell,
        cwd: getRepoPath(repo),
        repoName: repo.name,
        repo,
      })
    }
  }

  return plan
}

export async function runManualCommand(
  workspace: Workspace,
  targetName: string,
  opts?: RunManualCommandOptions
): Promise<RunManualCommandResult> {
  const plan = planManualCommand(workspace, targetName, opts?.config)
  const baseEnv = await buildWorkspaceEnv(workspace, {
    triggeredBy: `command:${targetName}`,
    config: opts?.config,
    skipSecrets: opts?.skipSecrets,
  })

  for (const step of plan) {
    const env = step.scope === "repo" && step.repo ? buildRepoEnv(baseEnv, step.repo) : baseEnv
    const result = await runShellSequence([step.shell], step.cwd, env)
    if (result.exitCode !== 0) {
      return {
        exitCode: result.exitCode,
        failedCommand: result.failedCommand ?? step.shell,
        plan,
      }
    }
  }
  return { exitCode: 0, plan }
}

