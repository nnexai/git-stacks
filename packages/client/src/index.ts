export interface RequestTransport {
  request(path: string, init?: RequestInit): Promise<unknown>
}

export interface EventTransport {
  subscribe(cursor: string, observer: (event: unknown) => void, signal?: AbortSignal): Promise<string>
}

export * from "./presentation.js"
export * from "./reducer.js"
export * from "./signal-state.js"
