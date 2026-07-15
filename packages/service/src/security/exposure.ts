import { join } from "node:path"
import { isIP } from "node:net"
import { z } from "zod"

import { readProtectedJson, writeProtectedJson } from "./protected-store.js"

const ExposureSchema = z.strictObject({
  version: z.literal(1),
  enabled: z.boolean(),
  bind_host: z.string().refine((value) => isIP(value) !== 0, "bind_host must be an IP address"),
  advertise_host: z.string().min(1).max(253).refine((value) => !/[\s/:]/.test(value), "advertise_host must be a host name or IP without a port"),
  port: z.number().int().min(0).max(65535),
  updated_at: z.string().datetime({ offset: true }),
})
export type RemoteExposure = z.infer<typeof ExposureSchema>

export function exposurePath(serviceRoot: string): string { return join(serviceRoot, "trust", "exposure.json") }

export function readRemoteExposure(serviceRoot: string): RemoteExposure | null {
  return readProtectedJson(exposurePath(serviceRoot), (value) => ExposureSchema.parse(value))
}

export function configureRemoteExposure(serviceRoot: string, input: { enabled: boolean; bindHost?: string; advertiseHost?: string; port?: number }): RemoteExposure {
  const current = readRemoteExposure(serviceRoot)
  const record = ExposureSchema.parse({
    version: 1,
    enabled: input.enabled,
    bind_host: input.bindHost ?? current?.bind_host ?? "0.0.0.0",
    advertise_host: input.advertiseHost ?? current?.advertise_host ?? "127.0.0.1",
    port: input.port ?? current?.port ?? 0,
    updated_at: new Date().toISOString(),
  })
  if (record.enabled && record.port > 65534) throw new Error("Remote exposure needs two consecutive UDP ports")
  writeProtectedJson(exposurePath(serviceRoot), record)
  return record
}
