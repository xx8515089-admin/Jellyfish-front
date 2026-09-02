import { OpenAPI } from './generated'
import type { CancelablePromise } from './generated'
import { request as __request } from './generated/core/request'
import { unwrapApiData } from './generatedResponse'

type ApiEnvelope<T> = {
  code?: number
  message?: string
  data?: T | null
}

export type StudioScriptImportId = string | number

export type StudioScriptImportListItem = {
  id: StudioScriptImportId
  ownerName?: string | null
  title: string
  sourceFileName?: string | null
  videoRatio?: string | null
  targetMarket?: string | null
  visualStyleId?: StudioScriptImportId | null
  toneStyleId?: StudioScriptImportId | null
  characterCount?: number | null
  chapterCount?: number | null
  parseStatus?: number | null
  parseStatusName?: string | null
  /** 页面创建步骤，后端使用 1 开始的序号。 */
  currentStep?: number | null
  /** 列表接口当前不返回原文，保留该字段以兼容后续详情化返回。 */
  rawText?: string | null
  createdAt?: string | null
  updatedAt?: string | null
}

export type StudioScriptImportList = {
  items: StudioScriptImportListItem[]
  page: number
  pageSize: number
  total: number
}

export type StudioScriptImportListParams = {
  page: number
  pageSize: number
  keyword?: string
}

export type StudioScriptParseChapter = {
  id?: StudioScriptImportId | null
  index?: number | null
  title?: string | null
  chapterTitle?: string | null
  chapter_title?: string | null
  rawText?: string | null
  raw_text?: string | null
  content?: string | null
  text?: string | null
  summary?: string | null
  characterCount?: number | null
  paragraphCount?: number | null
}

export type StudioScriptParseResult = {
  id?: StudioScriptImportId | null
  parseStatus?: number | null
  parseStatusName?: string | null
  currentStep?: number | null
  segmentationMode?: number | null
  aiModelId?: StudioScriptImportId | null
  ai_model_id?: StudioScriptImportId | null
  /** 兼容部分接口直接返回 modelId，或把模型信息放在 aiModel 中。 */
  modelId?: StudioScriptImportId | null
  model_id?: StudioScriptImportId | null
  aiModel?: StudioScriptImportId | {
    id?: StudioScriptImportId | null
    modelId?: StudioScriptImportId | null
    model_id?: StudioScriptImportId | null
  } | null
  fileName?: string | null
  fileType?: string | null
  title?: string | null
  rawText?: string | null
  videoRatio?: string | null
  targetMarket?: string | null
  visualStyleId?: StudioScriptImportId | null
  toneStyleId?: StudioScriptImportId | null
  visualStyleCode?: string | null
  customStylePrompt?: string | null
  toneStyleCode?: string | null
  toneStylePrompt?: string | null
  characterCount?: number | null
  paragraphCount?: number | null
  chapterCount?: number | null
  chapters?: StudioScriptParseChapter[] | null
  warnings?: string[] | null
}

export type StudioScriptBasicInfoConfirmRequest = {
  id: StudioScriptImportId | null
  fileName: string
  fileType: string
  title: string
  videoRatio: string
  rawText: string
  targetMarket: string
  visualStyleId: StudioScriptImportId | null
  toneStyleId: StudioScriptImportId | null
}

export type StudioScriptBasicInfoSaveRequest = {
  id: StudioScriptImportId | null
  sourceFileName: string
  fileType: string
  title: string
  rawText: string
  videoRatio: string
  targetMarket: string
  visualStyleId: StudioScriptImportId | null
  toneStyleId: StudioScriptImportId | null
}

export type StudioScriptImportRenameRequest = {
  id: StudioScriptImportId
  title: string
}

export type StudioScriptImportDeleteRequest = {
  id: StudioScriptImportId
}

export type StudioScriptChapterFileParseResult = {
  fileName?: string | null
  fileType?: string | null
  rawText?: string | null
  characterCount?: number | null
}

export type StudioScriptChapterCreateRequest = {
  scriptImportId: StudioScriptImportId
  rawText: string
}

export type StudioScriptAssetExtractEstimateParams = {
  scriptImportId: StudioScriptImportId
}

export type StudioScriptAssetExtractEstimate = {
  requiredCredits: number
}

