import { join } from "path"
import { createRenderEffect, createSignal, onCleanup, untrack, type Accessor } from "solid-js"
import { readGlobalConfig, type Workspace } from "../../../lib/config"
import { getTasksDir } from "../../../lib/paths"
import { getWorkspaceFileStatusView } from "../../../lib/workspace-file-status"
import type { WorkspaceFileStatusState } from "../types"

function workspaceRoot(workspace: Workspace): string {
  const config = readGlobalConfig()
  return join(getTasksDir(config.workspace_root), workspace.name)
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

export function useWorkspaceFileStatus(selectedWorkspace?: Accessor<Workspace | undefined>) {
  const [state, setState] = createSignal<WorkspaceFileStatusState>({ state: "idle" })
  let disposed = false
  let requestId = 0

  onCleanup(() => {
    disposed = true
    requestId += 1
  })

  async function load(workspace = selectedWorkspace?.()): Promise<void> {
    const currentRequest = requestId + 1
    requestId = currentRequest
    if (!workspace) {
      setState({ state: "idle" })
      return
    }

    const workspaceName = workspace.name
    setState({ state: "loading", workspaceName })
    try {
      const view = await Promise.resolve(getWorkspaceFileStatusView(workspace, workspaceRoot(workspace), { verbose: true }))
      if (disposed || currentRequest !== requestId) return
      setState({ state: "loaded", workspaceName, view })
    } catch (err) {
      if (disposed || currentRequest !== requestId) return
      setState({ state: "error", workspaceName, message: errorMessage(err) })
    }
  }

  function reset(): void {
    requestId += 1
    setState({ state: "idle" })
  }

  if (selectedWorkspace) {
    createRenderEffect(() => {
      const selected = selectedWorkspace()
      if (!selected) {
        reset()
        return
      }
      void untrack(() => load(selected))
    })
  }

  return { state, load, reset }
}
