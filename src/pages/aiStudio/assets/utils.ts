import { apiBaseUrl } from '../../../config/api'
import { OpenAPI } from '../../../services/generated'

/** 从后端下载地址中提取文件 ID，用于统一走当前配置的后端地址。 */
function tryExtractFileIdFromUrl(value: string): string | null {
  try {
    const url = new URL(value)
    const m = url.pathname.match(/\/api\/v1\/studio\/files\/([^/]+)\/download\/?$/)
    if (m?.[1]) return decodeURIComponent(m[1])
  } catch {
    // 地址无法解析时保留原值，由调用方继续兜底展示。
  }
  return null
}

/** 解析资产地址，兼容后端返回的绝对地址、相对路径与 file_id。 */
export function resolveAssetUrl(value?: string | null): string | undefined {
  if (!value) return undefined
  const trimmed = value.trim()
  if (!trimmed) return undefined

  if (/^(?:[a-z][a-z\d+\-.]*:)?\/\//i.test(trimmed) || trimmed.startsWith('data:') || trimmed.startsWith('blob:')) {
    const fileId = tryExtractFileIdFromUrl(trimmed)
    if (fileId) return buildFileDownloadUrl(fileId)
    return trimmed
  }

  // 后端有些缩略图字段可能直接返回 file_id（不包含 / 或 :）。
  // 这种情况下需要拼接下载地址，否则 new URL 会生成错误路径。
  if (!trimmed.includes('/') && !trimmed.includes(':')) {
    return buildFileDownloadUrl(trimmed)
  }

  try {
    return new URL(trimmed, OpenAPI.BASE || apiBaseUrl || window.location.origin).toString()
  } catch {
    return trimmed
  }
}

/** 根据文件 ID 构造后端下载地址。 */
export function buildFileDownloadUrl(fileId?: string | null): string | undefined {
  if (!fileId) return undefined
  return resolveAssetUrl(`/api/v1/studio/files/${encodeURIComponent(fileId)}/download`)
}
