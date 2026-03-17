#!/usr/bin/env bun
import { Command } from "commander"
import { basename } from "path"
import { $ } from "bun"
import { stackCommand } from "./commands/stack"
import { registerWorkspaceCommands } from "./commands/workspace"
import { configCommand } from "./commands/config"
import { createCompletionCommand } from "./commands/completion"
import { doctorCommand } from "./commands/doctor"
import { getVersionString } from "./lib/version"

async function checkGitVersion(): Promise<void> {
  const result = await $`git --version`.quiet().nothrow()
  if (result.exitCode !== 0) {
    console.error("git-stacks: git is not installed. Visit https://git-scm.com to install.")
    process.exit(1)
  }
  const match = result.stdout.toString().match(/(\d+)\.(\d+)/)
  if (!match) return
  const [major, minor] = [parseInt(match[1]), parseInt(match[2])]
  if (major < 2 || (major === 2 && minor < 24)) {
    console.error(
      `git-stacks: git >= 2.24 required (found ${major}.${minor}). Visit https://git-scm.com to install.`
    )
    process.exit(1)
  }
}

const program = new Command()

const rawName = basename(process.argv[1])
const binName = rawName.endsWith(".ts") || rawName.endsWith(".js") ? "git-stacks" : rawName

const versionString = await getVersionString()
program.name(binName).description("Git worktree workspace manager").version(versionString).enablePositionalOptions()

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

// Skip git check for completion subcommand (shell completions must work even without git)
const subcommand = process.argv[2]
if (subcommand !== "completion") {
  await checkGitVersion()
}
program.parse()
