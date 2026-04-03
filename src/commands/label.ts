import { Command } from "commander"
import {
  readWorkspace,
  writeWorkspace,
  workspaceExists,
} from "../lib/config"
import { formatError } from "../lib/errors"

const LABEL_REGEX = /^[A-Za-z0-9._:-]+$/

function validateLabel(label: string): void {
  if (!LABEL_REGEX.test(label)) {
    console.error(`Invalid label "${label}": may only contain letters, digits, dots, colons, hyphens, underscores`)
    process.exit(1)
  }
}

function requireWorkspace(name: string): void {
  if (!workspaceExists(name)) {
    console.error(formatError(`Workspace '${name}' not found`, "run: git-stacks list"))
    process.exit(1)
  }
}

export const labelCommand = new Command("label")
  .description("Manage workspace labels")

labelCommand
  .command("add <workspace> <labels...>")
  .description("Add labels to a workspace")
  .action((workspace: string, labels: string[]) => {
    requireWorkspace(workspace)
    labels.forEach(validateLabel)
    const ws = readWorkspace(workspace)
    const existing = ws.labels ?? []
    const merged = [...new Set([...existing, ...labels])]
    writeWorkspace({ ...ws, labels: merged })
    console.log(`Labels: ${merged.join(", ")}`)
  })

labelCommand
  .command("remove <workspace> <labels...>")
  .description("Remove labels from a workspace")
  .action((workspace: string, labels: string[]) => {
    requireWorkspace(workspace)
    labels.forEach(validateLabel)
    const ws = readWorkspace(workspace)
    const existing = ws.labels ?? []
    const filtered = existing.filter(label => !labels.includes(label))
    writeWorkspace({ ...ws, labels: filtered.length > 0 ? filtered : undefined })
    if (filtered.length > 0) {
      console.log(`Labels: ${filtered.join(", ")}`)
      return
    }
    console.log("No labels remaining.")
  })

labelCommand
  .command("list <workspace>")
  .description("List labels on a workspace")
  .action((workspace: string) => {
    requireWorkspace(workspace)
    const ws = readWorkspace(workspace)
    const labels = ws.labels ?? []
    if (labels.length === 0) {
      console.log("No labels.")
      return
    }
    for (const label of labels) {
      console.log(label)
    }
  })

labelCommand
  .command("clear <workspace>")
  .description("Remove all labels from a workspace")
  .action((workspace: string) => {
    requireWorkspace(workspace)
    const ws = readWorkspace(workspace)
    writeWorkspace({ ...ws, labels: undefined })
    console.log("Labels cleared.")
  })
