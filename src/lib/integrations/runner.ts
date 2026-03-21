import { integrations } from "./index"
import type { IntegrationContext, ArtifactBag, Integration } from "./types"

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
  for (const integration of sorted) {
    if (skip?.has(integration.id)) continue
    if (!integration.isEnabled(ctx)) continue
    if (integration.applies && !integration.applies(ctx.workspace)) continue
    const artifactPath = integration.generate?.(ctx) ?? null
    const artifact = await integration.open(ctx, artifactPath, bag)
    bag[integration.id] = artifact
  }
  return bag
}
