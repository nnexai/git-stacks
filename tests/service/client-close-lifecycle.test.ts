import { afterEach, describe, expect, mock, test } from "@test/api"

afterEach(() => mock.restore())

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((accept) => { resolve = accept })
  return { promise, resolve }
}

describe("official service client lifecycle", () => {
  test("closes authentication that completes after shutdown starts", async () => {
    const authenticationStarted = deferred<void>()
    const authentication = deferred<{ rpc: {
      closed: Promise<void>
      close: ReturnType<typeof mock>
      request: ReturnType<typeof mock>
    } }>()
    const close = mock(async () => undefined)
    const request = mock(async () => { throw new Error("request must not run after shutdown") })
    const rpc = {
      closed: new Promise<void>(() => {}),
      close,
      request,
    }
    mock.module("@git-stacks/client", () => ({
      authenticateSecureCarrier: () => {
        authenticationStarted.resolve()
        return authentication.promise
      },
      ensureSharedEventSubscription: async () => undefined,
    }))
    mock.module("../../packages/service/src/main", () => ({
      ensureManagedServiceProcess: async () => ({
        service_id: "22222222-2222-4222-8222-222222222222",
        listener_epoch: "33333333-3333-4333-8333-333333333333",
        tui_launch: { token: "launch-token" },
        local_tls: {},
      }),
    }))
    mock.module("../../packages/service/src/transport/local-tls", () => ({ connectLocalTls: async () => ({}) }))

    const { closeServiceClient, fetchCoreState } = await import("../../packages/service/src/policy/client")
    const fetch = fetchCoreState().catch((error) => error)
    await authenticationStarted.promise
    const closing = closeServiceClient("TUI closed")
    authentication.resolve({ rpc })

    await closing
    expect(await fetch).toBeInstanceOf(Error)
    expect(request).not.toHaveBeenCalled()
    expect(close).toHaveBeenCalledTimes(1)
    expect(close).toHaveBeenCalledWith("service client closed during authentication")
  })
})
