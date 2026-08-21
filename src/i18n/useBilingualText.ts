import { useTranslation } from 'react-i18next'
import i18n from '../i18n'

/** Selects a bilingual UI phrase and rerenders when the active language changes. */
export function useBilingualText(): (zhCN: string, enUS: string) => string {
  useTranslation()
  return bilingualText
}

/** Selects a bilingual phrase outside React components. */
export function bilingualText(zhCN: string, enUS: string): string {
  return i18n.resolvedLanguage === 'en-US' || i18n.language.startsWith('en') ? enUS : zhCN
}
