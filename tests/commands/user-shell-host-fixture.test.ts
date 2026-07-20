import { afterAll, afterEach, describe, expect, test } from "@test/api"
import { execFile, spawnSync } from "node:child_process"
import { existsSync } from "node:fs"
import { chmod, copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { promisify } from "node:util"
import { spawn as spawnPty } from "node-pty"
import { buildUserShellBootstrap, discoverUserShell, executeUserShellCommand } from "../../packages/core/src/user-shell"
import { createDynamicEnvironmentStore } from "../../packages/service/src/policy/dynamic-environment"

const execFileAsync = promisify(execFile)
const fixtures = join(import.meta.dirname, "../fixtures/user-shell")
const requiredShells = new Set((process.env.GIT_STACKS_REQUIRE_SHELLS ?? "").split(",").filter(Boolean))
const requiredSshAgent = process.env.GIT_STACKS_REQUIRE_SSH_AGENT === "1"
const temporaryRoots = new Set<string>()
const agents: Array<Record<string, string>> = []
const receipt = {
  schema_version: 1,
  host: {
    os: process.platform,
    arch: process.arch,
    runner: process.env.RUNNER_NAME ?? "local",
    commit_sha: process.env.GITHUB_SHA ?? "local",
  },
  shells: [] as Array<{ shell: string; executable: string; version: string; case_counts: Record<string, number> }>,
  ssh: { agent_cases: 0, ssh_add_cases: 0 },
  process_tree: { case_count: 0 },
  skip_count: 0,
  status: "pending",
  timestamp: "",
}

function executable(name: string): string | undefined {
  const found = spawnSync("sh", ["-c", `command -v ${name}`], { encoding: "utf8" })
  return found.status === 0 ? found.stdout.trim() : undefined
}

const availableShells = ["bash", "zsh", "fish"].filter((shell) => executable(shell))
const sshToolsAvailable = ["ssh-agent", "ssh-add", "ssh-keygen"].every((command) => executable(command))

async function root(prefix: string): Promise<string> {
  const value = await mkdtemp(join(tmpdir(), prefix))
  temporaryRoots.add(value)
  return value
}

function parseAgent(output: string): Record<string, string> {
  const socket = output.match(/SSH_AUTH_SOCK=([^;]+);/)?.[1]
  const pid = output.match(/SSH_AGENT_PID=([^;]+);/)?.[1]
  if (!socket || !pid) throw new Error("ssh-agent did not publish a socket and pid")
  return { SSH_AUTH_SOCK: socket, SSH_AGENT_PID: pid }
}

async function startAgent(): Promise<Record<string, string>> {
  const { stdout } = await execFileAsync("ssh-agent", ["-s"])
  const environment = parseAgent(stdout)
  agents.push(environment)
  return environment
}

async function stopAgent(environment: Record<string, string>): Promise<void> {
  await execFileAsync("ssh-agent", ["-k"], { env: { ...process.env, ...environment } }).catch(() => undefined)
}

function quote(value: string): string {
  return `'${value.replaceAll("'", `'"'"'`)}'`
}

async function waitFor(predicate: () => boolean, message: string, timeoutMs = 4_000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (!predicate() && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 10))
  if (!predicate()) throw new Error(message)
}

async function runPty(shellPath: string, environment: NodeJS.ProcessEnv, cwd: string, command: string): Promise<string> {
  const plan = buildUserShellBootstrap(discoverUserShell({ SHELL: shellPath }, "pty"), { mode: "pty" })
  const [file, ...args] = plan.argv
  const terminal = spawnPty(file!, args, {
    cwd,
    env: {
      ...Object.fromEntries(Object.entries(environment).filter((entry): entry is [string, string] => entry[1] !== undefined)),
      TERM: "dumb",
    },
    cols: 100,
    rows: 30,
    name: "dumb",
  })
  let output = ""
  terminal.onData((chunk) => { output += chunk })
  const exited = new Promise<void>((resolve) => terminal.onExit(() => resolve()))
  await new Promise((resolve) => setTimeout(resolve, 200))
  terminal.write(`${command}\r`)
  await new Promise((resolve) => setTimeout(resolve, 20))
  terminal.write("exit\r")
  try {
    await Promise.race([exited, new Promise((_, reject) => setTimeout(() => reject(new Error("PTY fixture timed out")), 5_000))])
  } catch (error) {
    terminal.kill("SIGKILL")
    throw error
  }
  return output
}

