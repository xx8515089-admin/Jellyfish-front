import { OpenAPI } from './generated'
import type { CancelablePromise } from './generated'
import { request as __request } from './generated/core/request'
import { unwrapApiData } from './generatedResponse'

type ApiEnvelope<T> = {
  code?: number
  message?: string
  data?: T | null
}

export type StudioAssetImageGenerateRequest = {
  id: number
  lookId: number | null
  prompt: string
  aspectRatio: string
  visualStyleId: number | null
  quality: number | null
  resolution: number
  modelId: number
}

export type StudioAssetGenerateEstimateRequest = {
  modelId: number
  quality: string | number | null
  resolution: number
}

export type StudioAssetGenerateEstimateResult = {
  modelId?: number | null
  modelName?: string
  quality?: string | number | null
  resolution?: number | null
  billingUnit?: string
  creditCost: number
}

export type StudioEpisodeAssetsGenerateEstimateRequest = {
  modelId: number
  quality: string | number | null
  resolution: number
  scriptImportId: string | number
  episodeId?: string | number
}

export type StudioEpisodeAssetsGenerateRequest = {
  scriptImportId: string | number
  episodeId?: string | number
  modelId: number
  quality: number | null
  resolution: number
  regenerate: boolean
}

export type StudioEpisodeAssetsGenerateEstimateResult = {
  scriptImportId?: string | number | null
  chapterId?: string | number | null
  episodeIndex?: number | null
  modelId?: number | null
  modelName?: string
  quality?: string | number | null
  resolution?: number | null
  totalCount: number
  generatedCount: number
  pendingCount: number
  unitCreditCost: number
  totalCreditCost: number
}

export type StudioEpisodeAssetsGenerateStatusRequest = {
  scriptImportId: string | number
  episodeId?: string | number
}

export type StudioEpisodeAssetsGenerateStatusItem = {
  scopeKey?: string | number | null
  scopeCode?: string
  assetId?: number | null
  assetType?: number | null
  assetName?: string
  characterLookId?: number | null
  characterLookName?: string | null
  coverFileId?: string | number | null
  coverUrl?: string | null
  status?: number | null
  statusName?: string
  taskId?: string | number | null
  progress?: number | null
  error?: string
}

export type StudioEpisodeAssetsGenerateStatusResult = {
  scriptImportId?: string | number | null
  episodeId?: string | number | null
  episodeIndex?: number | null
  totalCount: number
  generatedCount: number
  generatingCount: number
  pendingCount: number
  failedCount: number
  allGenerated: boolean
  shouldPoll: boolean
  batch?: unknown
  items: StudioEpisodeAssetsGenerateStatusItem[]
}

export type StudioAssetImageOptionsUpdateRequest = {
  id: number
  prompt: string
  lookId: number | null
  aspectRatio: string
  visualStyleId: number | null
}

export type StudioAssetPrimaryImageRequest = {
  assetId: number
  versionId: number
  lookId: number
}

export type StudioAssetLookUploadRequest = {
  assetId: number
  name: string
  file: File
}

export type StudioAssetLookGenerateRequest = {
  assetId: number
  name: string
  prompt: string
  referenceFileIds: number[]
  aspectRatio: string
  visualStyleId: number | null
  quality: number | null
  resolution: number
  modelId: number
}

export type StudioAssetLookEpisodeSelectionRequest = {
  lookId: number
  episodeId: number
  selected: boolean
}

export type StudioAssetLookRenameRequest = {
  lookId: number
  name: string
}

export type StudioAssetLookItem = {
  id: string
  lookCode?: string
  name: string
  description?: string
  prompt?: string
  aspectRatio?: string
  visualStyleId?: number | null
  quality?: number | null
  resolution?: number | null
  modelId?: number | null
  status?: number | null
  statusName?: string
  defaultLook?: boolean
  coverFileId?: string
  coverUrl?: string
  episodeIds: string[]
  createdAt?: string
  updatedAt?: string
}

export type StudioAssetImageHistoryItem = {
  id: string
  fileId?: string
  imageUrl?: string
  thumbnailUrl?: string
  versionId?: string
  isCurrent?: boolean
  createdAt?: string
  prompt?: string
  aspectRatio?: string
  visualStyleId?: number | null
  modelId?: number | null
  resolution?: number | null
  lookId?: number | null
}

export type StudioAssetReferenceItem = {
  id: string
  fileId?: string
  name: string
  url?: string
  mimeType?: string
  sizeBytes?: number
  sortOrder?: number
  createdAt?: string
}

