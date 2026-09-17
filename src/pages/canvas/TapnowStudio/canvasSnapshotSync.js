// Pointer movement changes the snapshot every frame. Wait until it settles before
// serializing the graph or walking its media for a local backup.
export function scheduleCanvasSnapshotSync({
  snapshot, session, saved, save, autoSave = true, onDirty, onDraftError,
  getSnapshot = () => snapshot,
  timers = globalThis, draftDelay = 250, saveDelay = 1500,
}) {
  let cancelled = false
  let flushing = false
  let saveTimer
  let draftPromise
  let draftSnapshot
  let serialized
  const backup = () => {
    const currentSnapshot = getSnapshot()
    if (draftPromise && draftSnapshot === currentSnapshot) return draftPromise
    draftSnapshot = currentSnapshot
    try {
      serialized = JSON.stringify(currentSnapshot)
      const currentSerialized = serialized
      if (serialized === saved.current) return Promise.resolve()
      draftPromise = Promise.resolve(session.draft(JSON.parse(serialized))).then(draft => {
        if ((!cancelled || flushing) && getSnapshot() === currentSnapshot && currentSerialized !== saved.current) session.write('draft', draft)
      }).catch(() => { if (!cancelled) onDraftError?.() })
    } catch {
      if (!cancelled) onDraftError?.()
      draftPromise = Promise.resolve()
    }
    return draftPromise
  }
  const draftTimer = timers.setTimeout(() => {
    if (cancelled) return
    void backup()
    if (!autoSave || serialized === saved.current || serialized === undefined) return
    onDirty?.()
    saveTimer = timers.setTimeout(() => {
      if (!cancelled && serialized !== saved.current) void save().catch(() => {})
    }, Math.max(0, saveDelay - draftDelay))
  }, draftDelay)
  return {
    cancel() {
      cancelled = true
      timers.clearTimeout(draftTimer)
      timers.clearTimeout(saveTimer)
    },
    // Page exit/unmount must begin backing up the latest snapshot immediately.
    // Keep that backup alive even when React subsequently cleans up this effect.
    flush() {
      flushing = true
      timers.clearTimeout(draftTimer)
      return backup()
    },
  }
}