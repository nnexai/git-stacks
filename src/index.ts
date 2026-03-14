#!/usr/bin/env bun
import { Command } from "commander"
import { stackCommand } from "./commands/stack"
import { registerWorkspaceCommands } from "./commands/workspace"
import { configCommand } from "./commands/config"
import { completionCommand } from "./commands/completion"

const program = new Command()

program.name("ws").description("Git worktree workspace manager").version("0.1.0")

program.addCommand(stackCommand)
registerWorkspaceCommands(program)
program.addCommand(configCommand)
program.addCommand(completionCommand)

program.parse()
