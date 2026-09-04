/** Use the last known progress when a status response omits a valid percentage. */
export function normalizeAssetGenerationProgress(value: unknown, previous = 0): number {
  const progress = typeof value === 'number'
    || (typeof value === 'string' && value.trim() !== '')
    ? Number(value)
    : NaN
  const fallback = Number.isFinite(previous) ? previous : 0
  return Math.max(0, Math.min(100, Math.round(Number.isFinite(progress) ? progress : fallback)))
}
