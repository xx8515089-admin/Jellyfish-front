import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import dayjs from 'dayjs'
import 'dayjs/locale/zh-cn'
import 'dayjs/locale/en'
import LanguageDetector from 'i18next-browser-languagedetector'
import zhLayout from './locales/zh-CN/layout.json'
import zhCommon from './locales/zh-CN/common.json'
import zhNotFound from './locales/zh-CN/notFound.json'
import enLayout from './locales/en-US/layout.json'
import enCommon from './locales/en-US/common.json'
import enNotFound from './locales/en-US/notFound.json'
import zhLogin from './locales/zh-CN/login.json'
import enLogin from './locales/en-US/login.json'

export type SupportedLanguage = 'zh-CN' | 'en-US'

const resources = {
  'zh-CN': {
    common: zhCommon,
    layout: zhLayout,
    notFound: zhNotFound,
    login: zhLogin,
  },
  'en-US': {
    common: enCommon,
    layout: enLayout,
    notFound: enNotFound,
    login: enLogin,
  },
}

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'zh-CN',
    supportedLngs: ['zh-CN', 'en-US'],
    ns: ['common', 'layout', 'notFound', 'login'],
    defaultNS: 'layout',
    interpolation: {
      escapeValue: false,
    },
    detection: {
      order: ['localStorage', 'navigator', 'htmlTag'],
      lookupLocalStorage: 'jellyfish_language',
    },
  })

/** 保持文档语言元数据与 i18next 一致，包括页面首次加载时。 */
function syncDocumentLanguage(language: string): void {
  const english = (language ?? '').startsWith('en')
  document.documentElement.lang = english ? 'en' : 'zh-CN'
  dayjs.locale(english ? 'en' : 'zh-cn')
}

i18n.on('languageChanged', syncDocumentLanguage)
syncDocumentLanguage(i18n.resolvedLanguage ?? i18n.language)

export default i18n


