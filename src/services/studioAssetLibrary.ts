import { OpenAPI } from './generated'
import type { CancelablePromise } from './generated'
import { request as __request } from './generated/core/request'

type ApiEnvelope<T> = {
  code?: number
  message?: string
  data?: T | null
}

export type StudioAssetLibraryAssetType = 1 | 2 | 3

export type StudioAssetLibraryOption = {
  code: string
  label: string
}

export type StudioAssetLibraryOptions = Partial<Record<
  'gender'
  | 'ageGroup'
  | 'countryType'
  | 'bodyType'
  | 'skinTone'
  | 'temperamentTags'
  | 'personaTags',
  StudioAssetLibraryOption[]
>>

export type StudioAssetLibraryItem = {
  id: number
  assetType: StudioAssetLibraryAssetType
  assetTypeName?: string
  libraryCode?: string
  name: string
  prompt?: string | null
  gender?: unknown
  ageGroup?: unknown
  visualStyleId?: number | null
  visualStyleName?: string | null
  countryType?: unknown
  bodyType?: unknown
  skinTone?: unknown
  temperamentTags?: unknown[] | null
  personaTags?: unknown[] | null
  customTags?: unknown[] | null
  description?: string | null
  lookName?: string | null
  coverFileId?: number | null
  coverUrl?: string | null
  status?: number | null
  statusName?: string | null
  createdAt?: string | null
  updatedAt?: string | null
}

export type StudioAssetLibraryPage = {
  page: number
  pageSize: number
  total: number
  items: StudioAssetLibraryItem[]
}

type StudioAssetLibrarySaveBase = {
  assetId: number
  imageVersionId: number
  name?: string | null
}

export type StudioAssetLibrarySaveRequest =
  | (StudioAssetLibrarySaveBase & {
      assetType: 1
      gender?: string | null
      ageGroup?: string | null
      visualStyleId?: number | null
      countryType?: string | null
    })
  | (StudioAssetLibrarySaveBase & {
      assetType: 2 | 3
      gender?: never
      ageGroup?: never
      visualStyleId?: number | null
      countryType?: never
    })

export type StudioAssetLibraryImportRequest = {
  assetType: StudioAssetLibraryAssetType
  libraryItemId: number
  scriptImportId: number
  name?: string | null
  episodeIndexes?: number[] | null
}

export type StudioAssetLibraryImportResult = {
  importRecordId: number
  libraryItemId: number
  assetType: StudioAssetLibraryAssetType
  assetId: number
  assetName: string
  defaultLookId: number
  coverFileId: number
  coverUrl: string | null
  episodeIndexes: number[]
  imageVersionId: number
}

type AssetLibraryPagePayload = {
  page?: number | null
  pageSize?: number | null
  page_size?: number | null
  total?: number | null
  items?: unknown
}

type AssetLibraryItemPayload = Record<string, unknown>

function requestListItems(query: {
  assetType: StudioAssetLibraryAssetType
  status?: number
  keyword?: string
  page?: number
  pageSize?: number
}): CancelablePromise<ApiEnvelope<AssetLibraryPagePayload>> {
  return __request(OpenAPI, {
    method: 'GET',
    url: '/api/v1/studio/assetLibrary/items',
    query,
    errors: {
      422: 'Validation Error',
    },
  })
}

function requestSaveItem(
  requestBody: StudioAssetLibrarySaveRequest,
): CancelablePromise<ApiEnvelope<AssetLibraryItemPayload>> {
  const commonBody = {
    assetType: requestBody.assetType,
    assetId: requestBody.assetId,
    imageVersionId: requestBody.imageVersionId,
    ...(requestBody.name !== undefined ? { name: requestBody.name } : {}),
  }
  const body = requestBody.assetType === 1
    ? {
        ...commonBody,
        ...(requestBody.gender !== undefined ? { gender: requestBody.gender } : {}),
        ...(requestBody.ageGroup !== undefined ? { ageGroup: requestBody.ageGroup } : {}),
        ...(requestBody.visualStyleId !== undefined ? { visualStyleId: requestBody.visualStyleId } : {}),
        ...(requestBody.countryType !== undefined ? { countryType: requestBody.countryType } : {}),
      }
    : {
        ...commonBody,
        ...(requestBody.visualStyleId !== undefined ? { visualStyleId: requestBody.visualStyleId } : {}),
      }
  return __request(OpenAPI, {
    method: 'POST',
    url: '/api/v1/studio/assetLibrary/items',
    body,
    mediaType: 'application/json',
    errors: {
      422: 'Validation Error',
    },
  })
}

