import { OpenAPI } from './generated'
import type { CancelablePromise } from './generated'
import { request as __request } from './generated/core/request'

type ApiEnvelope<T> = {
  code?: number
  message?: string
  data?: T | null
}

export type SystemVoiceSourceType = 1 | 2 | 3
export type SystemVoiceGender = 1 | 2
export type SystemVoiceAgeGroup = 1 | 2 | 3 | 4 | 5

export type SystemVoiceLanguage = {
  code: string
  name: string
  primaryLanguage: boolean
}

export type SystemVoiceRead = {
  id: number
  name: string
  sourceType: SystemVoiceSourceType | null
  sourceTypeName: string
  providerCode: string
  providerVoiceId: string
  gender: SystemVoiceGender | null
  genderName: string
  ageGroup: SystemVoiceAgeGroup | null
  ageGroupName: string
  emotionAdjustable: boolean
  previewFileId: number | null
  previewUrl: string
  previewText: string
  sortOrder: number
  languages: SystemVoiceLanguage[]
  authorizationStatus: number | null
  status: number | null
  createdAt?: string | null
  updatedAt?: string | null
}

export type SystemVoicesPageQuery = {
  sourceType?: SystemVoiceSourceType
  gender?: SystemVoiceGender
  ageGroup?: SystemVoiceAgeGroup
  languageCode?: string
  keyword?: string
  page: number
  pageSize: number
}

export type SystemVoicesPage = {
  items: SystemVoiceRead[]
  page: number
  pageSize: number
  total: number
}

export type StudioAvailableVoicesQuery = {
  sourceType?: SystemVoiceSourceType
  gender?: SystemVoiceGender
  ageGroup?: SystemVoiceAgeGroup
  languageCode?: string
}

export type StudioAssetVoiceUpdatePayload = {
  assetId: number
  voiceId: number
}

export type StudioAvailableVoicesRequest = {
  promise: Promise<SystemVoiceRead[]>
  cancel: () => void
}

export type SystemVoicePayload = {
  name: string
  providerCode: string
  providerVoiceId: string
  gender: SystemVoiceGender
  ageGroup: SystemVoiceAgeGroup
  emotionAdjustable: boolean
  previewUrl: string
  previewText: string
  sortOrder: number
  languages: SystemVoiceLanguage[]
}

export type SystemVoiceUpdatePayload = SystemVoicePayload & {
  id: number
}

export type SystemVoiceDeletePayload = {
  id: number
}

type UnknownRecord = Record<string, unknown>

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function readNumber(record: UnknownRecord, ...keys: string[]): number | null {
  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'number' && Number.isFinite(value)) return value
    if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) return Number(value)
  }
  return null
}

function readString(record: UnknownRecord, ...keys: string[]): string {
  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'string') return value
  }
  return ''
}

function readBoolean(record: UnknownRecord, ...keys: string[]): boolean {
  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'boolean') return value
    if (value === 1 || value === '1' || value === 'true') return true
    if (value === 0 || value === '0' || value === 'false') return false
  }
  return false
}

function normalizeLanguage(value: unknown): SystemVoiceLanguage | null {
  if (!isRecord(value)) return null
  const code = readString(value, 'code', 'languageCode', 'language_code').trim()
  if (!code) return null
  return {
    code,
    name: readString(value, 'name', 'languageName', 'language_name').trim() || code,
    primaryLanguage: readBoolean(value, 'primaryLanguage', 'primary_language'),
  }
}

function normalizeVoice(value: unknown): SystemVoiceRead | null {
  if (!isRecord(value)) return null
  const id = readNumber(value, 'id')
  if (id === null) return null

  const sourceType = readNumber(value, 'sourceType', 'source_type')
  const gender = readNumber(value, 'gender')
  const ageGroup = readNumber(value, 'ageGroup', 'age_group')
  const rawLanguages = value.languages ?? value.languageList ?? value.language_list

  return {
    id,
    name: readString(value, 'name').trim() || `Voice ${id}`,
    sourceType: sourceType === 1 || sourceType === 2 || sourceType === 3 ? sourceType : null,
    sourceTypeName: readString(value, 'sourceTypeName', 'source_type_name').trim(),
    providerCode: readString(value, 'providerCode', 'provider_code').trim(),
    providerVoiceId: readString(value, 'providerVoiceId', 'provider_voice_id').trim(),
    gender: gender === 1 || gender === 2 ? gender : null,
    genderName: readString(value, 'genderName', 'gender_name').trim(),
    ageGroup: ageGroup && ageGroup >= 1 && ageGroup <= 5 ? ageGroup as SystemVoiceAgeGroup : null,
    ageGroupName: readString(value, 'ageGroupName', 'age_group_name').trim(),
    emotionAdjustable: readBoolean(value, 'emotionAdjustable', 'emotion_adjustable'),
    previewFileId: readNumber(value, 'previewFileId', 'preview_file_id'),
    previewUrl: readString(value, 'previewUrl', 'preview_url').trim(),
    previewText: readString(value, 'previewText', 'preview_text').trim(),
    sortOrder: readNumber(value, 'sortOrder', 'sort_order') ?? 0,
    languages: Array.isArray(rawLanguages)
      ? rawLanguages.map(normalizeLanguage).filter((item): item is SystemVoiceLanguage => item !== null)
      : [],
    authorizationStatus: readNumber(value, 'authorizationStatus', 'authorization_status'),
    status: readNumber(value, 'status'),
    createdAt: readString(value, 'createdAt', 'created_at').trim() || null,
    updatedAt: readString(value, 'updatedAt', 'updated_at').trim() || null,
  }
}

