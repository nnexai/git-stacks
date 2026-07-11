import { Terminal } from "@xterm/headless"

const events: Array<Record<string, unknown>> = []
const record = (category: string, data: Record<string, unknown>) =>
  events.push({ at: new Date().toISOString(), category, ...data })

const emulator = new Terminal({ cols: 40, rows: 8, allowProposedApi: true })
let outputBytes = 0
const proc = Bun.spawn(["bash", "--noprofile", "--norc"], {
  env: { ...process.env, TERM: "xterm-256color", PS1: "spike$ " },
  terminal: {
    cols: 40,
    rows: 8,
    data(_pty, data) {
      outputBytes += data.byteLength
      emulator.write(data)
      record("pty-output", { bytes: data.byteLength })
    },
  },
})

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))
const send = async (input: string) => {
  record("input", { input: JSON.stringify(input) })
  proc.terminal!.write(input)
  await wait(120)
}

await wait(120)
await send("printf '\\033[31mRED\\033[0m plain\\n'\r")
await send("printf 'first\\nsecond\\n\\033[1A\\rREPLACED\\n'\r")
await send("read -p 'name: ' name; printf 'hello:%s\\n' \"$name\"\r")
await send("Ada\r")
proc.terminal!.resize(55, 10)
emulator.resize(55, 10)
record("resize", { cols: 55, rows: 10 })
await send("stty size\r")
await send("exit\r")
const exitCode = await proc.exited
proc.terminal!.close()

const lines: string[] = []
for (let y = 0; y < emulator.buffer.active.length; y++) {
  lines.push(emulator.buffer.active.getLine(y)?.translateToString(true) ?? "")
}
const screen = lines.join("\n")
const checks = {
  tty: screen.includes("10 55"),
  interactiveInput: screen.includes("hello:Ada"),
  cursorMovement: screen.includes("REPLACED"),
  cleanExit: exitCode === 0,
}
record("summary", { outputBytes, exitCode, checks })
console.log(JSON.stringify({ checks, outputBytes, screen, events }, null, 2))
emulator.dispose()
if (Object.values(checks).some(value => !value)) process.exit(1)
