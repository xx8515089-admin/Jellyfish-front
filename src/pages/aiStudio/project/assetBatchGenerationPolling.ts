import type { StudioAssetImageTaskRequest, StudioEpisodeAssetsGenerateStatusResult } from '../../../services/studioAssetGeneration'

export type PollTimerCancel = () => void

/**
 * 页面不可见时暂停一次性轮询计时器，重新可见后立即补查。
 * 这样不会让后台标签页持续打状态接口，也不会延迟用户回来后的最新状态。
 */
export function schedulePollWhenVisible(callback: () => void, delay: number): PollTimerCancel {
  let cancelled = false
  let timer: number | undefined
  const visibilityDocument = typeof document === 'undefined' ? undefined : document

  const clearTimer = () => {
    if (timer === undefined) return
    window.clearTimeout(timer)
    timer = undefined
  }
  const cleanup = () => {
    clearTimer()
    visibilityDocument?.removeEventListener('visibilitychange', handleVisibilityChange)
  }
  const run = () => {
    timer = undefined
    if (cancelled) return
    if (visibilityDocument?.visibilityState === 'hidden') return
    cleanup()
    callback()
  }
  function handleVisibilityChange() {
    if (cancelled || !visibilityDocument) return
    if (visibilityDocument.visibilityState === 'hidden') {
      clearTimer()
      return
    }
    if (timer === undefined) timer = window.setTimeout(run, 0)
  }

  visibilityDocument?.addEventListener('visibilitychange', handleVisibilityChange)
  if (!visibilityDocument || visibilityDocument.visibilityState !== 'hidden') {
    timer = window.setTimeout(run, Math.max(0, delay))
  }

  return () => {
    if (cancelled) return
    cancelled = true
    cleanup()
  }
}

/** One cancellable status lane per selected episode/overview. Never creates a task. */
export function startBatchGenerationPolling({ requestStatus, onStatus, onError, isCurrent = () => true }: {
  requestStatus: () => StudioAssetImageTaskRequest<StudioEpisodeAssetsGenerateStatusResult>
  onStatus: (status: StudioEpisodeAssetsGenerateStatusResult) => void
  onError: (error: unknown) => void
  isCurrent?: () => boolean
}) {
  let active = true
  let cancelTimer: PollTimerCancel | undefined
  let request: StudioAssetImageTaskRequest<StudioEpisodeAssetsGenerateStatusResult> | undefined
  let failures = 0
  const current = () => active && isCurrent()
  const schedule = (delay: number) => {
    if (!current()) return
    cancelTimer?.()
    cancelTimer = schedulePollWhenVisible(() => {
      cancelTimer = undefined
      void poll()
    }, delay)
  }
  const poll = async () => {
    if (!current()) return
    let delay: number | undefined
    try {
      request = requestStatus()
      const status = await request.promise
      if (!current()) return
      failures = 0
      onStatus(status)
      if (!status.allGenerated && status.shouldPoll) delay = 3000
    } catch (error) {
      if (!current()) return
      onError(error)
      const status = Number((error as { status?: number } | null)?.status)
      failures += 1
      if (status !== 401 && status !== 403 && failures < 3) delay = 3000 * 2 ** (failures - 1)
    } finally {
      request = undefined
      if (delay !== undefined) schedule(delay)
    }
  }
  void poll()
  return () => {
    active = false
    cancelTimer?.()
    cancelTimer = undefined
    request?.cancel()
    request = undefined
  }
}
