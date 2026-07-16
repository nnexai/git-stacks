import { createSignal, onCleanup, type Accessor } from "solid-js"

import { fetchWorkspaceFileStatusProjection } from "@git-stacks/service/client"
import type { WorkspaceFileStatusState } from "../types"

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

export function useWorkspaceFileStatus(
  selectedWorkspace?: Accessor<{ workspaceId: string; workspaceName: string } | undefined>,
  selectedRevision?: Accessor<string | undefined>,
) {
  const [state, setState] = createSignal<WorkspaceFileStatusState>({ state: "idle" })
  const cache = new Map<string, WorkspaceFileStatusState>()
  const inFlight = new Map<string, Promise<void>>()
  let disposed = false
  let visibleKey: string | undefined
  let cacheRevision: string | undefined

  onCleanup(() => {
    disposed = true
    visibleKey = undefined
    cache.clear()
  })

  async function load(
    workspace = selectedWorkspace?.(),
    options: { force?: boolean; revision?: string } = { force: true },
  ): Promise<void> {
    if (!workspace) {
      visibleKey = undefined
      setState({ state: "idle" })
      return
    }

    const revision = options.revision ?? selectedRevision?.()
    if (revision !== cacheRevision) {
      cacheRevision = revision
      cache.clear()
    }
    const workspaceName = workspace.workspaceName
    const key = `${revision ?? "0"}\0${workspaceName}`
    visibleKey = key
    if (!options.force && cache.has(key)) {
      setState(cache.get(key)!)
      return
    }
    setState({ state: "loading", workspaceName })
    let request = inFlight.get(key)
    if (!request || options.force) {
      request = Promise.resolve().then(() => fetchWorkspaceFileStatusProjection({
        workspace_id: workspace.workspaceId,
        expected_revision: revision ?? "0",
      })).then((view) => {
        const next: WorkspaceFileStatusState = { state: "loaded", workspaceName, view }
        cache.set(key, next)
        if (!disposed && visibleKey === key) setState(next)
      }).catch((err) => {
        const next: WorkspaceFileStatusState = { state: "error", workspaceName, message: errorMessage(err) }
        cache.set(key, next)
        if (!disposed && visibleKey === key) setState(next)
      }).finally(() => { if (inFlight.get(key) === request) inFlight.delete(key) })
      inFlight.set(key, request)
    }
    await request
  }

  function reset(): void {
    visibleKey = undefined
    setState({ state: "idle" })
  }

  return { state, load, reset }
}
