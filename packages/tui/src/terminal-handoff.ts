import { drainCommandStream } from "./command-stream"


export async function runWorkspaceShellHandoff(
  workspace: string,
  output: (line: { text: string; stream: "stdout" | "stderr" }) => void,
): Promise<number> {
  const process = Bun.spawn(["git-stacks", "run", workspace], { stdout: "pipe", stderr: "pipe" })
  const [exitCode] = await Promise.all([
    process.exited,
    drainCommandStream(process.stdout, (text) => output({ text, stream: "stdout" })),
    drainCommandStream(process.stderr, (text) => output({ text, stream: "stderr" })),
  ])
  return exitCode
}
