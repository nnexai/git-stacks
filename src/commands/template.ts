import { Command } from "commander"
import { prompts as p } from "../tui/utils"
import { readTemplate, writeTemplate, listTemplates, templateExists, templatePath } from "../lib/config"
import { runTemplateNew, runTemplateEdit } from "../tui/template-wizard"
import { unlinkSync } from "fs"
import { editTemplateYaml, openYamlInEditor } from "../lib/workspace-ops"

export const templateCommand = new Command("template").description("Manage workspace templates")

templateCommand
  .command("new [name]")
  .description("Create a new template interactively")
  .action(async (name?: string) => {
    await runTemplateNew(name)
  })

templateCommand
  .command("list")
  .description("List all templates")
  .action(() => {
    const templates = listTemplates()
    if (templates.length === 0) {
      console.log("No templates. Run `git-stacks template new` to create one.")
      return
    }
    console.log("")
    for (const tpl of templates) {
      console.log(`  ${tpl.name}${tpl.description ? `  \u2014  ${tpl.description}` : ""}`)
      for (const repo of tpl.repos) {
        const mode = repo.mode === "trunk" ? "[trunk]" : "[worktree]"
        const branch = repo.branch_pattern ?? repo.base_branch ?? ""
        console.log(`    ${repo.repo.padEnd(24)} ${mode.padEnd(12)} ${branch}`)
      }
    }
  })

templateCommand
  .command("show <name>")
  .description("Show template details")
  .action((name: string) => {
    if (!templateExists(name)) {
      console.error(`Template '${name}' not found.`)
      process.exit(1)
    }
    const tpl = readTemplate(name)
    console.log(`Template:    ${tpl.name}`)
    if (tpl.description) console.log(`Description: ${tpl.description}`)
    console.log(`\nRepos (${tpl.repos.length}):`)
    for (const repo of tpl.repos) {
      console.log(`  ${repo.repo}`)
      console.log(`    mode:           ${repo.mode}`)
      if (repo.base_branch) console.log(`    base_branch:    ${repo.base_branch}`)
      if (repo.branch_pattern) console.log(`    branch_pattern: ${repo.branch_pattern}`)
    }
    if (tpl.hooks) {
      const hookEntries = Object.entries(tpl.hooks).filter(([, v]) => v && v.length > 0)
      if (hookEntries.length > 0) {
        console.log(`\nHooks:`)
        for (const [hookName, cmds] of hookEntries) {
          for (const cmd of cmds!) {
            console.log(`  ${hookName}: ${cmd}`)
          }
        }
      }
    }
    if (tpl.env) {
      console.log(`\nEnvironment:`)
      for (const [k, v] of Object.entries(tpl.env)) {
        console.log(`  ${k}=${v}`)
      }
    }
  })

templateCommand
  .command("edit <name>")
  .description("Edit an existing template")
  .option("--yaml", "Open template YAML in $EDITOR")
  .action(async (name: string, opts: { yaml?: boolean }) => {
    if (!templateExists(name)) {
      console.error(`Template '${name}' not found.`)
      process.exit(1)
    }
    if (opts.yaml) {
      const { path, validate } = editTemplateYaml(name)
      await openYamlInEditor(path, validate)
      return
    }
    await runTemplateEdit(name)
  })

templateCommand
  .command("clone <name> <new-name>")
  .description("Clone a template under a new name")
  .action((name: string, newName: string) => {
    if (!templateExists(name)) {
      console.error(`Template '${name}' not found.`)
      process.exit(1)
    }
    if (templateExists(newName)) {
      console.error(`Template '${newName}' already exists.`)
      process.exit(1)
    }
    const tpl = readTemplate(name)
    tpl.name = newName
    writeTemplate(tpl)
    console.log(`Cloned '${name}' \u2192 '${newName}'.`)
  })

templateCommand
  .command("rename <old> <new>")
  .description("Rename a template")
  .action((oldName: string, newName: string) => {
    if (!templateExists(oldName)) {
      console.error(`Template '${oldName}' not found.`)
      process.exit(1)
    }
    if (templateExists(newName)) {
      console.error(`Template '${newName}' already exists.`)
      process.exit(1)
    }
    const tpl = readTemplate(oldName)
    tpl.name = newName
    writeTemplate(tpl)
    unlinkSync(templatePath(oldName))
    console.log(`Renamed '${oldName}' \u2192 '${newName}'.`)
  })

templateCommand
  .command("remove <name>")
  .description("Remove a template")
  .option("--force", "Skip confirmation prompt")
  .action(async (name: string, opts: { force?: boolean }) => {
    if (!templateExists(name)) {
      console.error(`Template '${name}' not found.`)
      process.exit(1)
    }

    if (!opts.force) {
      const ok = await p.confirm({
        message: `Remove template '${name}'?`,
        initialValue: false,
      })
      if (p.isCancel(ok) || !ok) {
        console.log("Cancelled.")
        return
      }
    }

    unlinkSync(templatePath(name))
    console.log(`Removed template '${name}'.`)
  })
