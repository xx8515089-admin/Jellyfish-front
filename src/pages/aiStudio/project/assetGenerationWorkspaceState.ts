/** Only reuse a file ID when it belongs to the image currently being previewed. */
export function resolvePreviewImageFileId(
  previewUrl: string | undefined,
  look: { imageUrl?: string; fileId?: string },
  asset: { imageUrl?: string; fileId?: string },
) {
  if (!previewUrl) return undefined
  if (previewUrl === look.imageUrl && look.fileId) return look.fileId
  return previewUrl === asset.imageUrl ? asset.fileId : undefined
}

export function getLookGenerationState<T>(
  lookId: number | undefined,
  states: Record<string, T> | undefined,
  fallback: T | undefined,
) {
  if (states === undefined) return fallback
  return lookId === undefined ? undefined : states[String(lookId)]
}

/** Previewing history must never rewrite the persisted cover's URL or file ID. */
export function captureLookEditorOptions<T extends { id: string }>(
  looks: T[],
  activeLookId: string,
  options: { prompt: string; aspectRatio: string; visualStyleId: number | null },
): T[] {
  return looks.map((look) => look.id === activeLookId ? { ...look, ...options, editorOptionsTouched: true } : look)
}
