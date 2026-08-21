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
  segmentationMode?: number | null
  aiModelId?: StudioScriptImportId | null
  aiModel?: unknown
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
  characterCount?: number | null
  paragraphCount?: number | null
  chapterCount?: number | null
  chapters?: StudioScriptParseChapter[] | null
  warnings?: string[] | null
}

export type StudioScriptBasicInfoConfirmRequest = {
  id: StudioScriptImportId
  title: string
  videoRatio: string
  rawText: string
  targetMarket: string
  visualStyleId: StudioScriptImportId | null
  toneStyleId: StudioScriptImportId | null
}

export type StudioScriptImportRenameRequest = {
  id: StudioScriptImportId
  title: string
}

type StudioScriptBasicInfoRequest =
  | StudioScriptBasicInfoConfirmRequest
  | StudioScriptImportRenameRequest

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
  requestBody: StudioScriptBasicInfoRequest,
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

  async renameImport(requestBody: StudioScriptImportRenameRequest): Promise<void> {
    const response = await confirmScriptBasicInfo(requestBody)
    if ((response.code ?? 200) >= 400) {
      throw new Error(response.message || 'Script import rename failed')
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
}
