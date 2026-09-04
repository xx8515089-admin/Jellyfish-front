import { getStoredAuthUser } from '../../../auth'
import { bilingualText } from '../../../i18n/useBilingualText'
import { getApiErrorMessage } from '../../../services/apiErrors'
import {
  parseStudioAssetImageTaskResult,
  StudioAssetGenerationApi,
  type StudioAssetImageTaskDetail,
  type StudioAssetImageTaskRequest,
  type StudioAssetLookGenerateRequest,
} from '../../../services/studioAssetGeneration'
import { normalizeAssetGenerationProgress } from './assetGenerationProgressState'

export type AssetLookGenerationTaskSnapshot = {
  phase: 'idle' | 'submitting' | 'running' | 'poll-failed' | 'refreshing' | 'refresh-failed' | 'failed'
  progress: number
  taskId?: string
  lookName?: string
  clientLookId?: string
  expectedFileId?: string
  previousLookIds?: string[]
  errorMessage?: string
  revision: number
}

type StoredTask = {
  taskId: string
  lookName?: string
  clientLookId?: string
  taskSucceeded: boolean
  progress: number
  expectedFileId?: string
  previousLookIds?: string[]
}

const POLL_INTERVAL_MS = 1200
const POLL_RETRY_DELAYS_MS = [1200, 2400, 4800]
const controllers = new Map<string, ReturnType<typeof createController>>()
const activityListeners = new Set<() => void>()
const activeAssetsByUser = new Map<string, readonly number[]>()
const emptyActiveAssets: readonly number[] = []

function updateTaskActivity(userScope: string, assetId: number, active: boolean, notify = true) {
  const current = activeAssetsByUser.get(userScope) ?? emptyActiveAssets
  if (current.includes(assetId) === active) return
  activeAssetsByUser.set(userScope, active
    ? [...current, assetId].sort((first, second) => first - second)
    : current.filter((id) => id !== assetId))
  if (notify) activityListeners.forEach((listener) => listener())
}

/** A stable ownership snapshot; progress changes only notify each asset's subscribers. */
export const getActiveAssetLookGenerationTasks = (): readonly number[] => (
  activeAssetsByUser.get(getUserScope()) ?? emptyActiveAssets
)

export const subscribeAssetLookGenerationTasks = (listener: () => void) => {
  activityListeners.add(listener)
  return () => { activityListeners.delete(listener) }
}

function getUserScope() {
  const user = getStoredAuthUser()
  return user?.id !== null && user?.id !== undefined ? `id:${user.id}` : `username:${user?.username ?? 'anonymous'}`
}

const clampProgress = normalizeAssetGenerationProgress

function readStoredTask(storageKey: string): StoredTask | null {
  try {
    const raw = window.sessionStorage.getItem(storageKey)
    if (!raw) return null
    const value = JSON.parse(raw) as Partial<StoredTask> | null
    if (!value || typeof value.taskId !== 'string' || !value.taskId.trim()) return null
    return {
      taskId: value.taskId,
      lookName: typeof value.lookName === 'string' ? value.lookName : undefined,
      clientLookId: typeof value.clientLookId === 'string' ? value.clientLookId : undefined,
      taskSucceeded: value.taskSucceeded === true,
      progress: clampProgress(value.progress),
      expectedFileId: typeof value.expectedFileId === 'string' ? value.expectedFileId : undefined,
      previousLookIds: Array.isArray(value.previousLookIds)
        ? value.previousLookIds.filter((id): id is string => typeof id === 'string')
        : undefined,
    }
  } catch {
    return null
  }
}

