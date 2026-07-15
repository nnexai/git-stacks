import { z } from "zod"

import {
  GlobalConfigSchema,
  RepoRegistryEntrySchema,
  TemplateSchema,
  WorkspaceSchema,
} from "@git-stacks/core/config"
import { RevisionSchema, TimestampSchema, WorkspaceSnapshotSchema } from "@git-stacks/protocol"

/**
 * Trusted read model consumed by first-party machine-local clients.
 *
 * The browser intentionally does not receive this shape. Its browser projection
 * projection remains a path- and secret-minimising boundary, while the TUI and
 * future first-party clients can use one complete service-owned model instead
 * of reading YAML, the filesystem, and Git independently.
 */
export const CoreRepositorySchema = RepoRegistryEntrySchema.extend({
  disk_exists: z.boolean(),
})

export const CoreWorkspaceSchema = z.strictObject({
  definition: WorkspaceSchema,
  projection: WorkspaceSnapshotSchema,
})

export const CoreStateSchema = z.strictObject({
  revision: RevisionSchema,
  generated_at: TimestampSchema,
  config: GlobalConfigSchema,
  workspaces: z.array(CoreWorkspaceSchema),
  templates: z.array(TemplateSchema),
  repositories: z.array(CoreRepositorySchema),
})

export type CoreRepository = z.infer<typeof CoreRepositorySchema>
export type CoreWorkspace = z.infer<typeof CoreWorkspaceSchema>
export type CoreState = z.infer<typeof CoreStateSchema>

export const EditTargetRequestSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("workspace"), name: z.string().min(1) }),
  z.strictObject({ kind: z.literal("template"), name: z.string().min(1) }),
  z.strictObject({ kind: z.literal("registry") }),
])

export const EditTargetSchema = z.strictObject({
  path: z.string().min(1),
  kind: z.enum(["workspace", "template", "registry"]),
  name: z.string().min(1).optional(),
})

export type EditTargetRequest = z.infer<typeof EditTargetRequestSchema>
export type EditTarget = z.infer<typeof EditTargetSchema>

const WorkspaceOptionsSchema = z.record(z.string(), z.unknown()).optional()
export const WorkspaceMutationRequestSchema = z.strictObject({
  workspace: z.string().min(1),
  options: WorkspaceOptionsSchema,
})
export const WorkspaceRenameRequestSchema = z.strictObject({
  workspace: z.string().min(1),
  new_name: z.string().min(1),
  options: WorkspaceOptionsSchema,
})
export const WorkspaceLabelsRequestSchema = z.strictObject({
  workspace: z.string().min(1),
  labels: z.array(z.string().regex(/^[A-Za-z0-9._:-]+$/)).max(16),
})
export const WorkspaceCommandRequestSchema = z.strictObject({
  workspace: z.string().min(1),
  command: z.string().min(1),
})
export const WorkspaceIssueRequestSchema = z.strictObject({
  workspace: z.string().min(1),
  tracker: z.enum(["github", "gitlab", "gitea", "jira"]),
})
export const TemplateWriteRequestSchema = z.strictObject({ template: TemplateSchema })
export const TemplateCloneRequestSchema = z.strictObject({
  template: z.string().min(1),
  new_name: z.string().min(1),
})
export const TemplateDeleteRequestSchema = z.strictObject({ template: z.string().min(1) })
export const RepositoryDeleteRequestSchema = z.strictObject({ repository: z.string().min(1) })

export const CoreMutationSchemas = {
  "workspace.open": WorkspaceMutationRequestSchema,
  "workspace.close": WorkspaceMutationRequestSchema,
  "workspace.clean": WorkspaceMutationRequestSchema,
  "workspace.remove": WorkspaceMutationRequestSchema,
  "workspace.merge": WorkspaceMutationRequestSchema,
  "workspace.sync": WorkspaceMutationRequestSchema,
  "workspace.push": WorkspaceMutationRequestSchema,
  "workspace.rename": WorkspaceRenameRequestSchema,
  "workspace.labels.set": WorkspaceLabelsRequestSchema,
  "workspace.command.run": WorkspaceCommandRequestSchema,
  "workspace.issue.open": WorkspaceIssueRequestSchema,
  "template.write": TemplateWriteRequestSchema,
  "template.clone": TemplateCloneRequestSchema,
  "template.delete": TemplateDeleteRequestSchema,
  "repository.delete": RepositoryDeleteRequestSchema,
} as const

export type CoreMutationName = keyof typeof CoreMutationSchemas
export type CoreMutationRequest<Name extends CoreMutationName> = z.infer<(typeof CoreMutationSchemas)[Name]>