export type StudioScriptAssetExtractRequest = {
  scriptImportId: StudioScriptImportId
}

export type StudioScriptAssetEpisode = {
  id: StudioScriptImportId
  index: number
  title: string
}

export type StudioScriptAssetType = 1 | 2 | 3

export type StudioScriptAssetListParams = {
  scriptImportId: StudioScriptImportId
  chapterId?: StudioScriptImportId
  assetType: StudioScriptAssetType
}

export type StudioScriptAssetListItem = {
  id: StudioScriptImportId
  assetCode?: string | null
  assetType: StudioScriptAssetType
  assetTypeName?: string | null
  name: string
  aliases?: string[] | null
  appearedEpisodes?: number[] | null
  description?: string | null
  createPrompt?: string | null
  status?: number | null
  coverFileId?: StudioScriptImportId | null
  coverUrl?: string | null
  createdAt?: string | null
  updatedAt?: string | null
}

export type StudioScriptAssetListResult = {
  total: number
  list: StudioScriptAssetListItem[]
  taskId: StudioScriptImportId | null
  extractionStatus: number
  extractionStatusName: string
  polling: boolean
  errorMessage: string
}

export type StudioScriptAssetListRequest = {
  promise: Promise<StudioScriptAssetListResult>
  cancel: () => void
}

export type StudioScriptAssetEpisodeListRequest = {
  promise: Promise<StudioScriptAssetEpisode[]>
  cancel: () => void
}

const assetExtractEstimateRequests = new Map<string, Promise<StudioScriptAssetExtractEstimate>>()

function parseScriptFile(file: File): CancelablePromise<ApiEnvelope<StudioScriptParseResult>> {
  return __request(OpenAPI, {
    method: 'POST',
    url: '/api/v1/studio/scripts/parse',
    formData: { file },
    mediaType: 'multipart/form-data',
    errors: {
      422: 'Validation Error',
    },
  })
}

function confirmScriptBasicInfo(
  requestBody: StudioScriptBasicInfoConfirmRequest,
): CancelablePromise<ApiEnvelope<StudioScriptParseResult>> {
  return __request(OpenAPI, {
    method: 'POST',
    url: '/api/v1/studio/scripts/imports/basicInfo/confirm',
    body: requestBody,
    mediaType: 'application/json',
    errors: {
      422: 'Validation Error',
    },
  })
}

function saveScriptBasicInfo(
  requestBody: StudioScriptBasicInfoSaveRequest,
): CancelablePromise<ApiEnvelope<StudioScriptParseResult>> {
  return __request(OpenAPI, {
    method: 'POST',
    url: '/api/v1/studio/scripts/imports/basicInfo/save',
    body: requestBody,
    mediaType: 'application/json',
    errors: {
      422: 'Validation Error',
    },
  })
}

function getScriptBasicInfoDetail(
  id: StudioScriptImportId,
): CancelablePromise<ApiEnvelope<StudioScriptParseResult>> {
  return __request(OpenAPI, {
    method: 'GET',
    url: '/api/v1/studio/scripts/imports/basicInfo/detail',
    query: { id },
    errors: {
      422: 'Validation Error',
    },
  })
}

function parseScriptImportChapterFile(
  file: File,
): CancelablePromise<ApiEnvelope<StudioScriptChapterFileParseResult>> {
  return __request(OpenAPI, {
    method: 'POST',
    url: '/api/v1/studio/scripts/imports/chapters/parse',
    formData: { file },
    mediaType: 'multipart/form-data',
    errors: {
      422: 'Validation Error',
    },
  })
}

function createScriptImportChapter(
  requestBody: StudioScriptChapterCreateRequest,
): CancelablePromise<ApiEnvelope<StudioScriptParseChapter[]>> {
  return __request(OpenAPI, {
    method: 'POST',
    url: '/api/v1/studio/scripts/imports/chapters/create',
    body: requestBody,
    mediaType: 'application/json',
    errors: {
      422: 'Validation Error',
    },
  })
}

function getScriptImportChapters(
  scriptImportId: StudioScriptImportId,
): CancelablePromise<ApiEnvelope<StudioScriptParseChapter[]>> {
  return __request(OpenAPI, {
    method: 'GET',
    url: '/api/v1/studio/scripts/imports/chapters/list',
    query: { scriptImportId },
    errors: {
      422: 'Validation Error',
    },
  })
}

