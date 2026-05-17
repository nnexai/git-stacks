import { Command } from "commander"
import { formatError } from "../lib/errors"
import { readWorkspace, workspaceExists, type Workspace } from "../lib/config"
import { detectWorkspaceFromCwd } from "../lib/workspace-status"
import { listManualCommands, planManualCommand, runManualCommand } from "../lib/workspace-command"

function resolveWorkspace(workspaceName: string | undefined): Workspace {
  if (workspaceName) {
    if (!workspaceExists(workspaceName)) {
      console.error(formatError(`Workspace '${workspaceName}' not found`, "run: git-stacks list"))
      process.exit(1)
    }
    return readWorkspace(workspaceName)
  }
  const detected = detectWorkspaceFromCwd()
  if (detected.ok) return detected.workspace
  console.error(formatError("Missing workspace name", "usage: git-stacks command <verb> <workspace>"))
  process.exit(1)
}

function scopeLabel(step: ReturnType<typeof planManualCommand>[number]): string {
  return step.scope === "workspace" ? "workspace" : `repo:${step.repoName ?? "unknown"}`
}

export const commandCommand = new Command("command")
  .description("List and run manual workspace commands")

commandCommand
  .command("list [workspace]")
  .description("List available manual commands")
  .option("--all", "Include pre* and post* command names")
  .action((workspaceName: string | undefined, opts: { all?: boolean }) => {
    const workspace = resolveWorkspace(workspaceName)
    const names = listManualCommands(workspace, { all: opts.all === true })
    for (const n of names) console.log(n)
  })

commandCommand
  .command("run [workspaceOrCommand] [commandMaybe]")
  .description("Run a manual command with pre/post resolution")
  .option("--dry-run", "Print the resolved execution plan without running shell commands")
  .option("--skip-secrets", "Do not resolve secret refs in workspace env")
  .action(async (workspaceOrCommand: string | undefined, commandMaybe: string | undefined, opts: { dryRun?: boolean; skipSecrets?: boolean }) => {
    const workspaceName = commandMaybe ? workspaceOrCommand : undefined
    const commandName = commandMaybe ?? workspaceOrCommand
    if (!commandName) {
      console.error(formatError("Missing command name", "usage: git-stacks command run [workspace] <command>"))
      process.exit(1)
    }
    const workspace = resolveWorkspace(workspaceName)
    const plan = planManualCommand(workspace, commandName)

    if (opts.dryRun) {
      if (plan.length === 0) {
        console.log(`No commands resolved for '${commandName}'.`)
        return
      }
      for (const step of plan) {
        console.log(`${step.bucket}  ${scopeLabel(step)}  ${step.cwd}  ${step.shell}`)
      }
      return
    }

    const result = await runManualCommand(workspace, commandName, { skipSecrets: opts.skipSecrets })
    if (result.exitCode !== 0) process.exit(result.exitCode)
  })
