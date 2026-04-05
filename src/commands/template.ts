import { Command } from "commander"
import { prompts as p } from "../tui/utils"
import { readTemplate, writeTemplate, listTemplates, templateExists, templatePath } from "../lib/config"
import { runTemplateNew, runTemplateEdit } from "../tui/template-wizard"
import { unlinkSync } from "fs"
import { editTemplateYaml, openYamlInEditor } from "../lib/workspace-yaml"
import { renameTemplate } from "../lib/workspace-ops"
import { matchesLabels } from "../lib/labels"
import { formatError } from "../lib/errors"

const LABEL_REGEX = /^[A-Za-z0-9._:-]+$/

function validateLabel(label: string): void {
  if (!LABEL_REGEX.test(label)) {
    console.error(`Invalid label "${label}": may only contain letters, digits, dots, colons, hyphens, underscores`)
    process.exit(1)
  }
}

function requireTemplate(name: string): void {
  if (!templateExists(name)) {
    console.error(formatError(`Template '${name}' not found`, "run: git-stacks template list"))
    process.exit(1)
  }
}

export const templateCommand = new Command("template").description("Manage workspace templates")
const templateLabelCommand = new Command("label").description("Manage template labels")

templateCommand
  .command("new [name]")
  .description("Create a new template interactively")
  .action(async (name?: string) => {
    await runTemplateNew(name)
  })

templateCommand
  .command("list")
  .description("List all templates")
  .option("--label <tag>", "Filter by label (repeatable, AND logic)", (val: string, arr: string[]) => {
    arr.push(val)
    return arr
  }, [] as string[])
  .action((opts: { label: string[] }) => {
    const templates = listTemplates()
    const filtered = opts.label.length > 0
      ? templates.filter(tpl => matchesLabels(tpl, opts.label))
      : templates

    if (filtered.length === 0) {
      if (opts.label.length > 0) {
        console.log(`No templates match labels: ${opts.label.join(", ")}`)
        return
      }
      console.log("No templates. Run `git-stacks template new` to create one.")
      return
    }
    console.log("")
    for (const tpl of filtered) {
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
    requireTemplate(template)
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
    requireTemplate(template)
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
    requireTemplate(template)
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
    requireTemplate(template)

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

templateLabelCommand
  .command("add <template> <labels...>")
  .description("Add labels to a template")
  .action((template: string, labels: string[]) => {
    requireTemplate(template)
    labels.forEach(validateLabel)
    const tpl = readTemplate(template)
    const existing = tpl.labels ?? []
    const merged = [...new Set([...existing, ...labels])]
    writeTemplate({ ...tpl, labels: merged })
    console.log(`Labels: ${merged.join(", ")}`)
  })

templateLabelCommand
  .command("remove <template> <labels...>")
  .description("Remove labels from a template")
  .action((template: string, labels: string[]) => {
    requireTemplate(template)
    labels.forEach(validateLabel)
    const tpl = readTemplate(template)
    const existing = tpl.labels ?? []
    const filtered = existing.filter(label => !labels.includes(label))
    writeTemplate({ ...tpl, labels: filtered.length > 0 ? filtered : undefined })
    if (filtered.length > 0) {
      console.log(`Labels: ${filtered.join(", ")}`)
      return
    }
    console.log("No labels remaining.")
  })

templateLabelCommand
  .command("list <template>")
  .description("List labels on a template")
  .action((template: string) => {
    requireTemplate(template)
    const tpl = readTemplate(template)
    const labels = tpl.labels ?? []
    if (labels.length === 0) {
      console.log("No labels.")
      return
    }
    for (const label of labels) {
      console.log(label)
    }
  })

templateLabelCommand
  .command("clear <template>")
  .description("Remove all labels from a template")
  .action((template: string) => {
    requireTemplate(template)
    const tpl = readTemplate(template)
    writeTemplate({ ...tpl, labels: undefined })
    console.log("Labels cleared.")
  })

templateCommand.addCommand(templateLabelCommand)
