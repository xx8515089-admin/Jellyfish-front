import i18n from '../i18n'
import { useSyncExternalStore } from 'react'
import english from '../locales/en-US/ui.json'

const translations: Record<string, string> = english

/** UI labels only: never use the translated value as a persisted identifier. */
export function uiText(value: string, ...parameters: unknown[]): string {
  const text = getUiLanguage() === 'en-US' ? translations[value] ?? value : value
  return parameters.length ? text.replace(/\{(\d+)\}/g, (placeholder, index: string) => Number(index) < parameters.length ? String(parameters[Number(index)] ?? '') : placeholder) : text
}

export function getUiLanguage(): 'en-US' | 'zh-CN' {
  return (i18n.resolvedLanguage ?? i18n.language ?? '').startsWith('en') ? 'en-US' : 'zh-CN'
}

function subscribeLanguage(onChange: () => void): () => void {
  i18n.on('languageChanged', onChange)
  return () => { i18n.off('languageChanged', onChange) }
}

/** Subscribe to the application language even inside the canvas's own i18n provider. */
export function useUiLanguage(): 'en-US' | 'zh-CN' {
  return useSyncExternalStore(subscribeLanguage, getUiLanguage, getUiLanguage)
}

// These status strings also drive recovery logic. Translate only their display value.
const statusPatterns: Array<[RegExp, string]> = [
  [/^已保存 · v(.+)$/, '已保存 · v{0}'],
  [/^已同步 · v(.+)$/, '已同步 · v{0}'],
  [/^已找回 v(.+)，新编辑已保留，请保存云端$/, '已找回 v{0}，新编辑已保留，请保存云端'],
  [/^已找回 v(.+)，当前编辑可继续保存$/, '已找回 v{0}，当前编辑可继续保存'],
  [/^已确认发布 v(.+)，当前编辑已保留；请核对云端版本冲突$/, '已确认发布 v{0}，当前编辑已保留；请核对云端版本冲突'],
]
export function uiStatusText(value: string): string {
  for (const [pattern, template] of statusPatterns) {
    const match = value.match(pattern)
    if (match) return uiText(template, ...match.slice(1))
  }
  return uiText(value)
}