function requestImportItem(
  requestBody: StudioAssetLibraryImportRequest,
): CancelablePromise<ApiEnvelope<Record<string, unknown>>> {
  return __request(OpenAPI, {
    method: 'POST',
    url: '/api/v1/studio/assetLibrary/imports',
    body: requestBody,
    mediaType: 'application/json',
    errors: {
      422: 'Validation Error',
    },
  })
}

function requestOptions(
  assetType: StudioAssetLibraryAssetType,
): CancelablePromise<ApiEnvelope<Record<string, unknown>>> {
  return __request(OpenAPI, {
    method: 'GET',
    url: '/api/v1/studio/assetLibrary/options',
    query: { assetType },
    errors: {
      422: 'Validation Error',
    },
  })
}

function unwrapAssetLibraryData<T>(response: ApiEnvelope<T>, fallback: string): T {
  if (response.code !== 200) {
    const error = new Error(response.message || fallback) as Error & {
      status?: number
      body?: ApiEnvelope<T>
    }
    error.status = response.code
    error.body = response
    throw error
  }
  if (response.data === undefined || response.data === null) {
    throw new Error(response.message || fallback)
  }
  return response.data
}

function toNumber(value: unknown): number | undefined {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

function toPositiveInteger(value: unknown): number | undefined {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined
}

function toStringValue(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed || undefined
}

function normalizeUnknownArray(value: unknown): unknown[] | null | undefined {
  return Array.isArray(value) ? value : value === null ? null : undefined
}

function normalizeAssetLibraryItem(value: unknown): StudioAssetLibraryItem | null {
  if (!value || typeof value !== 'object') return null
  const item = value as AssetLibraryItemPayload
  const id = toNumber(item.id)
  const assetType = toNumber(item.assetType ?? item.asset_type)
  const name = toStringValue(item.name)
  if (!id || (assetType !== 1 && assetType !== 2 && assetType !== 3) || !name) return null
  return {
    id,
    assetType,
    name,
    assetTypeName: toStringValue(item.assetTypeName ?? item.asset_type_name),
    libraryCode: toStringValue(item.libraryCode ?? item.library_code),
    prompt: toStringValue(item.prompt) ?? null,
    gender: item.gender,
    ageGroup: item.ageGroup ?? item.age_group,
    visualStyleId: toNumber(item.visualStyleId ?? item.visual_style_id) ?? null,
    visualStyleName: toStringValue(item.visualStyleName ?? item.visual_style_name) ?? null,
    countryType: item.countryType ?? item.country_type,
    bodyType: item.bodyType ?? item.body_type,
    skinTone: item.skinTone ?? item.skin_tone,
    temperamentTags: normalizeUnknownArray(item.temperamentTags ?? item.temperament_tags) ?? null,
    personaTags: normalizeUnknownArray(item.personaTags ?? item.persona_tags) ?? null,
    customTags: normalizeUnknownArray(item.customTags ?? item.custom_tags) ?? null,
    description: toStringValue(item.description) ?? null,
    lookName: toStringValue(item.lookName ?? item.look_name) ?? null,
    coverFileId: toNumber(item.coverFileId ?? item.cover_file_id) ?? null,
    coverUrl: toStringValue(item.coverUrl ?? item.cover_url) ?? null,
    status: toNumber(item.status) ?? null,
    statusName: toStringValue(item.statusName ?? item.status_name) ?? null,
    createdAt: toStringValue(item.createdAt ?? item.created_at) ?? null,
    updatedAt: toStringValue(item.updatedAt ?? item.updated_at) ?? null,
  }
}

function normalizeOptionList(value: unknown): StudioAssetLibraryOption[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') return []
    const record = item as Record<string, unknown>
    const code = toStringValue(record.code)
    const label = toStringValue(record.label)
    return code && label ? [{ code, label }] : []
  })
}

