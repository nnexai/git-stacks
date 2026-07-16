export interface WorkspaceLifecycleLease {
  readonly workspaceId: string
  release(): void
}

export interface WorkspaceLifecycleAdmission {
  acquire(workspaceId: string): Promise<WorkspaceLifecycleLease>
  assertTerminalAdmission(workspaceId: string): void
}

type TargetState = {
  held: boolean
  waiters: Array<(lease: WorkspaceLifecycleLease) => void>
}

function blocked(): Error & { status: number; code: string } {
  return Object.assign(new Error("Workspace lifecycle is in progress"), {
    status: 409,
    code: "workspace_lifecycle_in_progress",
  })
}

export function createWorkspaceLifecycleAdmission(): WorkspaceLifecycleAdmission {
  const targets = new Map<string, TargetState>()

  const grant = (workspaceId: string, state: TargetState): WorkspaceLifecycleLease => {
    let released = false
    return {
      workspaceId,
      release() {
        if (released) return
        released = true
        const next = state.waiters.shift()
        if (next) {
          next(grant(workspaceId, state))
          return
        }
        state.held = false
        targets.delete(workspaceId)
      },
    }
  }

  return {
    acquire(workspaceId) {
      let state = targets.get(workspaceId)
      if (!state) {
        state = { held: false, waiters: [] }
        targets.set(workspaceId, state)
      }
      if (!state.held) {
        state.held = true
        return Promise.resolve(grant(workspaceId, state))
      }
      return new Promise((resolve) => state!.waiters.push(resolve))
    },
    assertTerminalAdmission(workspaceId) {
      if (targets.get(workspaceId)?.held) throw blocked()
    },
  }
}
