#!/usr/bin/env bun
import { Command } from "commander"
import { basename } from "path"
import { stackCommand } from "./commands/stack"
import { registerWorkspaceCommands } from "./commands/workspace"
import { configCommand } from "./commands/config"
import { createCompletionCommand } from "./commands/completion"
import { doctorCommand } from "./commands/doctor"

const program = new Command()

const rawName = basename(process.argv[1])
const binName = rawName.endsWith(".ts") || rawName.endsWith(".js") ? "git-stacks" : rawName

program.name(binName).description("Git worktree workspace manager").version("0.1.1").enablePositionalOptions()

program.addCommand(stackCommand)
registerWorkspaceCommands(program)
program.addCommand(configCommand)

program
  .command("manage")
  .description("Interactive workspace dashboard")
  .action(async () => {
    // Register the Bun solid plugin programmatically so the dashboard works
    // when running via `bunx` or global install (where bunfig.toml preload is absent).
    const { plugin } = await import("bun")
    const { default: solidPlugin } = await import("@opentui/solid/bun-plugin")
    plugin(solidPlugin)
    const { runDashboard } = await import("./tui/dashboard/run")
    await runDashboard()
  })

program.addCommand(doctorCommand)

// Register last — program tree must be fully populated before the action runs
program.addCommand(createCompletionCommand(program))

// Default to manage when no subcommand is given
if (process.argv.length <= 2) {
  process.argv.push("manage")
}

program.parse()
