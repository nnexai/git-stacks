import { beforeEach, describe, expect, mock, test } from "@test/api"
import type { Workspace } from "@/lib/config"

const buildWorkspaceEnvMock = mock(async (_workspace: Workspace, _opts: any) => ({
  GS_TRIGGERED_BY: "placeholder",
}))
const buildRepoEnvMock = mock((base: Record<string, string>, repo: any) => ({
  ...base,
  GS_REPO_NAME: repo.name,
}))
const runShellSequenceMock = mock(async (_commands: string[] | undefined, _cwd: string, _env: Record<string, string>): Promise<{ exitCode: number; failedCommand?: string }> => ({
  exitCode: 0,
}))
const runShellSequenceCapturedMock = mock(async (
  _commands: string[] | undefined,
  _cwd: string,
  _env: Record<string, string>,
  onOutput: (output: { line: string; stream: "stdout" | "stderr" }) => void
): Promise<{ exitCode: number; failedCommand?: string }> => {
  onOutput({ line: "captured error", stream: "stderr" })
  return { exitCode: 0 }
})

mock.module("@/lib/workspace-env", () => ({
  buildWorkspaceEnv: buildWorkspaceEnvMock,
  buildRepoEnv: buildRepoEnvMock,
}))
mock.module("@/lib/lifecycle", () => ({
  runShellSequence: runShellSequenceMock,
  runShellSequenceCaptured: runShellSequenceCapturedMock,
}))

const { listManualCommands, planManualCommand, runManualCommand } = await import("@/lib/workspace-command")

function makeWorkspace(): Workspace {
  return {
    name: "ws",
    schema_version: "1",
    branch: "feature/ws",
    created: "2026-01-01",
    commands: {
      preverify: "echo ws-pre",
      verify: "echo ws-main",
      postverify: "echo ws-post",
    },
    repos: [
      {
        name: "api",
        repo: "api",
        type: "other",
        mode: "dir",
        main_path: "/tmp/api",
        commands: {
          preverify: "echo api-pre",
          verify: "echo api-main",
          postverify: "echo api-post",
        },
      },
    ],
  }
}

describe("workspace-command planning", () => {
  beforeEach(() => {
    buildWorkspaceEnvMock.mockClear()
    buildRepoEnvMock.mockClear()
    runShellSequenceMock.mockClear()
    runShellSequenceCapturedMock.mockClear()
    runShellSequenceMock.mockImplementation(async () => ({ exitCode: 0 }))
    runShellSequenceCapturedMock.mockImplementation(async (_commands, _cwd, _env, onOutput) => {
      onOutput({ line: "captured error", stream: "stderr" })
      return { exitCode: 0 }
    })
  })

  test("lists visible names by default and shows hidden with --all", () => {
    const ws = makeWorkspace()
    expect(listManualCommands(ws)).toEqual(["verify"])
    expect(listManualCommands(ws, { all: true })).toEqual(["postverify", "preverify", "verify"])
  })

  test("plans verify in pre/main/post order with workspace before repo", () => {
    const ws = makeWorkspace()
    const plan = planManualCommand(ws, "verify")
    expect(plan.map((p) => `${p.commandName}:${p.scope}`)).toEqual([
      "preverify:workspace",
      "preverify:repo",
      "verify:workspace",
      "verify:repo",
      "postverify:workspace",
      "postverify:repo",
    ])
  })

  test("running pre* directly only executes that bucket", async () => {
    const ws = makeWorkspace()
    const result = await runManualCommand(ws, "preverify", { skipSecrets: true })
    expect(result.exitCode).toBe(0)
    expect(result.plan.map((p) => p.commandName)).toEqual(["preverify", "preverify"])
    expect(buildWorkspaceEnvMock).toHaveBeenCalledWith(ws, expect.objectContaining({ triggeredBy: "command:preverify", skipSecrets: true }))
  })

  test("returns first failing exit code", async () => {
    const ws = makeWorkspace()
    runShellSequenceMock
      .mockResolvedValueOnce({ exitCode: 0 })
      .mockResolvedValueOnce({ exitCode: 42, failedCommand: "echo api-pre" })
    const result = await runManualCommand(ws, "verify")
    expect(result.exitCode).toBe(42)
    expect(result.failedCommand).toBe("echo api-pre")
  })

  test("uses captured shell execution when onOutput is provided", async () => {
    const ws = makeWorkspace()
    const emitted: Array<{ line: string; stream: "stdout" | "stderr"; stepCommand: string }> = []
    const result = await runManualCommand(ws, "preverify", {
      onOutput: (output) => emitted.push({
        line: output.line,
        stream: output.stream,
        stepCommand: output.step.commandName,
      }),
    })

    expect(result.exitCode).toBe(0)
    expect(runShellSequenceMock).not.toHaveBeenCalled()
    expect(runShellSequenceCapturedMock).toHaveBeenCalled()
    expect(emitted).toContainEqual({
      line: "captured error",
      stream: "stderr",
      stepCommand: "preverify",
    })
  })
})
