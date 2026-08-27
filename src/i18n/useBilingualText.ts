import { useTranslation } from 'react-i18next'
import i18n from '../i18n'

/** 选择双语 UI 文案，并在当前语言变化时重新渲染。 */
export function useBilingualText(): (zhCN: string, enUS: string) => string {
  useTranslation()
  return bilingualText
}

/** 在 React 组件之外选择双语文案。 */
export function bilingualText(zhCN: string, enUS: string): string {
  return i18n.resolvedLanguage === 'en-US' || i18n.language.startsWith('en') ? enUS : zhCN
}