export type StudioAssetReferenceListResult = {
  total: number
  maxCount: number
  list: StudioAssetReferenceItem[]
}

export type StudioAssetReferenceAttachRequest = {
  assetId: number
  fileId: string
}

export type StudioAssetImageTaskDetail = {
  createdAt?: string | null
  updatedAt?: string | null
  id: string | number
  mode?: string | null
  taskKind?: string | null
  status: number
  progress?: number | null
  payload?: string | null
  result?: string | null
  error?: string | null
  cancelRequested?: boolean
  cancelRequestedAt?: string | null
  startedAt?: string | null
  finishedAt?: string | null
  cancelReason?: string | null
  cancelledAt?: string | null
  executorType?: string | null
  executorTaskId?: string | null
  statusName?: string | null
}

export type StudioAssetImageTaskResult = {
  fileId?: string | number | null
  versionId?: string | number | null
}

export type StudioAssetImageTaskRequest<T> = {
  promise: Promise<T>
  cancel: () => void
}

function createAssetImageTask(
  requestBody: StudioAssetImageGenerateRequest,
): CancelablePromise<ApiEnvelope<unknown>> {
  return __request(OpenAPI, {
    method: 'POST',
    url: '/api/v1/studio/assets/generate',
    body: requestBody,
    mediaType: 'application/json',
    errors: {
      422: 'Validation Error',
    },
  })
}

function updateAssetImageOptions(
  requestBody: StudioAssetImageOptionsUpdateRequest,
): CancelablePromise<ApiEnvelope<unknown>> {
  return __request(OpenAPI, {
    method: 'POST',
    url: '/api/v1/studio/assets/imageOptions/update',
    body: requestBody,
    mediaType: 'application/json',
    errors: {
      422: 'Validation Error',
    },
  })
}

function estimateAssetGenerateCredits(
  requestBody: StudioAssetGenerateEstimateRequest,
): CancelablePromise<ApiEnvelope<unknown>> {
  return __request(OpenAPI, {
    method: 'GET',
    url: '/api/v1/studio/assets/generate/estimate',
    query: requestBody,
    errors: {
      422: 'Validation Error',
    },
  })
}

function estimateEpisodeAssetsGenerateCredits(
  requestBody: StudioEpisodeAssetsGenerateEstimateRequest,
): CancelablePromise<ApiEnvelope<unknown>> {
  const { episodeId, ...query } = requestBody
  return __request(OpenAPI, {
    method: 'GET',
    url: '/api/v1/studio/episodes/assets/generate/estimate',
    query: episodeId === undefined || episodeId === null || String(episodeId).trim() === ''
      ? query
      : { ...query, episodeId },
    errors: {
      422: 'Validation Error',
    },
  })
}

function createEpisodeAssetsGenerateTask(
  requestBody: StudioEpisodeAssetsGenerateRequest,
): CancelablePromise<ApiEnvelope<unknown>> {
  const { episodeId, ...body } = requestBody
  return __request(OpenAPI, {
    method: 'POST',
    url: '/api/v1/studio/episodes/assets/generate',
    body: episodeId === undefined || episodeId === null || String(episodeId).trim() === ''
      ? body
      : { ...body, episodeId },
    mediaType: 'application/json',
    errors: {
      422: 'Validation Error',
    },
  })
}

function getEpisodeAssetsGenerateStatus(
  requestBody: StudioEpisodeAssetsGenerateStatusRequest,
): CancelablePromise<ApiEnvelope<unknown>> {
  const { episodeId, ...query } = requestBody
  return __request(OpenAPI, {
    method: 'GET',
    url: '/api/v1/studio/episodes/assets/generate/status',
    query: episodeId === undefined || episodeId === null || String(episodeId).trim() === ''
      ? query
      : { ...query, episodeId },
    errors: {
      422: 'Validation Error',
    },
  })
}

function getAssetImageHistory(
  assetId: number,
  lookId?: number | null,
): CancelablePromise<ApiEnvelope<unknown>> {
  return __request(OpenAPI, {
    method: 'GET',
    url: '/api/v1/studio/assets/images/history',
    query: lookId === undefined || lookId === null
      ? { assetId }
      : { assetId, lookId },
    errors: {
      422: 'Validation Error',
    },
  })
}

