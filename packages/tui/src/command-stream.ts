export async function drainCommandStream(

  stream: ReadableStream<Uint8Array> | null,
  onLine: (text: string) => void,
): Promise<void> {
  if (!stream) return
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let buffer = ""
  while (true) {
    const { done, value } = await reader.read()
    if (done) {
      buffer += decoder.decode()
      if (buffer) onLine(buffer)
      return
    }
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split("\n")
    buffer = lines.pop() ?? ""
    for (const line of lines) if (line) onLine(line)
  }
}