function assertSystemSuccess(response: ApiEnvelope<unknown>, fallback: string): void {
  if (response.code !== undefined && response.code !== 0 && response.code !== 200) {
    throw new Error(response.message || fallback)
  }
}

function getAvailableVoices(
  query: SystemVoicesPageQuery,
): CancelablePromise<ApiEnvelope<unknown>> {
  return __request(OpenAPI, {
    method: 'GET',
    url: '/api/v1/studio/voices/available/page',
    query,
    errors: {
      422: 'Validation Error',
    },
  })
}

function getAvailableVoiceList(
  query: StudioAvailableVoicesQuery,
): CancelablePromise<ApiEnvelope<unknown>> {
  return __request(OpenAPI, {
    method: 'GET',
    url: '/api/v1/studio/voices/available',
    query,
    errors: {
      422: 'Validation Error',
    },
  })
}

function updateStudioAssetVoice(
  requestBody: StudioAssetVoiceUpdatePayload,
): CancelablePromise<ApiEnvelope<unknown>> {
  return __request(OpenAPI, {
    method: 'POST',
    url: '/api/v1/studio/assets/voice/update',
    body: requestBody,
    mediaType: 'application/json',
    errors: {
      422: 'Validation Error',
    },
  })
}

function createSystemVoice(
  requestBody: SystemVoicePayload,
): CancelablePromise<ApiEnvelope<unknown>> {
  return __request(OpenAPI, {
    method: 'POST',
    url: '/api/v1/studio/voices/system/create',
    body: requestBody,
    mediaType: 'application/json',
    errors: {
      422: 'Validation Error',
    },
  })
}

function updateSystemVoice(
  requestBody: SystemVoiceUpdatePayload,
): CancelablePromise<ApiEnvelope<unknown>> {
  return __request(OpenAPI, {
    method: 'POST',
    url: '/api/v1/studio/voices/system/update',
    body: requestBody,
    mediaType: 'application/json',
    errors: {
      422: 'Validation Error',
    },
  })
}

function deleteSystemVoice(
  requestBody: SystemVoiceDeletePayload,
): CancelablePromise<ApiEnvelope<unknown>> {
  return __request(OpenAPI, {
    method: 'POST',
    url: '/api/v1/studio/voices/system/delete',
    body: requestBody,
    mediaType: 'application/json',
    errors: {
      422: 'Validation Error',
    },
  })
}

export const SystemVoicesApi = {
  async getPage(query: SystemVoicesPageQuery): Promise<SystemVoicesPage> {
    const response = await getAvailableVoices(query)
    assertSystemSuccess(response, 'Voices loading failed')

    const data = isRecord(response.data) ? response.data : {}
    const rawItems = data.items ?? data.records ?? data.list
    const items = Array.isArray(rawItems)
      ? rawItems.map(normalizeVoice).filter((item): item is SystemVoiceRead => item !== null)
      : []

    return {
      items,
      page: readNumber(data, 'page', 'current', 'pageNum', 'page_num') ?? query.page,
      pageSize: readNumber(data, 'pageSize', 'size', 'page_size') ?? query.pageSize,
      total: readNumber(data, 'total', 'totalCount', 'total_count') ?? items.length,
    }
  },

  async create(requestBody: SystemVoicePayload): Promise<void> {
    const response = await createSystemVoice(requestBody)
    assertSystemSuccess(response, 'Voice creation failed')
  },

  async update(requestBody: SystemVoiceUpdatePayload): Promise<void> {
    const response = await updateSystemVoice(requestBody)
    assertSystemSuccess(response, 'Voice update failed')
  },

  async delete(requestBody: SystemVoiceDeletePayload): Promise<void> {
    const response = await deleteSystemVoice(requestBody)
    assertSystemSuccess(response, 'Voice deletion failed')
  },
}

/** 项目资产步骤使用的音色查询与角色音色配置接口。 */
export const StudioVoicesApi = {
  requestAvailable(query: StudioAvailableVoicesQuery = {}): StudioAvailableVoicesRequest {
    const request = getAvailableVoiceList(query)
    return {
      cancel: () => request.cancel(),
      promise: request.then((response) => {
        assertSystemSuccess(response, 'Available voices loading failed')
        if (!Array.isArray(response.data)) {
          throw new Error('Available voices returned an invalid data payload')
        }
        return response.data
          .map(normalizeVoice)
          .filter((item): item is SystemVoiceRead => item !== null)
      }),
    }
  },

  async updateAssetVoice(requestBody: StudioAssetVoiceUpdatePayload): Promise<void> {
    const response = await updateStudioAssetVoice(requestBody)
    assertSystemSuccess(response, 'Asset voice update failed')
  },
}
