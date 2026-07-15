import type { SecureScope } from "@git-stacks/protocol"

export interface SharedEventSubscriptionClient {
  request<T>(method: string, body?: unknown, options?: { scope?: SecureScope }): Promise<T>
}

const subscriptions = new WeakMap<object, Promise<string>>()

/**
 * A secure session owns one durable server-side event subscription. Local
 * consumers multiplex observers on that session instead of consuming another
 * bounded server subscription for every operation or view.
 */
export function ensureSharedEventSubscription(
  client: SharedEventSubscriptionClient & object,
  cursor: string,
): Promise<string> {
  const existing = subscriptions.get(client)
  if (existing) return existing

  const request = client.request<{ cursor?: unknown }>("events.subscribe", { cursor }, { scope: "event.read" })
    .then((result) => {
      if (typeof result.cursor !== "string" || !/^(0|[1-9][0-9]*)$/.test(result.cursor)) {
        throw new Error("Invalid service event subscription cursor")
      }
      return result.cursor
    })
  subscriptions.set(client, request)
  void request.catch(() => {
    if (subscriptions.get(client) === request) subscriptions.delete(client)
  })
  return request
}
