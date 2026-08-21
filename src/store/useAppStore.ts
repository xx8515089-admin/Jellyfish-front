import { create } from 'zustand'
import type { SupportedLanguage } from '../i18n'
import { getAuthUserView, getStoredAuthMenus, getStoredAuthUser } from '../auth'
import type { AuthMenuSnapshot } from '../auth'

interface UserInfo {
  name: string
  role: string
  isAdmin: boolean
  apiQuota: number
  apiUsed: number
  apiRemaining: number
}

interface AppState {
  siderCollapsed: boolean
  user: UserInfo
  menus: AuthMenuSnapshot[]
  language: SupportedLanguage
  setUser: (user: Partial<UserInfo>) => void
  setMenus: (menus: AuthMenuSnapshot[]) => void
  setLanguage: (lang: SupportedLanguage) => void
  toggleSider: () => void
}

const storedUserView = getAuthUserView(getStoredAuthUser())
const storedMenus = getStoredAuthMenus()

/** 优先使用显式语言偏好，否则跟随浏览器语言。 */
function getInitialLanguage(): SupportedLanguage {
  const storedLanguage = window.localStorage.getItem('jellyfish_language')
  if (storedLanguage === 'zh-CN' || storedLanguage === 'en-US') return storedLanguage

  const browserLanguage = window.navigator.languages?.[0] ?? window.navigator.language
  return browserLanguage.toLowerCase().startsWith('en') ? 'en-US' : 'zh-CN'
}

/** 保存界面状态、后端确认的身份信息和额度信息。 */
export const useAppStore = create<AppState>((set) => ({
  siderCollapsed: false,
  user: storedUserView,
  menus: storedMenus,
  language: getInitialLanguage(),
  setUser: (user) => set((state) => ({ user: { ...state.user, ...user } })),
  setMenus: (menus) => set({ menus }),
  setLanguage: (lang) => {
    window.localStorage.setItem('jellyfish_language', lang)
    document.documentElement.lang = lang === 'en-US' ? 'en' : 'zh-CN'
    set(() => ({ language: lang }))
  },
  toggleSider: () => set((state) => ({ siderCollapsed: !state.siderCollapsed })),
}))
