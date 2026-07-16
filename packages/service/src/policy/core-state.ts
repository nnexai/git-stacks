import { existsSync } from "node:fs"

import {
  listRegistryEntries,
  listTemplatesUncached,
  listWorkspacesUncached,
  readGlobalConfig,
  templatePath,
  workspaceFilePath,
} from "@git-stacks/core/config"
import { REGISTRY_FILE } from "@git-stacks/core/paths"
import {
  CoreStateSchema,
  EditTargetSchema,
  type CoreState,
  type EditTarget,
  type EditTargetRequest,
} from "./core-contract"
import { SnapshotBusyError } from "./snapshot"
import { listWorkspaceNotes, type WorkspaceNoteRecord } from "@git-stacks/core/notes"
import type { ArchivedWorkspaceSummary, WorkspaceCatalog, WorkspaceSnapshotResponse } from "@git-stacks/protocol"

type CoreSnapshotSource = {
  buildAll(signal?: AbortSignal): Promise<WorkspaceSnapshotResponse[]>
  buildCatalog?(signal?: AbortSignal): Promise<WorkspaceCatalog>
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
        const catalog = await snapshot.buildCatalog?.(signal)
        const projections = catalog?.workspaces ?? await snapshot.buildAll(signal)
        const definitions = listWorkspacesUncached()
        const activeDefinitions = definitions.filter((workspace) => workspace.archived !== true)
        const definitionsByName = new Map(activeDefinitions.map((workspace) => [workspace.name, workspace]))
        const workspaces = projections.flatMap(({ workspace: projection }) => {
          const definition = definitionsByName.get(projection.name)
          return definition ? [{ definition, projection }] : []
        })
        const namesMatch = workspaces.length === projections.length
          && activeDefinitions.length === projections.length
          && workspaces.every(({ definition, projection }) => definition.id === projection.id)
        if (!namesMatch) continue

        const archivedWorkspaces: ArchivedWorkspaceSummary[] = catalog?.archived_workspaces ?? definitions
          .filter((workspace): workspace is typeof workspace & { id: string; archived_at: string } => workspace.archived === true && workspace.id !== undefined && workspace.archived_at !== undefined)
          .map((workspace) => ({
            id: workspace.id,
            name: workspace.name,
            activity_at: Date.parse(workspace.archived_at) >= Date.parse(workspace.last_opened ?? workspace.created)
              ? workspace.archived_at
              : workspace.last_opened ?? workspace.created,
          }))
          .sort((left, right) => Date.parse(right.activity_at) - Date.parse(left.activity_at) || left.name.localeCompare(right.name) || left.id.localeCompare(right.id))
        const revision = catalog?.revision ?? projections[0]?.revision ?? await snapshot.currentRevision?.() ?? "0"
        const generatedAt = catalog?.generated_at ?? projections[0]?.generated_at ?? new Date().toISOString()
        return CoreStateSchema.parse({
          revision,
          generated_at: generatedAt,
          config: readGlobalConfig(),
          workspaces,
          archived_workspaces: archivedWorkspaces,
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
