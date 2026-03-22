import { integrations } from "./index"
import type { IntegrationContext, ArtifactBag, Integration, WindowDetector, DetectorSnapshot } from "./types"

export interface RunGenerateResult {
  integration: Integration
  path: string | null
}

export async function runIntegrationGenerate(ctx: IntegrationContext): Promise<RunGenerateResult[]> {
  const sorted = [...integrations].sort((a, b) => a.order - b.order)
  const results: RunGenerateResult[] = []
  for (const integration of sorted) {
    if (!integration.isEnabled(ctx)) continue
    if (integration.applies && !integration.applies(ctx.workspace)) continue
    const path = integration.generate?.(ctx) ?? null
    results.push({ integration, path })
  }
  return results
}

export async function runIntegrations(ctx: IntegrationContext, skip?: Set<string>): Promise<ArtifactBag> {
  const sorted = [...integrations].sort((a, b) => a.order - b.order)
  const bag: ArtifactBag = {}

  // Collect all enabled WindowDetectors from integrations that provide one
  const detectors: WindowDetector[] = sorted
    .filter((i) => i.windowDetector && i.isEnabled(ctx) && (!i.applies || i.applies(ctx.workspace)))
    .map((i) => i.windowDetector!)

  for (const integration of sorted) {
    if (skip?.has(integration.id)) continue
    if (!integration.isEnabled(ctx)) continue
    if (integration.applies && !integration.applies(ctx.workspace)) continue
    const artifactPath = integration.generate?.(ctx) ?? null

    // Before spawning, capture pre-spawn snapshots from all detectors
    const snapshots = new Map<WindowDetector, DetectorSnapshot>()
    for (const detector of detectors) {
      snapshots.set(detector, await detector.begin())
    }

    const artifact = await integration.open(ctx, artifactPath, bag)

    // After open(), if a WindowArtifact was returned, resolve window IDs via each detector
    if (artifact?.kind === "window") {
      const windowIds: Record<string, number[]> = artifact.windowIds ?? {}
      for (const detector of detectors) {
        const snapshot = snapshots.get(detector)!
        const ids = await detector.resolve(snapshot, { pid: artifact.pid, app_id: artifact.app_id })
        if (ids.length > 0) {
          windowIds[detector.id] = ids
        }
      }
      if (Object.keys(windowIds).length > 0) {
        artifact.windowIds = windowIds
      }
    }

    bag[integration.id] = artifact
  }
  return bag
}

export async function runIntegrationCleanup(ctx: IntegrationContext): Promise<void> {
  const sorted = [...integrations].sort((a, b) => a.order - b.order)
  for (const integration of sorted) {
    if (!integration.isEnabled(ctx)) continue
    if (integration.applies && !integration.applies(ctx.workspace)) continue
    if (!integration.cleanup) continue
    try {
      await integration.cleanup(ctx)
    } catch (err) {
      // Cleanup failures are non-fatal — log and continue
      console.warn(`${integration.id} cleanup: ${String(err)}`)
    }
  }
}
