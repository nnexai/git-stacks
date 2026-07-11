import { Command } from "commander"
import { registerWorkspaceCommands } from "../commands/workspace"
import { configCommand } from "../commands/config"
import { createCompletionCommand } from "../commands/completion"
import { doctorCommand } from "../commands/doctor"
import { repoCommand } from "../commands/repo"
import { templateCommand } from "../commands/template"
import { messageCommand } from "../commands/message"
import { notesCommand } from "../commands/notes"
import { installCommand } from "../commands/install"
import { integrationCommand } from "../commands/integration"
import { labelCommand } from "../commands/label"
import { filesCommand } from "../commands/files"
import { commandCommand } from "../commands/command"
import { serviceCommand } from "../commands/service"
import { silenceObservability } from "./observability"

export function buildCliProgram(binName = "git-stacks"): Command {
  const program = new Command()
  program.name(binName).description("Git worktree workspace manager").enablePositionalOptions()

  registerWorkspaceCommands(program)
  program.addCommand(configCommand)

  program
    .command("manage")
    .description("Interactive workspace dashboard")
    .action(async () => {
      await silenceObservability()

      // Register the Bun solid plugin programmatically so the dashboard works
      // when running via `bunx` or global install (where bunfig.toml preload is absent).
      const { plugin } = await import("bun")
      const { default: solidPlugin } = await import("@opentui/solid/bun-plugin")
      plugin(solidPlugin)
      const { runDashboard } = await import("../tui/dashboard/run")
      await runDashboard()
    })

  program.addCommand(doctorCommand)
  program.addCommand(repoCommand)
  program.addCommand(templateCommand)
  program.addCommand(messageCommand)
  program.addCommand(notesCommand)
  program.addCommand(installCommand)
  program.addCommand(integrationCommand)
  program.addCommand(labelCommand)
  program.addCommand(filesCommand)
  program.addCommand(commandCommand)
  program.addCommand(serviceCommand)

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
