/**
 * resolveActiveGalFile — pick which .gal file agent tools / critic should read.
 * Prefers the renderer's activeScriptFile when present in scripts/.
 */
export const resolveActiveGalFile = (
  activeScriptFile: string | null | undefined,
  galFiles: string[]
): string | null => {
  const sorted = [...galFiles].sort()
  if (activeScriptFile && sorted.includes(activeScriptFile)) {
    return activeScriptFile
  }
  return sorted[0] ?? null
}
