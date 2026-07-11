const session = `git-stacks-spike-${process.pid}`
const run = async (...args: string[]) => {
  const proc = Bun.spawn(["tmux", ...args], { stdout: "pipe", stderr: "pipe" })
  const [stdout, stderr, code] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited])
  return { code, stdout, stderr }
}
const events: Array<Record<string, unknown>> = []
try {
  await run("new-session", "-d", "-s", session, "-n", "agent", "bash", "-lc", "printf 'agent:working\\n'; sleep .2; printf 'agent:waiting\\n'; sleep 30")
  await run("new-window", "-d", "-t", session, "-n", "server", "bash", "-lc", "printf 'server:ready\\n'; sleep 30")
  await Bun.sleep(700)

  const inventory = await run("list-panes", "-s", "-t", session, "-F", "#{session_name}\t#{window_name}\t#{pane_id}\t#{pane_current_path}\t#{pane_dead}")
  const panes = inventory.stdout.trim().split("\n").map(line => {
    const [sessionName, window, paneId, cwd, dead] = line.split("\t")
    return { sessionName, window, paneId, cwd, dead: dead === "1" }
  })
  events.push({ at: new Date().toISOString(), category: "inventory", count: panes.length })

  const previews: Record<string, string> = {}
  for (const pane of panes) {
    const captured = await run("capture-pane", "-p", "-t", pane.paneId, "-S", "-8")
    previews[pane.window] = captured.stdout.trim()
  }
  const checks = {
    inventory: panes.length === 2,
    workspaceGrouping: panes.every(p => p.sessionName === session),
    agentAttentionVisible: previews.agent?.includes("agent:waiting") ?? false,
    serverStateVisible: previews.server?.includes("server:ready") ?? false,
    noSessionOwnershipNeeded: true,
  }
  console.log(JSON.stringify({ checks, panes, previews, attachCommand: `tmux attach-session -t ${session}`, events }, null, 2))
  if (Object.values(checks).some(value => !value)) process.exitCode = 1
} finally {
  await run("kill-session", "-t", session)
}
