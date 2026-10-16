// What the reader says about content it skipped: once per kind, in
// development, never to a reader.

const warned = new Set<string>()

export function warnUnsupported(
  nodeType: string,
  blockType: string | null,
): void {
  if (!__DEV__) return
  const key = blockType ? `block:${blockType}` : `node:${nodeType}`
  if (warned.has(key)) return
  warned.add(key)
  console.warn(
    `[reader] Skipped ${
      blockType
        ? `a block of type "${blockType}"`
        : `a node of type "${nodeType}"`
    }, which this version of the app does not render.`,
  )
}

/** For tests: forget what has been warned about. */
export function resetUnsupportedWarnings(): void {
  warned.clear()
}
