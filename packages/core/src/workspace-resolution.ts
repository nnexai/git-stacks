// Canonical implementation owned by @git-stacks/core.
import { readWorkspace, workspaceExists, type Workspace } from "./config"
import { detectWorkspaceFromCwd } from "./workspace-status"

export type OptionalWorkspaceSource = "explicit" | "cwd" | "env"

export type OptionalWorkspaceResolution =
  | { ok: true; workspace: Workspace; source: OptionalWorkspaceSource }
  | { ok: false; error: "workspace_not_found"; name: string; source: "explicit" | "env" }
  | { ok: false; error: "no_match" }

export type ResolveOptionalWorkspaceOptions = {
  cwd?: string
  allowEnvFallback?: boolean
  env?: Pick<NodeJS.ProcessEnv, "GS_WORKSPACE_NAME">
}

function resolveByName(name: string, source: "explicit" | "env"): OptionalWorkspaceResolution {
  if (!workspaceExists(name)) return { ok: false, error: "workspace_not_found", name, source }
  return { ok: true, workspace: readWorkspace(name), source }
}

export function resolveOptionalWorkspace(
  workspaceName?: string,
  opts: ResolveOptionalWorkspaceOptions = {}
): OptionalWorkspaceResolution {
  if (workspaceName) return resolveByName(workspaceName, "explicit")

  const detected = detectWorkspaceFromCwd(opts.cwd)
  if (detected.ok) return { ok: true, workspace: detected.workspace, source: "cwd" }

  if (opts.allowEnvFallback) {
    const envWorkspace = opts.env?.GS_WORKSPACE_NAME ?? process.env.GS_WORKSPACE_NAME
    if (envWorkspace) return resolveByName(envWorkspace, "env")
  }

  return { ok: false, error: "no_match" }
}
