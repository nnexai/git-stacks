// --- Config display helpers ---


/**
 * Formats a config value to a human-readable string for display in TUI detail panes.
 *
 * Rules:
 * - null/undefined → ""
 * - string/number/boolean → String(value)
 * - array of primitives → elements joined with ", "
 * - array of objects where every element has a `windows` key → "{N} col(s)" (niri columns)
 * - other arrays → JSON.stringify(value)
 * - non-null object → JSON.stringify(value)
 */
export function formatConfigValue(value: unknown): string {
  if (value === null || value === undefined) {
    return ""
  }

  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value)
  }

  if (Array.isArray(value)) {
    // Array of primitives
    if (value.every((el) => typeof el === "string" || typeof el === "number" || typeof el === "boolean")) {
      return value.join(", ")
    }

    // Niri columns array: all elements are objects with a `windows` property
    if (
      value.length > 0 &&
      value.every((el) => el !== null && typeof el === "object" && !Array.isArray(el) && "windows" in (el as object))
    ) {
      const count = value.length
      return count === 1 ? "1 col" : `${count} cols`
    }

    // Generic array fallback
    return JSON.stringify(value)
  }

  // Non-null object
  return JSON.stringify(value)
}
