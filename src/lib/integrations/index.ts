import { vscodeIntegration } from "./vscode"
import { intellijIntegration } from "./intellij"
import { cmuxIntegration } from "./cmux"
import { tmuxIntegration } from "./tmux"

export { type Integration, type IntegrationContext, type IntegrationArtifact, type ArtifactBag, resolveEnabledGlobally } from "./types"

/**
 * All registered integrations, in the order they run (generate → open).
 * Add new integrations here and in their own file — no other files need touching.
 */
export const integrations = [vscodeIntegration, intellijIntegration, cmuxIntegration, tmuxIntegration]
