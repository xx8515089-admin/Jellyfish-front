import { useCallback, useEffect, useRef, useState } from 'react'
import { WorkflowService as api } from '../../../services/generated/services/WorkflowService'
import type { WorkflowMedia } from '../../../services/generated/models/WorkflowMedia'
import type { WorkflowPage } from '../../../services/generated/models/WorkflowPage'
import type { WorkflowImageRequest } from '../../../services/generated/models/WorkflowImageRequest'
import type { WorkflowVideoRequest } from '../../../services/generated/models/WorkflowVideoRequest'
import { getAuthToken, getStoredAuthUser } from '../../../auth'
import { OpenAPI } from '../../../services/generated/core/OpenAPI'
import { getHeaders } from '../../../services/generated/core/request'
import type { StudioStoryboardMediaHistoryItem } from '../../../services/studioAssetGeneration'
import { workflowMediaRead } from './workflowMediaTransport'
import { createWorkflowRequestId, isDefiniteSubmissionRejection, shouldRefreshWorkflowHistory, workflowShouldPoll, workflowPollDelay, workflowOutputReady } from './workflowMediaPolicy'
import { schedulePollWhenVisible, type PollTimerCancel } from './assetBatchGenerationPolling'

/** Unwrap the generated response envelope without treating missing data as success. */
export function workflowData<T>(result: { code: number; message?: string; data?: T }): T {
  if (result.code !== 200 || result.data == null) throw new Error(result.message || '请求失败')
  return result.data
}

/** Normalize only identities and display scalars; terminal/output readiness remain server-owned. */
export function workflowHistoryItem(item: WorkflowMedia, type = item.mediaType ?? 'video'): StudioStoryboardMediaHistoryItem {
  return { ...item, mediaType: type, id: String(item.id), itemKey: item.itemKey || `${type}:${item.id}`, generationRecordId: String(item.generationRecordId ?? item.id), resolution: item.resolution == null ? undefined : String(item.resolution), thumbnailUrl: null }
}

type Pending = { type: 'image' | 'video'; body: WorkflowImageRequest | WorkflowVideoRequest; language: string }

