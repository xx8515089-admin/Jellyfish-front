import { useCallback } from 'react'
import { useUiLanguage, getUiLanguage } from './uiText'

/** Return a language-dependent callback so memoized labels also update. */
export function useBilingualText(): (zhCN: string, enUS: string) => string {
  const language = useUiLanguage()
  return useCallback((zhCN: string, enUS: string) => language === 'en-US' ? enUS : zhCN, [language])
}

export function bilingualText(zhCN: string, enUS: string): string {
  return getUiLanguage() === 'en-US' ? enUS : zhCN
}
