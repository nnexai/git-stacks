import { readFileSync } from "node:fs"
import { parse } from "yaml"
import { RepoRegistrySchema, TemplateSchema, WorkspaceSchema } from "../../lib/config"
import { fetchEditTarget } from "../../lib/service/client"
import type { EditTargetRequest } from "../../lib/service/core-contract"

export async function resolveEditorHandoff(request: EditTargetRequest): Promise<{
  path: string
  validate: () => { ok: boolean; error?: string }
}> {
  const target = await fetchEditTarget(request)
  const schema = target.kind === "workspace" ? WorkspaceSchema : target.kind === "template" ? TemplateSchema : RepoRegistrySchema
  return {
    path: target.path,
    validate: () => {
      try {
        schema.parse(parse(readFileSync(target.path, "utf8")))
        return { ok: true }
      } catch (error) {
        return { ok: false, error: String(error) }
      }
    },
  }
}

export async function openEditorHandoff(path: string): Promise<number> {
  const editor = process.env.VISUAL || process.env.EDITOR || "vi"
  return Bun.spawn([editor, path], { stdin: "inherit", stdout: "inherit", stderr: "inherit" }).exited
}
