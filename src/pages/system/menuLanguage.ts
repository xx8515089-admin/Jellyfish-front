import type { SystemMenuRead } from '../../services/generated'

/** Display name is localized by the API. Never write it back as the Chinese name. */
export function menuNameFields(menu: Pick<SystemMenuRead, 'name' | 'nameZh' | 'nameEn'>) {
  if (typeof menu.nameZh !== 'string') throw new Error('Menu detail is missing nameZh')
  return { name: menu.nameZh, nameEn: menu.nameEn ?? '' }
}

/** Empty English deliberately clears the translation; null/omission means preserve on the server. */
export function menuNamePayload(values: { name: string; nameEn?: string | null }) {
  return { name: values.name.trim(), nameEn: values.nameEn == null ? values.nameEn : values.nameEn.trim() }
}

export function assertMenuSuccess(response: { code?: number; message?: string }, fallback: string): void {
  if (response.code !== 200) throw new Error(response.message || fallback)
}