function setAssetPrimaryImage(
  requestBody: StudioAssetPrimaryImageRequest,
): CancelablePromise<ApiEnvelope<unknown>> {
  return __request(OpenAPI, {
    method: 'POST',
    url: '/api/v1/studio/assets/images/primary',
    body: requestBody,
    mediaType: 'application/json',
    errors: {
      422: 'Validation Error',
    },
  })
}

function getAssetLooks(
  assetId: number,
  episodeId?: string | number,
): CancelablePromise<ApiEnvelope<unknown>> {
  return __request(OpenAPI, {
    method: 'GET',
    url: '/api/v1/studio/assets/looks',
    query: episodeId === undefined || episodeId === null || String(episodeId).trim() === ''
      ? { assetId }
      : { assetId, episodeId },
    errors: {
      422: 'Validation Error',
    },
  })
}

function uploadAssetLook(
  requestBody: StudioAssetLookUploadRequest,
): CancelablePromise<ApiEnvelope<unknown>> {
  return __request(OpenAPI, {
    method: 'POST',
    url: '/api/v1/studio/assets/looks/upload',
    formData: requestBody,
    mediaType: 'multipart/form-data',
    errors: {
      422: 'Validation Error',
    },
  })
}

function generateAssetLook(
  requestBody: StudioAssetLookGenerateRequest,
): CancelablePromise<ApiEnvelope<unknown>> {
  return __request(OpenAPI, {
    method: 'POST',
    url: '/api/v1/studio/assets/looks/generate',
    body: requestBody,
    mediaType: 'application/json',
    errors: {
      422: 'Validation Error',
    },
  })
}

function updateAssetLookEpisodeSelection(
  requestBody: StudioAssetLookEpisodeSelectionRequest,
): CancelablePromise<ApiEnvelope<unknown>> {
  return __request(OpenAPI, {
    method: 'POST',
    url: '/api/v1/studio/assets/looks/episodeSelection',
    body: requestBody,
    mediaType: 'application/json',
    errors: {
      422: 'Validation Error',
    },
  })
}

function renameAssetLook(
  requestBody: StudioAssetLookRenameRequest,
): CancelablePromise<ApiEnvelope<unknown>> {
  return __request(OpenAPI, {
    method: 'POST',
    url: '/api/v1/studio/assets/looks/rename',
    body: requestBody,
    mediaType: 'application/json',
    errors: {
      422: 'Validation Error',
    },
  })
}

function getAssetReferences(
  assetId: number,
): CancelablePromise<ApiEnvelope<unknown>> {
  return __request(OpenAPI, {
    method: 'GET',
    url: '/api/v1/studio/assets/references',
    query: { assetId },
    errors: {
      422: 'Validation Error',
    },
  })
}

function uploadAssetReference(
  assetId: number,
  file: File,
): CancelablePromise<ApiEnvelope<unknown>> {
  return __request(OpenAPI, {
    method: 'POST',
    url: '/api/v1/studio/assets/references',
    formData: { assetId, file },
    mediaType: 'multipart/form-data',
    errors: {
      422: 'Validation Error',
    },
  })
}

function attachAssetReference(
  requestBody: StudioAssetReferenceAttachRequest,
): CancelablePromise<ApiEnvelope<unknown>> {
  return __request(OpenAPI, {
    method: 'POST',
    url: '/api/v1/studio/assets/references',
    body: requestBody,
    mediaType: 'application/json',
    errors: {
      422: 'Validation Error',
    },
  })
}

function getAssetImageTaskDetail(
  id: string,
): CancelablePromise<ApiEnvelope<StudioAssetImageTaskDetail>> {
  return __request(OpenAPI, {
    method: 'GET',
    url: '/api/v1/film/tasks/detail',
    query: { id },
    errors: {
      422: 'Validation Error',
    },
  })
}

