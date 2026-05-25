import type { IssueCandidate } from "./types"
import type { CommandOutputLine } from "./command-output"

export type IssueOpenResult = {
  exitCode: number
  lines: CommandOutputLine[]
}

export const issueTrackerLabels: Record<IssueCandidate["tracker"], string> = {
  github: "GitHub",
  gitlab: "GitLab",
  gitea: "Gitea",
  jira: "Jira",
}

export const _exec = {
  spawn: Bun.spawn,
}

export async function openWorkspaceIssue(
  workspaceName: string,
  candidate: IssueCandidate
): Promise<IssueOpenResult> {
  const args = ["git-stacks", "integration", candidate.tracker, "issue", "open", workspaceName]
  if (candidate.tracker !== "jira") args.push("--web")
  const proc = _exec.spawn(args, {
    stdout: "pipe",
    stderr: "pipe",
  })
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ])
  const lines: CommandOutputLine[] = [
    ...stdout.split("\n").map(line => ({ text: line.trim(), stream: "stdout" as const })),
    ...stderr.split("\n").map(line => ({ text: line.trim(), stream: "stderr" as const })),
  ].filter(line => line.text)
  return { exitCode, lines }
}
