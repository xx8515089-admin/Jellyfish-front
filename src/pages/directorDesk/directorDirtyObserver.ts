/** Coalesce expensive snapshot comparisons without delaying leave-page protection. */
interface SnapshotState {
  project: unknown
  viewportAspectRatio: unknown
  finishedShotFov: unknown
  cameraMotionProgress: number
  cameraMotionPlaying: boolean
}

export function observeDirectorChanges<T extends SnapshotState>(
  subscribe: (listener: (next: T, previous: T) => void) => () => void,
  onPending: () => void,
  onSettled: () => void,
  delay = 200,
) {
  let timer: ReturnType<typeof setTimeout> | undefined
  const unsubscribe = subscribe((next, previous) => {
    const edited = next.project !== previous.project ||
      next.viewportAspectRatio !== previous.viewportAspectRatio ||
      next.finishedShotFov !== previous.finishedShotFov
    const seeked = !next.cameraMotionPlaying && (
      next.cameraMotionProgress !== previous.cameraMotionProgress ||
      previous.cameraMotionPlaying
    )
    if (!edited && !seeked) return
    onPending()
    if (timer !== undefined) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = undefined
      onSettled()
    }, delay)
  })
  return () => {
    unsubscribe()
    if (timer !== undefined) clearTimeout(timer)
  }
}
