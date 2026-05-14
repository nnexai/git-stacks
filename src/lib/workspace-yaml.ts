import { readFileSync } from "fs"
import { parse } from "yaml"
import {
  workspacePath,
  templatePath,
  WorkspaceSchema,
  TemplateSchema,
  GlobalConfigSchema,
  RepoRegistrySchema,
} from "./config"
import { GLOBAL_CONFIG_FILE, REGISTRY_FILE } from "./paths"
import { timeOperation } from "./observability"

const OBS_CATEGORY = "workspace-yaml"

// ─── Injectable executor ──────────────────────────────────────────────────────
// Wraps the Bun.spawn call in openYamlInEditor for test injection.
export const _exec = {
  spawnEditor: (editor: string, path: string): { exited: Promise<number> } => {
    return Bun.spawn([editor, path], {
      stdin: "inherit",
      stdout: "inherit",
      stderr: "inherit",
    })
  },
}

// ─── editWorkspaceYaml ────────────────────────────────────────────────────────

export function editWorkspaceYaml(name: string): {
  path: string
  validate: () => { ok: boolean; error?: string }
} {
  return timeOperation(OBS_CATEGORY, "editWorkspaceYaml", () => {
    const path = workspacePath(name)
    return {
      path,
      validate: () => {
        try {
          const raw = readFileSync(path, "utf-8")
          WorkspaceSchema.parse(parse(raw))
          return { ok: true }
        } catch (err) {
          return { ok: false, error: String(err) }
        }
      },
    }
  })
}

// ─── openYamlInEditor ─────────────────────────────────────────────────────────

export async function openYamlInEditor(
  path: string,
  validate: () => { ok: boolean; error?: string }
): Promise<void> {
  return timeOperation(OBS_CATEGORY, "openYamlInEditor", async () => {
    const editor = process.env.VISUAL || process.env.EDITOR || "vi"
    const proc = _exec.spawnEditor(editor, path)
    const exitCode = await proc.exited
    if (exitCode !== 0) {
      throw new Error(`Editor exited with code ${exitCode}`)
    }
    const result = validate()
    if (!result.ok) {
      console.error(`\nWarning: file has validation errors:\n${result.error}`)
    }
  })
}

// ─── editTemplateYaml ─────────────────────────────────────────────────────────

export function editTemplateYaml(name: string): {
  path: string
  validate: () => { ok: boolean; error?: string }
} {
  return timeOperation(OBS_CATEGORY, "editTemplateYaml", () => {
    const path = templatePath(name)
    return {
      path,
      validate: () => {
        try {
          const raw = readFileSync(path, "utf-8")
          TemplateSchema.parse(parse(raw))
          return { ok: true }
        } catch (err) {
          return { ok: false, error: String(err) }
        }
      },
    }
  })
}

// ─── editGlobalConfigYaml ────────────────────────────────────────────────────

export function editGlobalConfigYaml(): {
  path: string
  validate: () => { ok: boolean; error?: string }
} {
  return timeOperation(OBS_CATEGORY, "editGlobalConfigYaml", () => {
    const path = GLOBAL_CONFIG_FILE
    return {
      path,
      validate: () => {
        try {
          const raw = readFileSync(path, "utf-8")
          GlobalConfigSchema.parse(parse(raw))
          return { ok: true }
        } catch (err) {
          return { ok: false, error: String(err) }
        }
      },
    }
  })
}

// ─── editRegistryYaml ────────────────────────────────────────────────────────

export function editRegistryYaml(): {
  path: string
  validate: () => { ok: boolean; error?: string }
} {
  return timeOperation(OBS_CATEGORY, "editRegistryYaml", () => {
    const path = REGISTRY_FILE
    return {
      path,
      validate: () => {
        try {
          const raw = readFileSync(path, "utf-8")
          RepoRegistrySchema.parse(parse(raw))
          return { ok: true }
        } catch (err) {
          return { ok: false, error: String(err) }
        }
      },
    }
  })
}
