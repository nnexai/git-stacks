import { vscodeIntegration } from "./vscode"
import { intellijIntegration } from "./intellij"
import { cmuxIntegration } from "./cmux"
import { tmuxIntegration } from "./tmux"
import { niriIntegration } from "./niri"
import { aerospaceIntegration } from "./aerospace"
import { githubIntegration } from "./github"
import { gitlabIntegration } from "./gitlab"
import { giteaIntegration } from "./gitea"
import { jiraIntegration } from "./jira"

export { type Integration, type IntegrationContext, type IntegrationArtifact, type ArtifactBag, resolveEnabledGlobally } from "./types"

/**
 * All registered integrations, in the order they run (generate → open).
 * Add new integrations here and in their own file — no other files need touching.
 */
export const integrations = [
  vscodeIntegration, intellijIntegration, cmuxIntegration, tmuxIntegration, niriIntegration, aerospaceIntegration,
  githubIntegration, gitlabIntegration, giteaIntegration, jiraIntegration,
]
