declare global {
  interface Window {
    __ENV?: {
      BACKEND_URL?: string
    }
  }
}

/** 规范化后端地址，避免拼接接口路径时出现重复斜杠。 */
function normalizeApiBaseUrl(value?: string | null): string {
  const trimmed = value?.trim() ?? ''
  return trimmed.replace(/\/+$/, '')
}

/** Java 后端接口地址，优先使用部署期注入，其次使用 Vite 构建期配置。 */
export const apiBaseUrl = normalizeApiBaseUrl(window.__ENV?.BACKEND_URL || import.meta.env.VITE_BACKEND_URL || '')

/** 标记当前是否显式配置了后端地址，未配置时 generated client 使用同源地址。 */
export const hasConfiguredApiBaseUrl = Boolean(apiBaseUrl)
