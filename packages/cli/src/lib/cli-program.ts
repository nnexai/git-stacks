import { Command } from "commander"

import { registerWorkspaceCommands } from "../commands/workspace"
import { configCommand } from "../commands/config"
import { createCompletionCommand } from "../commands/completion"
import { doctorCommand } from "../commands/doctor"
import { repoCommand } from "../commands/repo"
import { templateCommand } from "../commands/template"
import { notesCommand } from "../commands/notes"
import { integrationCommand } from "../commands/integration"
import { labelCommand } from "../commands/label"
import { filesCommand } from "../commands/files"
import { commandCommand } from "../commands/command"
import { prepareManagedDashboardEnvironment, serviceCommand } from "../commands/service"
import { webCommand } from "../commands/web"
import { hooksCommand } from "../commands/hooks"
import { silenceObservability } from "@git-stacks/core/observability"
import { spawn, which } from "@git-stacks/core/node-runtime"

export function buildCliProgram(binName = "git-stacks"): Command {
  const program = new Command()
  program.name(binName).description("Git worktree workspace manager").enablePositionalOptions()

  registerWorkspaceCommands(program)
  program.addCommand(configCommand)

  program
    .command("manage")
    .description("Interactive workspace dashboard")
    .option("--target <id>", "Connect the TUI through the local helper to a paired target")
    .action(async (options: { target?: string }) => {
      await silenceObservability()
      const executable = which("git-stacks-tui")
      if (!executable) {
        throw new Error("The optional git-stacks TUI is not installed. Install @git-stacks/tui or use `git-stacks web`.")
      }
      await prepareManagedDashboardEnvironment()
      const tuiProcess = spawn([executable], { stdio: ["inherit", "inherit", "inherit"], env: { ...process.env, ...(options.target ? { GIT_STACKS_TARGET_ID: options.target } : {}) } })
      const exitCode = await tuiProcess.exited
      if (exitCode !== 0) process.exit(exitCode)
    })

  program.addCommand(doctorCommand)
  program.addCommand(repoCommand)
  program.addCommand(templateCommand)
  program.addCommand(notesCommand)
  program.addCommand(integrationCommand)
  program.addCommand(labelCommand)
  program.addCommand(filesCommand)
  program.addCommand(commandCommand)
  program.addCommand(serviceCommand)
  program.addCommand(webCommand)
  program.addCommand(hooksCommand)

  // Register last: the completion action needs the fully populated program tree.
  program.addCommand(createCompletionCommand(program))

  return program
}

export function collectCommandPaths(command: Command, parents: string[] = []): string[] {
  const paths: string[] = []

  for (const child of command.commands) {
    const path = [...parents, child.name()]
    paths.push(path.join(" "))
    paths.push(...collectCommandPaths(child, path))
  }

  return paths
}
