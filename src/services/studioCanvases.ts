import type { CanvasCapabilities, CanvasTextCapabilities, CanvasTextModel, CanvasTextOperation, CanvasTextEstimateRequest, CanvasTextQuote, CanvasTextCreateRequest, CanvasTextTask, CanvasLibraryReview, CanvasPublishLibraryRequest, CanvasLibraryPublication, CanvasBatchSummary, CanvasBatchEstimate } from './studioCanvasV3Types'
import type { CanvasExecutionCapabilities, CanvasExecutionModel, CanvasChatEstimateRequest, CanvasExecutionQuote, CanvasExecutionCreate, CanvasExecutionTask, CanvasChatSession, CanvasChatMessage, CanvasWorkflowCapabilities, CanvasWorkflowEstimateRequest, CanvasWorkflowQuote, CanvasWorkflow } from './studioCanvasV4Types'
import { getStoredAuthUser } from '../auth'
import { OpenAPI } from './generated'
import { getHeaders } from './generated/core/request'
import type { ApiRequestOptions } from './generated/core/ApiRequestOptions'

export type CanvasOperation = 'imageGenerate' | 'videoGenerate'
export interface CanvasModel {
  modelId: number; supplierId: number; supplierName: string; name: string; modelCode: string; defaultModel: boolean
  operation: CanvasOperation; available: boolean; unavailableReason?: string; supportedNodeTypes: string[]; inputPorts: string[]; referenceRoles: string[]
  parameters: { ratios?: string[]; resolutions?: (string | number)[]; qualities?: number[]; minReferenceImages?: number; maxReferenceImages?: number; maxPromptCharacters?: number; minDurationSeconds?: number; maxDurationSeconds?: number; generateAudio?: boolean }
  supportsResultRecovery?: boolean; billingRules?: unknown[]
}
export interface CanvasAssetSource { sourceLinkId: CanvasId; assetType: number; libraryItemId: CanvasId; snapshotHash?: string; snapshot?: { name?: string; identityPrompt?: string; lookName?: string; lookPrompt?: string } }
export interface CanvasAssetReceipt { clientRequestId: string; operation: string; asset: CanvasAsset; source?: CanvasAssetSource }
export interface CanvasBatchRequest { canvasId: CanvasId; revisionNo: number; clientRequestId: string; maxTotalCredits?: number; items: { clientItemId: string; nodeId: string; shotId?: CanvasId; operation: CanvasOperation; count: number }[] }
export interface CanvasBatch { batchId: CanvasId; canvasId: CanvasId; status: string; shouldPoll: boolean; reservedCredits?: number; parentBatchId?: CanvasId; items: { clientItemId: string; outputIndex: number; generation: CanvasGeneration }[] }
export type CanvasId = number | string
export interface CanvasSummary {
  coverAssetId?: number | null
  coverFileId?: number | null
  coverUrl?: string | null
  coverType?: 'image' | 'video' | null
  coverContentUrl?: string | null
  canvasId: CanvasId; name: string; revisionNo: number; currentRevisionNo: number
  createdAt: string; updatedAt: string
}
export interface CanvasAssetIssue { nodeId: string | null; shotId?: string | null; fieldPath: string; assetId: CanvasId; errorCode: string }
export interface CanvasDocument extends CanvasSummary {
  deleted?: boolean
  assetIssues?: CanvasAssetIssue[]
  schemaVersion: number
  project: { nodes: unknown[]; connections: unknown[]; view: { x: number; y: number; zoom: number }; projectName?: string; [key: string]: unknown }
  assetBindings: { nodeId: string; fieldPath: string; assetId: CanvasId; shotId?: CanvasId; sourceLinkId?: CanvasId }[]
  modelBindings: { nodeId: string; fieldPath: string; modelId: number; shotId?: CanvasId; operation?: CanvasOperation | CanvasTextOperation }[]
}
export interface CanvasAsset {
  assetId: CanvasId; canvasId: CanvasId; name: string; mediaType: string; mimeType: string
  availability?: 'available' | 'missing'; unavailableCode?: string | null
  sources?: CanvasAssetSource[]; sourceLinkId?: CanvasId; sizeBytes: number; url?: string; contentUrl?: string; downloadUrl?: string; removed?: boolean
}
export interface CanvasGeneration {
  generationId: CanvasId; canvasId: CanvasId; revisionNo: number; nodeId: string
  shotId?: CanvasId; batchId?: CanvasId; shouldPoll?: boolean; actions?: { cancel: boolean; retry: boolean; syncResult: boolean; retrySettlement: boolean }; billing?: { reservedCredits: number | null; settledCredits: number | null }
  retryAfterMs?: number; status: number; progress: number; cancelRequested: boolean; error?: string; billingState: string
  operation: 'imageGenerate' | 'videoGenerate'; canSync: boolean; outputs: CanvasAsset[]; createdAt: string
}
export interface CanvasGenerateRequest {
  canvasId: CanvasId; revisionNo: number; nodeId: string; shotId?: CanvasId
  operation: 'imageGenerate' | 'videoGenerate'; clientRequestId: string
}
export interface CanvasPage<T> { items: T[]; page: number; pageSize: number; total: number }
export type CanvasSubmissionState = 'unknown' | 'notFound' | 'notAccepted'
export interface CanvasFailure {
  errorCode?: string; nodeId?: string | null; shotId?: CanvasId | null; fieldPath?: string | null
  submissionState?: CanvasSubmissionState; retryable?: boolean; retryAfterMs?: number | null
}
export function canvasRetryAfter(data?: CanvasFailure, headers?: Headers, now = Date.now()) {
  if (typeof data?.retryAfterMs === 'number' && Number.isFinite(data.retryAfterMs) && data.retryAfterMs >= 0) return data.retryAfterMs
  const value = headers?.get('Retry-After')
  if (!value) return undefined
  const seconds = Number(value)
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000
  const date = Date.parse(value)
  return Number.isFinite(date) ? Math.max(0, date - now) : undefined
}
export class CanvasApiError extends Error {
  readonly submissionState: CanvasSubmissionState
  readonly retryable: boolean
  readonly retryAfterMs?: number
  readonly data?: CanvasFailure
  readonly location?: CanvasFailure
  constructor(message: string, public errorCode?: string, public status?: number, data?: CanvasFailure, public headers?: Headers, public envelopeCode?: number) {
    super(message)
    this.name = 'CanvasApiError'
    this.data = data; this.location = data
    this.submissionState = ['notFound', 'notAccepted'].includes(data?.submissionState || '') ? data!.submissionState! : 'unknown'
    this.retryable = data?.retryable === true
    this.retryAfterMs = canvasRetryAfter(data, headers)
  }
}
export const canvasPollDelay = (...values: Array<{ retryAfterMs?: number } | null | undefined>) =>
  Math.max(typeof document !== 'undefined' && document.hidden ? 15000 : 2500, ...values.map(value => Number.isFinite(value?.retryAfterMs) ? Math.max(0, value!.retryAfterMs!) : 0))
