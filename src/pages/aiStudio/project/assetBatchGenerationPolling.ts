import type { StudioAssetImageTaskRequest, StudioEpisodeAssetsGenerateStatusResult } from '../../../services/studioAssetGeneration'

/** One cancellable status lane per selected episode/overview. Never creates a task. */
export function startBatchGenerationPolling({ requestStatus, onStatus, onError, isCurrent = () => true }: {
  requestStatus: () => StudioAssetImageTaskRequest<StudioEpisodeAssetsGenerateStatusResult>
  onStatus: (status: StudioEpisodeAssetsGenerateStatusResult) => void
  onError: (error: unknown) => void
  isCurrent?: () => boolean
}) {
  let active = true
  let timer: number | undefined
  let request: StudioAssetImageTaskRequest<StudioEpisodeAssetsGenerateStatusResult> | undefined
  let failures = 0
  const current = () => active && isCurrent()
  const schedule = (delay: number) => {
    if (!current()) return
    timer = window.setTimeout(() => { timer = undefined; void poll() }, delay)
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
    if (timer !== undefined) window.clearTimeout(timer)
    request?.cancel()
    request = undefined
  }
}
