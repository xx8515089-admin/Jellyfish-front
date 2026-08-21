import { OpenAPI } from './generated'
import type { CancelablePromise } from './generated'
import { request as __request } from './generated/core/request'

type ApiEnvelope<T> = {
  code?: number
  message?: string
  data?: T | null
}

export type SystemSupplierCreateRequest = {
  name: string
  baseUrl: string
  apiKey: string
  apiSecret: string
  description: string
  active: boolean
}

export type SystemSupplierModelType = 1 | 2 | 3

export type SystemSupplierImageCapabilities = {
  aspectRatios: string[]
  qualities: number[]
  resolutions: number[]
  maxReferenceImages: number
  maxPromptCharacters: number
  generationPath: string
  editPath: string
}

export type SystemSupplierVideoCapabilities = {
  resolutions: string[]
  minDurationSeconds: number
  maxDurationSeconds: number
  maxReferenceImages: number
  nativeAudioSupported: boolean
  maxPromptCharacters: number
  promptTemplateCategory: string
  referenceTokenStyle: string
  submitPath: string
  queryPathTemplate: string
}

export type SystemSupplierModelCreateRequest = {
  supplierId: number
  type: SystemSupplierModelType
  name: string
  modelCode: string
  requestUrl: string
  description: string
  active: boolean
  imageCapabilities?: SystemSupplierImageCapabilities
  videoCapabilities?: SystemSupplierVideoCapabilities
}

type SystemSupplierModelUpdateBase = {
  modelId: number
  name: string
  modelCode: string
  requestUrl: string
  description: string
  active: boolean
}

export type SystemSupplierTextModelUpdateRequest = SystemSupplierModelUpdateBase & {
  type: 1
  imageCapabilities?: never
  videoCapabilities?: never
}

export type SystemSupplierImageModelUpdateRequest = SystemSupplierModelUpdateBase & {
  type: 2
  imageCapabilities: SystemSupplierImageCapabilities
  videoCapabilities?: never
}

export type SystemSupplierVideoModelUpdateRequest = SystemSupplierModelUpdateBase & {
  type: 3
  imageCapabilities?: never
  videoCapabilities: SystemSupplierVideoCapabilities
}

export type SystemSupplierModelUpdateRequest =
  | SystemSupplierTextModelUpdateRequest
  | SystemSupplierImageModelUpdateRequest
  | SystemSupplierVideoModelUpdateRequest

export type SystemSupplierModelRead = {
  createdAt?: string | null
  updatedAt?: string | null
  id: number
  supplierId: number
  type: number
  name: string
  modelCode: string
  requestUrl: string
  description?: string | null
  active: boolean
  supportedResolutions?: string[] | null
  minDurationSeconds?: number | null
  maxDurationSeconds?: number | null
  maxReferenceImages?: number | null
  nativeAudioSupported?: boolean | null
  maxPromptCharacters?: number | null
  videoPromptTemplateCategory?: string | null
  videoReferenceTokenStyle?: string | null
  videoSubmitPath?: string | null
  videoQueryPathTemplate?: string | null
  imageSupportedAspectRatios?: string[] | null
  imageSupportedQualities?: number[] | null
  imageSupportedResolutions?: number[] | null
  imageMaxReferenceImages?: number | null
  imageMaxPromptCharacters?: number | null
  imagePromptTemplateCategory?: string | null
  imageReferenceTokenStyle?: string | null
  imageGenerationPath?: string | null
  imageEditPath?: string | null
  speechSupportedLanguages?: string[] | null
  speechSupportedFormats?: string[] | null
  speechMinRate?: number | null
  speechMaxRate?: number | null
  speechMinVolume?: number | null
  speechMaxVolume?: number | null
  speechMaxInputCharacters?: number | null
  speechDefaultFormat?: string | null
  speechPath?: string | null
  speechVoiceProviderCode?: string | null
}

export type SystemSupplierRead = {
  createdAt?: string | null
  updatedAt?: string | null
  id: number
  name: string
  baseUrl: string
  description?: string | null
  active: boolean
  models: SystemSupplierModelRead[]
  apiSecretConfigured: boolean
  modelTypes: number[]
  apiKeyConfigured: boolean
}

function createSystemSupplier(
  requestBody: SystemSupplierCreateRequest,
): CancelablePromise<ApiEnvelope<unknown>> {
  return __request(OpenAPI, {
    method: 'POST',
    url: '/api/v1/system/suppliers/create',
    body: requestBody,
    mediaType: 'application/json',
    errors: {
      422: 'Validation Error',
    },
  })
}

function createSystemSupplierModel(
  requestBody: SystemSupplierModelCreateRequest,
): CancelablePromise<ApiEnvelope<unknown>> {
  return __request(OpenAPI, {
    method: 'POST',
    url: '/api/v1/system/suppliers/createModel',
    body: requestBody,
    mediaType: 'application/json',
    errors: {
      422: 'Validation Error',
    },
  })
}

function updateSystemSupplierModel(
  requestBody: SystemSupplierModelUpdateRequest,
): CancelablePromise<ApiEnvelope<unknown>> {
  return __request(OpenAPI, {
    method: 'POST',
    url: '/api/v1/system/suppliers/updateModel',
    body: requestBody,
    mediaType: 'application/json',
    errors: {
      422: 'Validation Error',
    },
  })
}

function getAllSystemSuppliers(): CancelablePromise<ApiEnvelope<SystemSupplierRead[]>> {
  return __request(OpenAPI, {
    method: 'GET',
    url: '/api/v1/system/suppliers/all',
  })
}

export const SystemSuppliersApi = {
  async getAll(): Promise<SystemSupplierRead[]> {
    const response = await getAllSystemSuppliers()
    if ((response.code ?? 200) >= 400) {
      throw new Error(response.message || 'Suppliers loading failed')
    }
    return Array.isArray(response.data) ? response.data : []
  },
  async create(requestBody: SystemSupplierCreateRequest): Promise<void> {
    const response = await createSystemSupplier(requestBody)
    if ((response.code ?? 200) >= 400) {
      throw new Error(response.message || 'Supplier creation failed')
    }
  },
  async createModel(requestBody: SystemSupplierModelCreateRequest): Promise<void> {
    const response = await createSystemSupplierModel(requestBody)
    if ((response.code ?? 200) >= 400) {
      throw new Error(response.message || 'Supplier model creation failed')
    }
  },
  async updateModel(requestBody: SystemSupplierModelUpdateRequest): Promise<void> {
    const response = await updateSystemSupplierModel(requestBody)
    if ((response.code ?? 200) >= 400) {
      throw new Error(response.message || 'Supplier model update failed')
    }
  },
}
