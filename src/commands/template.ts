import { Command } from "commander"
import { prompts as p } from "../tui/utils"
import { readTemplate, writeTemplate, listTemplates, templateExists, templatePath } from "../lib/config"
import { runTemplateNew, runTemplateEdit } from "../tui/template-wizard"
import { unlinkSync } from "fs"
import { editTemplateYaml, openYamlInEditor } from "../lib/workspace-yaml"
import { renameTemplate } from "../lib/workspace-ops"

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
  .command("show <template>")
  .description("Show template details")
  .action((template: string) => {
    if (!templateExists(template)) {
      console.error(`Template '${template}' not found.`)
      process.exit(1)
    }
    const tpl = readTemplate(template)
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
  .command("edit <template>")
  .description("Edit an existing template")
  .option("--yaml", "Open template YAML in $EDITOR")
  .action(async (template: string, opts: { yaml?: boolean }) => {
    if (!templateExists(template)) {
      console.error(`Template '${template}' not found.`)
      process.exit(1)
    }
    if (opts.yaml) {
      const { path, validate } = editTemplateYaml(template)
      await openYamlInEditor(path, validate)
      return
    }
    await runTemplateEdit(template)
  })

templateCommand
  .command("clone <template> <new-name>")
  .description("Clone a template under a new name")
  .action((template: string, newName: string) => {
    if (!templateExists(template)) {
      console.error(`Template '${template}' not found.`)
      process.exit(1)
    }
    if (templateExists(newName)) {
      console.error(`Template '${newName}' already exists.`)
      process.exit(1)
    }
    const tpl = readTemplate(template)
    tpl.name = newName
    writeTemplate(tpl)
    console.log(`Cloned '${template}' \u2192 '${newName}'.`)
  })

templateCommand
  .command("rename <template> <new-name>")
  .description("Rename a template (updates all workspace references)")
  .option("--dry-run", "Show what would change without writing")
  .action(async (template: string, newName: string, opts: { dryRun?: boolean }) => {
    const result = await renameTemplate(template, newName, { dryRun: opts.dryRun }, (msg) =>
      console.log(`  ${msg}`)
    )
    if (!result.ok) {
      console.error(result.error)
      process.exit(1)
    }
    if (!opts.dryRun) {
      console.log(`Renamed '${template}' \u2192 '${newName}'.`)
    }
  })

templateCommand
  .command("remove <template>")
  .description("Remove a template")
  .option("--force", "Skip confirmation prompt")
  .action(async (template: string, opts: { force?: boolean }) => {
    if (!templateExists(template)) {
      console.error(`Template '${template}' not found.`)
      process.exit(1)
    }

    if (!opts.force) {
      const ok = await p.confirm({
        message: `Remove template '${template}'?`,
        initialValue: false,
      })
      if (p.isCancel(ok) || !ok) {
        console.log("Cancelled.")
        return
      }
    }

    unlinkSync(templatePath(template))
    console.log(`Removed template '${template}'.`)
  })
