import { getAuthToken } from '../../../auth'
import { apiBaseUrl, joinApiBasePath } from '../../../config/api'
import { OpenAPI } from '../../../services/generated'

const getConfiguredApiBase = () => OpenAPI.BASE || apiBaseUrl

/** 从后端预览地址中提取文件 ID，用于统一走当前配置的后端地址。 */
function tryExtractFileIdFromUrl(value: string): string | null {
  try {
    const url = new URL(value, window.location.origin)
    if (url.pathname.replace(/\/+$/, '').endsWith('/api/v1/studio/files/content')) {
      return url.searchParams.get('id')
    }
  } catch {
    // 地址无法解析时保留原值，由调用方继续兜底展示。
  }
  return null
}

function buildStudioFileUrl(pathname: 'content' | 'download', fileId: string): string {
  const apiPath = `/api/v1/studio/files/${pathname}?id=${encodeURIComponent(fileId)}`
  return joinApiBasePath(getConfiguredApiBase(), apiPath)
}

export function normalizeMediaFileId(value?: string | number | null): string | null {
  if (value === null || value === undefined) return null
  const text = String(value).trim()
  if (!/^\d+$/.test(text)) return null
  return Number(text) > 0 ? text : null
}

/** 解析资产地址，兼容后端返回的绝对地址、相对路径与 file_id。 */
export function resolveAssetUrl(value?: string | null): string | undefined {
  if (!value) return undefined
  const trimmed = value.trim()
  if (!trimmed) return undefined

  if (/^(?:[a-z][a-z\d+\-.]*:)?\/\//i.test(trimmed) || trimmed.startsWith('data:') || trimmed.startsWith('blob:')) {
    const fileId = tryExtractFileIdFromUrl(trimmed)
    if (fileId) return buildFileContentUrl(fileId)
    return trimmed
  }

  // 后端有些缩略图字段可能直接返回 file_id（不包含 / 或 :）。
  // 这种情况下需要拼接预览地址，否则 new URL 会生成错误路径。
  if (!trimmed.includes('/') && !trimmed.includes(':')) {
    return buildFileContentUrl(trimmed)
  }

  const fileId = tryExtractFileIdFromUrl(trimmed)
  if (fileId) return buildFileContentUrl(fileId)

  try {
    return joinApiBasePath(getConfiguredApiBase(), trimmed)
  } catch {
    return trimmed
  }
}

/** 根据文件 ID 构造后端预览地址。 */
export function buildFileContentUrl(fileId?: string | number | null): string | undefined {
  const normalizedFileId = normalizeMediaFileId(fileId)
  return normalizedFileId ? buildStudioFileUrl('content', normalizedFileId) : undefined
}

function getFileNameFromContentDisposition(disposition: string, fallback: string): string {
  const encodedName = /filename\*=UTF-8''([^;]+)/i.exec(disposition)?.[1]
  if (encodedName) {
    try {
      return decodeURIComponent(encodedName)
    } catch {
      return encodedName
    }
  }
  const quotedName = /filename="([^"]+)"/i.exec(disposition)?.[1]
  if (quotedName) return quotedName
  const plainName = /filename=([^;]+)/i.exec(disposition)?.[1]?.trim()
  return plainName || fallback
}

async function readDownloadError(response: Response): Promise<string | null> {
  const payload = await response.json().catch(() => null)
  if (!payload || typeof payload !== 'object') return null
  const record = payload as Record<string, unknown>
  const message = record.message
  if (typeof message === 'string' && message.trim()) return message.trim()
  const data = record.data
  if (data && typeof data === 'object') {
    const nestedMessage = (data as Record<string, unknown>).message
    if (typeof nestedMessage === 'string' && nestedMessage.trim()) return nestedMessage.trim()
  }
  return null
}

export async function downloadMediaFile(fileId: string | number | null | undefined): Promise<void> {
  const normalizedFileId = normalizeMediaFileId(fileId)
  if (!normalizedFileId) {
    throw new Error('文件尚未生成，无法下载')
  }
  const token = getAuthToken()
  if (!token) {
    throw new Error('请先登录后再下载')
  }
  const response = await fetch(buildStudioFileUrl('download', normalizedFileId), {
    headers: { Authorization: token },
  })
  if (!response.ok) {
    throw new Error(await readDownloadError(response) || '下载失败，请重试')
  }

  const fileName = getFileNameFromContentDisposition(
    response.headers.get('Content-Disposition') || '',
    `file-${normalizedFileId}`,
  )
  const blobUrl = URL.createObjectURL(await response.blob())
  const link = document.createElement('a')
  link.href = blobUrl
  link.download = fileName
  document.body.appendChild(link)
  try {
    link.click()
  } finally {
    link.remove()
    window.setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000)
  }
}