function createController(assetId: number, userScope: string, storageKey: string) {
  const restored = readStoredTask(storageKey)
  let taskSucceeded = restored?.taskSucceeded ?? false
  let snapshot: AssetLookGenerationTaskSnapshot = restored ? {
    phase: taskSucceeded ? 'refreshing' : 'running',
    taskId: restored.taskId,
    lookName: restored.lookName,
    clientLookId: restored.clientLookId,
    expectedFileId: restored.expectedFileId,
    previousLookIds: restored.previousLookIds,
    progress: taskSucceeded ? 100 : restored.progress,
    revision: 0,
  } : { phase: 'idle', progress: 0, revision: 0 }
  updateTaskActivity(userScope, assetId, Boolean(snapshot.taskId), false)
  const listeners = new Set<() => void>()
  let timer: ReturnType<typeof window.setTimeout> | undefined
  let activeRequest: StudioAssetImageTaskRequest<StudioAssetImageTaskDetail> | undefined
  let pollRun = 0
  let consecutiveErrors = 0

  const publish = (next: Omit<AssetLookGenerationTaskSnapshot, 'revision'>) => {
    snapshot = { ...next, revision: snapshot.revision + 1 }
    try {
      if (snapshot.taskId) {
        const stored: StoredTask = {
          taskId: snapshot.taskId,
          lookName: snapshot.lookName,
          clientLookId: snapshot.clientLookId,
          taskSucceeded,
          progress: snapshot.progress,
          expectedFileId: snapshot.expectedFileId,
          previousLookIds: snapshot.previousLookIds,
        }
        window.sessionStorage.setItem(storageKey, JSON.stringify(stored))
      } else {
        window.sessionStorage.removeItem(storageKey)
      }
    } catch {
      // Browsers can disable storage; retain task ownership in memory in that case.
    }
    updateTaskActivity(userScope, assetId, Boolean(snapshot.taskId) || snapshot.phase === 'submitting')
    listeners.forEach((listener) => listener())
  }

  const stopPolling = () => {
    pollRun += 1
    if (timer !== undefined) window.clearTimeout(timer)
    timer = undefined
    const request = activeRequest
    activeRequest = undefined
    request?.cancel()
  }

  const canPoll = (run: number, taskId: string) => (
    run === pollRun
    && listeners.size > 0
    && getUserScope() === userScope
    && snapshot.taskId === taskId
    && !taskSucceeded
  )

  const schedulePoll = (run: number, taskId: string, delay: number) => {
    if (!canPoll(run, taskId)) return
    timer = window.setTimeout(() => {
      timer = undefined
      void poll(run, taskId)
    }, delay)
  }

  const poll = async (run: number, taskId: string) => {
    if (!canPoll(run, taskId) || activeRequest) return
    let request: StudioAssetImageTaskRequest<StudioAssetImageTaskDetail> | undefined
    try {
      request = StudioAssetGenerationApi.requestTaskDetail(taskId)
      activeRequest = request
      const detail = await request.promise
      if (!canPoll(run, taskId) || activeRequest !== request) return
      activeRequest = undefined
      consecutiveErrors = 0
      if (Number(detail.status) === 3 || detail.statusName?.trim() === '执行成功') {
        taskSucceeded = true
        const fileId = parseStudioAssetImageTaskResult(detail.result)?.fileId
        publish({
          ...snapshot,
          phase: 'refreshing',
          progress: 100,
          expectedFileId: fileId === null || fileId === undefined ? undefined : String(fileId),
          errorMessage: undefined,
        })
        return
      }
      // A failed status lookup is not evidence that the server task failed.
      if (Number(detail.status) > 3 || /失败|已取消|执行取消|failed|cancelled|canceled/i.test(detail.statusName ?? '') || detail.cancelledAt) {
        publish({
          phase: 'failed',
          progress: clampProgress(detail.progress, snapshot.progress),
          lookName: snapshot.lookName,
          errorMessage: detail.error?.trim() || detail.cancelReason?.trim() || detail.statusName?.trim()
            || bilingualText('造型生成失败', 'Look generation failed'),
        })
        return
      }
      const progress = clampProgress(detail.progress, snapshot.progress)
      if (snapshot.phase !== 'running' || snapshot.progress !== progress || snapshot.errorMessage !== undefined) {
        publish({ ...snapshot, phase: 'running', progress, errorMessage: undefined })
      }
      schedulePoll(run, taskId, POLL_INTERVAL_MS)
    } catch (error) {
      if (!canPoll(run, taskId) || activeRequest !== request) return
      activeRequest = undefined
      const retryDelay = POLL_RETRY_DELAYS_MS[consecutiveErrors++]
      publish({
        ...snapshot,
        phase: retryDelay === undefined ? 'poll-failed' : 'running',
        errorMessage: getApiErrorMessage(error, bilingualText('暂时无法查询造型生成进度', 'Look generation status is temporarily unavailable')),
      })
      if (retryDelay !== undefined) schedulePoll(run, taskId, retryDelay)
    }
  }

  const resume = () => {
    if (!snapshot.taskId || getUserScope() !== userScope) return
    if (taskSucceeded) {
      publish({ ...snapshot, phase: 'refreshing', errorMessage: undefined })
      return
    }
    if (activeRequest || timer !== undefined) return
    consecutiveErrors = 0
    publish({ ...snapshot, phase: 'running', errorMessage: undefined })
    void poll(pollRun, snapshot.taskId!)
  }

  return {
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => {
      listeners.add(listener)
      if (listeners.size === 1) resume()
      return () => {
        listeners.delete(listener)
        if (listeners.size === 0) stopPolling()
      }
    },
    submit: async (input: StudioAssetLookGenerateRequest, existingLookIds: string[] = [], clientLookId?: string) => {
      if (input.assetId !== assetId || getUserScope() !== userScope) {
        throw new Error(bilingualText('当前资产或登录用户已变化，请重新打开资产', 'The asset or signed-in user changed; reopen the asset'))
      }
      if (snapshot.taskId || snapshot.phase === 'submitting') {
        throw new Error(bilingualText('已有造型生成任务，请先恢复查询或刷新结果', 'A look generation task already exists; resume its status or refresh its results'))
      }
      stopPolling()
      taskSucceeded = false
      publish({ phase: 'submitting', progress: 0, lookName: input.name, clientLookId, previousLookIds: [...existingLookIds] })
      try {
        // Keep creation alive when the editor closes: its returned ID must remain recoverable.
        const taskId = await StudioAssetGenerationApi.requestLookGenerate(input).promise
        publish({ ...snapshot, phase: 'running', taskId, progress: 0, errorMessage: undefined })
        if (listeners.size > 0) resume()
      } catch (error) {
        publish({
          phase: 'failed',
          progress: 0,
          lookName: input.name,
          errorMessage: getApiErrorMessage(error, bilingualText('造型生成任务提交失败', 'Failed to submit the look generation task')),
        })
        throw error
      }
    },
    resume,
    setRefreshFailed: (taskId: string, errorMessage: string) => {
      if (snapshot.taskId !== taskId || !taskSucceeded) return
      publish({ ...snapshot, phase: 'refresh-failed', errorMessage })
    },
    complete: (taskId: string) => {
      if (snapshot.taskId !== taskId || !taskSucceeded) return
      stopPolling()
      taskSucceeded = false
      publish({ phase: 'idle', progress: 0 })
    },
  }
}

/** One task owner per asset and signed-in user, independent of editor mounting. */
export function getAssetLookGenerationTask(assetId: number) {
  const userScope = getUserScope()
  const key = `jellyfish.asset-look-generation.v1:${encodeURIComponent(userScope)}:${assetId}`
  let controller = controllers.get(key)
  if (!controller) {
    controller = createController(assetId, userScope, key)
    controllers.set(key, controller)
  }
  return controller
}
