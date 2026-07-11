import { Terminal } from "@xterm/headless"

type Surface = { id: string; terminal: Terminal; proc: Bun.Subprocess; chunks: number }
const events: Array<Record<string, unknown>> = []

function createSurface(id: string): Surface {
  const terminal = new Terminal({ cols: 48, rows: 8, allowProposedApi: true })
  const surface = { id, terminal, proc: undefined as unknown as Bun.Subprocess, chunks: 0 }
  surface.proc = Bun.spawn(["bash", "--noprofile", "--norc"], {
    env: { ...process.env, TERM: "xterm-256color", PS1: `${id}$ ` },
    terminal: {
      cols: 48,
      rows: 8,
      data(_pty, data) {
        surface.chunks++
        terminal.write(data)
        events.push({ at: new Date().toISOString(), category: "output", id, bytes: data.byteLength })
      },
    },
  })
  return surface
}

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))
const screen = (surface: Surface) => {
  const lines: string[] = []
  for (let y = 0; y < surface.terminal.buffer.active.length; y++) {
    lines.push(surface.terminal.buffer.active.getLine(y)?.translateToString(true) ?? "")
  }
  return lines.join("\n")
}

const agent = createSurface("agent")
const server = createSurface("server")
await wait(100)
agent.proc.terminal!.write("for i in 1 2 3; do echo agent:$i; sleep .12; done\r")
server.proc.terminal!.write("for i in 1 2 3 4; do echo server:$i; sleep .09; done\r")
events.push({ at: new Date().toISOString(), category: "visible", id: "agent" })
await wait(180)
events.push({ at: new Date().toISOString(), category: "visible", id: "server" })
server.proc.terminal!.resize(60, 10)
server.terminal.resize(60, 10)
await wait(500)

const agentScreen = screen(agent)
const serverScreen = screen(server)
const checks = {
  agentAdvancedWhileHidden: agentScreen.includes("agent:3"),
  serverAdvancedWhileHidden: serverScreen.includes("server:4"),
  independentBuffers: !agentScreen.includes("server:") && !serverScreen.includes("agent:"),
  independentResize: agent.terminal.cols === 48 && server.terminal.cols === 60,
}
for (const surface of [agent, server]) {
  surface.proc.terminal!.write("exit\r")
  await surface.proc.exited
  surface.proc.terminal!.close()
}
console.log(JSON.stringify({ checks, chunks: { agent: agent.chunks, server: server.chunks }, agentScreen, serverScreen, events }, null, 2))
agent.terminal.dispose()
server.terminal.dispose()
if (Object.values(checks).some(value => !value)) process.exit(1)
