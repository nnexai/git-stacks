export type LimiterResult<T> = PromiseSettledResult<T>

/**
 * Run an async function over each item with at most `limit` concurrent executions.
 * Returns results in input order, same shape as Promise.allSettled.
 */
export async function mapLimited<T, R>(
  items: T[],
  fn: (item: T) => Promise<R>,
  limit: number
): Promise<LimiterResult<R>[]> {
  const results: LimiterResult<R>[] = new Array(items.length)
  let running = 0
  let nextIndex = 0

  return new Promise((resolve) => {
    function startNext(): void {
      while (running < limit && nextIndex < items.length) {
        const index = nextIndex++
        running++

        fn(items[index]).then(
          (value) => {
            results[index] = { status: "fulfilled", value }
            running--
            if (nextIndex < items.length) {
              startNext()
            } else if (running === 0) {
              resolve(results)
            }
          },
          (reason) => {
            results[index] = { status: "rejected", reason }
            running--
            if (nextIndex < items.length) {
              startNext()
            } else if (running === 0) {
              resolve(results)
            }
          }
        )
      }

      // Edge case: no items
      if (items.length === 0) {
        resolve(results)
      }
    }

    startNext()
  })
}
