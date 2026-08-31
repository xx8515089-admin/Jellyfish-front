import { OpenAPI } from './generated'
import type { CancelablePromise } from './generated'
import { request as __request } from './generated/core/request'

type ApiEnvelope<T> = {
  code?: number
  message?: string
  data?: T | null
}

export type SystemSupplierBalanceQuery = {
  supplierId: number
}

export type SystemSupplierBalanceRead = {
  supplierId: number
  supplierName?: string | null
  balance: number | string | null
  currency?: string | null
}

export type SystemSupplierCreateRequest = {
  name: string
  baseUrl: string
  apiKey: string
  apiSecret: string
  description: string
  active: boolean
}

export type SystemSupplierUpdateRequest = {
  id: number
  name: string
  baseUrl: string
  apiKey: string
  apiSecret: string
  description: string
  active: boolean
}

export type SystemSupplierModelType = 1 | 2 | 3

export type SystemSupplierModelsQuery = {
  supplierId: number
  type?: SystemSupplierModelType
  page: number
  pageSize: number
}

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

export type SystemSupplierTextCapabilities = {
  apiProtocol: string
  memorySupported: boolean
  defaultMemoryEnabled: boolean
  reasoningEfforts: string[]
  defaultReasoningEffort: string
}

type SystemSupplierModelCreateBase = {
  supplierId: number
  name: string
  modelCode: string
  requestUrl: string
  description: string
  active: boolean
  defaultModel: boolean
}

export type SystemSupplierTextModelCreateRequest = SystemSupplierModelCreateBase & {
  type: 1
  textCapabilities: SystemSupplierTextCapabilities
  imageCapabilities?: never
  videoCapabilities?: never
}

export type SystemSupplierImageModelCreateRequest = SystemSupplierModelCreateBase & {
  type: 2
  textCapabilities?: never
  imageCapabilities: SystemSupplierImageCapabilities
  videoCapabilities?: never
}

export type SystemSupplierVideoModelCreateRequest = SystemSupplierModelCreateBase & {
  type: 3
  textCapabilities?: never
  imageCapabilities?: never
  videoCapabilities: SystemSupplierVideoCapabilities
}

export type SystemSupplierModelCreateRequest =
  | SystemSupplierTextModelCreateRequest
  | SystemSupplierImageModelCreateRequest
  | SystemSupplierVideoModelCreateRequest

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

export type SystemSupplierModelsPage = {
  items: SystemSupplierModelRead[]
  page: number
  pageSize: number
  total: number
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

function updateSystemSupplier(
  requestBody: SystemSupplierUpdateRequest,
): CancelablePromise<ApiEnvelope<unknown>> {
  return __request(OpenAPI, {
    method: 'POST',
    url: '/api/v1/system/suppliers/update',
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

function getSystemSupplierModels(
  query: SystemSupplierModelsQuery,
): CancelablePromise<ApiEnvelope<SystemSupplierModelsPage>> {
  return __request(OpenAPI, {
    method: 'GET',
    url: '/api/v1/system/suppliers/getModels',
    query,
    errors: {
      422: 'Validation Error',
    },
  })
}

function getSystemSupplierBalance(
  query: SystemSupplierBalanceQuery,
): CancelablePromise<ApiEnvelope<SystemSupplierBalanceRead>> {
  return __request(OpenAPI, {
    method: 'GET',
    url: '/api/v1/system/suppliers/getBalance',
    query,
    errors: {
      422: 'Validation Error',
    },
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
  async getModels(query: SystemSupplierModelsQuery): Promise<SystemSupplierModelsPage> {
    const response = await getSystemSupplierModels(query)
    if ((response.code ?? 200) >= 400) {
      throw new Error(response.message || 'Supplier models loading failed')
    }
    return {
      items: Array.isArray(response.data?.items) ? response.data.items : [],
      page: response.data?.page ?? query.page,
      pageSize: response.data?.pageSize ?? query.pageSize,
      total: response.data?.total ?? 0,
    }
  },
  async getBalance(query: SystemSupplierBalanceQuery): Promise<SystemSupplierBalanceRead | null> {
    const response = await getSystemSupplierBalance(query)
    if ((response.code ?? 200) >= 400) {
      throw new Error(response.message || 'Supplier balance loading failed')
    }
    return response.data ?? null
  },
  async create(requestBody: SystemSupplierCreateRequest): Promise<void> {
    const response = await createSystemSupplier(requestBody)
    if ((response.code ?? 200) >= 400) {
      throw new Error(response.message || 'Supplier creation failed')
    }
  },
  async update(requestBody: SystemSupplierUpdateRequest): Promise<void> {
    const response = await updateSystemSupplier(requestBody)
    if ((response.code ?? 200) >= 400) {
      throw new Error(response.message || 'Supplier update failed')
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
