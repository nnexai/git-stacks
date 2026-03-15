#!/usr/bin/env bun
import { Command } from "commander"
import { stackCommand } from "./commands/stack"
import { registerWorkspaceCommands } from "./commands/workspace"
import { configCommand } from "./commands/config"
import { createCompletionCommand } from "./commands/completion"

const program = new Command()

program.name("ws").description("Git worktree workspace manager").version("0.1.0")

program.addCommand(stackCommand)
registerWorkspaceCommands(program)
program.addCommand(configCommand)

program
  .command("manage")
  .description("Interactive workspace dashboard")
  .action(async () => {
    const { runDashboard } = await import("./tui/dashboard/run")
    await runDashboard()
  })

// Register last — program tree must be fully populated before the action runs
program.addCommand(createCompletionCommand(program))

// Default to manage when no subcommand is given
if (process.argv.length <= 2) {
  process.argv.push("manage")
}

program.parse()
