import type { ApiRequestOptions } from './generated/core/ApiRequestOptions'
import type { OpenAPIConfig } from './generated/core/OpenAPI'
import { CancelablePromise } from './generated/core/CancelablePromise'
import { ApiError } from './generated/core/ApiError'
import { getHeaders, getQueryString, request as jsonRequest } from './generated/core/request'
import { joinApiBasePath } from '../config/api'

/** Read a safe server filename without allowing path components in the download name. */
export function csvFilename(disposition: string | null): string {
  const encoded = /filename\*=UTF-8''([^;]+)/i.exec(disposition ?? '')?.[1]
  const plain = /filename="([^"]+)"|filename=([^;]+)/i.exec(disposition ?? '')
  let name = plain?.[1] || plain?.[2]?.trim() || 'efficiency-overview.csv'
  if (encoded) { try { name = decodeURIComponent(encoded) } catch { /* Retain the plain filename. */ } }
  return Array.from(name, (character) => character.charCodeAt(0) < 32 || character === '/' || character === '\\' ? '_' : character).join('')
}

/** Generated JSON calls share the app client; CSV retains binary data and validates failure envelopes. */
export function request<T>(config: OpenAPIConfig, options: ApiRequestOptions): CancelablePromise<T> {
  if (!options.url.endsWith('/efficiency/export')) return jsonRequest<T>(config, options)
  return new CancelablePromise(async (resolve, reject, onCancel) => {
    const controller = new AbortController()
    onCancel(() => controller.abort())
    try {
      const url = joinApiBasePath(config.BASE, options.url) + getQueryString(options.query ?? {})
      const headers = await getHeaders(config, { ...options, headers: { ...options.headers, Accept: 'text/csv' } })
      if (onCancel.isCancelled) return
      const response = await fetch(url, {
        method: 'GET', headers, signal: controller.signal,
        ...(config.WITH_CREDENTIALS ? { credentials: config.CREDENTIALS } : {}),
      })
      const contentType = response.headers.get('Content-Type') ?? ''
      if (!response.ok || !/^text\/csv(?:;|$)/i.test(contentType)) {
        const payload = await response.json().catch(() => null) as { code?: number } | null
        const body = payload?.code === 200 ? null : payload
        throw new ApiError(options, { url, ok: response.ok, status: response.status, statusText: response.statusText, body }, '导出失败：未收到有效 CSV 文件')
      }
      // A disconnected stream rejects here, before a download or success message is shown.
      const blob = await response.blob()
      resolve(new File([blob], csvFilename(response.headers.get('Content-Disposition')), { type: contentType }) as T)
    } catch (error) { reject(error) }
  })
}
