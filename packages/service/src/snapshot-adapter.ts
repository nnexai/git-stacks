import type { z } from "zod"

import type {
  TerminalLaunchResolution,
  TerminalLaunchResolutionRequestSchema,
  WorkspaceCatalog,
  WorkspaceSnapshotResponse,
} from "@git-stacks/protocol"

export type SnapshotAdapter = {
  buildAll(signal?: AbortSignal): Promise<WorkspaceSnapshotResponse[]>
  buildWorkspace(name: string, requestId?: string, signal?: AbortSignal): Promise<WorkspaceSnapshotResponse>
  buildCatalog?(signal?: AbortSignal): Promise<WorkspaceCatalog>
  resolveTerminalLaunch?(request: z.infer<typeof TerminalLaunchResolutionRequestSchema>, signal?: AbortSignal): Promise<TerminalLaunchResolution>
  currentRevision?(): Promise<string>
}
