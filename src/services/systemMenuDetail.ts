import type { SystemMenuRead } from './generated/models/SystemMenuRead'
import type { ApiResponse_SystemMenuRead_ } from './generated/models/ApiResponse_SystemMenuRead_'
import { OpenAPI } from './generated/core/OpenAPI'
import { request } from './generated/core/request'
import type { SupportedLanguage } from '../i18n'

export async function getSystemMenuDetail(id: number, language: SupportedLanguage): Promise<SystemMenuRead> {
  const response = await request<ApiResponse_SystemMenuRead_>(OpenAPI, {
    method: 'GET', url: '/api/v1/system/menus/detail', query: { id },
    headers: { language: language === 'en-US' ? 'en' : 'cn' },
  })
  if (response.code !== 200 || !response.data) throw new Error(response.message || 'Menu detail unavailable')
  return response.data
}
