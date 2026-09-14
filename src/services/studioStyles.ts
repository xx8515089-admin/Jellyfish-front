import { OpenAPI } from './generated'
import type { CancelablePromise } from './generated'
import { request as __request } from './generated/core/request'

type ApiEnvelope<T> = {
  code?: number
  message?: string
  data?: T | null
}

export type StudioCustomStyleType = 1 | 2

export type StudioCustomStyleCreate = {
  styleType: StudioCustomStyleType
  name: string
  promptTemplate: string
  description: string
  coverUrl: string
  publicOption: boolean
  sortOrder: number
}

export type StudioCustomStyle = Partial<StudioCustomStyleCreate> & {
  id?: string | number | null
  code?: string | null
  styleCode?: string | null
}

export type StudioCustomStyleCover = {
  createdAt?: string | null
  updatedAt?: string | null
  id?: string | number | null
  name?: string | null
  fileType?: string | null
  storageKey?: string | null
  url: string
  mimeType?: string | null
  sizeBytes?: number | null
  width?: number | null
  height?: number | null
  sourceType?: number | null
}

export type StudioStyleOption = {
  createdAt?: string | null
  updatedAt?: string | null
  id: string | number
  styleType: StudioCustomStyleType
  name: string
  language?: string | null
  coverUrl?: string | null
  description?: string | null
  promptTemplate?: string | null
  status?: number | null
  defaultOption?: boolean
  sortOrder?: number | null
  customOption?: boolean
  publicOption?: boolean
}

type StudioStyleOptionPayload = Partial<Omit<StudioStyleOption, 'id' | 'styleType' | 'name'>> & {
  id?: string | number | null
  styleId?: string | number | null
  styleType?: StudioCustomStyleType | null
  type?: StudioCustomStyleType | null
  name?: string | null
  isDefault?: boolean | null
}

function createCustomStyle(
  requestBody: StudioCustomStyleCreate,
): CancelablePromise<ApiEnvelope<StudioCustomStyle>> {
  return __request(OpenAPI, {
    method: 'POST',
    url: '/api/v1/studio/styles/custom',
    body: requestBody,
    mediaType: 'application/json',
    errors: {
      422: 'Validation Error',
    },
  })
}

/** 上传一张裁剪后的 JPG 或 PNG 自定义风格封面。 */
function uploadCustomStyleCover(
  file: File,
): CancelablePromise<ApiEnvelope<StudioCustomStyleCover>> {
  return __request(OpenAPI, {
    method: 'POST',
    url: '/api/v1/studio/styles/custom/covers',
    formData: { file },
    mediaType: 'multipart/form-data',
    errors: {
      422: 'Validation Error',
    },
  })
}

/** 加载指定后端风格类别中已启用的风格选项。 */
function getStyleOptions(
  styleType: StudioCustomStyleType,
): CancelablePromise<ApiEnvelope<StudioStyleOptionPayload[]>> {
  return __request(OpenAPI, {
    method: 'GET',
    url: '/api/v1/studio/styles/options',
    query: {
      type: styleType,
    },
    errors: {
      422: 'Validation Error',
    },
  })
}

/** 兼容风格接口的新旧字段名，并补全当前请求对应的风格类型。 */
function normalizeStyleOption(
  item: StudioStyleOptionPayload,
  requestedStyleType: StudioCustomStyleType,
): StudioStyleOption | null {
  const id = item.id ?? item.styleId
  const name = item.name?.trim()
  if (id === null || id === undefined || !name) return null

  return {
    ...item,
    id,
    styleType: item.styleType ?? item.type ?? requestedStyleType,
    name,
    defaultOption: item.defaultOption ?? item.isDefault ?? false,
  }
}

export const StudioStylesApi = {
  /** 上传自定义封面，并返回其持久化在线 URL 元数据。 */
  async uploadCustomCover(file: File): Promise<StudioCustomStyleCover> {
    const response = await uploadCustomStyleCover(file)
    if ((response.code ?? 200) >= 400) {
      throw new Error(response.message || 'Custom style cover upload failed')
    }
    if (!response.data?.url?.trim()) {
      throw new Error(response.message || 'Custom style cover upload returned no URL')
    }
    return response.data
  },
  /** type 为 1 时返回视觉风格，为 2 时返回影调风格。 */
  async getOptions(styleType: StudioCustomStyleType): Promise<StudioStyleOption[]> {
    const response = await getStyleOptions(styleType)
    if (response.code !== 200) {
      throw new Error(response.message || 'Style options loading failed')
    }
    if (!Array.isArray(response.data)) return []
    return response.data
      .map((item) => normalizeStyleOption(item, styleType))
      .filter((item): item is StudioStyleOption => item !== null)
  },
  async createCustom(requestBody: StudioCustomStyleCreate): Promise<StudioCustomStyle> {
    const response = await createCustomStyle(requestBody)
    if ((response.code ?? 200) >= 400) {
      throw new Error(response.message || 'Custom style creation failed')
    }
    return response.data && typeof response.data === 'object'
      ? response.data
      : requestBody
  },
}
