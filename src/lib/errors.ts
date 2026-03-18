export function formatError(message: string, hint?: string): string {
  if (hint) {
    return `error: ${message}\n  -> ${hint}`
  }
  return `error: ${message}`
}
