// Canonical implementation owned by @git-stacks/core.
import { appendFile, mkdir, open, readFile, rm, unlink } from "node:fs/promises"
import { createHash } from "node:crypto"
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

export interface WorkspaceNotesSnapshot {
  revision: string
  count: number
  records: WorkspaceNoteRecord[]
}

export class WorkspaceNotesRevisionConflictError extends Error {
  readonly code = "notes_revision_conflict" as const

  constructor(readonly expectedRevision: string, readonly actualRevision: string) {
    super("Workspace notes changed; refresh before trying again")
    this.name = "WorkspaceNotesRevisionConflictError"
  }
}

type WorkspaceNotesStoreOptions = {
  /** Injectable storage boundary for tests and embedded callers. */
  root?: string
}

type WorkspaceNotesMutationOptions = WorkspaceNotesStoreOptions & {
  expectedRevision?: string
  clock?: () => Date
}

function assertWorkspaceName(workspace: string): void {
  if (!workspace || workspace.includes("/") || workspace.includes("\\") || workspace.includes("..")) {
    throw new Error(`Invalid workspace name '${workspace}'`)
  }
}

function notePath(workspace: string, root = NOTES_DIR): string {
  assertWorkspaceName(workspace)
  return join(root, `${workspace}.jsonl`)
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

async function readRaw(path: string): Promise<string> {
  try {
    return await readFile(path, "utf8")
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return ""
    throw error
  }
}

function revision(raw: string): string {
  if (raw === "") return "0"
  return BigInt(`0x${createHash("sha256").update(raw).digest("hex")}`).toString(10)
}

async function readValidated(workspace: string, root = NOTES_DIR): Promise<{ raw: string; records: WorkspaceNoteRecord[] }> {
  const raw = await readRaw(notePath(workspace, root))
  return { raw, records: parseJsonl(raw, workspace) }
}

async function acquireMutationLock(root: string, workspace: string): Promise<() => Promise<void>> {
  await mkdir(root, { recursive: true, mode: 0o700 })
  const lockPath = `${notePath(workspace, root)}.lock`
  for (let attempt = 0; attempt < 200; attempt += 1) {
    try {
      const handle = await open(lockPath, "wx", 0o600)
      return async () => {
        await handle.close()
        await unlink(lockPath).catch((error: NodeJS.ErrnoException) => {
          if (error.code !== "ENOENT") throw error
        })
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error
      await new Promise<void>((resolve) => setTimeout(resolve, 5))
    }
  }
  throw new Error("Workspace notes are busy; retry after the current mutation finishes")
}

function assertRevision(expectedRevision: string | undefined, actualRevision: string): void {
  if (expectedRevision !== undefined && expectedRevision !== actualRevision) {
    throw new WorkspaceNotesRevisionConflictError(expectedRevision, actualRevision)
  }
}

export async function addWorkspaceNote(
  workspace: string,
  text: string,
  options: WorkspaceNotesMutationOptions = {},
): Promise<WorkspaceNoteRecord> {
  const root = options.root ?? NOTES_DIR
  const release = await acquireMutationLock(root, workspace)
  try {
    const current = await readValidated(workspace, root)
    assertRevision(options.expectedRevision, revision(current.raw))
    const record: WorkspaceNoteRecord = {
      text,
      created: (options.clock ?? (() => new Date()))().toISOString(),
    }
    await appendFile(notePath(workspace, root), JSON.stringify(record) + "\n", { encoding: "utf8", mode: 0o600 })
    return record
  } finally {
    await release()
  }
}

export async function listWorkspaceNotes(
  workspace: string,
  opts: { limit?: number; root?: string } = {}
): Promise<WorkspaceNoteRecord[]> {
  const { records } = await readValidated(workspace, opts.root)
  const newestFirst = [...records].reverse()
  if (opts.limit === undefined) return newestFirst
  return newestFirst.slice(0, Math.max(0, opts.limit))
}

export async function clearWorkspaceNotes(
  workspace: string,
  options: WorkspaceNotesMutationOptions = {},
): Promise<void> {
  const root = options.root ?? NOTES_DIR
  const release = await acquireMutationLock(root, workspace)
  try {
    const current = await readValidated(workspace, root)
    assertRevision(options.expectedRevision, revision(current.raw))
    await rm(notePath(workspace, root), { force: true })
  } finally {
    await release()
  }
}

export async function getWorkspaceNotesSnapshot(
  workspace: string,
  opts: { limit?: number; root?: string } = {},
): Promise<WorkspaceNotesSnapshot> {
  const { raw, records } = await readValidated(workspace, opts.root)
  const newestFirst = [...records].reverse()
  return {
    revision: revision(raw),
    count: records.length,
    records: opts.limit === undefined ? newestFirst : newestFirst.slice(0, Math.max(0, opts.limit)),
  }
}

export async function getWorkspaceNoteSummary(workspace: string): Promise<WorkspaceNoteSummary> {
  const { records } = await readValidated(workspace)
  const latest = records.length > 0 ? records[records.length - 1] : null
  return {
    count: records.length,
    latest: latest ? { created: latest.created, text: latest.text } : null,
  }
}
