import { OpenAPI } from '../../../services/generated/core/OpenAPI'
import { getHeaders } from '../../../services/generated/core/request'
import { ApiError } from '../../../services/generated/core/ApiError'

const cache = new Map<string, { etag: string | null; value: unknown }>()
let authScope = ''

/** Special media transport preserves 304/202/binary semantics absent from the generated JSON client. */
export async function workflowMediaRead<T>(path: string, signal: AbortSignal, binary = false): Promise<T> {
  const headers = await getHeaders(OpenAPI, { method: 'GET', url: path })
  const scope = headers.get('Authorization') ?? ''
  if (scope !== authScope) { cache.clear(); authScope = scope }
  const url = `${OpenAPI.BASE.replace(/\/$/, '')}${path}`
  const previous = cache.get(url)
  if (previous?.etag) headers.set('If-None-Match', previous.etag)
  const response = await fetch(url, { headers, signal, credentials: OpenAPI.WITH_CREDENTIALS ? OpenAPI.CREDENTIALS : 'same-origin' })
  if (signal.aborted || scope !== authScope) throw new Error('媒体请求已失效')
  if (response.status === 304 && previous) return previous.value as T
  if (binary && (response.status === 202 || response.status === 503)) {
    throw Object.assign(new Error('缩略图处理中或暂不可用'), { retryAfter: Number(response.headers.get('Retry-After')) || (response.status === 202 ? 3 : 300) })
  }
  const body = binary && response.ok && response.headers.get('Content-Type')?.startsWith('image/')
    ? await response.blob() : await response.json()
  if (!response.ok || (!(body instanceof Blob) && body.code !== 200)) {
    throw new ApiError({ method: 'GET', url: path }, { url, ok: false, status: response.status, statusText: response.statusText, body }, body.message || '媒体查询失败')
  }
  const value = body instanceof Blob ? body : body.data
  if (scope === authScope) {
    if (cache.size >= 80) cache.delete(cache.keys().next().value!)
    cache.set(url, { etag: response.headers.get('ETag'), value })
  }
  return value as T
}
