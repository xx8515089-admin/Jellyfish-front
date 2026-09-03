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

export const StudioModelsApi = {
  /** 查询图片生成模型；默认固定为后端模型类型 2，并合并 StrictMode 等并发请求。 */
  async getImageModels(): Promise<StudioGenerationModel[]> {
    if (imageModelsRequest) return imageModelsRequest

    imageModelsRequest = getStudioModels(2)
      .then((response) => {
        if ((response.code ?? 200) >= 400) {
          throw new Error(response.message || 'Image model loading failed')
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
      .finally(() => {
        imageModelsRequest = null
      })
    return imageModelsRequest
  },
}
