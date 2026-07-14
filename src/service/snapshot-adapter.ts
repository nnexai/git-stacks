import type { z } from "zod"
import type {
  TerminalLaunchResolution,
  TerminalLaunchResolutionRequestSchema,
  WorkspaceSnapshotResponse,
} from "../lib/service/contract"

export type SnapshotAdapter = {
  buildAll(signal?: AbortSignal): Promise<WorkspaceSnapshotResponse[]>
  buildWorkspace(name: string, requestId?: string, signal?: AbortSignal): Promise<WorkspaceSnapshotResponse>
  resolveTerminalLaunch?(request: z.infer<typeof TerminalLaunchResolutionRequestSchema>, signal?: AbortSignal): Promise<TerminalLaunchResolution>
  currentRevision?(): Promise<string>
}
