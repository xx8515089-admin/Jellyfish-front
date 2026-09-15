import { OpenAPI } from '../../services/generated'
import { getHeaders } from '../../services/generated/core/request'

const contentPath = '/api/v1/studio/files/content'

export function resolveDirectorImageSource(source: string, apiBase: string, pageUrl: string) {
  const base = new URL(`${apiBase.replace(/\/+$/, '')}/`, pageUrl)
  const endpoint = new URL(`${apiBase.replace(/\/+$/, '')}${contentPath}`, pageUrl)
  const value = source.trim()
  if (/^data:image\//i.test(value) || value.startsWith('blob:')) return { url: value, authenticated: false }
  const relativeApi = value.startsWith(`${contentPath}?`) || value === contentPath || value.startsWith(`${contentPath.slice(1)}?`)
  const url = relativeApi ? new URL(`${endpoint.href}${value.includes('?') ? value.slice(value.indexOf('?')) : ''}`) : new URL(value, base)
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('图片地址无效')
  return { url: url.href, authenticated: url.origin === endpoint.origin && url.pathname === endpoint.pathname }
}

export async function loadDirectorMedia(source: string, signal: AbortSignal, mediaType: 'image' | 'video' | 'audio' = 'image'): Promise<{ url: string; release: () => void }> {
  const resolved = resolveDirectorImageSource(source, OpenAPI.BASE, window.location.href)
  if (!resolved.authenticated) return { url: resolved.url, release: () => {} }
  const headers = await getHeaders(OpenAPI, { method: 'GET', url: contentPath })
  headers.set('Accept', `${mediaType}/*,application/octet-stream`)
  const response = await fetch(resolved.url, { headers, signal, redirect: 'error', credentials: OpenAPI.WITH_CREDENTIALS ? OpenAPI.CREDENTIALS : 'same-origin' })
  if (!response.ok) {
    const result = await response.json().catch(() => null)
    throw new Error(result?.message || `媒体加载失败（${response.status}）`)
  }
  const blob = await response.blob()
  const contentType = blob.type.toLowerCase().split(';')[0]
  if (contentType && !contentType.startsWith(`${mediaType}/`) && contentType !== 'application/octet-stream') throw new Error(`返回的内容不是${mediaType === 'image' ? '图片' : '视频或音频'}（${contentType}）`)
  if (signal.aborted) throw new Error('媒体加载已取消')
  const url = URL.createObjectURL(blob)
  return { url, release: () => URL.revokeObjectURL(url) }
}

export const loadDirectorImage = (source: string, signal: AbortSignal) => loadDirectorMedia(source, signal, 'image')

/** Media types here are scoped to director/video reference selections, not global image reference enums. */
export function directorReferenceMediaType(reference: { referenceType: number }): 'image' | 'video' | 'audio' {
  return reference.referenceType === 7 ? 'video' : reference.referenceType === 6 ? 'audio' : 'image'
}
