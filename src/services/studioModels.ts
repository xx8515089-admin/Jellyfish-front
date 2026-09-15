import { OpenAPI } from './generated'
import type { CancelablePromise } from './generated'
import { request as __request } from './generated/core/request'
import { getStoredAuthUser } from '../auth'

type ApiEnvelope<T> = {
  code?: number
  message?: string
  data?: T | null
}

export type StudioImageModelCapabilities = {
  aspectRatios: string[]
  qualities: number[]
  resolutions: number[]
  maxReferenceImages: number
  maxPromptCharacters: number
  promptTemplateCategory?: string | null
  referenceTokenStyle?: string | null
}

export type StudioVideoModelCapabilities = {
  resolutions: string[]
  minDurationSeconds: number
  maxDurationSeconds: number
  maxReferenceImages: number
  nativeAudioSupported: boolean
  maxPromptCharacters: number
  promptTemplateCategory?: string | null
  referenceTokenStyle?: string | null
}

export type StudioGenerationModel = {
  id: number
  supplierId: number
  supplierName: string
  type: number
  name: string
  modelCode: string
  defaultModel: boolean
  description?: string | null
  billingRules?: unknown[] | null
  imageCapabilities?: StudioImageModelCapabilities | null
  videoCapabilities?: StudioVideoModelCapabilities | null
  speechCapabilities?: {
    languages?: string[]
    formats?: string[]
    minSpeechRate?: number
    maxSpeechRate?: number
    minVolume?: number
    maxVolume?: number
    maxInputCharacters?: number
    defaultFormat?: string
    voiceProviderCode?: string
  } | null
}

function getStudioModels(type = 2): CancelablePromise<ApiEnvelope<StudioGenerationModel[]>> {
  return __request(OpenAPI, {
    method: 'GET',
    url: '/api/v1/studio/models',
    query: { type },
    errors: {
      422: 'Validation Error',
    },
  })
}

type StudioModelsCacheEntry = {
  models: StudioGenerationModel[]
  expiresAt: number
}

const STUDIO_MODELS_CACHE_TTL_MS = 5 * 60 * 1000
const STUDIO_MODELS_CACHE_MAX_ENTRIES = 8
const studioModelsRequests = new Map<string, Promise<StudioGenerationModel[]>>()
const studioModelsCache = new Map<string, StudioModelsCacheEntry>()

const getStudioModelsCacheKey = (type: number) => {
  const user = getStoredAuthUser()
  const userScope = user?.id ?? user?.username ?? 'anonymous'
  return `${String(userScope)}:${type}`
}

function loadStudioModels(type: number, errorMessage: string): Promise<StudioGenerationModel[]> {
  return getStudioModels(type)
    .then((response) => {
      if ((response.code ?? 200) >= 400) {
        throw new Error(response.message || errorMessage)
      }
      const models = Array.isArray(response.data)
        ? response.data.filter((model) => (
          Number.isFinite(Number(model.id))
          && Boolean(model.name?.trim())
          && Boolean(model.modelCode?.trim())
        ))
        : []
      return models
    })
}

function loadCachedStudioModels(
  type: number,
  errorMessage: string,
  force = false,
): Promise<StudioGenerationModel[]> {
  const cacheKey = getStudioModelsCacheKey(type)
  const cached = studioModelsCache.get(cacheKey)
  if (!force && cached && cached.expiresAt > Date.now()) {
    studioModelsCache.delete(cacheKey)
    studioModelsCache.set(cacheKey, cached)
    return Promise.resolve(cached.models)
  }
  if (cached) studioModelsCache.delete(cacheKey)

  const pending = studioModelsRequests.get(cacheKey)
  if (pending) return pending
  const request = loadStudioModels(type, errorMessage)
    .then((models) => {
      if (models.length > 0) {
        studioModelsCache.set(cacheKey, {
          models,
          expiresAt: Date.now() + STUDIO_MODELS_CACHE_TTL_MS,
        })
        while (studioModelsCache.size > STUDIO_MODELS_CACHE_MAX_ENTRIES) {
          const oldestKey = studioModelsCache.keys().next().value as string | undefined
          if (oldestKey === undefined) break
          studioModelsCache.delete(oldestKey)
        }
      }
      return models
    })
    .finally(() => {
      if (studioModelsRequests.get(cacheKey) === request) studioModelsRequests.delete(cacheKey)
    })
  studioModelsRequests.set(cacheKey, request)
  return request
}

export const StudioModelsApi = {
  async getSpeechModels(force = false): Promise<StudioGenerationModel[]> {
    return loadCachedStudioModels(4, 'Speech model loading failed', force)
  },
  /** 查询图片生成模型；默认固定为后端模型类型 2，并合并 StrictMode 等并发请求。 */
  async getImageModels(force = false): Promise<StudioGenerationModel[]> {
    return loadCachedStudioModels(2, 'Image model loading failed', force)
  },

  /** 查询视频生成模型；后端模型类型固定为 3，并合并 StrictMode 等并发请求。 */
  async getVideoModels(force = false): Promise<StudioGenerationModel[]> {
    return loadCachedStudioModels(3, 'Video model loading failed', force)
  },
}
