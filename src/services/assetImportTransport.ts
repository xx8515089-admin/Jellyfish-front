import type { OpenAPIConfig } from './generated/core/OpenAPI'
import type { ApiRequestOptions } from './generated/core/ApiRequestOptions'
import { CancelablePromise } from './generated/core/CancelablePromise'
import { getHeaders, getFormData, getQueryString, getRequestBody, sendRequest } from './generated/core/request'
import { joinApiBasePath } from '../config/api'

export class AssetImportApiError extends Error {
  readonly errorCode?: string
  readonly retryAfterMs?: number
  constructor(public status: number, public body: { message?: string; errorCode?: string; data?: { errorCode?: string } } | null, public headers: Headers) {
    super(body?.message || `素材导入请求失败（${status}）`)
    this.errorCode = body?.data?.errorCode || body?.errorCode
    const value = headers.get('Retry-After')
    this.retryAfterMs = value ? (Number.isFinite(Number(value)) ? Math.max(0, Number(value) * 1000) : Math.max(0, Date.parse(value) - Date.now()) || 3000) : status === 429 ? 3000 : undefined
  }
}
const deadlines = new Map<string, number>()
/** Reuse existing BASE, raw Authorization, language and cancellation; retain response headers. */
export const request = <T>(config: OpenAPIConfig, options: ApiRequestOptions): CancelablePromise<T> => new CancelablePromise(async (resolve, reject, onCancel) => {
  try {
    const headers = await getHeaders(config, options)
    const scope = headers.get('Authorization') || ''
    const wait = (deadlines.get(scope) || 0) - Date.now()
    if (wait > 0) throw new AssetImportApiError(429, { message: '请求较频繁，请稍后重试' }, new Headers({ 'Retry-After': String(wait / 1000) }))
    const url = joinApiBasePath(config.BASE, options.url) + (options.query ? getQueryString(options.query) : '')
    if (onCancel.isCancelled) return
    const response = await sendRequest(config, options, url, getRequestBody(options), getFormData(options), headers, onCancel)
    const body = await response.json().catch(() => null)
    if (!response.ok) {
      const error = new AssetImportApiError(response.status, body, response.headers)
      if (response.status === 429) deadlines.set(scope, Date.now() + (error.retryAfterMs || 3000))
      throw error
    }
    resolve(body as T)
  } catch (error) { reject(error) }
})
