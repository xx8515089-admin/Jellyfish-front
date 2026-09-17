import type { CanvasCapabilities, CanvasTextCapabilities, CanvasTextModel, CanvasTextOperation, CanvasTextEstimateRequest, CanvasTextQuote, CanvasTextCreateRequest, CanvasTextTask, CanvasLibraryReview, CanvasPublishLibraryRequest, CanvasLibraryPublication, CanvasBatchSummary, CanvasBatchEstimate } from './studioCanvasV3Types'
import type { CanvasExecutionCapabilities, CanvasExecutionModel, CanvasChatEstimateRequest, CanvasExecutionQuote, CanvasExecutionCreate, CanvasExecutionTask, CanvasChatSession, CanvasChatMessage, CanvasWorkflowCapabilities, CanvasWorkflowEstimateRequest, CanvasWorkflowQuote, CanvasWorkflow } from './studioCanvasV4Types'
import { OpenAPI } from './generated'
import { request, getHeaders } from './generated/core/request'
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
  canvasId: CanvasId; name: string; revisionNo: number; currentRevisionNo: number
  createdAt: string; updatedAt: string
}
export interface CanvasDocument extends CanvasSummary {
  schemaVersion: number
  project: { nodes: unknown[]; connections: unknown[]; view: { x: number; y: number; zoom: number }; projectName?: string; [key: string]: unknown }
  assetBindings: { nodeId: string; fieldPath: string; assetId: CanvasId; shotId?: CanvasId; sourceLinkId?: CanvasId }[]
  modelBindings: { nodeId: string; fieldPath: string; modelId: number; shotId?: CanvasId; operation?: CanvasOperation | CanvasTextOperation }[]
}
export interface CanvasAsset {
  assetId: CanvasId; canvasId: CanvasId; name: string; mediaType: string; mimeType: string
  sources?: CanvasAssetSource[]; sourceLinkId?: CanvasId; sizeBytes: number; url?: string; contentUrl?: string; downloadUrl?: string; removed?: boolean
}
export interface CanvasGeneration {
  generationId: CanvasId; canvasId: CanvasId; revisionNo: number; nodeId: string
  shotId?: CanvasId; batchId?: CanvasId; shouldPoll?: boolean; actions?: { cancel: boolean; retry: boolean; syncResult: boolean; retrySettlement: boolean }; billing?: { reservedCredits: number | null; settledCredits: number | null }
  status: number; progress: number; cancelRequested: boolean; error?: string; billingState: string
  operation: 'imageGenerate' | 'videoGenerate'; canSync: boolean; outputs: CanvasAsset[]; createdAt: string
}
export interface CanvasGenerateRequest {
  canvasId: CanvasId; revisionNo: number; nodeId: string; shotId?: CanvasId
  operation: 'imageGenerate' | 'videoGenerate'; clientRequestId: string
}
export interface CanvasPage<T> { items: T[]; page: number; pageSize: number; total: number }
export class CanvasApiError extends Error {
  constructor(message: string, public errorCode?: string, public status?: number, public location?: { nodeId?: string; shotId?: CanvasId; fieldPath?: string }) { super(message) }
}
export const canvasRequestId = (operation: string) => {
  if (typeof crypto.randomUUID === 'function') return `${operation}-${crypto.randomUUID()}`
  // getRandomValues remains available on HTTP LAN deployments where randomUUID is absent.
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  return `${operation}-${Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('')}`
}
async function call<T>(options: ApiRequestOptions): Promise<T> {
  try {
    const result = await request<{ code: number; message?: string; data: T & { errorCode?: string; nodeId?: string; shotId?: CanvasId; fieldPath?: string } }>(OpenAPI, options)
    if (result.code !== 200) throw new CanvasApiError(result.message || '画布请求失败', result.data?.errorCode, result.code, result.data)
    return result.data
  } catch (error) {
    const body = (error as { body?: { message?: string; data?: { errorCode?: string; nodeId?: string; shotId?: CanvasId; fieldPath?: string } } }).body
    if (body) throw new CanvasApiError(body.message || '画布请求失败', body.data?.errorCode, (error as { status?: number }).status, body.data)
    throw error
  }
}
const base = '/api/v1/studio/canvases'
const get = <T>(path: string, query: Record<string, unknown> = {}) => call<T>({ method: 'GET', url: base + path, query })
const post = <T>(path: string, body: unknown) => call<T>({ method: 'POST', url: base + path, body, mediaType: 'application/json' })
export const StudioCanvases = {
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
  workflowCreate: (body: CanvasExecutionCreate) => post<CanvasWorkflow>('/workflows/create', body),
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
  async content(canvasId: CanvasId, assetId: CanvasId, download = false) {
    const url = `${base}/assets/${download ? 'download' : 'content'}?canvasId=${encodeURIComponent(canvasId)}&assetId=${encodeURIComponent(assetId)}`
    const headers = await getHeaders(OpenAPI, { method: 'GET', url })
    const response = await fetch(OpenAPI.BASE + url, { headers, credentials: OpenAPI.WITH_CREDENTIALS ? OpenAPI.CREDENTIALS : 'same-origin' })
    if (!response.ok) throw new Error(`素材读取失败（${response.status}）`)
    return response.blob()
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

/** Resolve protected media using login headers; the page owns the object URLs. */
export async function hydrateCanvasDocument(document: CanvasDocument, urls: string[]) {
  const copy = JSON.parse(JSON.stringify(document)) as CanvasDocument
  const assets = new Map<string, string>()
  for (const binding of copy.assetBindings ?? []) {
    const node = copy.project.nodes.find((value) => (value as { id: string }).id === binding.nodeId) as Record<string, unknown> | undefined
    if (!node) continue
    let target = binding.shotId == null ? node : (node.settings as { shots?: Record<string, unknown>[] })?.shots?.find(shot => String(shot.id) === String(binding.shotId))
    if (!target) continue
    const parts = binding.fieldPath.slice(1).split('/').map((part) => part.replace(/~1/g, '/').replace(/~0/g, '~'))
    for (const part of parts.slice(0, -1)) target = target?.[part] as Record<string, unknown>
    if (!target) continue
    let url = assets.get(`${binding.assetId}:${binding.sourceLinkId ?? ''}`)
    if (!url) {
      url = URL.createObjectURL(await StudioCanvases.content(copy.canvasId, binding.assetId))
      urls.push(url)
      assets.set(`${binding.assetId}:${binding.sourceLinkId ?? ''}`, url)
    }
    target[parts[parts.length - 1]] = url
  }
  for (const binding of copy.modelBindings ?? []) {
    const node = copy.project.nodes.find((value) => (value as { id: string }).id === binding.nodeId) as Record<string, unknown> | undefined
    let target = binding.shotId == null ? node : (node?.settings as { shots?: Record<string, unknown>[] })?.shots?.find(shot => String(shot.id) === String(binding.shotId))
    const parts = binding.fieldPath.slice(1).split('/').map(part => part.replace(/~1/g, '/').replace(/~0/g, '~'))
    for (const part of parts.slice(0, -1)) target = target?.[part] as Record<string, unknown> | undefined
    if (target) target[parts[parts.length - 1]] = binding.fieldPath === '/settings/textModelId' ? binding.modelId : `studio-${binding.modelId}`
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
