/** Apply edits made during an asynchronous read without discarding the saved assets. */
export function mergeHydratedAssets<T extends { id: string; overrideFields?: string[] }>(
  saved: T[],
  baseline: T[],
  current: T[],
): T[] {
  if (current === baseline) return saved
  const baselineById = new Map(baseline.map((asset) => [asset.id, asset]))
  const currentIds = new Set(current.map((asset) => asset.id))
  const merged = new Map(saved.filter((asset) => (
    !baselineById.has(asset.id) || currentIds.has(asset.id)
  )).map((asset) => [asset.id, asset]))
  current.forEach((asset) => {
    const previous = baselineById.get(asset.id)
    if (asset === previous) return
    const restored = merged.get(asset.id)
    if (!restored) {
      merged.set(asset.id, asset)
      return
    }
    const next = { ...restored, ...asset }
    if (previous) {
      // Unedited fields can contain richer values in IndexedDB, such as full image data.
      Object.keys(previous).forEach((key) => {
        if (Object.is(Reflect.get(previous, key), Reflect.get(asset, key))) {
          if (Object.prototype.hasOwnProperty.call(restored, key)) Reflect.set(next, key, Reflect.get(restored, key))
          else Reflect.deleteProperty(next, key)
        } else if (!Object.prototype.hasOwnProperty.call(asset, key)) {
          Reflect.deleteProperty(next, key)
        }
      })
    }
    if (restored.overrideFields || asset.overrideFields) {
      next.overrideFields = [...mergeHydratedIds(
        restored.overrideFields,
        previous?.overrideFields,
        new Set(asset.overrideFields ?? []),
      )]
    }
    merged.set(asset.id, next)
  })
  return [...merged.values()]
}

export function mergeHydratedIds(saved: string[] | undefined, baseline: string[] | undefined, current: Set<string>) {
  const next = new Set(saved ?? [])
  const initial = new Set(baseline ?? [])
  initial.forEach((id) => { if (!current.has(id)) next.delete(id) })
  current.forEach((id) => { if (!initial.has(id)) next.add(id) })
  return next.size === current.size && [...next].every((id) => current.has(id)) ? current : next
}