afterEach(async () => {
  await Promise.allSettled(agents.splice(0).map(stopAgent))
  await Promise.allSettled([...temporaryRoots].map((path) => rm(path, { recursive: true, force: true })))
  temporaryRoots.clear()
})

afterAll(async () => {
  receipt.skip_count = ["bash", "zsh", "fish"].filter((shell) => !executable(shell)).length
  const requiredComplete = [...requiredShells].every((shell) => receipt.shells.some((entry) => entry.shell === shell))
    && (!requiredSshAgent || (receipt.ssh.agent_cases > 0 && receipt.ssh.ssh_add_cases >= 2))
  const localComplete = availableShells.every((shell) => receipt.shells.some((entry) => entry.shell === shell))
    && (!sshToolsAvailable || receipt.ssh.agent_cases > 0)
    && receipt.process_tree.case_count > 0
  receipt.status = requiredShells.size > 0 || requiredSshAgent
    ? requiredComplete ? "pass" : "fail"
    : localComplete ? "local-capability-aware" : "fail"
  receipt.timestamp = new Date().toISOString()
  if (process.env.GIT_STACKS_SHELL_RECEIPT) {
    await writeFile(process.env.GIT_STACKS_SHELL_RECEIPT, `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o600 })
  }
})

describe("host user-shell fixtures", () => {
  for (const shell of ["bash", "zsh", "fish"] as const) {
    const path = executable(shell)
    if (!path && !requiredShells.has(shell)) console.warn(`CAPABILITY_SKIP shell=${shell} reason=executable-unavailable`)
    test.skipIf(!path && !requiredShells.has(shell))(`${shell} adapter and PTY preserve profile commands, runtime PATH, quoting, and exit`, async () => {
      expect(path, `${shell} is required on this host`).toBeTruthy()
      const home = await root(`git-stacks-${shell}-profile-`)
      const marker = "quoted value with spaces and ' apostrophe"
      let environment: NodeJS.ProcessEnv = { ...process.env, HOME: home }
      const runtimeDirectory = join(home, ".phase124-nvm", "bin")
      await mkdir(runtimeDirectory, { recursive: true })
      const runtime = join(runtimeDirectory, "phase124_runtime")
      await writeFile(runtime, `#!/bin/sh\nprintf 'runtime:${shell}\\n'\n`)
      await chmod(runtime, 0o700)
      if (shell === "bash") {
        await copyFile(join(fixtures, "bash-init.sh"), join(home, ".bash_profile"))
      } else if (shell === "zsh") {
        await copyFile(join(fixtures, "zsh-init.zsh"), join(home, ".zprofile"))
        environment = { ...environment, ZDOTDIR: home }
      } else {
        const config = join(home, "fish")
        await mkdir(config, { recursive: true })
        await copyFile(join(fixtures, "fish-init.fish"), join(config, "config.fish"))
        environment = { ...environment, XDG_CONFIG_HOME: home }
      }
      const command = `phase124_alias; phase124_function ${JSON.stringify(marker)}; phase124_runtime; printf 'identity:%s\\n' "$PHASE124_PROFILE_SHELL"; exit 17`
      const result = await executeUserShellCommand({ command, cwd: home, shellEnvironment: { ...environment, SHELL: path }, inheritedEnvironment: environment })
      const stdout = result.stdout.toString("utf8")
      expect(result.exitCode).toBe(17)
      expect(stdout).toContain(`alias:${shell}`)
      expect(stdout).toContain(`function:${shell}:${marker}`)
      expect(stdout).toContain(`runtime:${shell}`)
      expect(stdout).toContain(`identity:${shell}`)
      expect(stdout).not.toContain("phase124-pty-startup")
      expect(stdout).not.toMatch(/\u001b|\[[0-9;?]*[A-Za-z]/)
      const ptyOutput = await runPty(path!, environment, home, "printf 'phase124-pty-command\\n'")
      expect(ptyOutput).toContain(`phase124-pty-startup:${shell}`)
      expect(ptyOutput).toContain("phase124-pty-command")
      const version = spawnSync(path!, ["--version"], { encoding: "utf8" }).stdout.split("\n")[0]?.trim() || shell
      receipt.shells.push({ shell, executable: path!, version, case_counts: { profile: 1, quoting: 1, runtime_path: 1, exit: 1, pty: 1 } })
    })
  }

  test.skipIf(!executable("bash"))("Bash rejects imported bootstrap-function interception while preserving profile commands", async () => {
    const bash = executable("bash")!
    const home = await root("git-stacks-bash-imported-functions-")
    await copyFile(join(fixtures, "bash-init.sh"), join(home, ".bash_profile"))
    const interceptionMarker = join(home, "intercepted")
    const environment = {
      ...process.env,
      HOME: home,
      "BASH_FUNC_command%%": `() { printf command >> ${quote(interceptionMarker)}; return 0; }`,
      "BASH_FUNC_read%%": `() { printf read >> ${quote(interceptionMarker)}; return 0; }`,
      "BASH_FUNC_export%%": `() { printf export >> ${quote(interceptionMarker)}; return 0; }`,
      "BASH_FUNC_rm%%": `() { printf rm >> ${quote(interceptionMarker)}; return 0; }`,
      "BASH_FUNC_sleep%%": `() { printf sleep >> ${quote(interceptionMarker)}; return 0; }`,
      "BASH_FUNC_eval%%": `() { printf eval >> ${quote(interceptionMarker)}; return 0; }`,
      "BASH_FUNC_exit%%": `() { printf exit >> ${quote(interceptionMarker)}; return 0; }`,
      "BASH_FUNC_unrelated%%": `() { printf unrelated >> ${quote(interceptionMarker)}; return 0; }`,
    }
    const result = await executeUserShellCommand({
      command: "phase124_alias; phase124_function imported-safe; printf 'overlay:%s\\n' \"$PHASE124_IMPORTED_OVERLAY\"; exit 23",
      cwd: home,
      shellEnvironment: { ...environment, SHELL: bash },
      inheritedEnvironment: environment,
      overlay: { PHASE124_IMPORTED_OVERLAY: "authoritative" },
    })

    expect(result.exitCode).toBe(23)
    expect(result.stdout.toString("utf8")).toContain("alias:bash")
    expect(result.stdout.toString("utf8")).toContain("function:bash:imported-safe")
    expect(result.stdout.toString("utf8")).toContain("overlay:authoritative")
    expect(existsSync(interceptionMarker)).toBe(false)
  })

  if (!sshToolsAvailable && !requiredSshAgent) console.warn("CAPABILITY_SKIP ssh-agent reason=openssh-tools-unavailable")
  test.skipIf(!sshToolsAvailable && !requiredSshAgent)("two real agents preserve process A while future PTY and non-PTY launches rotate to process B", async () => {
    expect(sshToolsAvailable, "OpenSSH host fixtures are required").toBe(true)
    const fixtureRoot = await root("git-stacks-ssh-rotation-")
    const agentA = await startAgent()
    const agentB = await startAgent()
    const keyA = join(fixtureRoot, "agent-a")
    const keyB = join(fixtureRoot, "agent-b")
    await execFileAsync("ssh-keygen", ["-q", "-t", "ed25519", "-C", "phase124-agent-a", "-N", "", "-f", keyA])
    await execFileAsync("ssh-keygen", ["-q", "-t", "ed25519", "-C", "phase124-agent-b", "-N", "", "-f", keyB])
    await execFileAsync("ssh-add", [keyA], { env: { ...process.env, ...agentA } })
    await execFileAsync("ssh-add", [keyB], { env: { ...process.env, ...agentB } })
    const bash = executable("bash")!
    const release = join(fixtureRoot, "release-a")
    const serviceEnvironment = createDynamicEnvironmentStore({ PATH: process.env.PATH, SSH_AUTH_SOCK: agentA.SSH_AUTH_SOCK })
    const processAController = new AbortController()
    let outputA = ""
    let processAError: unknown
    const processA = executeUserShellCommand({
      command: `ssh-add -l | grep -q phase124-agent-a && printf 'agent:A:before\\n'; while [ ! -e ${quote(release)} ]; do sleep 0.02; done; ssh-add -l | grep -q phase124-agent-a && printf 'agent:A:after\\n'`,
      cwd: fixtureRoot,
      shellEnvironment: { ...process.env, SHELL: bash },
      inheritedEnvironment: process.env,
      overlay: { ...serviceEnvironment.snapshot() },
      signal: processAController.signal,
      onOutput: ({ chunk }) => { outputA += Buffer.from(chunk).toString("utf8") },
    }).catch((error) => { processAError = error; return undefined })
    try {
      await waitFor(() => outputA.includes("agent:A:before") || processAError !== undefined, "process A did not validate agent A")
      if (processAError) throw processAError
      serviceEnvironment.replace({ PATH: process.env.PATH, SSH_AUTH_SOCK: agentB.SSH_AUTH_SOCK })
      const outputB = await executeUserShellCommand({
        command: "ssh-add -l | grep -q phase124-agent-b && printf 'agent:B:command\\n'",
        cwd: fixtureRoot,
        shellEnvironment: { ...process.env, SHELL: bash },
        inheritedEnvironment: process.env,
        overlay: { ...serviceEnvironment.snapshot() },
      })
      const ptyB = await runPty(bash, { ...process.env, ...serviceEnvironment.snapshot() }, fixtureRoot, "ssh-add -l | grep -q phase124-agent-b && printf 'agent:B:pty\\n'")
      await writeFile(release, "release\n")
      expect((await processA)?.exitCode).toBe(0)
      expect(outputA).toContain("agent:A:before")
      expect(outputA).toContain("agent:A:after")
      expect(outputB.stdout.toString("utf8")).toContain("agent:B:command")
      expect(ptyB).toContain("agent:B:pty")
      serviceEnvironment.replace({ PATH: process.env.PATH })
      const inheritedWithoutSocket = { ...process.env }
      delete inheritedWithoutSocket.SSH_AUTH_SOCK
      const cleared = await executeUserShellCommand({
        command: "ssh-add -l",
        cwd: fixtureRoot,
        shellEnvironment: { ...process.env, SHELL: bash },
        inheritedEnvironment: inheritedWithoutSocket,
        overlay: { ...serviceEnvironment.snapshot() },
      })
      expect(cleared.exitCode).not.toBe(0)
      receipt.ssh.agent_cases = 2
      receipt.ssh.ssh_add_cases = 4
    } finally {
      await writeFile(release, "release\n").catch(() => undefined)
      const stopped = await Promise.race([
        processA.then(() => true),
        new Promise<false>((resolve) => setTimeout(() => resolve(false), 2_000)),
      ])
      if (!stopped) processAController.abort()
      await processA
    }
  })

  test.skipIf(!executable("bash"))("cancellation removes a real host command child and grandchild", async () => {
    const fixtureRoot = await root("git-stacks-shell-tree-")
    const childFile = join(fixtureRoot, "child.pid")
    const grandchildFile = join(fixtureRoot, "grandchild.pid")
    const controller = new AbortController()
    let executionError: unknown
    const execution = executeUserShellCommand({
      command: `sh -c 'trap "" TERM; sleep 60 & echo $! > "$GRANDCHILD_FILE"; wait' & echo $! > "$CHILD_FILE"; wait`,
      cwd: fixtureRoot,
      shellEnvironment: { ...process.env, SHELL: executable("bash") },
      inheritedEnvironment: process.env,
      overlay: { CHILD_FILE: childFile, GRANDCHILD_FILE: grandchildFile },
      signal: controller.signal,
    }).catch((error) => { executionError = error; return undefined })
    await waitFor(() => existsSync(childFile) && existsSync(grandchildFile) || executionError !== undefined, "process tree fixture did not start")
    if (executionError) throw executionError
    controller.abort()
    expect(await execution).toBeUndefined()
    expect(executionError).toMatchObject({ diagnostic: { category: "cancellation" } })
    const childPid = Number((await readFile(childFile, "utf8")).trim())
    const grandchildPid = Number((await readFile(grandchildFile, "utf8")).trim())
    const pids = [childPid, grandchildPid]
    const alive = (pid: number) => {
      try { process.kill(pid, 0) } catch { return false }
      const state = spawnSync("ps", ["-o", "stat=", "-p", String(pid)], { encoding: "utf8" })
      return state.status === 0 && !state.stdout.trim().startsWith("Z")
    }
    await waitFor(() => pids.every((pid) => !alive(pid)), "cancelled process tree still has live descendants")
    receipt.process_tree.case_count = 1
  })
})