/** Each visited segment owns a polling lane; pagination and submission recovery never recreate a task implicitly. */
export function useWorkflowMedia(segmentId: string | undefined) {
  const [pages, setPages] = useState<Record<string, WorkflowPage>>({})
  const [tasks, setTasks] = useState<Record<string, WorkflowMedia[]>>({})
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [pending, setPending] = useState<Pending>()
  const [completedMedia, setCompletedMedia] = useState<{ segmentId: string; itemKey: string }>()
  const lanes = useRef(new Map<string, { stop: () => void }>())
  const mediaLanes = useRef(new Map<string, { stop: () => void }>())
  const alive = useRef(true)
  const submissionLock = useRef(false)
  const requests = useRef(new Set<AbortController>())
  const pendingRef = useRef<Pending>()
  const pageRevision = useRef(new Map<string, number>())
  const auth = getAuthToken()
  // Account-scoped session drafts contain the original request, never authentication secrets.
  const user = getStoredAuthUser()
  const storageKey = `workflow-submission:${user?.id ?? user?.username ?? 'anonymous'}`
  const refresh = useCallback(async (id: string, cursor?: string) => {
    const revision = cursor ? pageRevision.current.get(id) ?? 0 : (pageRevision.current.get(id) ?? 0) + 1
    if (!cursor) pageRevision.current.set(id, revision)
    const request = new AbortController(); requests.current.add(request)
    setLoading(true)
    try {
      const page = await workflowMediaRead<WorkflowPage>(`/api/v1/studio/storyboards/media/historyPage?segmentId=${encodeURIComponent(id)}&pageSize=20${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`, request.signal)
      if (!alive.current || revision !== pageRevision.current.get(id)) return
      setPages((current) => {
        if (!cursor && current[id] === page) return current
        const items = cursor ? [...(current[id]?.items ?? []), ...page.items].filter((item, index, all) => all.findIndex((other) => (other.itemKey ?? `${other.mediaType}:${other.id}`) === (item.itemKey ?? `${item.mediaType}:${item.id}`)) === index) : page.items
        return { ...current, [id]: cursor ? { ...page, items } : page }
      }); setError('')
    } catch (reason) { if (alive.current && !request.signal.aborted) setError(reason instanceof Error ? reason.message : '历史查询失败') }
    finally { requests.current.delete(request); if (alive.current) setLoading(false) }
  }, [])

  /** Poll each media detail by its generation id and retain progress until the output is ready. */
  const watchMedia = useCallback((generationId: number, owner: number, type: 'image' | 'video' = 'image') => {
    const taskKey = `${type}:${generationId}`
    if (mediaLanes.current.has(taskKey)) return
    let active = true
    let timer: PollTimerCancel | undefined
    let request: ReturnType<typeof api.imageDetail> | undefined
    let failures = 0
    const poll = async () => {
      try {
        request = type === 'image' ? api.imageDetail({ id: generationId }) : api.videoDetail({ id: generationId })
        const detail = workflowData(await request)
        if (!active) return
        failures = 0
        const item: WorkflowMedia = { ...detail, mediaType: type, itemKey: `${type}:${detail.id}` }
        const ownerId = String(owner)
        setTasks((current) => ({ ...current, [ownerId]: [...(current[ownerId] ?? []).filter((entry) => !(entry.mediaType === type && entry.id === generationId)), ...[item]] }))
        if (workflowShouldPoll(item)) {
          timer = schedulePollWhenVisible(() => void poll(), workflowPollDelay(item))
          return
        }
        await refresh(ownerId)
        if (!active) return
        // Detail is authoritative even if the history list has not caught up yet.
        setPages((current) => ({ ...current, [ownerId]: { ...(current[ownerId] ?? { hasMore: false }), items: [item, ...(current[ownerId]?.items ?? []).filter((entry) => !(entry.mediaType === type && entry.id === generationId))] } }))
        if (workflowOutputReady(item)) setCompletedMedia({ segmentId: ownerId, itemKey: taskKey })
        setTasks((current) => ({ ...current, [ownerId]: (current[ownerId] ?? []).filter((entry) => !(entry.mediaType === type && entry.id === generationId)) }))
        if (item.status !== 3) setError(item.errorMessage || item.error || item.statusName || '生成未成功')
        mediaLanes.current.delete(taskKey)
      } catch (reason) {
        if (!active) return
        if (++failures < 3) timer = schedulePollWhenVisible(() => void poll(), failures * 3000)
        else { setError(reason instanceof Error ? reason.message : '生成状态查询失败'); mediaLanes.current.delete(taskKey) }
      }
    }
    mediaLanes.current.set(taskKey, { stop: () => { active = false; timer?.(); request?.cancel() } })
    void poll()
  }, [refresh])

  const watch = useCallback((id: string, force = false) => {
    if (lanes.current.has(id) && !force) return
    lanes.current.get(id)?.stop()
    let active = true
    let timer: PollTimerCancel | undefined
    let request: AbortController | undefined
    let previous: WorkflowMedia[] | undefined
    let failures = 0
    const poll = async () => {
      request = new AbortController()
      try {
        const result = await workflowMediaRead<WorkflowMedia[]>(`/api/v1/studio/storyboards/media/activeTasks?segmentId=${encodeURIComponent(id)}`, request.signal)
        if (!active) return
        failures = 0
        setTasks((current) => current[id] === result ? current : { ...current, [id]: result })
        result.filter(workflowShouldPoll).forEach((item) => watchMedia(item.id, item.segmentId, item.mediaType ?? 'video'))
        if (shouldRefreshWorkflowHistory(previous, result)) void refresh(id)
        previous = result
        lanes.current.delete(id)
      } catch (reason) {
        if (!active) return
        if (++failures < 3) timer = schedulePollWhenVisible(() => void poll(), failures * 3000)
        else { setError(reason instanceof Error ? reason.message : '任务查询失败'); lanes.current.delete(id) }
      }
    }
    lanes.current.set(id, { stop: () => { active = false; timer?.(); request?.abort() } })
    void poll()
  }, [refresh, watchMedia])

  useEffect(() => {
    alive.current = true
    setPages({}); setTasks({})
    try { const saved = JSON.parse(sessionStorage.getItem(storageKey) || 'null') as Pending | null; pendingRef.current = saved ?? undefined; setPending(saved ?? undefined) } catch { /* Ignore invalid persisted drafts. */ }
    return () => { alive.current = false; mediaLanes.current.forEach((lane) => lane.stop()); mediaLanes.current.clear(); lanes.current.forEach((lane) => lane.stop()); lanes.current.clear(); requests.current.forEach((request) => request.abort()) }
  }, [storageKey, auth])
  useEffect(() => {
    if (!segmentId) return
    watch(segmentId, true)
    const visible = () => { if (document.visibilityState === 'visible') watch(segmentId, true) }
    document.addEventListener('visibilitychange', visible)
    return () => document.removeEventListener('visibilitychange', visible)
  }, [segmentId, watch, storageKey, auth])

  /** Persist the original request before POST; uncertainty keeps its identity available for lookup. */
  const sendOriginal = async (draft: Pending) => {
    try {
      const response = draft.type === 'image' ? await api.generateImage({ requestBody: draft.body as WorkflowImageRequest, language: draft.language }) : await api.generateVideo({ requestBody: draft.body as WorkflowVideoRequest, language: draft.language })
      const result = workflowData(response)
      if (!alive.current || getAuthToken() !== auth) return result
      pendingRef.current = undefined; setPending(undefined); sessionStorage.removeItem(storageKey)
      setTasks((current) => ({ ...current, [String(result.segmentId)]: [...(current[String(result.segmentId)] ?? []).filter((item) => !(item.id === result.id && item.mediaType === draft.type)), { ...result, mediaType: draft.type }] }))
      watchMedia(result.id, result.segmentId, draft.type)
      return result
    } catch (reason) {
      // A structured rejection is known, unlike a timeout. Keep conflicting accepted keys for investigation.
      if (alive.current && getAuthToken() === auth && isDefiniteSubmissionRejection(reason)) {
        pendingRef.current = undefined; setPending(undefined); sessionStorage.removeItem(storageKey)
      }
      throw reason
    } finally { submissionLock.current = false }
  }
  const submit = async (type: Pending['type'], body: Pending['body']) => {
    if (submissionLock.current || pendingRef.current) throw new Error('请先核查上一次提交状态')
    submissionLock.current = true
    try {
      const headers = await getHeaders(OpenAPI, { method: 'POST', url: `/api/v1/studio/storyboards/${type}s/generate` })
      const draft = { type, body: { ...body, clientRequestId: createWorkflowRequestId() }, language: headers.get('language') ?? 'en' }
      sessionStorage.setItem(storageKey, JSON.stringify(draft))
      pendingRef.current = draft; setPending(draft)
      return await sendOriginal(draft)
    } finally { submissionLock.current = false }
  }
  /** Retry exactly the saved request, retaining its language and idempotency key. */
  const retrySubmission = async () => {
    if (submissionLock.current || !pendingRef.current) return
    submissionLock.current = true
    try { await sendOriginal(pendingRef.current); setError('') }
    catch (reason) { setError(reason instanceof Error ? reason.message : '重试失败') }
  }
  /** Look up acceptance without dispatching a new billable generation. */
  const recover = async () => {
    const draft = pendingRef.current
    if (!draft) return
    try {
      const found = workflowData(await api.submission({ generationType: draft.type, clientRequestId: draft.body.clientRequestId! }))
      if (!alive.current || getAuthToken() !== auth) return
      pendingRef.current = undefined; setPending(undefined); sessionStorage.removeItem(storageKey)
      watchMedia(found.generationRecordId, found.segmentId, draft.type)
      setError('')
    } catch (reason) { setError(reason instanceof Error ? reason.message : '提交暂未查到，请稍后再查') }
  }
  return { page: segmentId ? pages[segmentId] : undefined, tasks, error, loading, pending, completedMedia, refresh, watch, submit, recover, retrySubmission }
}