export const canvasRequestId = (operation: string) => {
  if (typeof crypto.randomUUID === 'function') return `${operation}-${crypto.randomUUID()}`
  // getRandomValues remains available on HTTP LAN deployments where randomUUID is absent.
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  return `${operation}-${Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('')}`
}
/** Unwrap the shared response envelope for generated canvas clients. */
export async function canvasResult<T>(pending: PromiseLike<{ code: number; message?: string; data: any }>): Promise<T> {
  try {
    const result = await pending
    if (result.code !== 200) throw new CanvasApiError(result.message || '画布请求失败', result.data?.errorCode, undefined, result.data, undefined, result.code)
    return result.data
  } catch (error) {
    const body = (error as { body?: { message?: string; data?: { errorCode?: string; nodeId?: string; shotId?: CanvasId; fieldPath?: string } } }).body
    if (body) throw new CanvasApiError(body.message || '画布请求失败', body.data?.errorCode, (error as { status?: number }).status, body.data)
    throw error
  }
}
/** Canvas-specific transport retains structured failures and headers for every HTTP status. */
const accountScope = () => { const user = getStoredAuthUser(); return String(user?.id ?? user?.username ?? 'anonymous') }
const assertAccountScope = (owner: string) => { if (accountScope() !== owner) throw new CanvasApiError('登录账户已变化，请使用原账户恢复请求；记录已保留') }
const backoff = new Map<string, { until: number; error: CanvasApiError }>()
export async function canvasCall<T>(options: ApiRequestOptions): Promise<T> {
  const owner = accountScope()
  const headers = new Headers(await getHeaders(OpenAPI, options))
  assertAccountScope(owner)
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(options.query || {})) if (value != null) query.set(key, String(value))
  const url = (OpenAPI.BASE || '') + options.url + (query.size ? '?' + query.toString() : '')
  // Memory only; never persist authentication headers in recovery records.
  const throttleKey = headers.get('Authorization') + ':' + options.url
  const waiting = backoff.get(throttleKey)
  if (waiting && waiting.until > Date.now()) throw new CanvasApiError(waiting.error.message, waiting.error.errorCode, waiting.error.status, { ...waiting.error.data, submissionState: 'unknown', retryAfterMs: waiting.until - Date.now() }, waiting.error.headers, waiting.error.envelopeCode)
  backoff.delete(throttleKey)
  let body: BodyInit | undefined
  if (options.formData) {
    const form = new FormData()
    for (const [key, value] of Object.entries(options.formData)) if (value != null) form.append(key, value)
    body = form
    headers.delete('Content-Type')
  } else if (options.body !== undefined) body = JSON.stringify(options.body)
  let response: Response
  try { response = await fetch(url, { method: options.method, headers, body, credentials: OpenAPI.WITH_CREDENTIALS ? OpenAPI.CREDENTIALS : 'same-origin' }) }
  catch (cause) { throw new CanvasApiError(cause instanceof Error ? cause.message : '网络请求失败，原提交已保留') }
  let result: { code?: number; message?: string; data?: any } | undefined
  try { result = await response.json() } catch { /* HTML, empty and interrupted responses remain unknown. */ }
  assertAccountScope(owner)
  if (!response.ok || result?.code !== 200) {
    const error = new CanvasApiError(result?.message || '画布请求失败（' + response.status + '），请保留原请求稍后恢复', result?.data?.errorCode, response.status, result?.data, response.headers, result?.code)
    if (error.retryAfterMs != null || response.status === 429) backoff.set(throttleKey, { until: Date.now() + (error.retryAfterMs ?? 3000), error })
    throw error
  }
  return result.data as T
}
const call = canvasCall
const base = '/api/v1/studio/canvases'
const get = <T>(path: string, query: Record<string, unknown> = {}) => call<T>({ method: 'GET', url: base + path, query })
const post = <T>(path: string, body: unknown) => call<T>({ method: 'POST', url: base + path, body, mediaType: 'application/json' })
export type CanvasReviewFamily = 'generation' | 'text' | 'analysis' | 'execution'
export interface CanvasReviewRecordRequest { family: CanvasReviewFamily; taskRef: CanvasId; clientRequestId: string; state: 'open' | 'awaitingProvider' | 'resolved'; reason: string; evidenceRef: string; providerTaskId?: string }
export interface CanvasReviewItem { id: CanvasId; taskId?: CanvasId; canvasId?: CanvasId; status?: number; billingState?: string; providerTaskId?: string }
export interface CanvasReviewRecord { id?: CanvasId; family?: CanvasReviewFamily; taskRef?: CanvasId; state: string; reason: string; evidenceRef: string; createdAt?: string }
export const StudioCanvases = {
  reviewPending: (family: CanvasReviewFamily, page = 1) => get<CanvasPage<CanvasReviewItem>>('/review/pending', { family, page, pageSize: 20 }),
  reviewHistory: (family: CanvasReviewFamily, taskRef: CanvasId, page = 1) => get<CanvasReviewRecord[]>('/review/history', { family, taskRef, page, pageSize: 20 }),
  reviewRecord: (body: CanvasReviewRecordRequest) => post<CanvasReviewRecord>('/review/record', body),
  executionCapabilities: () => get<CanvasExecutionCapabilities>('/executions/capabilities'),
  executionModels: (operation?: string) => get<CanvasExecutionModel[]>('/executions/models', { operation }),
  executionEstimate: (body: CanvasChatEstimateRequest) => post<CanvasExecutionQuote>('/executions/costEstimate', body),
  executionCreate: (body: CanvasExecutionCreate) => post<CanvasExecutionTask>('/executions/create', body),
  executionDetail: (canvasId: CanvasId, taskId: CanvasId) => get<CanvasExecutionTask>('/executions/detail', { canvasId, taskId }),
  executionSubmission: (canvasId: CanvasId, clientRequestId: string) => get<CanvasExecutionTask>('/executions/submission', { canvasId, clientRequestId }),
  executionList: (canvasId: CanvasId, page = 1, filters: { nodeId?: string; status?: number; operation?: string } = {}) => get<CanvasPage<CanvasExecutionTask>>('/executions/list', { canvasId, page, pageSize: 20, ...filters }),
  executionCancel: (canvasId: CanvasId, taskId: CanvasId) => post<CanvasExecutionTask>('/executions/cancel', { canvasId, taskId }),
  executionRetry: (body: CanvasExecutionCreate & { taskId: CanvasId }) => post<CanvasExecutionTask>('/executions/retry', body),
  executionRetrySettlement: (canvasId: CanvasId, taskId: CanvasId) => post<CanvasExecutionTask>('/executions/retrySettlement', { canvasId, taskId }),
  executionSyncResult: (canvasId: CanvasId, taskId: CanvasId) => post<CanvasExecutionTask>('/executions/syncResult', { canvasId, taskId }),
  executionAllowedActions: (canvasId: CanvasId, taskId: CanvasId) => get<unknown[]>('/executions/allowedActions', { canvasId, taskId }),
  chatSessionCreate: (body: { canvasId: CanvasId; title: string; clientRequestId: string }) => post<CanvasChatSession>('/chat/sessions/create', body),
  chatSessions: (canvasId: CanvasId, page = 1) => get<CanvasPage<CanvasChatSession>>('/chat/sessions/list', { canvasId, page, pageSize: 20 }),
  chatMessages: (canvasId: CanvasId, sessionId: CanvasId) => get<CanvasChatMessage[]>('/chat/messages', { canvasId, sessionId }),
  chatArchive: (canvasId: CanvasId, sessionId: CanvasId, archived: boolean) => post<CanvasChatSession>('/chat/sessions/archive', { canvasId, sessionId, archived }),
  workflowCapabilities: () => get<CanvasWorkflowCapabilities>('/workflows/capabilities'),
  workflowEstimate: (body: CanvasWorkflowEstimateRequest) => post<CanvasWorkflowQuote>('/workflows/costEstimate', body),
  workflowCreate: (body: CanvasExecutionCreate & { maxReservedCredits: number }) => post<CanvasWorkflow>('/workflows/create', body),
  workflowDetail: (canvasId: CanvasId, workflowId: CanvasId) => get<CanvasWorkflow>('/workflows/detail', { canvasId, workflowId }),
  workflowSubmission: (canvasId: CanvasId, clientRequestId: string) => get<CanvasWorkflow>('/workflows/submission', { canvasId, clientRequestId }),
  workflows: (canvasId: CanvasId, page = 1) => get<CanvasPage<CanvasWorkflow>>('/workflows/list', { canvasId, page, pageSize: 20 }),
  workflowCancel: (canvasId: CanvasId, workflowId: CanvasId) => post<CanvasWorkflow>('/workflows/cancel', { canvasId, workflowId }),
  workflowResume: (canvasId: CanvasId, workflowId: CanvasId) => post<CanvasWorkflow>('/workflows/resume', { canvasId, workflowId }),
  capabilities: () => get<CanvasCapabilities>('/capabilities'),
  textCapabilities: () => get<CanvasTextCapabilities>('/tasks/capabilities'),
  textModels: (operation?: CanvasTextOperation) => get<CanvasTextModel[]>('/tasks/models', { operation }),
  textEstimate: (body: CanvasTextEstimateRequest) => post<CanvasTextQuote>('/tasks/costEstimate', body),
  textCreate: (body: CanvasTextCreateRequest) => post<CanvasTextTask>('/tasks/create', body),
  textDetail: (canvasId: CanvasId, taskId: CanvasId) => get<CanvasTextTask>('/tasks/detail', { canvasId, taskId }),
  textSubmission: (canvasId: CanvasId, clientRequestId: string) => get<CanvasTextTask>('/tasks/submission', { canvasId, clientRequestId }),
  textList: (canvasId: CanvasId, page = 1, filters: { nodeId?: string; status?: number } = {}) => get<CanvasPage<CanvasTextTask>>('/tasks/list', { canvasId, page, pageSize: 20, ...filters }),
  textCancel: (canvasId: CanvasId, taskId: CanvasId) => post<CanvasTextTask>('/tasks/cancel', { canvasId, taskId }),
  textRetry: (body: CanvasTextCreateRequest & { taskId: CanvasId }) => post<CanvasTextTask>('/tasks/retry', body),
  textRetrySettlement: (canvasId: CanvasId, taskId: CanvasId) => post<CanvasTextTask>('/tasks/retrySettlement', { canvasId, taskId }),
  reviewLibrary: (body: { canvasId: CanvasId; canvasAssetId: CanvasId; clientRequestId: string }) => post<CanvasLibraryReview>('/assets/reviewLibrary', body),
  reviewLibrarySubmission: (canvasId: CanvasId, clientRequestId: string) => get<CanvasLibraryReview>('/assets/reviewLibrarySubmission', { canvasId, clientRequestId }),
  publishLibrary: (body: CanvasPublishLibraryRequest) => post<CanvasLibraryPublication>('/assets/publishLibrary', body),
  batches: (canvasId: CanvasId, page = 1, status?: string) => get<CanvasPage<CanvasBatchSummary>>('/batches/list', { canvasId, page, pageSize: 20, status }),
  models: (query: { operation?: CanvasOperation; supplierId?: number; includeUnavailable?: boolean } = {}) => get<CanvasModel[]>('/models', query),
  attachLibrary: (body: { canvasId: CanvasId; assetType: number; libraryItemId: CanvasId; mediaSelection: 'cover'; clientRequestId: string }) => post<CanvasAssetReceipt>('/assets/attachLibrary', body),
  assetSubmission: (canvasId: CanvasId, clientRequestId: string) => get<CanvasAssetReceipt>('/assets/submission', { canvasId, clientRequestId }),
  batchEstimate: (body: CanvasBatchRequest) => post<CanvasBatchEstimate>('/batches/costEstimate', body),
  batchCreate: (body: CanvasBatchRequest) => post<CanvasBatch>('/batches/create', body),
  batchDetail: (canvasId: CanvasId, batchId: CanvasId) => get<CanvasBatch>('/batches/detail', { canvasId, batchId }),
  batchSubmission: (canvasId: CanvasId, clientRequestId: string) => get<CanvasBatch>('/batches/submission', { canvasId, clientRequestId }),
  batchCancel: (canvasId: CanvasId, batchId: CanvasId) => post<CanvasBatch>('/batches/cancel', { canvasId, batchId }),
  batchRetry: (body: { canvasId: CanvasId; batchId: CanvasId; clientRequestId: string; maxTotalCredits: number }) => post<CanvasBatch>('/batches/retryFailed', body),
  retrySettlement: (canvasId: CanvasId, generationId: CanvasId) => post<CanvasGeneration>('/generations/retrySettlement', { canvasId, generationId }),
  list: (page = 1, pageSize = 20, keyword?: string) => get<CanvasPage<CanvasSummary>>('/list', { page, pageSize, keyword }),
  create: (name: string, clientRequestId: string) => post<CanvasDocument>('/create', { name, clientRequestId }),
  detail: (canvasId: CanvasId, revisionNo?: number) => get<CanvasDocument>('/detail', { canvasId, revisionNo }),
  save: (body: { canvasId: CanvasId; expectedRevisionNo: number; clientSaveId: string; schemaVersion: number; project: CanvasDocument['project']; assetBindings: CanvasDocument['assetBindings']; modelBindings: CanvasDocument['modelBindings'] }) => post<CanvasDocument>('/save', body),
  rename: (canvasId: CanvasId, expectedRevisionNo: number, name: string, clientRequestId: string) => post<CanvasDocument>('/rename', { canvasId, expectedRevisionNo, name, clientRequestId }),
  delete: (canvasId: CanvasId, expectedRevisionNo: number) => post<null>('/delete', { canvasId, expectedRevisionNo }),
  revisions: (canvasId: CanvasId, page = 1) => get<CanvasPage<{ revisionNo: number; createdAt: string }>>('/revisions', { canvasId, page, pageSize: 20 }),
  restore: (canvasId: CanvasId, expectedRevisionNo: number, sourceRevisionNo: number, clientRequestId: string) => post<CanvasDocument>('/restore', { canvasId, expectedRevisionNo, sourceRevisionNo, clientRequestId }),
  copy: (canvasId: CanvasId, sourceRevisionNo: number, name: string, clientRequestId: string) => post<CanvasDocument>('/copy', { canvasId, sourceRevisionNo, name, clientRequestId }),
  upload: (canvasId: CanvasId, file: File, clientRequestId?: string) => call<CanvasAsset>({ method: 'POST', url: base + '/assets/upload', formData: { canvasId, file, clientRequestId } }),
  assets: (canvasId: CanvasId, page = 1) => get<CanvasPage<CanvasAsset>>('/assets/list', { canvasId, page, pageSize: 100 }),
  attach: (canvasId: CanvasId, sourceAssetId: CanvasId) => post<CanvasAsset>('/assets/attach', { canvasId, sourceAssetId }),
  removeAsset: (canvasId: CanvasId, assetId: CanvasId) => post<null>('/assets/remove', { canvasId, assetId }),
  async content(canvasId: CanvasId, assetId: CanvasId, download = false, signal?: AbortSignal) {
    const owner = accountScope()
    const url = `${base}/assets/${download ? 'download' : 'content'}?canvasId=${encodeURIComponent(canvasId)}&assetId=${encodeURIComponent(assetId)}`
    const headers = await getHeaders(OpenAPI, { method: 'GET', url })
    assertAccountScope(owner)
    const response = await fetch((OpenAPI.BASE || "") + url, { headers, signal, credentials: OpenAPI.WITH_CREDENTIALS ? OpenAPI.CREDENTIALS : 'same-origin' })
    if (!response.ok) {
      let body: { message?: string; code?: number; data?: CanvasFailure } | undefined
      try { body = await response.json() } catch { /* Media errors can have an empty body. */ }
      throw new CanvasApiError(body?.message || '素材暂时读取失败（' + response.status + '）', body?.data?.errorCode, response.status, body?.data, response.headers, body?.code)
    }
    const blob = await response.blob()
    assertAccountScope(owner)
    return blob
  },
  estimate: (body: CanvasGenerateRequest) => post<{ creditCost: number; currentBalance: number; sufficient: boolean; unlimited: boolean }>('/generations/costEstimate', body),
  generate: (body: CanvasGenerateRequest) => post<CanvasGeneration>('/generations/create', body),
  generation: (canvasId: CanvasId, generationId: CanvasId) => get<CanvasGeneration>('/generations/detail', { canvasId, generationId }),
  generations: (canvasId: CanvasId, page = 1, nodeId?: string, filters: { shotId?: CanvasId; batchId?: CanvasId; status?: number } = {}) => get<CanvasPage<CanvasGeneration>>('/generations/list', { canvasId, page, pageSize: 20, nodeId, ...filters }),
  submission: (canvasId: CanvasId, clientRequestId: string) => get<CanvasGeneration>('/generations/submission', { canvasId, clientRequestId }),
  cancel: (canvasId: CanvasId, generationId: CanvasId) => post<CanvasGeneration>('/generations/cancel', { canvasId, generationId }),
  retry: (canvasId: CanvasId, generationId: CanvasId, clientRequestId: string) => post<CanvasGeneration>('/generations/retry', { canvasId, generationId, clientRequestId }),
  sync: (canvasId: CanvasId, generationId: CanvasId) => post<CanvasGeneration>('/generations/sync', { canvasId, generationId }),
}

