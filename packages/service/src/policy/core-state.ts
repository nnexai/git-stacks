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
import { SnapshotBusyError, workspaceActivityAt } from "./snapshot"
import { getWorkspaceNoteSummary, listWorkspaceNotes, type WorkspaceNoteRecord } from "@git-stacks/core/notes"
import type { ArchivedWorkspaceSummary, WorkspaceCatalog, WorkspaceSnapshotResponse } from "@git-stacks/protocol"

type CoreSnapshotSource = {
  buildAll(signal?: AbortSignal): Promise<WorkspaceSnapshotResponse[]>
  buildCatalog?(signal?: AbortSignal): Promise<WorkspaceCatalog>
  /** Revision of the last completed authoritative catalog, if one exists. */
  cachedRevision?(): string | undefined
}

export interface CoreStateProvider {
  build(signal?: AbortSignal): Promise<CoreState>
  /** Seed a revision-bound read model from an already-authoritative snapshot. */
  seed?(catalog: WorkspaceCatalog): Promise<void>
  cached?(revision: string): Promise<CoreState | undefined>
  editTarget(request: EditTargetRequest): EditTarget
  noteCount(workspace: string): Promise<number>
  notes(workspace: string, limit?: number): Promise<WorkspaceNoteRecord[]>
}

/**
 * Holds one materialized state for latency-sensitive workspace action reads.
 *
 * A source revision check makes the entry advisory: it is never used after the
 * authoritative snapshot has advanced. Generations prevent slower builds from
 * replacing newer results, while monotonic revision admission rejects late
 * seeds from an older authoritative generation.
 */
export class RevisionBoundCoreStateCache {
  private generation = 0
  private entry: { generation: number; state: CoreState } | undefined
  private latestRevision: string | undefined

  beginGeneration(): number {
    return ++this.generation
  }

  replaceIfCurrent(generation: number, state: CoreState): void {
    if (generation !== this.generation || this.isOlderThanLatest(state.revision)) return
    this.latestRevision = state.revision
    this.entry = { generation, state }
  }

  async current(revision: string, cachedRevision?: () => string | undefined): Promise<CoreState | undefined> {
    const entry = this.entry
    if (!entry || entry.state.revision !== revision || !cachedRevision) return undefined
    const authoritativeRevision = cachedRevision()
    if (authoritativeRevision === undefined) return undefined
    this.observeRevision(authoritativeRevision)
    if (this.entry !== entry) return undefined
    return authoritativeRevision === revision ? entry.state : undefined
  }

  private isOlderThanLatest(revision: string): boolean {
    return this.latestRevision !== undefined && BigInt(revision) < BigInt(this.latestRevision)
  }

  private observeRevision(revision: string): void {
    if (this.isOlderThanLatest(revision) || revision === this.latestRevision) return
    this.latestRevision = revision
    this.generation += 1
    if (this.entry?.state.revision !== revision) this.entry = undefined
  }
}

export function createCoreStateProvider(snapshot: CoreSnapshotSource): CoreStateProvider {
  const cache = new RevisionBoundCoreStateCache()

  const materialize = (catalog: WorkspaceCatalog | undefined, projections: WorkspaceSnapshotResponse[]): CoreState | undefined => {
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
    if (!namesMatch) return undefined

    const archivedWorkspaces: ArchivedWorkspaceSummary[] = catalog?.archived_workspaces ?? definitions
      .filter((workspace): workspace is typeof workspace & { id: string; archived_at: string } => workspace.archived === true && workspace.id !== undefined && workspace.archived_at !== undefined)
      .map((workspace) => ({
        id: workspace.id,
        name: workspace.name,
        activity_at: Date.parse(workspace.archived_at) >= Date.parse(workspaceActivityAt(workspace))
          ? workspace.archived_at
          : workspaceActivityAt(workspace),
      }))
      .sort((left, right) => Date.parse(right.activity_at) - Date.parse(left.activity_at) || left.name.localeCompare(right.name) || left.id.localeCompare(right.id))
    const revision = catalog?.revision ?? projections[0]?.revision ?? "0"
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

  return {
    async build(signal) {
      const generation = cache.beginGeneration()
      for (let attempt = 1; attempt <= 3; attempt += 1) {
        signal?.throwIfAborted()
        const catalog = await snapshot.buildCatalog?.(signal)
        const projections = catalog?.workspaces ?? await snapshot.buildAll(signal)
        const state = materialize(catalog, projections)
        if (!state) continue
        cache.replaceIfCurrent(generation, state)
        return state
      }
      throw new SnapshotBusyError(3)
    },

    async seed(catalog) {
      const generation = cache.beginGeneration()
      const state = materialize(catalog, catalog.workspaces)
      if (!state || state.revision !== catalog.revision) throw new SnapshotBusyError(1)
      cache.replaceIfCurrent(generation, state)
    },

    cached(revision) { return cache.current(revision, snapshot.cachedRevision) },

    editTarget(request) {
      if (request.kind === "registry") return EditTargetSchema.parse({ kind: request.kind, path: REGISTRY_FILE })
      const path = request.kind === "workspace" ? workspaceFilePath(request.name) : templatePath(request.name)
      if (!existsSync(path)) throw new Error(`${request.kind} '${request.name}' not found`)
      return EditTargetSchema.parse({ kind: request.kind, name: request.name, path })
    },

    async noteCount(workspace) {
      workspaceFilePath(workspace)
      return (await getWorkspaceNoteSummary(workspace)).count
    },

    notes(workspace, limit = 5) {
      workspaceFilePath(workspace)
      return listWorkspaceNotes(workspace, { limit })
    },
  }
}
