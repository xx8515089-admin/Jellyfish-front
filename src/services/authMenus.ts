import { getAuthToken, updateStoredAuthMenus } from '../auth'
import type { SupportedLanguage } from '../i18n'
import { useAppStore } from '../store/useAppStore'
import { OpenAPI } from './generated/core/OpenAPI'
import { request } from './generated/core/request'
import type { ApiResponse_list_SystemMenuRead__ } from './generated/models/ApiResponse_list_SystemMenuRead__'

let refreshSequence = 0

/** Fetch the server-localized tree; a late response must not replace a newer language/account. */
export async function refreshAuthMenus(language: SupportedLanguage = useAppStore.getState().language): Promise<void> {
  const token = getAuthToken()
  const sequence = ++refreshSequence
  if (!token) return
  const isCurrent = () => sequence === refreshSequence && token === getAuthToken() && language === useAppStore.getState().language
  try {
    const response = await request<ApiResponse_list_SystemMenuRead__>(OpenAPI, {
      method: 'GET',
      url: '/api/v1/auth/menus',
      headers: { language: language === 'en-US' ? 'en' : 'cn' },
    })
    if (!isCurrent()) return
    if (response.code !== 200 || !Array.isArray(response.data)) {
      throw new Error(response.message || 'Menu refresh failed')
    }
    updateStoredAuthMenus(response.data)
    useAppStore.getState().setMenus(response.data)
  } catch (error) {
    if (isCurrent()) throw error
  }
}