function normalizeImportResult(value: unknown): StudioAssetLibraryImportResult {
  if (!value || typeof value !== 'object') throw new Error('Asset import returned invalid data')
  const record = value as Record<string, unknown>
  const libraryItemId = toPositiveInteger(record.libraryItemId ?? record.library_item_id)
  const assetType = toNumber(record.assetType ?? record.asset_type)
  const assetId = toPositiveInteger(record.assetId ?? record.asset_id)
  const assetName = toStringValue(record.assetName ?? record.asset_name)
  const importRecordId = toPositiveInteger(record.importRecordId ?? record.import_record_id)
  const defaultLookId = toPositiveInteger(record.defaultLookId ?? record.default_look_id)
  const coverFileId = toPositiveInteger(record.coverFileId ?? record.cover_file_id)
  const imageVersionId = toPositiveInteger(record.imageVersionId ?? record.image_version_id)
  const hasCoverUrl = Object.prototype.hasOwnProperty.call(record, 'coverUrl')
    || Object.prototype.hasOwnProperty.call(record, 'cover_url')
  const rawCoverUrl = Object.prototype.hasOwnProperty.call(record, 'coverUrl')
    ? record.coverUrl
    : record.cover_url
  const coverUrl = rawCoverUrl === null ? null : toStringValue(rawCoverUrl)
  const rawEpisodeIndexes = record.episodeIndexes ?? record.episode_indexes
  const episodeIndexes = Array.isArray(rawEpisodeIndexes)
    ? rawEpisodeIndexes.map(toPositiveInteger)
    : null
  if (
    !importRecordId
    || !libraryItemId
    || (assetType !== 1 && assetType !== 2 && assetType !== 3)
    || !assetId
    || !assetName
    || !defaultLookId
    || !coverFileId
    || !imageVersionId
    || !hasCoverUrl
    || coverUrl === undefined
    || episodeIndexes === null
    || episodeIndexes.some((item) => item === undefined)
  ) {
    throw new Error('Asset import returned invalid data')
  }
  return {
    importRecordId,
    libraryItemId,
    assetType,
    assetId,
    assetName,
    defaultLookId,
    coverFileId,
    coverUrl,
    episodeIndexes: episodeIndexes as number[],
    imageVersionId,
  }
}

export function formatAssetLibraryValue(value: unknown): string | undefined {
  if (typeof value === 'string') return value.trim() || undefined
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    return toStringValue(record.label) ?? toStringValue(record.name) ?? toStringValue(record.code)
  }
  return undefined
}

export function formatAssetLibraryTags(value: unknown[] | null | undefined): string[] {
  if (!Array.isArray(value)) return []
  return value
    .map(formatAssetLibraryValue)
    .filter((item): item is string => Boolean(item))
}

export const StudioAssetLibraryApi = {
  async listItems(params: {
    assetType: StudioAssetLibraryAssetType
    status?: number
    keyword?: string
    page?: number
    pageSize?: number
  }): Promise<StudioAssetLibraryPage> {
    const response = await requestListItems({
      assetType: params.assetType,
      status: params.status ?? 1,
      keyword: params.keyword?.trim() || undefined,
      page: params.page ?? 1,
      pageSize: params.pageSize ?? 30,
    })
    const data = unwrapAssetLibraryData(response, 'Asset library list loading failed')
    const rows = Array.isArray(data.items) ? data.items : []
    return {
      page: data.page ?? params.page ?? 1,
      pageSize: data.pageSize ?? data.page_size ?? params.pageSize ?? 30,
      total: data.total ?? rows.length,
      items: rows
        .map(normalizeAssetLibraryItem)
        .filter((item): item is StudioAssetLibraryItem => item !== null),
    }
  },
  async saveItem(requestBody: StudioAssetLibrarySaveRequest): Promise<StudioAssetLibraryItem> {
    const response = await requestSaveItem(requestBody)
    const data = unwrapAssetLibraryData(response, 'Asset library save failed')
    const item = normalizeAssetLibraryItem(data)
    if (!item) throw new Error(response.message || 'Asset library save returned invalid data')
    return item
  },
  async importItem(requestBody: StudioAssetLibraryImportRequest): Promise<StudioAssetLibraryImportResult> {
    const response = await requestImportItem(requestBody)
    const data = unwrapAssetLibraryData(response, 'Asset library import failed')
    const result = normalizeImportResult(data)
    if (result.assetType !== requestBody.assetType || result.libraryItemId !== requestBody.libraryItemId) {
      throw new Error('Asset import returned mismatched data')
    }
    return result
  },
  async getOptions(assetType: StudioAssetLibraryAssetType): Promise<StudioAssetLibraryOptions> {
    const response = await requestOptions(assetType)
    const data = unwrapAssetLibraryData(response, 'Asset library options loading failed')
    return {
      gender: normalizeOptionList(data.gender),
      ageGroup: normalizeOptionList(data.ageGroup ?? data.age_group),
      countryType: normalizeOptionList(data.countryType ?? data.country_type),
      bodyType: normalizeOptionList(data.bodyType ?? data.body_type),
      skinTone: normalizeOptionList(data.skinTone ?? data.skin_tone),
      temperamentTags: normalizeOptionList(data.temperamentTags ?? data.temperament_tags),
      personaTags: normalizeOptionList(data.personaTags ?? data.persona_tags),
    }
  },
}
