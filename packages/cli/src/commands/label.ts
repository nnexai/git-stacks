import { Command } from "commander"

import {
  readWorkspace,
  updateWorkspace,
  workspaceExists,
} from "@git-stacks/core/config"
import { formatError } from "@git-stacks/core/errors"

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
    const next = updateWorkspace(workspace, (ws) => ({ ...ws, labels: [...new Set([...(ws.labels ?? []), ...labels])] }))
    const merged = next.labels ?? []
    console.log(`Labels: ${merged.join(", ")}`)
  })

labelCommand
  .command("remove <workspace> <labels...>")
  .description("Remove labels from a workspace")
  .action((workspace: string, labels: string[]) => {
    requireWorkspace(workspace)
    labels.forEach(validateLabel)
    const next = updateWorkspace(workspace, (ws) => {
      const filtered = (ws.labels ?? []).filter(label => !labels.includes(label))
      return { ...ws, labels: filtered.length > 0 ? filtered : undefined }
    })
    const filtered = next.labels ?? []
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
    updateWorkspace(workspace, (ws) => ({ ...ws, labels: undefined }))
    console.log("Labels cleared.")
  })