function normalizeTaskId(value: unknown): string | null {
  if (typeof value === 'string') return value.trim() || null
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return null
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function normalizeHistoryValue(value: unknown): string | undefined {
  if (typeof value === 'string') return value.trim() || undefined
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return undefined
}

function normalizeHistoryBoolean(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') return value
  if (value === 1 || value === '1' || value === 'true') return true
  if (value === 0 || value === '0' || value === 'false') return false
  return undefined
}

function normalizeFiniteNumber(value: unknown): number | undefined {
  if (value === null || value === undefined || value === '') return undefined
  const normalized = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(normalized) ? normalized : undefined
}

function parseHistoryPayload(value: unknown): Record<string, unknown> | null {
  if (!value) return null
  if (typeof value === 'object') return asRecord(value)
  if (typeof value !== 'string' || !value.trim()) return null
  try {
    return asRecord(JSON.parse(value) as unknown)
  } catch {
    return null
  }
}

function extractHistoryRows(data: unknown): unknown[] {
  if (Array.isArray(data)) return data
  const record = asRecord(data)
  if (!record) return []
  for (const key of ['list', 'items', 'records', 'images', 'content', 'rows', 'history']) {
    if (Array.isArray(record[key])) return record[key] as unknown[]
  }
  return [record]
}

function normalizeAssetImageHistory(data: unknown): StudioAssetImageHistoryItem[] {
  const seen = new Set<string>()
  const result: StudioAssetImageHistoryItem[] = []

  extractHistoryRows(data).forEach((value, index) => {
    if (typeof value === 'string' || typeof value === 'number') {
      const imageUrl = normalizeHistoryValue(value)
      if (!imageUrl || seen.has(imageUrl)) return
      seen.add(imageUrl)
      result.push({ id: `history-${index}`, imageUrl })
      return
    }

    const record = asRecord(value)
    if (!record) return
    const payload = parseHistoryPayload(record.payload)
    const file = asRecord(record.file)
    const fileId = normalizeHistoryValue(
      record.fileId
      ?? record.file_id
      ?? record.imageFileId
      ?? record.image_file_id
      ?? record.resultFileId
      ?? record.coverFileId
      ?? file?.id,
    )
    const imageUrl = normalizeHistoryValue(
      record.imageUrl
      ?? record.image_url
      ?? record.fileUrl
      ?? record.file_url
      ?? record.coverUrl
      ?? record.cover_url
      ?? record.downloadUrl
      ?? record.download_url
      ?? record.previewUrl
      ?? record.preview_url
      ?? record.url
      ?? file?.url
      ?? file?.downloadUrl
      ?? file?.previewUrl,
    )
    const thumbnailUrl = normalizeHistoryValue(
      record.thumbnailUrl
      ?? record.thumbnail_url
      ?? record.thumbUrl
      ?? record.thumb_url
      ?? record.thumbnail,
    )
    const dedupeKey = fileId ?? imageUrl ?? thumbnailUrl
    if (!dedupeKey || seen.has(dedupeKey)) return
    seen.add(dedupeKey)

    const versionId = normalizeHistoryValue(record.versionId ?? record.version_id)
    result.push({
      id: versionId
        ?? normalizeHistoryValue(record.id)
        ?? fileId
        ?? imageUrl
        ?? thumbnailUrl
        ?? `history-${index}`,
      fileId,
      imageUrl,
      thumbnailUrl,
      versionId,
      isCurrent: normalizeHistoryBoolean(
        record.isCurrent ?? record.current ?? record.selected ?? record.main,
      ),
      createdAt: normalizeHistoryValue(record.createdAt ?? record.created_at),
      prompt: normalizeHistoryValue(record.prompt ?? payload?.prompt),
      aspectRatio: normalizeHistoryValue(record.aspectRatio ?? record.aspect_ratio ?? payload?.aspectRatio),
      visualStyleId: normalizeFiniteNumber(
        record.visualStyleId ?? record.visual_style_id ?? payload?.visualStyleId,
      ) ?? null,
      modelId: normalizeFiniteNumber(record.modelId ?? record.model_id ?? payload?.modelId) ?? null,
      resolution: normalizeFiniteNumber(record.resolution ?? payload?.resolution) ?? null,
      lookId: normalizeFiniteNumber(
        record.lookId
          ?? record.look_id
          ?? record.characterLookId
          ?? record.character_look_id
          ?? payload?.lookId
          ?? payload?.characterLookId,
      ) ?? null,
    })
  })

  return result
}

function normalizeAssetReferences(data: unknown): StudioAssetReferenceListResult {
  const record = asRecord(data)
  const rows = Array.isArray(data)
    ? data
    : Array.isArray(record?.list)
      ? record.list
      : []
  const seen = new Set<string>()
  const list = rows.flatMap((value, index): StudioAssetReferenceItem[] => {
    const item = asRecord(value)
    if (!item) return []
    const file = asRecord(item.file)
    const fileId = normalizeHistoryValue(
      item.fileId ?? item.file_id ?? item.imageFileId ?? item.image_file_id ?? file?.id,
    )
    const url = normalizeHistoryValue(
      item.url
      ?? item.fileUrl
      ?? item.file_url
      ?? item.imageUrl
      ?? item.image_url
      ?? file?.url
      ?? file?.downloadUrl,
    )
    const id = normalizeHistoryValue(item.id) ?? fileId ?? url ?? `reference-${index}`
    const dedupeKey = fileId ? `file:${fileId}` : url ? `url:${url}` : `id:${id}`
    if ((!fileId && !url) || seen.has(dedupeKey)) return []
    seen.add(dedupeKey)
    return [{
      id,
      fileId,
      name: normalizeHistoryValue(item.name ?? item.fileName ?? item.file_name)
        ?? `reference-${index + 1}`,
      url,
      mimeType: normalizeHistoryValue(item.mimeType ?? item.mime_type),
      sizeBytes: normalizeFiniteNumber(item.sizeBytes ?? item.size_bytes),
      sortOrder: normalizeFiniteNumber(item.sortOrder ?? item.sort_order),
      createdAt: normalizeHistoryValue(item.createdAt ?? item.created_at),
    }]
  })
  const rawMaxCount = normalizeFiniteNumber(record?.maxCount ?? record?.max_count)
  const maxCount = rawMaxCount === undefined
    ? 14
    : Math.max(0, Math.floor(rawMaxCount))
  const rawTotal = normalizeFiniteNumber(record?.total)

  return {
    total: rawTotal === undefined ? list.length : Math.max(0, Math.floor(rawTotal)),
    maxCount,
    list,
  }
}

function normalizeNumberOrNull(value: unknown): number | null {
  const normalized = normalizeFiniteNumber(value)
  return normalized === undefined ? null : normalized
}

function normalizeAssetGenerateEstimate(data: unknown): StudioAssetGenerateEstimateResult {
  const record = asRecord(data)
  const creditCost = normalizeFiniteNumber(record?.creditCost)
  return {
    modelId: normalizeNumberOrNull(record?.modelId),
    modelName: typeof record?.modelName === 'string' ? record.modelName : undefined,
    quality: typeof record?.quality === 'string' || typeof record?.quality === 'number'
      ? record.quality
      : null,
    resolution: normalizeNumberOrNull(record?.resolution),
    billingUnit: typeof record?.billingUnit === 'string' ? record.billingUnit : undefined,
    creditCost: creditCost ?? 0,
  }
}

function normalizeEpisodeAssetsGenerateEstimate(data: unknown): StudioEpisodeAssetsGenerateEstimateResult {
  const record = asRecord(data)
  return {
    scriptImportId: typeof record?.scriptImportId === 'string' || typeof record?.scriptImportId === 'number'
      ? record.scriptImportId
      : null,
    chapterId: typeof record?.chapterId === 'string' || typeof record?.chapterId === 'number'
      ? record.chapterId
      : null,
    episodeIndex: normalizeNumberOrNull(record?.episodeIndex),
    modelId: normalizeNumberOrNull(record?.modelId),
    modelName: typeof record?.modelName === 'string' ? record.modelName : undefined,
    quality: typeof record?.quality === 'string' || typeof record?.quality === 'number'
      ? record.quality
      : null,
    resolution: normalizeNumberOrNull(record?.resolution),
    totalCount: Math.max(0, Math.floor(normalizeFiniteNumber(record?.totalCount) ?? 0)),
    generatedCount: Math.max(0, Math.floor(normalizeFiniteNumber(record?.generatedCount) ?? 0)),
    pendingCount: Math.max(0, Math.floor(normalizeFiniteNumber(record?.pendingCount) ?? 0)),
    unitCreditCost: normalizeFiniteNumber(record?.unitCreditCost) ?? 0,
    totalCreditCost: normalizeFiniteNumber(record?.totalCreditCost) ?? 0,
  }
}

function normalizeEpisodeAssetsGenerateStatus(data: unknown): StudioEpisodeAssetsGenerateStatusResult {
  const record = asRecord(data)
  const rows = Array.isArray(record?.items) ? record.items : []
  return {
    scriptImportId: typeof record?.scriptImportId === 'string' || typeof record?.scriptImportId === 'number'
      ? record.scriptImportId
      : null,
    episodeId: typeof record?.episodeId === 'string' || typeof record?.episodeId === 'number'
      ? record.episodeId
      : null,
    episodeIndex: normalizeNumberOrNull(record?.episodeIndex),
    totalCount: Math.max(0, Math.floor(normalizeFiniteNumber(record?.totalCount) ?? 0)),
    generatedCount: Math.max(0, Math.floor(normalizeFiniteNumber(record?.generatedCount) ?? 0)),
    generatingCount: Math.max(0, Math.floor(normalizeFiniteNumber(record?.generatingCount) ?? 0)),
    pendingCount: Math.max(0, Math.floor(normalizeFiniteNumber(record?.pendingCount) ?? 0)),
    failedCount: Math.max(0, Math.floor(normalizeFiniteNumber(record?.failedCount) ?? 0)),
    allGenerated: Boolean(normalizeHistoryBoolean(record?.allGenerated)),
    shouldPoll: Boolean(normalizeHistoryBoolean(record?.shouldPoll)),
    batch: record?.batch,
    items: rows.flatMap((value): StudioEpisodeAssetsGenerateStatusItem[] => {
      const item = asRecord(value)
      if (!item) return []
      return [{
        scopeKey: typeof item.scopeKey === 'string' || typeof item.scopeKey === 'number' ? item.scopeKey : null,
        scopeCode: normalizeHistoryValue(item.scopeCode),
        assetId: normalizeNumberOrNull(item.assetId),
        assetType: normalizeNumberOrNull(item.assetType),
        assetName: normalizeHistoryValue(item.assetName),
        characterLookId: normalizeNumberOrNull(item.characterLookId),
        characterLookName: normalizeHistoryValue(item.characterLookName) ?? null,
        coverFileId: normalizeHistoryValue(item.coverFileId) ?? null,
        coverUrl: normalizeHistoryValue(item.coverUrl) ?? null,
        status: normalizeNumberOrNull(item.status),
        statusName: normalizeHistoryValue(item.statusName),
        taskId: normalizeHistoryValue(item.taskId) ?? null,
        progress: normalizeNumberOrNull(item.progress),
        error: normalizeHistoryValue(item.error),
      }]
    }),
  }
}

function normalizeStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return [...new Set(value.flatMap((item) => {
    const normalized = normalizeHistoryValue(item)
    return normalized ? [normalized] : []
  }))]
}