function getScriptAssetExtractEstimate(
  params: StudioScriptAssetExtractEstimateParams,
): CancelablePromise<ApiEnvelope<StudioScriptAssetExtractEstimate>> {
  return __request(OpenAPI, {
    method: 'GET',
    url: '/api/v1/studio/scripts/imports/assets/extract/estimate',
    query: {
      scriptImportId: params.scriptImportId,
    },
    errors: {
      422: 'Validation Error',
    },
  })
}

function extractScriptAssets(
  requestBody: StudioScriptAssetExtractRequest,
): CancelablePromise<ApiEnvelope<unknown>> {
  return __request(OpenAPI, {
    method: 'POST',
    url: '/api/v1/studio/scripts/imports/assets/extract',
    body: requestBody,
    mediaType: 'application/json',
    errors: {
      422: 'Validation Error',
    },
  })
}

function getScriptAssetEpisodes(
  scriptImportId: StudioScriptImportId,
): CancelablePromise<ApiEnvelope<StudioScriptAssetEpisode[]>> {
  return __request(OpenAPI, {
    method: 'GET',
    url: '/api/v1/studio/scripts/imports/assets/episodes/list',
    query: { scriptImportId },
    errors: {
      422: 'Validation Error',
    },
  })
}

function getScriptAssetList(
  params: StudioScriptAssetListParams,
): CancelablePromise<ApiEnvelope<StudioScriptAssetListResult>> {
  return __request(OpenAPI, {
    method: 'GET',
    url: '/api/v1/studio/scripts/imports/assets/list',
    query: {
      scriptImportId: params.scriptImportId,
      chapterId: params.chapterId,
      assetType: params.assetType,
    },
    errors: {
      422: 'Validation Error',
    },
  })
}

function getScriptImports(
  params: StudioScriptImportListParams,
): CancelablePromise<ApiEnvelope<StudioScriptImportList>> {
  return __request(OpenAPI, {
    method: 'GET',
    url: '/api/v1/studio/scripts/imports',
    query: {
      page: params.page,
      pageSize: params.pageSize,
      keyword: params.keyword,
    },
    errors: {
      422: 'Validation Error',
    },
  })
}

function renameScriptImport(
  requestBody: StudioScriptImportRenameRequest,
): CancelablePromise<ApiEnvelope<unknown>> {
  return __request(OpenAPI, {
    method: 'POST',
    url: '/api/v1/studio/scripts/imports/rename',
    body: requestBody,
    mediaType: 'application/json',
    errors: {
      422: 'Validation Error',
    },
  })
}

function deleteScriptImport(
  requestBody: StudioScriptImportDeleteRequest,
): CancelablePromise<ApiEnvelope<unknown>> {
  return __request(OpenAPI, {
    method: 'POST',
    url: '/api/v1/studio/scripts/imports/delete',
    body: requestBody,
    mediaType: 'application/json',
    errors: {
      422: 'Validation Error',
    },
  })
}

