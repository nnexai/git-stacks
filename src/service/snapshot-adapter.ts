import type { z } from "zod"
import type {
  NativeLaunchResolution,
  NativeLaunchResolutionRequestSchema,
  WorkspaceSnapshotResponse,
} from "../lib/service/contract"

export type SnapshotAdapter = {
  buildAll(signal?: AbortSignal): Promise<WorkspaceSnapshotResponse[]>
  buildWorkspace(name: string, requestId?: string, signal?: AbortSignal): Promise<WorkspaceSnapshotResponse>
  resolveNativeLaunch?(request: z.infer<typeof NativeLaunchResolutionRequestSchema>, signal?: AbortSignal): Promise<NativeLaunchResolution>
  currentRevision?(): Promise<string>
}
