import { Command } from "commander"
import { mkdirSync } from "node:fs"
import { workspaceExists } from "../lib/config"
import { formatError } from "../lib/errors"
import { addWorkspaceNote, clearWorkspaceNotes, listWorkspaceNotes, type WorkspaceNoteRecord } from "../lib/notes"
import { NOTES_DIR } from "../lib/paths"
import { resolveOptionalWorkspace } from "../lib/workspace-resolution"
import { prompts } from "../tui/utils"

export const notesCommand = new Command("notes").description("Workspace operator notes")

function resolveWorkspace(explicitWorkspace?: string): string | null {
  const resolution = resolveOptionalWorkspace(explicitWorkspace, { allowEnvFallback: true })
  return resolution.ok ? resolution.workspace.name : null
}

function requireExistingWorkspace(explicitWorkspace?: string): string {
  const workspace = resolveWorkspace(explicitWorkspace)
  if (!workspace) {
    throw new Error(
      formatError(
        "no workspace specified",
        "use [workspace], run from a workspace root/worktree, or set GS_WORKSPACE_NAME"
      )
    )
  }
  if (!workspaceExists(workspace)) {
    throw new Error(formatError(`workspace '${workspace}' not found`))
  }
  return workspace
}

function printNotes(records: WorkspaceNoteRecord[]): void {
  for (const row of records) {
    const ts = row.created.slice(0, 19).replace("T", " ").padEnd(20)
    console.log(`${ts}  ${row.text}`)
  }
}

notesCommand
  .command("add <first> [rest...]")
  .description("Add a note for a workspace")
  .action(async (first: string, rest: string[] | undefined) => {
    try {
      const extra = rest ?? []
      const hasWorkspaceArg = extra.length > 0
      const workspace = hasWorkspaceArg ? first : undefined
      const text = hasWorkspaceArg ? extra.join(" ") : first
      const ws = requireExistingWorkspace(workspace)
      mkdirSync(NOTES_DIR, { recursive: true })
      await addWorkspaceNote(ws, text)
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error))
      process.exit(1)
    }
  })

notesCommand
  .command("list [workspace]")
  .description("List notes for a workspace")
  .option("--limit <n>", "Limit number of newest notes", (value) => parseInt(value, 10))
  .option("--all", "Show all notes")
  .action(async (workspace: string | undefined, opts: { limit?: number; all?: boolean }) => {
    try {
      const ws = requireExistingWorkspace(workspace)
      const useLimit = opts.all ? undefined : (opts.limit ?? 10)
      const records = await listWorkspaceNotes(ws, useLimit === undefined ? undefined : { limit: useLimit })
      if (records.length === 0) {
        console.log(`No notes for '${ws}'.`)
        return
      }
      printNotes(records)
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error))
      process.exit(1)
    }
  })

notesCommand
  .command("clear [workspace]")
  .description("Clear all notes for a workspace")
  .option("--force", "Clear without confirmation")
  .action(async (workspace: string | undefined, opts: { force?: boolean }) => {
    try {
      const ws = requireExistingWorkspace(workspace)
      if (!opts.force) {
        let confirmed: unknown = false
        try {
          confirmed = await prompts.confirm({ message: `Clear notes for '${ws}'?` })
        } catch {
          confirmed = false
        }
        if (prompts.isCancel(confirmed) || !confirmed) return
      }
      await clearWorkspaceNotes(ws)
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error))
      process.exit(1)
    }
  })
