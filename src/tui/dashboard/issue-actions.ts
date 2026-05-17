import type { IssueCandidate } from "./types"

export type IssueOpenResult = {
  exitCode: number
  lines: string[]
}

export const issueTrackerLabels: Record<IssueCandidate["tracker"], string> = {
  github: "GitHub",
  gitlab: "GitLab",
  gitea: "Gitea",
  jira: "Jira",
}

export async function openWorkspaceIssue(
  workspaceName: string,
  candidate: IssueCandidate
): Promise<IssueOpenResult> {
  const proc = Bun.spawn(["git-stacks", "integration", candidate.tracker, "issue", "open", workspaceName], {
    stdout: "pipe",
    stderr: "pipe",
  })
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ])
  const lines = [...stdout.split("\n"), ...stderr.split("\n")].map(line => line.trim()).filter(Boolean)
  return { exitCode, lines }
}
