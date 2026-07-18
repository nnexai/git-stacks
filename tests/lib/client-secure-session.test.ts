import { describe, expect, test } from "@test/api"
import { SecureRpcClient } from "../../packages/client/src/secure-session"

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

describe("SecureRpcClient", () => {
  test("rejects pending requests when the secure channel ends without an error", async () => {
    const ended = deferred<void>()
    const channel = {
      start: () => ended.promise,
      sendControl: async () => undefined,
    }
    const session = {
      require: () => undefined,
      carrier: { close: async () => undefined },
    }
    const client = new SecureRpcClient(channel as never, session as never)

    const request = client.request("operation.get", { operation_id: "op_1234567890abcdef" })
    await Promise.resolve()
    ended.resolve()

    await expect(request).rejects.toThrow("Secure channel closed unexpectedly")
    await expect(client.closed).resolves.toEqual(expect.objectContaining({ message: "Secure channel closed unexpectedly" }))
  })
})
