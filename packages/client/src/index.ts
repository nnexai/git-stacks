export interface RequestTransport {
  request(path: string, init?: RequestInit): Promise<unknown>
}

export interface EventTransport {
  subscribe(cursor: string, observer: (event: unknown) => void, signal?: AbortSignal): Promise<string>
}

export * from "./presentation.js"
export * from "./shortcuts.js"
export * from "./reducer.js"
export * from "./signal-state.js"
export * from "./secure-session.js"
export * from "./browser-webtransport.js"
export * from "./event-subscription.js"
