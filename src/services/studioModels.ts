import { OpenAPI } from './generated'
import type { CancelablePromise } from './generated'
import { request as __request } from './generated/core/request'

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

let imageModelsRequest: Promise<StudioGenerationModel[]> | null = null
let videoModelsRequest: Promise<StudioGenerationModel[]> | null = null

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

export const StudioModelsApi = {
  /** 查询图片生成模型；默认固定为后端模型类型 2，并合并 StrictMode 等并发请求。 */
  async getImageModels(): Promise<StudioGenerationModel[]> {
    if (imageModelsRequest) return imageModelsRequest

    imageModelsRequest = loadStudioModels(2, 'Image model loading failed')
      .finally(() => {
        imageModelsRequest = null
      })
    return imageModelsRequest
  },

  /** 查询视频生成模型；后端模型类型固定为 3，并合并 StrictMode 等并发请求。 */
  async getVideoModels(): Promise<StudioGenerationModel[]> {
    if (videoModelsRequest) return videoModelsRequest

    videoModelsRequest = loadStudioModels(3, 'Video model loading failed')
      .finally(() => {
        videoModelsRequest = null
      })
    return videoModelsRequest
  },
}
