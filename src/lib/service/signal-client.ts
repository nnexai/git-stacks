import { join } from "node:path"
import { WS_CONFIG_DIR } from "../paths"
import { readOfficialClientCredential } from "./credentials"
import type { Signal } from "./contract"
import { readServiceDescriptor, startManagedService } from "../../service/main"

export interface SignalProjectionResponse {
  signals: Signal[]
  dismissed: string[]
  sequence: string
}

async function authenticatedService() {
  const descriptor = readServiceDescriptor() ?? (await startManagedService()).descriptor
  const credential = readOfficialClientCredential(descriptor.credential_lookup, { serviceRoot: join(WS_CONFIG_DIR, "service") })
  if (!credential) throw new Error("git-stacks service credential is unavailable")
  return { descriptor, headers: { authorization: `Bearer ${credential.token}`, "content-type": "application/json" } }
}

export async function fetchSignalProjection(signal?: AbortSignal): Promise<SignalProjectionResponse> {
  const { descriptor, headers } = await authenticatedService()
  const response = await fetch(new URL("/v1/signals", descriptor.endpoint), { headers, signal })
  if (!response.ok) throw new Error(`signal projection failed (${response.status})`)
  const envelope = await response.json() as { data?: SignalProjectionResponse }
  if (!envelope.data) throw new Error("signal projection response is missing data")
  return envelope.data
}

export async function fetchWorkspaceSignalNames(signal?: AbortSignal): Promise<Map<string, string>> {
  const { descriptor, headers } = await authenticatedService()
  const response = await fetch(new URL("/v1/snapshot", descriptor.endpoint), { headers, signal })
  if (!response.ok) throw new Error(`workspace signal identity resolution failed (${response.status})`)
  const envelope = await response.json() as { data?: Array<{ workspace?: { id?: string; name?: string } }> }
  return new Map((envelope.data ?? []).flatMap((entry) => entry.workspace?.id && entry.workspace.name ? [[entry.workspace.id, entry.workspace.name] as const] : []))
}

export async function dismissSignal(signalId: string, signal?: AbortSignal): Promise<void> {
  const { descriptor, headers } = await authenticatedService()
  const response = await fetch(new URL("/v1/signals/dismiss", descriptor.endpoint), {
    method: "POST", headers, signal, body: JSON.stringify({ kind: "dismiss_signal", signal_id: signalId }),
  })
  if (!response.ok) throw new Error(`signal dismissal failed (${response.status})`)
}
