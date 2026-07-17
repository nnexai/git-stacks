import { spawn as spawnPty } from "node-pty"

const [scenario, executable, target] = process.argv.slice(2)
if (!scenario || !executable || !target) throw new Error("usage: tui-launcher-pty.mjs <scenario> <executable> <target>")

function quote(value) {
  return `'${value.replaceAll("'", `'"'"'`)}'`
}

function resultWrapper(childCommand, background = false) {
  const invocation = background
    ? `${childCommand} &\nchild=$!\nprintf '\\n__CHILD_PID__%s\\n' "$child"\nwait "$child"\nstatus=$?`
    : `${childCommand}\nstatus=$?`
  return [
    "before=$(stty -g)",
    invocation,
    "after=$(stty -g)",
    "if [ \"$before\" = \"$after\" ]; then tty=restored; else tty=changed; fi",
    "printf '\\n__RESULT__ status=%s tty=%s\\n' \"$status\" \"$tty\"",
  ].join("\n")
}

const probeEnvironmentKeys = new Set([
  "GIT_STACKS_TUI_FATAL_MOUNT_PROBE",
  "GIT_STACKS_TUI_LIFECYCLE_PROBE",
  "GIT_STACKS_TUI_RUNTIME_PROBE",
])

function cleanEnvironment(extra = {}) {
  return {
    ...Object.fromEntries(Object.entries(process.env).filter(([key, value]) => value !== undefined && !probeEnvironmentKeys.has(key))),
    TERM: "xterm-256color",
    ...extra,
  }
}

function childPid(output) {
  const match = output.match(/__CHILD_PID__(\d+)/)
  if (!match) throw new Error(`Missing child PID marker. Output:\n${output}`)
  return Number(match[1])
}

function isAlive(pid) {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return error?.code !== "ESRCH"
  }
}

function killPtyTree(terminal) {
  try {
    process.kill(-terminal.pid, "SIGKILL")
  } catch {
    try { terminal.kill("SIGKILL") } catch {}
  }
}

async function runPty(shellCommand, environment, drive) {
  const startedAt = Date.now()
  const terminal = spawnPty("/bin/bash", ["--noprofile", "--norc", "-c", shellCommand], {
    cwd: "/tmp",
    env: cleanEnvironment(environment),
    cols: 100,
    rows: 30,
    name: "xterm-256color",
  })
  let output = ""
  terminal.onData((chunk) => { output += chunk })
  const waitFor = async (text, timeoutMs = 3_000) => {
    const deadline = Date.now() + timeoutMs
    while (!output.includes(text) && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 10))
    }
    if (!output.includes(text)) throw new Error(`PTY output did not contain ${JSON.stringify(text)}. Output:\n${output}`)
  }
  const exited = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      killPtyTree(terminal)
      reject(new Error(`PTY launcher timed out. Output:\n${output}`))
    }, 5_000)
    terminal.onExit((event) => {
      clearTimeout(timeout)
      setTimeout(() => resolve(event), 20)
    })
  })
  try {
    if (drive) await drive({ terminal, waitFor, output: () => output })
    const event = await exited
    const pidMatch = output.match(/__CHILD_PID__(\d+)/)
    const pid = pidMatch ? Number(pidMatch[1]) : undefined
    return {
      output,
      ptyExitCode: event.exitCode,
      durationMs: Date.now() - startedAt,
      ...(pid === undefined ? {} : { pid, childAlive: isAlive(pid) }),
    }
  } catch (error) {
    killPtyTree(terminal)
    await Promise.race([
      exited.catch(() => undefined),
      new Promise((resolve) => setTimeout(resolve, 250)),
    ])
    throw error
  }
}

const childCommand = `${quote(executable)} ${quote(target)}`
let shellCommand
let environment = {}
let drive

switch (scenario) {
  case "runtime":
    shellCommand = resultWrapper(childCommand)
    environment = { GIT_STACKS_TUI_RUNTIME_PROBE: "1" }
    break
  case "fatal":
    shellCommand = resultWrapper(childCommand, true)
    environment = { GIT_STACKS_TUI_FATAL_MOUNT_PROBE: "1" }
    break
  case "q":
  case "ctrl-c":
    shellCommand = resultWrapper(childCommand)
    environment = { GIT_STACKS_TUI_LIFECYCLE_PROBE: "1" }
    drive = async ({ terminal, waitFor }) => {
      await waitFor("initial stale view")
      terminal.write(scenario === "q" ? "q" : "")
    }
    break
  case "sigint":
  case "sigterm":
    shellCommand = resultWrapper(childCommand, true)
    environment = { GIT_STACKS_TUI_LIFECYCLE_PROBE: "1" }
    drive = async ({ waitFor, output }) => {
      await waitFor("initial stale view")
      process.kill(childPid(output()), scenario === "sigint" ? "SIGINT" : "SIGTERM")
    }
    break
  case "direct":
    shellCommand = resultWrapper(childCommand)
    break
  default:
    throw new Error(`Unknown PTY scenario: ${scenario}`)
}

try {
  process.stdout.write(JSON.stringify(await runPty(shellCommand, environment, drive)))
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`)
  process.exitCode = 1
}