function normalizeAssetLooks(data: unknown): StudioAssetLookItem[] {
  const rows = Array.isArray(data)
    ? data
    : Array.isArray(asRecord(data)?.list)
      ? asRecord(data)?.list as unknown[]
      : asRecord(data)
        ? [data]
        : []
  const seen = new Set<string>()

  return rows.flatMap((value, index): StudioAssetLookItem[] => {
    const item = asRecord(value)
    if (!item) return []
    const id = normalizeHistoryValue(item.id)
      ?? normalizeHistoryValue(item.lookId ?? item.look_id)
      ?? normalizeHistoryValue(item.lookCode ?? item.look_code)
      ?? `look-${index}`
    if (seen.has(id)) return []
    seen.add(id)
    const coverFileId = normalizeHistoryValue(
      item.coverFileId ?? item.cover_file_id ?? item.fileId ?? item.file_id,
    )
    const coverUrl = normalizeHistoryValue(
      item.coverUrl ?? item.cover_url ?? item.imageUrl ?? item.image_url ?? item.url,
    )

    return [{
      id,
      lookCode: normalizeHistoryValue(item.lookCode ?? item.look_code),
      name: normalizeHistoryValue(item.name) ?? `look-${index + 1}`,
      description: normalizeHistoryValue(item.description),
      prompt: normalizeHistoryValue(item.prompt),
      aspectRatio: normalizeHistoryValue(item.aspectRatio ?? item.aspect_ratio),
      visualStyleId: normalizeNumberOrNull(item.visualStyleId ?? item.visual_style_id),
      quality: normalizeNumberOrNull(item.quality),
      resolution: normalizeNumberOrNull(item.resolution),
      modelId: normalizeNumberOrNull(item.modelId ?? item.model_id),
      status: normalizeNumberOrNull(item.status),
      statusName: normalizeHistoryValue(item.statusName ?? item.status_name),
      defaultLook: Boolean(normalizeHistoryBoolean(item.defaultLook ?? item.default_look)),
      coverFileId,
      coverUrl,
      episodeIds: normalizeStringList(item.episodeIds ?? item.episode_ids),
      createdAt: normalizeHistoryValue(item.createdAt ?? item.created_at),
      updatedAt: normalizeHistoryValue(item.updatedAt ?? item.updated_at),
    }]
  })
}

