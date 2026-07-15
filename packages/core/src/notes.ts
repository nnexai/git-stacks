// Canonical implementation owned by @git-stacks/core.
import { appendFile, readFile, rm } from "node:fs/promises"
import { existsSync } from "node:fs"
import { join } from "node:path"
import { NOTES_DIR } from "./paths"

export interface WorkspaceNoteRecord {
  text: string
  created: string
}

export interface WorkspaceNoteSummary {
  count: number
  latest: { created: string; text: string } | null
}

function assertWorkspaceName(workspace: string): void {
  if (!workspace || workspace.includes("/") || workspace.includes("\\") || workspace.includes("..")) {
    throw new Error(`Invalid workspace name '${workspace}'`)
  }
}

function notePath(workspace: string): string {
  assertWorkspaceName(workspace)
  return join(NOTES_DIR, `${workspace}.jsonl`)
}

function parseJsonl(raw: string, workspace: string): WorkspaceNoteRecord[] {
  const lines = raw.trim().split("\n").filter(Boolean)
  const out: WorkspaceNoteRecord[] = []

  for (const line of lines) {
    let parsed: unknown
    try {
      parsed = JSON.parse(line)
    } catch {
      throw new Error(`Malformed workspace note store for '${workspace}'`)
    }

    if (
      !parsed ||
      typeof parsed !== "object" ||
      typeof (parsed as Record<string, unknown>).text !== "string" ||
      typeof (parsed as Record<string, unknown>).created !== "string"
    ) {
      throw new Error(`Malformed workspace note store for '${workspace}'`)
    }

    out.push({
      text: (parsed as Record<string, string>).text,
      created: (parsed as Record<string, string>).created,
    })
  }

  return out
}

async function readValidated(workspace: string): Promise<WorkspaceNoteRecord[]> {
  const path = notePath(workspace)
  if (!existsSync(path)) return []
  const raw = await readFile(path, "utf8")
  return parseJsonl(raw, workspace)
}

export async function addWorkspaceNote(workspace: string, text: string): Promise<WorkspaceNoteRecord> {
  await readValidated(workspace)
  const record: WorkspaceNoteRecord = {
    text,
    created: new Date().toISOString(),
  }
  await appendFile(notePath(workspace), JSON.stringify(record) + "\n", "utf8")
  return record
}

export async function listWorkspaceNotes(
  workspace: string,
  opts: { limit?: number } = {}
): Promise<WorkspaceNoteRecord[]> {
  const records = await readValidated(workspace)
  const newestFirst = [...records].reverse()
  if (opts.limit === undefined) return newestFirst
  return newestFirst.slice(0, Math.max(0, opts.limit))
}

export async function clearWorkspaceNotes(workspace: string): Promise<void> {
  await readValidated(workspace)
  await rm(notePath(workspace), { force: true })
}

export async function getWorkspaceNoteSummary(workspace: string): Promise<WorkspaceNoteSummary> {
  const records = await readValidated(workspace)
  const latest = records.length > 0 ? records[records.length - 1] : null
  return {
    count: records.length,
    latest: latest ? { created: latest.created, text: latest.text } : null,
  }
}