export const StudioScriptsApi = {
  async getImports(params: StudioScriptImportListParams): Promise<StudioScriptImportList> {
    const response = await getScriptImports(params)
    return unwrapApiData<StudioScriptImportList>(response, 'Script imports loading failed')
  },

  async parse(file: File): Promise<StudioScriptParseResult> {
    const response = await parseScriptFile(file)
    return unwrapApiData<StudioScriptParseResult>(response, 'Script parsing failed')
  },

  async confirmBasicInfo(
    requestBody: StudioScriptBasicInfoConfirmRequest,
  ): Promise<StudioScriptParseResult> {
    const response = await confirmScriptBasicInfo(requestBody)
    return unwrapApiData<StudioScriptParseResult>(response, 'Script basic information confirmation failed')
  },

  async saveBasicInfo(
    requestBody: StudioScriptBasicInfoSaveRequest,
  ): Promise<StudioScriptParseResult | null> {
    const response = await saveScriptBasicInfo(requestBody)
    if ((response.code ?? 200) >= 400) {
      throw new Error(response.message || 'Script basic information saving failed')
    }
    return response.data ?? null
  },

  async getBasicInfoDetail(id: StudioScriptImportId): Promise<StudioScriptParseResult> {
    const response = await getScriptBasicInfoDetail(id)
    return unwrapApiData<StudioScriptParseResult>(response, 'Script basic information loading failed')
  },

  async renameImport(requestBody: StudioScriptImportRenameRequest): Promise<void> {
    const response = await renameScriptImport(requestBody)
    if ((response.code ?? 200) >= 400) {
      throw new Error(response.message || 'Script import renaming failed')
    }
  },

  async deleteImport(requestBody: StudioScriptImportDeleteRequest): Promise<void> {
    const response = await deleteScriptImport(requestBody)
    if ((response.code ?? 200) >= 400) {
      throw new Error(response.message || 'Script import deletion failed')
    }
  },

  async parseChapterFile(file: File): Promise<StudioScriptChapterFileParseResult> {
    const response = await parseScriptImportChapterFile(file)
    return unwrapApiData<StudioScriptChapterFileParseResult>(response, 'Script chapter file parsing failed')
  },

  async createChapter(
    requestBody: StudioScriptChapterCreateRequest,
  ): Promise<StudioScriptParseChapter[]> {
    const response = await createScriptImportChapter(requestBody)
    if ((response.code ?? 200) >= 400) {
      throw new Error(response.message || 'Script chapter creation failed')
    }
    return Array.isArray(response.data) ? response.data : []
  },

  async getChapters(scriptImportId: StudioScriptImportId): Promise<StudioScriptParseChapter[]> {
    const response = await getScriptImportChapters(scriptImportId)
    const chapters = unwrapApiData<StudioScriptParseChapter[]>(response, 'Script chapters loading failed')
    return [...chapters].sort((left, right) =>
      (left.index ?? Number.MAX_SAFE_INTEGER) - (right.index ?? Number.MAX_SAFE_INTEGER))
  },

  getAssetExtractEstimate(
    params: StudioScriptAssetExtractEstimateParams,
  ): Promise<StudioScriptAssetExtractEstimate> {
    const cacheKey = String(params.scriptImportId)
    const pendingRequest = assetExtractEstimateRequests.get(cacheKey)
    if (pendingRequest) return pendingRequest

    const request = getScriptAssetExtractEstimate(params)
      .then((response) => {
        const estimate = unwrapApiData<StudioScriptAssetExtractEstimate>(
          response,
          'Asset extraction credit estimate failed',
        )
        const requiredCredits = Number(estimate.requiredCredits)
        if (!Number.isFinite(requiredCredits)) {
          throw new Error('Asset extraction credit estimate returned an invalid requiredCredits value')
        }
        return { requiredCredits }
      })
      .finally(() => {
        if (assetExtractEstimateRequests.get(cacheKey) === request) {
          assetExtractEstimateRequests.delete(cacheKey)
        }
      })
    assetExtractEstimateRequests.set(cacheKey, request)
    return request
  },

  /** 分集发生变化时丢弃旧的在途去重入口，确保下一次估算发起新请求。 */
  invalidateAssetExtractEstimate(scriptImportId: StudioScriptImportId): void {
    assetExtractEstimateRequests.delete(String(scriptImportId))
  },

  async extractAssets(requestBody: StudioScriptAssetExtractRequest): Promise<void> {
    const response = await extractScriptAssets(requestBody)
    if ((response.code ?? 200) >= 400) {
      throw new Error(response.message || 'Script asset extraction failed')
    }
  },

  requestAssetEpisodes(
    scriptImportId: StudioScriptImportId,
  ): StudioScriptAssetEpisodeListRequest {
    const request = getScriptAssetEpisodes(scriptImportId)
    return {
      cancel: () => request.cancel(),
      promise: request.then((response) => {
        const episodes = unwrapApiData<StudioScriptAssetEpisode[]>(
          response,
          'Script asset episodes loading failed',
        )
        return [...episodes].sort((left, right) => left.index - right.index)
      }),
    }
  },

  requestAssetList(params: StudioScriptAssetListParams): StudioScriptAssetListRequest {
    const request = getScriptAssetList(params)
    return {
      cancel: () => request.cancel(),
      promise: request.then((response) => {
        const status = response.code ?? 200
        if (status >= 400 || response.data === null || response.data === undefined) {
          const error = new Error(response.message || 'Script assets loading failed') as Error & {
            status?: number
          }
          error.status = status
          throw error
        }
        return response.data
      }),
    }
  },
}