/** 创建接口尚未固定公开任务字段名，同时兼容 data.id、taskId、task_id 和直接返回 ID。 */
function extractCreatedTaskId(response: ApiEnvelope<unknown>): string | null {
  const directDataId = normalizeTaskId(response.data)
  if (directDataId) return directDataId
  if (!response.data || typeof response.data !== 'object') return null
  const data = response.data as Record<string, unknown>
  return normalizeTaskId(data.taskId ?? data.task_id ?? data.id)
}

export function parseStudioAssetImageTaskResult(
  result: string | null | undefined,
): StudioAssetImageTaskResult | null {
  if (!result?.trim()) return null
  try {
    const parsed = JSON.parse(result) as unknown
    return parsed && typeof parsed === 'object'
      ? parsed as StudioAssetImageTaskResult
      : null
  } catch {
    return null
  }
}

export const StudioAssetGenerationApi = {
  requestGenerateEstimate(
    requestBody: StudioAssetGenerateEstimateRequest,
  ): StudioAssetImageTaskRequest<StudioAssetGenerateEstimateResult> {
    const request = estimateAssetGenerateCredits(requestBody)
    return {
      cancel: () => request.cancel(),
      promise: request.then((response) => {
        if ((response.code ?? 200) >= 400) {
          throw new Error(response.message || 'Asset generation credit estimate failed')
        }
        return normalizeAssetGenerateEstimate(response.data)
      }),
    }
  },

  requestEpisodeAssetsGenerateEstimate(
    requestBody: StudioEpisodeAssetsGenerateEstimateRequest,
  ): StudioAssetImageTaskRequest<StudioEpisodeAssetsGenerateEstimateResult> {
    const request = estimateEpisodeAssetsGenerateCredits(requestBody)
    return {
      cancel: () => request.cancel(),
      promise: request.then((response) => {
        if ((response.code ?? 200) >= 400) {
          throw new Error(response.message || 'Episode assets generation credit estimate failed')
        }
        return normalizeEpisodeAssetsGenerateEstimate(response.data)
      }),
    }
  },

  requestEpisodeAssetsGenerate(
    requestBody: StudioEpisodeAssetsGenerateRequest,
  ): StudioAssetImageTaskRequest<void> {
    const request = createEpisodeAssetsGenerateTask(requestBody)
    return {
      cancel: () => request.cancel(),
      promise: request.then((response) => {
        if ((response.code ?? 200) >= 400) {
          throw new Error(response.message || 'Episode assets generation task creation failed')
        }
      }),
    }
  },

  requestEpisodeAssetsGenerateStatus(
    requestBody: StudioEpisodeAssetsGenerateStatusRequest,
  ): StudioAssetImageTaskRequest<StudioEpisodeAssetsGenerateStatusResult> {
    const request = getEpisodeAssetsGenerateStatus(requestBody)
    return {
      cancel: () => request.cancel(),
      promise: request.then((response) => {
        if ((response.code ?? 200) >= 400) {
          throw Object.assign(new Error(response.message || 'Episode assets generation status loading failed'), { status: response.code })
        }
        return normalizeEpisodeAssetsGenerateStatus(response.data)
      }),
    }
  },

  requestLooks(assetId: number, episodeId?: string | number): StudioAssetImageTaskRequest<StudioAssetLookItem[]> {
    const request = getAssetLooks(assetId, episodeId)
    return {
      cancel: () => request.cancel(),
      promise: request.then((response) => {
        if ((response.code ?? 200) >= 400) {
          throw new Error(response.message || 'Asset looks loading failed')
        }
        return normalizeAssetLooks(response.data)
      }),
    }
  },

  requestReferenceList(assetId: number): StudioAssetImageTaskRequest<StudioAssetReferenceListResult> {
    const request = getAssetReferences(assetId)
    return {
      cancel: () => request.cancel(),
      promise: request.then((response) => {
        if ((response.code ?? 200) >= 400) {
          throw new Error(response.message || 'Asset reference images loading failed')
        }
        return normalizeAssetReferences(response.data)
      }),
    }
  },

  requestLookUpload(
    requestBody: StudioAssetLookUploadRequest,
  ): StudioAssetImageTaskRequest<StudioAssetLookItem | null> {
    const request = uploadAssetLook(requestBody)
    return {
      cancel: () => request.cancel(),
      promise: request.then((response) => {
        if ((response.code ?? 200) >= 400) {
          throw new Error(response.message || 'Asset look upload failed')
        }
        return normalizeAssetLooks(response.data)[0] ?? null
      }),
    }
  },

  requestLookGenerate(
    requestBody: StudioAssetLookGenerateRequest,
  ): StudioAssetImageTaskRequest<string> {
    const request = generateAssetLook(requestBody)
    return {
      cancel: () => request.cancel(),
      promise: request.then((response) => {
        if ((response.code ?? 200) >= 400) {
          throw new Error(response.message || 'Asset look generation task creation failed')
        }
        const taskId = extractCreatedTaskId(response)
        if (!taskId) {
          throw new Error(response.message || 'Asset look generation returned no task ID')
        }
        return taskId
      }),
    }
  },

  requestLookEpisodeSelection(
    requestBody: StudioAssetLookEpisodeSelectionRequest,
  ): StudioAssetImageTaskRequest<void> {
    const request = updateAssetLookEpisodeSelection(requestBody)
    return {
      cancel: () => request.cancel(),
      promise: request.then((response) => {
        if ((response.code ?? 200) >= 400) {
          throw new Error(response.message || 'Asset look episode selection update failed')
        }
      }),
    }
  },

  requestLookRename(
    requestBody: StudioAssetLookRenameRequest,
  ): StudioAssetImageTaskRequest<void> {
    const request = renameAssetLook(requestBody)
    return {
      cancel: () => request.cancel(),
      promise: request.then((response) => {
        if ((response.code ?? 200) >= 400) {
          throw new Error(response.message || 'Asset look rename failed')
        }
      }),
    }
  },

  requestReferenceUpload(assetId: number, file: File): StudioAssetImageTaskRequest<void> {
    const request = uploadAssetReference(assetId, file)
    return {
      cancel: () => request.cancel(),
      promise: request.then((response) => {
        if ((response.code ?? 200) >= 400) {
          throw new Error(response.message || 'Asset reference image upload failed')
        }
      }),
    }
  },

  requestReferenceAttach(assetId: number, fileId: string): StudioAssetImageTaskRequest<void> {
    const request = attachAssetReference({ assetId, fileId })
    return {
      cancel: () => request.cancel(),
      promise: request.then((response) => {
        if ((response.code ?? 200) >= 400) {
          throw new Error(response.message || 'Asset reference image attach failed')
        }
      }),
    }
  },

  requestImageHistory(assetId: number, lookId?: number | null): StudioAssetImageTaskRequest<StudioAssetImageHistoryItem[]> {
    const request = getAssetImageHistory(assetId, lookId)
    return {
      cancel: () => request.cancel(),
      promise: request.then((response) => {
        if ((response.code ?? 200) >= 400) {
          throw new Error(response.message || 'Asset image history loading failed')
        }
        return normalizeAssetImageHistory(response.data)
      }),
    }
  },

  requestSetPrimaryImage(
    requestBody: StudioAssetPrimaryImageRequest,
  ): StudioAssetImageTaskRequest<void> {
    const request = setAssetPrimaryImage(requestBody)
    return {
      cancel: () => request.cancel(),
      promise: request.then((response) => {
        if ((response.code ?? 200) >= 400) {
          throw new Error(response.message || 'Asset primary image update failed')
        }
      }),
    }
  },

  requestUpdateImageOptions(
    requestBody: StudioAssetImageOptionsUpdateRequest,
  ): StudioAssetImageTaskRequest<void> {
    const request = updateAssetImageOptions(requestBody)
    return {
      cancel: () => request.cancel(),
      promise: request.then((response) => {
        if ((response.code ?? 200) >= 400) {
          throw new Error(response.message || 'Asset image options update failed')
        }
      }),
    }
  },

  requestGenerate(
    requestBody: StudioAssetImageGenerateRequest,
  ): StudioAssetImageTaskRequest<string> {
    const request = createAssetImageTask(requestBody)
    return {
      cancel: () => request.cancel(),
      promise: request.then((response) => {
        if ((response.code ?? 200) >= 400) {
          throw new Error(response.message || 'Asset image generation task creation failed')
        }
        const taskId = extractCreatedTaskId(response)
        if (!taskId) {
          throw new Error(response.message || 'Asset image generation returned no task ID')
        }
        return taskId
      }),
    }
  },

  requestTaskDetail(
    id: string,
  ): StudioAssetImageTaskRequest<StudioAssetImageTaskDetail> {
    const request = getAssetImageTaskDetail(id)
    return {
      cancel: () => request.cancel(),
      promise: request.then((response) => unwrapApiData<StudioAssetImageTaskDetail>(
        response,
        'Asset image generation task loading failed',
      )),
    }
  },
}
