export type PollClock = { now: () => number; sleep: (ms: number) => Promise<void> }

const systemClock: PollClock = {
  now: () => Date.now(),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
}

export async function pollForNewWindowIds(
  before: Set<number>,
  readIds: () => Promise<number[]>,
  options: { timeoutMs?: number; initialDelayMs?: number; maxDelayMs?: number; clock?: PollClock } = {},
): Promise<number[]> {
  const timeoutMs = options.timeoutMs ?? 10_000
  const maxDelayMs = options.maxDelayMs ?? 2_000
  const clock = options.clock ?? systemClock
  const deadline = clock.now() + timeoutMs
  let delay = options.initialDelayMs ?? 200
  while (clock.now() < deadline) {
    await clock.sleep(Math.min(delay, deadline - clock.now()))
    const ids = await readIds()
    const fresh = ids.filter((id) => !before.has(id))
    if (fresh.length > 0) return fresh
    delay = Math.min(delay * 2, maxDelayMs)
  }
  return []
}
