export type CommandOutputStream = "stdout" | "stderr" | "system"


export type CommandOutputLine = {
  text: string
  stream: CommandOutputStream
}

export type CommandOutputStatus = "running" | "success" | "failed" | "cancelled"

export type CommandOutputState = {
  lines: CommandOutputLine[]
  omittedCount: number
  status: CommandOutputStatus
}

export function initialCommandOutputState(status: CommandOutputStatus = "running"): CommandOutputState {
  return {
    lines: [],
    omittedCount: 0,
    status,
  }
}

export function appendCommandOutput(
  state: CommandOutputState,
  line: CommandOutputLine,
  limit = 100
): CommandOutputState {
  const boundedLimit = Math.max(0, limit)
  const nextLines = [...state.lines, line]
  const dropped = Math.max(0, nextLines.length - boundedLimit)
  return {
    ...state,
    lines: dropped > 0 ? nextLines.slice(dropped) : nextLines,
    omittedCount: state.omittedCount + dropped,
  }
}
