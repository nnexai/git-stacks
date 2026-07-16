import { afterEach, describe, expect, test } from "@test/api"
import { execFile, spawn, spawnSync } from "node:child_process"
import { copyFile, mkdir, mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { promisify } from "node:util"

const execFileAsync = promisify(execFile)
const fixtures = join(import.meta.dirname, "../fixtures/user-shell")
const required = process.env.GIT_STACKS_REQUIRE_HOST_SHELLS === "1"
const temporaryRoots = new Set<string>()
const agents: Array<Record<string, string>> = []

function executable(name: string): string | undefined {
  const found = spawnSync("sh", ["-c", `command -v ${name}`], { encoding: "utf8" })
  return found.status === 0 ? found.stdout.trim() : undefined
}

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

afterEach(async () => {
  await Promise.allSettled(agents.splice(0).map(stopAgent))
  await Promise.allSettled([...temporaryRoots].map((path) => rm(path, { recursive: true, force: true })))
  temporaryRoots.clear()
})

describe("host user-shell fixtures", () => {
  for (const shell of ["bash", "zsh", "fish"] as const) {
    const path = executable(shell)
    test.skipIf(!path && !required)(`${shell} interactive-login startup preserves aliases, functions, runtime PATH, quoting, and identity`, async () => {
      expect(path, `${shell} is required on this host`).toBeTruthy()
      const home = await root(`git-stacks-${shell}-profile-`)
      const marker = "quoted value with spaces and ' apostrophe"
      let args: string[]
      let environment: NodeJS.ProcessEnv = { ...process.env, HOME: home }
      if (shell === "bash") {
        await copyFile(join(fixtures, "bash-init.sh"), join(home, ".bash_profile"))
        args = ["-lic", `phase124_alias; phase124_function ${JSON.stringify(marker)}; printf 'path:%s\\nidentity:%s\\n' "$PATH" "$PHASE124_PROFILE_SHELL"`]
      } else if (shell === "zsh") {
        await copyFile(join(fixtures, "zsh-init.zsh"), join(home, ".zprofile"))
        environment = { ...environment, ZDOTDIR: home }
        args = ["-lic", `phase124_alias; phase124_function ${JSON.stringify(marker)}; printf 'path:%s\\nidentity:%s\\n' "$PATH" "$PHASE124_PROFILE_SHELL"`]
      } else {
        const config = join(home, "fish")
        await mkdir(config, { recursive: true })
        await copyFile(join(fixtures, "fish-init.fish"), join(config, "config.fish"))
        environment = { ...environment, XDG_CONFIG_HOME: home }
        args = ["-lic", `phase124_alias; phase124_function ${JSON.stringify(marker)}; printf 'path:%s\\nidentity:%s\\n' "$PATH" "$PHASE124_PROFILE_SHELL"`]
      }
      const { stdout } = await execFileAsync(path!, args, { env: environment })
      expect(stdout).toContain(`alias:${shell}`)
      expect(stdout).toContain(`function:${shell}:${marker}`)
      expect(stdout).toContain(`path:${home}/.phase124-nvm/bin`)
      expect(stdout).toContain(`identity:${shell}`)
    })
  }

  const sshAvailable = ["ssh-agent", "ssh-add", "ssh-keygen"].every((command) => executable(command))
  test.skipIf(!sshAvailable && !required)("two real agents preserve process A while future launches rotate to process B", async () => {
    expect(sshAvailable, "OpenSSH host fixtures are required").toBe(true)
    const fixtureRoot = await root("git-stacks-ssh-rotation-")
    const agentA = await startAgent()
    const agentB = await startAgent()
    const keyA = join(fixtureRoot, "agent-a")
    const keyB = join(fixtureRoot, "agent-b")
    await execFileAsync("ssh-keygen", ["-q", "-t", "ed25519", "-N", "", "-f", keyA])
    await execFileAsync("ssh-keygen", ["-q", "-t", "ed25519", "-N", "", "-f", keyB])
    await execFileAsync("ssh-add", [keyA], { env: { ...process.env, ...agentA } })
    await execFileAsync("ssh-add", [keyB], { env: { ...process.env, ...agentB } })

    const processA = spawn("sh", ["-c", "printf 'before:%s\\n' \"$SSH_AUTH_SOCK\"; read phase124; printf 'after:%s\\n' \"$SSH_AUTH_SOCK\""], {
      env: { ...process.env, ...agentA }, stdio: ["pipe", "pipe", "pipe"],
    })
    let outputA = ""
    processA.stdout.setEncoding("utf8").on("data", (chunk) => { outputA += chunk })
    await new Promise<void>((resolve, reject) => {
      const deadline = setTimeout(() => reject(new Error("process A did not publish its launch snapshot")), 2_000)
      const poll = () => outputA.includes("before:") ? (clearTimeout(deadline), resolve()) : setTimeout(poll, 5)
      poll()
    })
    const { stdout: outputB } = await execFileAsync("sh", ["-c", "printf 'future:%s\\n' \"$SSH_AUTH_SOCK\"; ssh-add -l"], {
      env: { ...process.env, ...agentB },
    })
    processA.stdin.end("continue\n")
    await new Promise<void>((resolve, reject) => {
      processA.once("exit", () => resolve())
      processA.once("error", reject)
    })

    expect(outputA).toContain(`before:${agentA.SSH_AUTH_SOCK}`)
    expect(outputA).toContain(`after:${agentA.SSH_AUTH_SOCK}`)
    expect(outputA).not.toContain(agentB.SSH_AUTH_SOCK)
    expect(outputB).toContain(`future:${agentB.SSH_AUTH_SOCK}`)
    expect(outputB).toMatch(/ED25519/)
  })
})