/** Resolve each protected asset independently; a missing preview never deletes its binding. */
export async function hydrateCanvasDocument(document: CanvasDocument, urls: string[]) {
  const copy = JSON.parse(JSON.stringify(document)) as CanvasDocument
  const issues: CanvasAssetIssue[] = [...(copy.assetIssues || [])]
  const assets = new Map<string, Promise<string>>()
  const load = (assetId: CanvasId, sourceLinkId?: CanvasId) => {
    const key = String(assetId) + ':' + (sourceLinkId ?? '')
    if (!assets.has(key)) assets.set(key, (async () => {
      try {
        const blob = await StudioCanvases.content(copy.canvasId, assetId)
        const url = URL.createObjectURL(blob); urls.push(url)
        // A previously temporary failure can recover without changing provenance.
        for (let i = issues.length - 1; i >= 0; i--) if (String(issues[i].assetId) === String(assetId)) issues.splice(i, 1)
        return url
      } catch (error) {
        const reason = error as CanvasApiError
        if (!issues.some(issue => String(issue.assetId) === String(assetId))) {
          issues.push({ nodeId: null, fieldPath: 'preview', assetId, errorCode: reason.errorCode || 'CANVAS_MEDIA_READ_UNKNOWN' })
        }
        return 'canvas-asset:' + copy.canvasId + ':' + key
      }
    })())
    return assets.get(key)!
  }
  for (const binding of copy.assetBindings ?? []) {
    const node = copy.project.nodes.find((value: any) => value.id === binding.nodeId) as any
    let target = binding.shotId == null ? node : node?.settings?.shots?.find((shot: any) => String(shot.id) === String(binding.shotId))
    if (!target || !binding.fieldPath.startsWith('/')) continue
    const parts = binding.fieldPath.slice(1).split('/').map(part => part.replace(/~1/g, '/').replace(/~0/g, '~'))
    if (parts.some(part => ['__proto__', 'constructor', 'prototype'].includes(part))) continue
    for (const part of parts.slice(0, -1)) target = target?.[part]
    if (!target) continue
    const url = await load(binding.assetId, binding.sourceLinkId)
    target[parts[parts.length - 1]] = url
    if (url.startsWith('canvas-asset:')) {
      const code = issues.find(issue => String(issue.assetId) === String(binding.assetId))?.errorCode || 'CANVAS_MEDIA_READ_UNKNOWN'
      issues.push({ nodeId: binding.nodeId, shotId: binding.shotId == null ? null : String(binding.shotId), fieldPath: binding.fieldPath, assetId: binding.assetId, errorCode: code })
    }
  }
  // analysisKeyframe is a provenance marker, not a JSON Pointer. Mark every occurrence.
  for (const node of copy.project.nodes as any[]) {
    const scenes = [...(node.settings?.analysisResultData?.scenes || []), ...(Array.isArray(node.settings?.analysisResults) ? node.settings.analysisResults : [])]
    for (const scene of scenes) for (const frame of scene.keyframes || []) {
      if (frame.assetId == null) continue
      frame.url = await load(frame.assetId)
      if (frame.url.startsWith('canvas-asset:')) {
        issues.push({ nodeId: node.id, fieldPath: 'analysisKeyframe', assetId: frame.assetId, errorCode: issues.find(issue => String(issue.assetId) === String(frame.assetId))?.errorCode || 'CANVAS_MEDIA_READ_UNKNOWN' })
      }
    }
    node._canvasAssetIssues = issues.filter(issue => issue.nodeId === node.id)
  }
  copy.assetIssues = issues
  for (const binding of copy.modelBindings ?? []) {
    const node = copy.project.nodes.find((value: any) => value.id === binding.nodeId) as any
    let target = binding.shotId == null ? node : node?.settings?.shots?.find((shot: any) => String(shot.id) === String(binding.shotId))
    const parts = binding.fieldPath.slice(1).split('/').map(part => part.replace(/~1/g, '/').replace(/~0/g, '~'))
    if (parts.some(part => ['__proto__', 'constructor', 'prototype'].includes(part))) continue
    for (const part of parts.slice(0, -1)) target = target?.[part]
    if (target) target[parts[parts.length - 1]] = ['/settings/textModelId', '/settings/analysisModelId'].includes(binding.fieldPath) ? binding.modelId : 'studio-' + binding.modelId
  }
  return copy
}

/** Adapt the canvas capability catalog to the editor's existing model controls. */
export function canvasCatalogModels(models: CanvasModel[]) {
  return models.filter(model => model.available).map(model => ({
    ...model, id: model.modelId, type: model.operation === 'imageGenerate' ? 2 : 3,
    imageCapabilities: model.operation === 'imageGenerate' ? {
      aspectRatios: model.parameters.ratios || [], qualities: model.parameters.qualities || [],
      resolutions: (model.parameters.resolutions || []).map(value => Number(String(value).replace(/k$/i, ''))),
      maxReferenceImages: model.parameters.maxReferenceImages || 0, maxPromptCharacters: model.parameters.maxPromptCharacters || 0,
    } : null,
    videoCapabilities: model.operation === 'videoGenerate' ? {
      resolutions: (model.parameters.resolutions || []).map(String), minDurationSeconds: model.parameters.minDurationSeconds || 1,
      maxDurationSeconds: model.parameters.maxDurationSeconds || 1, maxReferenceImages: model.parameters.maxReferenceImages || 0,
      maxPromptCharacters: model.parameters.maxPromptCharacters || 0, nativeAudioSupported: !!model.parameters.generateAudio,
    } : null,
  }))
}
