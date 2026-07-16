import {
  DynamicEnvironmentRefreshResultSchema,
  DynamicEnvironmentRefreshSchema,
  type DynamicEnvironmentKey,
  type DynamicEnvironmentRefresh,
  type DynamicEnvironmentRefreshResult,
} from "@git-stacks/protocol"

export type DynamicEnvironmentSnapshot = Readonly<DynamicEnvironmentRefresh>

export interface DynamicEnvironmentStore {
  replace(value: DynamicEnvironmentRefresh): DynamicEnvironmentRefreshResult
  snapshot(): DynamicEnvironmentSnapshot
}

const keys = ["PATH", "SSH_AUTH_SOCK"] as const satisfies readonly DynamicEnvironmentKey[]

function immutable(value: DynamicEnvironmentRefresh): DynamicEnvironmentSnapshot {
  return Object.freeze({
    ...(value.PATH !== undefined ? { PATH: value.PATH } : {}),
    ...(value.SSH_AUTH_SOCK !== undefined ? { SSH_AUTH_SOCK: value.SSH_AUTH_SOCK } : {}),
  })
}

export function createDynamicEnvironmentStore(initial: DynamicEnvironmentRefresh = {}): DynamicEnvironmentStore {
  let current = immutable(DynamicEnvironmentRefreshSchema.parse(initial))
  return {
    replace(value) {
      const next = immutable(DynamicEnvironmentRefreshSchema.parse(value))
      current = next
      return DynamicEnvironmentRefreshResultSchema.parse({
        updated: keys.filter((key) => next[key] !== undefined),
        cleared: keys.filter((key) => next[key] === undefined),
      })
    },
    snapshot: () => immutable(current),
  }
}
