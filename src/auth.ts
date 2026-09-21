import type { SystemMenuRead, UserRead } from './services/generated'

const AUTH_TOKEN_KEY = 'jellyfish_access_token'
const AUTH_USER_KEY = 'jellyfish_auth_user'
const AUTH_MENUS_KEY = 'jellyfish_auth_menus'

type JavaRoleSnapshot = {
  code?: string | null
  name?: string | null
  permissions?: string[] | null
}

export type AuthUserSnapshot = Partial<UserRead> & {
  id?: string | number
  username?: string
  displayName?: string | null
  display_name?: string | null
  active?: boolean
  is_active?: boolean
  isAdmin?: boolean
  is_admin?: boolean
  apiQuota?: number | null
  api_quota?: number | null
  apiUsed?: number | null
  api_used?: number | null
  apiRemaining?: number | null
  api_remaining?: number | null
  roles?: JavaRoleSnapshot[] | null
  roleIds?: number[] | null
}

export type AppUserSnapshot = {
  name: string
  role: string
  isAdmin: boolean
  apiQuota: number
  apiUsed: number
  apiRemaining: number
}

export type AuthMenuSnapshot = SystemMenuRead

type LoginDataShape = {
  accessToken?: string | null
  access_token?: string | null
  user?: AuthUserSnapshot | null
  menus?: AuthMenuSnapshot[] | null
}

/** 返回 generated OpenAPI client 使用的 bearer token。 */
export function getAuthToken(): string | null {
  return window.localStorage.getItem(AUTH_TOKEN_KEY)
}

/** 返回本地是否已有后端签发的 bearer token。 */
export function hasAuthSession(): boolean {
  return Boolean(getAuthToken())
}

/** 持久化后端签发的 token 与安全用户快照。 */
export function createAuthSession(token: string, user: AuthUserSnapshot, menus: AuthMenuSnapshot[]): void {
  window.localStorage.setItem(AUTH_TOKEN_KEY, token)
  updateStoredAuthUser(user)
  updateStoredAuthMenus(menus)
}

/** 更新本地用户快照，用于 /me 刷新后同步顶部导航信息。 */
export function updateStoredAuthUser(user: AuthUserSnapshot): void {
  window.localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user))
}

/** 读取最近一次后端确认的用户快照。 */
export function getStoredAuthUser(): AuthUserSnapshot | null {
  try {
    const value = window.localStorage.getItem(AUTH_USER_KEY)
    return value ? JSON.parse(value) as AuthUserSnapshot : null
  } catch {
    return null
  }
}

/** Menu cache entries are scoped to both the account and UI language. Legacy unscoped entries are ignored. */
function menuCacheScope(): { userId: string; language: 'zh-CN' | 'en-US' } | null {
  const user = getStoredAuthUser()
  if (user?.id == null) return null
  const storedLanguage = window.localStorage.getItem('jellyfish_language')
  const language = storedLanguage === 'zh-CN' || storedLanguage === 'en-US'
    ? storedLanguage
    : (window.navigator.languages?.[0] ?? window.navigator.language).toLowerCase().startsWith('en') ? 'en-US' : 'zh-CN'
  return { userId: String(user.id), language }
}

/** 保存当前用户及语言对应的菜单树。 */
export function updateStoredAuthMenus(menus: AuthMenuSnapshot[]): void {
  const scope = menuCacheScope()
  if (scope) window.localStorage.setItem(AUTH_MENUS_KEY, JSON.stringify({ ...scope, menus }))
}

/** 读取当前登录用户最近一次由后端确认的菜单树。 */
export function getStoredAuthMenus(): AuthMenuSnapshot[] {
  try {
    const value = window.localStorage.getItem(AUTH_MENUS_KEY)
    if (!value) return []
    const cached = JSON.parse(value) as { userId?: string; language?: string; menus?: unknown } | null
    const scope = menuCacheScope()
    return scope && cached?.userId === scope.userId && cached.language === scope.language && Array.isArray(cached.menus)
      ? cached.menus as AuthMenuSnapshot[] : []
  } catch {
    return []
  }
}

/** 从登录响应 data 中提取兼容 Java camelCase 与旧 snake_case 的 access token。 */
export function getLoginAccessToken(data: unknown): string | null {
  const payload = data as LoginDataShape | null
  return payload?.accessToken || payload?.access_token || null
}

/** 从登录响应 data 中提取当前用户可见菜单。 */
export function getLoginMenus(data: unknown): AuthMenuSnapshot[] {
  const payload = data as LoginDataShape | null
  return Array.isArray(payload?.menus) ? payload.menus : []
}

/** 返回菜单树中排序最靠前的可访问页面，作为登录后的安全默认落点。 */
export function getFirstMenuPath(menus: AuthMenuSnapshot[]): string | null {
  const sortedMenus = [...menus]
    .filter((menu) => menu.active && menu.menuType !== 'button')
    .sort((first, second) => first.sortOrder - second.sortOrder || first.id - second.id)

  for (const menu of sortedMenus) {
    if (menu.path?.startsWith('/')) return menu.path
    const childPath = getFirstMenuPath(menu.children ?? [])
    if (childPath) return childPath
  }
  return null
}

/** 将后端用户快照归一化为前端展示所需字段。 */
export function getAuthUserView(user?: AuthUserSnapshot | null): AppUserSnapshot {
  const apiQuota = readNumber(user?.apiQuota, user?.api_quota)
  const apiUsed = readNumber(user?.apiUsed, user?.api_used)
  const explicitRemaining = readOptionalNumber(user?.apiRemaining, user?.api_remaining)
  const isAdmin = Boolean(user?.isAdmin ?? user?.is_admin ?? hasAdminRole(user))

  return {
    name: user?.displayName || user?.display_name || user?.username || '',
    role: isAdmin ? 'Administrator' : 'User',
    isAdmin,
    apiQuota,
    apiUsed,
    apiRemaining: explicitRemaining ?? Math.max(apiQuota - apiUsed, 0),
  }
}

/** 清除所有本地认证材料，通常发生在退出登录或 token 被后端拒绝后。 */
export function clearAuthSession(): void {
  window.localStorage.removeItem(AUTH_TOKEN_KEY)
  window.localStorage.removeItem(AUTH_USER_KEY)
  window.localStorage.removeItem(AUTH_MENUS_KEY)
}

/** 判断 Java 后端角色快照中是否包含管理员权限。 */
function hasAdminRole(user?: AuthUserSnapshot | null): boolean {
  return Boolean(
    user?.roles?.some((role) => role.code === 'admin' || role.permissions?.includes('*')),
  )
}

/** 读取数字字段，兼容后端返回 number 或可解析字符串。 */
function readNumber(...values: Array<number | string | null | undefined>): number {
  return readOptionalNumber(...values) ?? 0
}

/** 读取可选数字字段，无法解析时返回空。 */
function readOptionalNumber(...values: Array<number | string | null | undefined>): number | null {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value)) return value
    if (typeof value === 'string' && value.trim()) {
      const parsed = Number(value)
      if (Number.isFinite(parsed)) return parsed
    }
  }
  return null
}
