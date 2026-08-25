import { OpenAPI } from './generated'
import type { CancelablePromise } from './generated'
import { request as __request } from './generated/core/request'

type ApiEnvelope<T> = {
  code?: number
  message?: string
  data?: T | null
}

export type PromptVariableDefinition = Record<string, unknown>

export type SystemPromptTemplateRead = {
  createdAt?: string | null
  updatedAt?: string | null
  id: number
  category: string
  name: string
  preview?: string | null
  content: string
  variables?: string[] | null
  variableDefinitions?: PromptVariableDefinition[] | null
  system?: boolean | null
  defaultTemplate?: boolean | null
}

export type SystemPromptTemplatePayload = {
  category: string
  name: string
  preview: string
  content: string
  variableDefinitions: PromptVariableDefinition[]
  system: boolean
  defaultTemplate: boolean
}

export type SystemPromptTemplateUpdatePayload = SystemPromptTemplatePayload & {
  id: number
}

export type SystemPromptTemplateDeletePayload = {
  id: number
}

function assertSystemSuccess(response: ApiEnvelope<unknown>, fallback: string): void {
  if (response.code !== undefined && response.code !== 0 && response.code !== 200) {
    throw new Error(response.message || fallback)
  }
}

function findAllPromptTemplates(): CancelablePromise<ApiEnvelope<SystemPromptTemplateRead[]>> {
  return __request(OpenAPI, {
    method: 'GET',
    url: '/api/v1/system/promptTemplates/findAll',
  })
}

function createPromptTemplate(
  requestBody: SystemPromptTemplatePayload,
): CancelablePromise<ApiEnvelope<unknown>> {
  return __request(OpenAPI, {
    method: 'POST',
    url: '/api/v1/system/promptTemplates/create',
    body: requestBody,
    mediaType: 'application/json',
    errors: {
      422: 'Validation Error',
    },
  })
}

function updatePromptTemplate(
  requestBody: SystemPromptTemplateUpdatePayload,
): CancelablePromise<ApiEnvelope<unknown>> {
  return __request(OpenAPI, {
    method: 'POST',
    url: '/api/v1/system/promptTemplates/update',
    body: requestBody,
    mediaType: 'application/json',
    errors: {
      422: 'Validation Error',
    },
  })
}

function deletePromptTemplate(
  requestBody: SystemPromptTemplateDeletePayload,
): CancelablePromise<ApiEnvelope<unknown>> {
  return __request(OpenAPI, {
    method: 'POST',
    url: '/api/v1/system/promptTemplates/delete',
    body: requestBody,
    mediaType: 'application/json',
    errors: {
      422: 'Validation Error',
    },
  })
}

export const SystemPromptTemplatesApi = {
  async findAll(): Promise<SystemPromptTemplateRead[]> {
    const response = await findAllPromptTemplates()
    assertSystemSuccess(response, 'Prompt templates loading failed')
    return Array.isArray(response.data) ? response.data : []
  },
  async create(requestBody: SystemPromptTemplatePayload): Promise<void> {
    const response = await createPromptTemplate(requestBody)
    assertSystemSuccess(response, 'Prompt template creation failed')
  },
  async update(requestBody: SystemPromptTemplateUpdatePayload): Promise<void> {
    const response = await updatePromptTemplate(requestBody)
    assertSystemSuccess(response, 'Prompt template update failed')
  },
  async delete(requestBody: SystemPromptTemplateDeletePayload): Promise<void> {
    const response = await deletePromptTemplate(requestBody)
    assertSystemSuccess(response, 'Prompt template deletion failed')
  },
}
