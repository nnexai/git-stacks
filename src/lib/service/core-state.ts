import { existsSync } from "node:fs"
import {
  listRegistryEntries,
  listTemplatesUncached,
  listWorkspacesUncached,
  readGlobalConfig,
  templatePath,
  workspaceFilePath,
} from "../config"
import { REGISTRY_FILE } from "../paths"
import {
  CoreStateSchema,
  EditTargetSchema,
  type CoreState,
  type EditTarget,
  type EditTargetRequest,
} from "./core-contract"
import { SnapshotBusyError } from "./snapshot"
import { listWorkspaceNotes, type WorkspaceNoteRecord } from "../notes"
import type { WorkspaceSnapshotResponse } from "./contract"

type CoreSnapshotSource = {
  buildAll(signal?: AbortSignal): Promise<WorkspaceSnapshotResponse[]>
  currentRevision?(): Promise<string>
}

export interface CoreStateProvider {
  build(signal?: AbortSignal): Promise<CoreState>
  editTarget(request: EditTargetRequest): EditTarget
  notes(workspace: string, limit?: number): Promise<WorkspaceNoteRecord[]>
}

export function createCoreStateProvider(snapshot: CoreSnapshotSource): CoreStateProvider {
  return {
    async build(signal) {
      for (let attempt = 1; attempt <= 3; attempt += 1) {
        signal?.throwIfAborted()
        const projections = await snapshot.buildAll(signal)
        const definitions = listWorkspacesUncached()
        const definitionsByName = new Map(definitions.map((workspace) => [workspace.name, workspace]))
        const workspaces = projections.flatMap(({ workspace: projection }) => {
          const definition = definitionsByName.get(projection.name)
          return definition ? [{ definition, projection }] : []
        })
        const namesMatch = workspaces.length === projections.length
          && definitions.length === projections.length
          && workspaces.every(({ definition, projection }) => definition.id === projection.id)
        if (!namesMatch) continue

        const revision = projections[0]?.revision ?? await snapshot.currentRevision?.() ?? "0"
        const generatedAt = projections[0]?.generated_at ?? new Date().toISOString()
        return CoreStateSchema.parse({
          revision,
          generated_at: generatedAt,
          config: readGlobalConfig(),
          workspaces,
          templates: listTemplatesUncached(),
          repositories: listRegistryEntries().map((repository) => ({
            ...repository,
            disk_exists: existsSync(repository.local_path),
          })),
        })
      }
      throw new SnapshotBusyError(3)
    },

    editTarget(request) {
      if (request.kind === "registry") return EditTargetSchema.parse({ kind: request.kind, path: REGISTRY_FILE })
      const path = request.kind === "workspace" ? workspaceFilePath(request.name) : templatePath(request.name)
      if (!existsSync(path)) throw new Error(`${request.kind} '${request.name}' not found`)
      return EditTargetSchema.parse({ kind: request.kind, name: request.name, path })
    },

    notes(workspace, limit = 5) {
      workspaceFilePath(workspace)
      return listWorkspaceNotes(workspace, { limit })
    },
  }
}
