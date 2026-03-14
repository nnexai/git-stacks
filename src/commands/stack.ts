import { Command } from "commander"
import { listStacks, readStack, stackExists } from "../lib/config"
import { runStackNew, runStackInit } from "../tui/stack-wizard"
import { runStackEdit } from "../tui/stack-edit"

export const stackCommand = new Command("stack").description("Manage stack definitions")

stackCommand
  .command("new")
  .description("Define a new stack interactively")
  .action(async () => {
    await runStackNew()
  })

stackCommand
  .command("init [dir]")
  .description("Initialize a stack by scanning a directory for git repos")
  .action(async (dir?: string) => {
    await runStackInit(dir)
  })

stackCommand
  .command("edit <name>")
  .description("Edit an existing stack — add/remove/modify repos")
  .action(async (name: string) => {
    await runStackEdit(name)
  })

stackCommand
  .command("list")
  .description("List all stacks")
  .action(() => {
    const stacks = listStacks()
    if (stacks.length === 0) {
      console.log("No stacks. Run `ws stack new` or `ws stack init` to create one.")
      return
    }
    for (const stack of stacks) {
      console.log(`\n  ${stack.name}${stack.description ? `  —  ${stack.description}` : ""}`)
      for (const repo of stack.repos) {
        const mode = repo.default_mode === "trunk" ? "[trunk]" : "[worktree]"
        console.log(`    ${repo.name.padEnd(30)} ${repo.type.padEnd(12)} ${mode}`)
      }
    }
  })

stackCommand
  .command("show <name>")
  .description("Show stack details")
  .action((name: string) => {
    if (!stackExists(name)) {
      console.error(`Stack '${name}' not found.`)
      process.exit(1)
    }
    const stack = readStack(name)
    console.log(`Stack:       ${stack.name}`)
    if (stack.description) console.log(`Description: ${stack.description}`)
    console.log(`\nRepos (${stack.repos.length}):`)
    for (const repo of stack.repos) {
      console.log(`  ${repo.name}`)
      console.log(`    type:    ${repo.type}`)
      console.log(`    path:    ${repo.path}`)
      console.log(`    default: ${repo.default_mode}`)
    }
  })
