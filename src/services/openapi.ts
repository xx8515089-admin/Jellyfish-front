import { getAuthToken } from '../auth'
import { apiBaseUrl, hasConfiguredApiBaseUrl } from '../config/api'
import { OpenAPI } from './generated'

type RequestLanguage = 'cn' | 'en'

/** 根据当前持久化的 UI 语言设置解析后端语言代码。 */
function getRequestLanguage(): RequestLanguage {
  const storedLanguage = window.localStorage.getItem('jellyfish_language')
  if (storedLanguage === 'en-US') return 'en'
  if (storedLanguage === 'zh-CN') return 'cn'

  const browserLanguage = window.navigator.languages?.[0] ?? window.navigator.language
  return browserLanguage.toLowerCase().startsWith('en') ? 'en' : 'cn'
}

/** 初始化 generated client 的后端地址与 Java 后端要求的 accessToken 认证头。 */
export function initOpenAPI(base: string = '') {
  OpenAPI.BASE = base
  OpenAPI.TOKEN = undefined
  OpenAPI.HEADERS = async (): Promise<Record<string, string>> => {
    const token = getAuthToken()
    return {
      ...(token ? { Authorization: token } : {}),
      language: getRequestLanguage(),
    }
  }
}

if (!hasConfiguredApiBaseUrl) {
  console.warn('未配置后端接口地址，将使用同源地址。请在 VITE_BACKEND_URL 或 window.__ENV.BACKEND_URL 中配置 Java 后端地址。')
}

initOpenAPI(apiBaseUrl)
