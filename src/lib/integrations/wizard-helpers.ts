import { prompts as p, cancel } from "../../tui/utils"
import { integrations } from "./index"

/**
 * Shared helper for prompting integration overrides in template and workspace wizards.
 *
 * First asks "Override integrations?" — if user says no, returns undefined (no key stored).
 * If yes, shows a multi-select pre-populated from initialEnabledIds, then runs configurePrompt()
 * for each enabled integration. Disabled integrations get { ...current, enabled: false }.
 *
 * @param initialEnabledIds - Integration IDs to pre-select (from global config or template overrides)
 * @param currentConfigs - Current per-integration config objects (preserves extra keys on disable)
 * @returns Record of integration configs, or undefined if user declined
 */
export async function promptIntegrationOverrides(
  initialEnabledIds: string[],
  currentConfigs: Record<string, Record<string, unknown>>
): Promise<Record<string, unknown> | undefined> {
  const addOverrides = await p.confirm({
    message: "Override integrations?",
    initialValue: false,
  })
  if (p.isCancel(addOverrides)) cancel()
  if (!addOverrides) return undefined

  const selectedRaw = await p.multiselect({
    message: "Active integrations",
    options: integrations.map((i) => ({ value: i.id, label: i.label, hint: i.hint })),
    initialValues: initialEnabledIds,
    required: false,
  })
  if (p.isCancel(selectedRaw)) cancel()
  const selected = new Set(selectedRaw as string[])

  const result: Record<string, unknown> = {}
  for (const integration of integrations) {
    const current = currentConfigs[integration.id] ?? {}
    if (selected.has(integration.id)) {
      const updated = await integration.configurePrompt(current)
      if (updated === null) cancel()
      result[integration.id] = updated
    } else {
      // Disabled — preserve extra config (e.g. cmd) in case user re-enables later
      result[integration.id] = { ...current, enabled: false }
    }
  }
  return result
}
