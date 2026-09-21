import { useCallback, useEffect, useRef, useState } from 'react'
import { getAuthToken, getStoredAuthUser } from '../../../auth'
import { videoBatchErrorMessage } from '../../../services/storyboardVideoBatchErrors'
import { StoryboardVideoBatchApi as api, type BatchScope, type VideoBatchDetail, type VideoBatchSubmission } from '../../../services/storyboardVideoBatch'
import { schedulePollWhenVisible } from './assetBatchGenerationPolling'
import { isVideoBatchRejected, videoBatchErrorCode } from './storyboardVideoBatchPolicy'

export function useStoryboardVideoBatches(scope: BatchScope, onChange: (batch: VideoBatchDetail) => void, onSubmissionAccepted?: (batch: VideoBatchDetail) => void) {
  const auth = getAuthToken()
  const storageKey = `storyboard-video-batch:${getStoredAuthUser()?.id ?? 'anonymous'}:${scope.scriptImportId}:${scope.episodeId}`
  const [batches, setBatches] = useState<VideoBatchDetail[]>([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [pending, setPending] = useState<VideoBatchSubmission | undefined>(() => {
    try { return JSON.parse(sessionStorage.getItem(storageKey) || 'null') ?? undefined } catch { return undefined }
  })
  const [hasMore, setHasMore] = useState(false)
  const [pollVersion, setPollVersion] = useState(0)
  const pendingRef = useRef(pending)
  const lock = useRef(false)
  const alive = useRef(false)
  const context = useRef({ storageKey, auth })
  if (context.current.storageKey !== storageKey || context.current.auth !== auth) {
    context.current = { storageKey, auth }
  }
  const session = context.current
  const callback = useRef(onChange)
  callback.current = onChange
  const acceptedCallback = useRef(onSubmissionAccepted)
  acceptedCallback.current = onSubmissionAccepted
  const observed = useRef(new Map<number, string>())
  const current = useCallback(() => alive.current && context.current === session && getAuthToken() === auth, [auth, session])
  const accept = useCallback((batch: VideoBatchDetail) => {
    if (!current()) return
    setBatches((items) => [...items.filter((item) => item.id !== batch.id), batch].sort((a, b) => b.id - a.id))
    const signature = JSON.stringify(batch.items?.map((item) => [item.segmentId, item.generationId, item.status]))
    if (observed.current.get(batch.id) !== signature) {
      observed.current.set(batch.id, signature)
      callback.current(batch)
    }
  }, [current])
  const clearPending = useCallback(() => {
    pendingRef.current = undefined
    setPending(undefined)
    sessionStorage.removeItem(storageKey)
  }, [storageKey])
  // Only confirmed acceptance ends a submission, including manual and automatic recovery.
  const finishSubmission = useCallback((batch: VideoBatchDetail) => {
    if (!current()) return
    accept(batch); clearPending(); setError('')
    acceptedCallback.current?.(batch)
  }, [accept, clearPending, current])
  const load = useCallback(async (beforeId?: number) => {
    try {
      const items = await api.list({ scriptImportId: scope.scriptImportId, episodeId: scope.episodeId }, beforeId)
      if (!current()) return
      items.forEach(accept)
      setHasMore(items.length === 10)
      setError('')
    } catch (reason) { if (current()) setError(videoBatchErrorMessage(reason, '加载批次失败')) }
  }, [scope.scriptImportId, scope.episodeId, current, accept])
  const recover = useCallback(async () => {
    if (lock.current || !pendingRef.current) return
    lock.current = true; setBusy(true)
    try {
      const batch = await api.submission(pendingRef.current.clientRequestId)
      if (!current()) return
      finishSubmission(batch)
    } catch (reason) {
      if (current()) setError(videoBatchErrorCode(reason) === 'VIDEO_BATCH_SUBMISSION_NOT_FOUND'
        ? '暂未找到已接收批次，可使用下方按钮原样重发；不会更换提交标识。' : videoBatchErrorMessage(reason, '查询提交失败'))
    } finally { if (current()) { lock.current = false; setBusy(false) } }
  }, [finishSubmission, current])
  useEffect(() => {
    alive.current = true
    lock.current = false
    setBusy(false); setBatches([]); setError(''); setHasMore(false)
    observed.current.clear()
    let restored: VideoBatchSubmission | undefined
    try { restored = JSON.parse(sessionStorage.getItem(storageKey) || 'null') ?? undefined } catch { restored = undefined }
    pendingRef.current = restored; setPending(restored)
    void load()
    void recover()
    return () => { alive.current = false }
  }, [load, recover, storageKey])

  const pollIds = batches.filter((batch) => batch.shouldPoll).map((batch) => batch.id).join(',')
  useEffect(() => {
    if (!pollIds) return
    let active = true
    let failures = 0
    let cancel: (() => void) | undefined
    const tick = async () => {
      const results = await Promise.allSettled(pollIds.split(',').map((id) => api.detail(Number(id))))
      if (!active || !current()) return
      let failed = false
      for (const result of results) {
        if (result.status === 'fulfilled') accept(result.value)
        else { failed = true; setError(videoBatchErrorMessage(result.reason, '更新批次进度失败')) }
      }
      failures = failed ? failures + 1 : 0
      if (!failed) setError('')
      if (failures < 3) cancel = schedulePollWhenVisible(() => void tick(), failed ? 8000 : 4000)
    }
    cancel = schedulePollWhenVisible(() => void tick(), 4000)
    return () => { active = false; cancel?.() }
  }, [pollIds, accept, current, pollVersion])

  const send = async (draft?: VideoBatchSubmission) => {
    if (lock.current) return
    const frozen = pendingRef.current ?? draft
    if (!frozen) return
    lock.current = true; setBusy(true); setError('')
    try {
      // Persist before dispatch: a reload must not lose the original identity or request.
      sessionStorage.setItem(storageKey, JSON.stringify(frozen))
      pendingRef.current = frozen; setPending(frozen)
      const batch = await (frozen.retryOfBatchId === null ? api.create(frozen) : api.retry(frozen))
      if (!current()) return
      finishSubmission(batch)
      return batch
    } catch (reason) {
      if (current()) {
        if (isVideoBatchRejected(reason)) clearPending()
        setError(videoBatchErrorMessage(reason, '提交结果尚未确认，请查询提交状态或原样重发'))
      }
      throw reason
    } finally { if (current()) { lock.current = false; setBusy(false) } }
  }
  const refresh = async () => {
    setPollVersion((value) => value + 1)
    await load()
    // Include older loaded batches, including needsReview after an external recovery.
    const results = await Promise.allSettled(batches.map((batch) => api.detail(batch.id)))
    if (!current()) return
    for (const result of results) {
      if (result.status === 'fulfilled') accept(result.value)
      else setError(videoBatchErrorMessage(result.reason, '刷新批次失败'))
    }
  }
  return { batches, pending, busy, error, hasMore, send, recover, refresh, loadMore: () => load(batches[batches.length - 1]?.id) }
}
