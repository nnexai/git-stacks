export interface WorkspaceLifecycleLease {
  readonly workspaceId: string
  release(): void
}

export interface WorkspaceTerminalAdmission {
  readonly workspaceId: string
  release(): void
}

export interface WorkspaceLifecycleAdmission {
  acquire(workspaceId: string): Promise<WorkspaceLifecycleLease>
  admitTerminal(workspaceId: string): WorkspaceTerminalAdmission
}

type TargetState = {
  held: boolean
  terminalCreates: number
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

  const grantNextLifecycle = (workspaceId: string, state: TargetState): void => {
    if (state.held || state.terminalCreates > 0) return
    const next = state.waiters.shift()
    if (!next) {
      targets.delete(workspaceId)
      return
    }
    state.held = true
    next(grant(workspaceId, state))
  }

  const grant = (workspaceId: string, state: TargetState): WorkspaceLifecycleLease => {
    let released = false
    return {
      workspaceId,
      release() {
        if (released) return
        released = true
        state.held = false
        grantNextLifecycle(workspaceId, state)
      },
    }
  }

  return {
    acquire(workspaceId) {
      let state = targets.get(workspaceId)
      if (!state) {
        state = { held: false, terminalCreates: 0, waiters: [] }
        targets.set(workspaceId, state)
      }
      if (!state.held && state.terminalCreates === 0) {
        state.held = true
        return Promise.resolve(grant(workspaceId, state))
      }
      return new Promise((resolve) => state!.waiters.push(resolve))
    },
    admitTerminal(workspaceId) {
      let state = targets.get(workspaceId)
      if (!state) {
        state = { held: false, terminalCreates: 0, waiters: [] }
        targets.set(workspaceId, state)
      }
      // Once lifecycle is held or queued, later terminal creates must not enter
      // ahead of it. This both closes the resolve/spawn ABA window and prevents
      // a stream of creates from starving an archive/remove request.
      if (state.held || state.waiters.length > 0) throw blocked()
      state.terminalCreates += 1
      let released = false
      return {
        workspaceId,
        release() {
          if (released) return
          released = true
          state!.terminalCreates -= 1
          grantNextLifecycle(workspaceId, state!)
        },
      }
    },
  }
}
