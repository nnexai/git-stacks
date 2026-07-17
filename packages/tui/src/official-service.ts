import {
  cancelWebOperation,
  fetchStaleWorkspaceEvaluation,
  fetchWebOperation,
  fetchWorkspaceActionInventory,
  fetchWorkspaceFileStatusProjection,
  fetchWorkspaceNotesProjection,
  resolveForgeSourceReview,
  runWorkspaceLifecycleMutation,
  setWorkspacePins,
  submitWebOperation,
} from "@git-stacks/service/client"

/** Typed bridge for the browser-safe service projection and operation APIs. */
export const officialService = {
  cancelWebOperation,
  fetchStaleWorkspaceEvaluation,
  fetchWebOperation,
  fetchWorkspaceActionInventory,
  fetchWorkspaceFileStatusProjection,
  fetchWorkspaceNotesProjection,
  resolveForgeSourceReview,
  runWorkspaceLifecycleMutation,
  setWorkspacePins,
  submitWebOperation,
}
